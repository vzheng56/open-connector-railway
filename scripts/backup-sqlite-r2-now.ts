import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import {
  createR2BackupObjectStore,
  readSqliteBackupConfig,
  runSqliteBackup,
} from "../src/server/backup/sqlite-r2-backup.ts";
import { logger } from "../src/server/logger.ts";

const config = readSqliteBackupConfig();
if (!config) {
  throw new Error("Set OOMOL_CONNECT_BACKUP_ENABLED=true and configure the R2 backup variables first.");
}

const dataDirectory = process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data");
const database = new DatabaseSync(join(dataDirectory, "connect.sqlite"), { readOnly: true });
try {
  const result = await runSqliteBackup({
    config,
    createSnapshot: async (filename) => {
      await backup(database, filename);
    },
    objectStore: createR2BackupObjectStore(config),
    workingDirectory: join(dataDirectory, "backup-work"),
    logger,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  database.close();
}
