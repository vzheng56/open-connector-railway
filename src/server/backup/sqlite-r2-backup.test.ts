import type { BackupObjectStore, SqliteBackupConfig } from "./sqlite-r2-backup.ts";

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { decryptBackupFile, encryptBackupFile, readSqliteBackupConfig, runSqliteBackup } from "./sqlite-r2-backup.ts";

describe("SQLite R2 backup", () => {
  it("encrypts and authenticates a backup round trip", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-connector-backup-test-"));
    const source = join(directory, "source.sqlite");
    const encrypted = join(directory, "source.sqlite.enc");
    const restored = join(directory, "restored.sqlite");
    const key = Buffer.alloc(32, 7);
    await writeFile(source, Buffer.from("sqlite backup fixture"));

    await encryptBackupFile(source, encrypted, key);
    await decryptBackupFile(encrypted, restored, key);

    await expect(readFile(restored)).resolves.toEqual(Buffer.from("sqlite backup fixture"));
    await expect(decryptBackupFile(encrypted, `${restored}.wrong`, Buffer.alloc(32, 8))).rejects.toThrow();
  });

  it("requires every secret when backup is enabled", () => {
    expect(readSqliteBackupConfig({ OOMOL_CONNECT_BACKUP_ENABLED: "false" })).toBeUndefined();
    expect(() => readSqliteBackupConfig({ OOMOL_CONNECT_BACKUP_ENABLED: "true" })).toThrow(
      "OOMOL_CONNECT_BACKUP_R2_ENDPOINT is required",
    );
  });

  it("uploads encrypted snapshots and prunes only expired objects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-connector-backup-run-"));
    const now = new Date("2026-08-22T00:00:00.000Z");
    const objectStore: BackupObjectStore = {
      put: vi.fn(async (_key, filename) => {
        expect((await readFile(filename)).subarray(0, 5).toString("ascii")).toBe("OCBK1");
      }),
      get: vi.fn(),
      list: vi.fn(async () => [
        { key: "backups/development/expired.enc", lastModified: new Date("2026-07-01T00:00:00Z") },
        { key: "backups/development/current.enc", lastModified: new Date("2026-08-20T00:00:00Z") },
      ]),
      delete: vi.fn(),
    };
    const result = await runSqliteBackup({
      config: createConfig(),
      createSnapshot: async (filename) => {
        await writeFile(filename, "consistent sqlite snapshot");
      },
      objectStore,
      workingDirectory: directory,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      now: () => now,
    });

    expect(result.key).toContain("backups/development/2026/08/22/");
    expect(result.deletedKeys).toEqual(["backups/development/expired.enc"]);
    expect(objectStore.delete).toHaveBeenCalledWith(["backups/development/expired.enc"]);
  });
});

function createConfig(): SqliteBackupConfig {
  return {
    bucket: "backup-bucket",
    endpoint: "https://example.r2.cloudflarestorage.com",
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
    encryptionKey: Buffer.alloc(32, 1),
    intervalSeconds: 86_400,
    retentionDays: 30,
    prefix: "backups",
    environment: "development",
  };
}
