import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  backupFilenameForKey,
  createR2BackupObjectStore,
  downloadAndDecryptBackup,
  readSqliteBackupConfig,
} from "../src/server/backup/sqlite-r2-backup.ts";

const key = readArgument("--key");
const outputFilename = resolve(readArgument("--output"));
await assertMissing(outputFilename);

const config = readSqliteBackupConfig();
if (!config) {
  throw new Error("Set OOMOL_CONNECT_BACKUP_ENABLED=true and configure the R2 backup variables first.");
}
const workDirectory = await mkdtemp(join(tmpdir(), "open-connector-restore-"));
const encryptedFilename = join(workDirectory, backupFilenameForKey(key));

try {
  await downloadAndDecryptBackup({
    config,
    objectStore: createR2BackupObjectStore(config),
    key,
    encryptedFilename,
    outputFilename,
  });
  const database = new DatabaseSync(outputFilename, { readOnly: true });
  try {
    const integrity = database.prepare("pragma integrity_check").get() as Record<string, unknown>;
    if (!Object.values(integrity).includes("ok")) {
      throw new Error("Restored SQLite backup failed integrity_check.");
    }
  } finally {
    database.close();
  }
  process.stdout.write(`${JSON.stringify({ restored: outputFilename, integrity: "ok" })}\n`);
} catch (error) {
  await rm(outputFilename, { force: true });
  throw error;
} finally {
  await rm(workDirectory, { recursive: true, force: true });
}

function readArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  if (!value) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

async function assertMissing(filename: string): Promise<void> {
  try {
    await access(filename);
  } catch {
    return;
  }
  throw new Error(`Refusing to overwrite existing restore target in ${dirname(filename)}.`);
}
