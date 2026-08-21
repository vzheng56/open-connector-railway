import type { RuntimeLogger } from "../../core/types.ts";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BACKUP_MAGIC = Buffer.from("OCBK1", "ascii");
const BACKUP_IV_BYTES = 12;
const BACKUP_TAG_BYTES = 16;
const DEFAULT_INTERVAL_SECONDS = 86_400;
const DEFAULT_RETENTION_DAYS = 30;
const MINIMUM_INTERVAL_SECONDS = 60;

export interface SqliteBackupConfig {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  encryptionKey: Buffer;
  intervalSeconds: number;
  retentionDays: number;
  prefix: string;
  environment: string;
}

export interface BackupObject {
  key: string;
  lastModified?: Date;
}

export interface BackupObjectStore {
  put(key: string, filename: string, metadata: Record<string, string>): Promise<void>;
  get(key: string, filename: string): Promise<void>;
  list(prefix: string): Promise<BackupObject[]>;
  delete(keys: string[]): Promise<void>;
}

export interface BackupRunResult {
  key: string;
  deletedKeys: string[];
  sizeBytes: number;
}

export interface SqliteBackupRunnerOptions {
  config: SqliteBackupConfig;
  createSnapshot(filename: string): Promise<void>;
  objectStore: BackupObjectStore;
  workingDirectory: string;
  logger: RuntimeLogger;
  now?: () => Date;
}

export interface SqliteBackupScheduler {
  runNow(): Promise<BackupRunResult>;
  stop(): void;
}

export function readSqliteBackupConfig(environment: NodeJS.ProcessEnv = process.env): SqliteBackupConfig | undefined {
  if (!readBoolean(environment.OOMOL_CONNECT_BACKUP_ENABLED)) {
    return undefined;
  }

  const endpoint = readRequired(environment, "OOMOL_CONNECT_BACKUP_R2_ENDPOINT");
  const bucket = readRequired(environment, "OOMOL_CONNECT_BACKUP_R2_BUCKET");
  const accessKeyId = readRequired(environment, "OOMOL_CONNECT_BACKUP_R2_ACCESS_KEY_ID");
  const secretAccessKey = readRequired(environment, "OOMOL_CONNECT_BACKUP_R2_SECRET_ACCESS_KEY");
  const encryptionKey = parseEncryptionKey(readRequired(environment, "OOMOL_CONNECT_BACKUP_ENCRYPTION_KEY"));

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    encryptionKey,
    intervalSeconds: readPositiveInteger(
      environment.OOMOL_CONNECT_BACKUP_INTERVAL_SECONDS,
      DEFAULT_INTERVAL_SECONDS,
      MINIMUM_INTERVAL_SECONDS,
    ),
    retentionDays: readPositiveInteger(environment.OOMOL_CONNECT_BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 1),
    prefix: normalizePrefix(environment.OOMOL_CONNECT_BACKUP_PREFIX ?? "open-connector"),
    environment: normalizePrefix(environment.RAILWAY_ENVIRONMENT_NAME ?? environment.NODE_ENV ?? "unknown"),
  };
}

export function createR2BackupObjectStore(config: SqliteBackupConfig): BackupObjectStore {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async put(key, filename, metadata) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: createReadStream(filename),
          ContentType: "application/octet-stream",
          Metadata: metadata,
        }),
      );
    },
    async get(key, filename) {
      const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!response.Body) {
        throw new Error(`Backup object ${key} did not include a response body.`);
      }
      await mkdir(dirname(filename), { recursive: true });
      const source = response.Body as Readable;
      await pipeline(source, createWriteStream(filename, { flags: "wx" }));
    },
    async list(prefix) {
      const objects: BackupObject[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const object of response.Contents ?? []) {
          if (object.Key) {
            objects.push({ key: object.Key, lastModified: object.LastModified });
          }
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);
      return objects;
    },
    async delete(keys) {
      for (let index = 0; index < keys.length; index += 1_000) {
        const batch = keys.slice(index, index + 1_000);
        if (batch.length === 0) {
          continue;
        }
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
          }),
        );
      }
    },
  };
}

export function startSqliteBackupScheduler(options: SqliteBackupRunnerOptions): SqliteBackupScheduler {
  let running: Promise<BackupRunResult> | undefined;
  const runNow = (): Promise<BackupRunResult> => {
    if (!running) {
      running = runSqliteBackup(options).finally(() => {
        running = undefined;
      });
    }
    return running;
  };

  const timer = setInterval(() => {
    void runNow().catch((error: unknown) => {
      options.logger.error({ error: errorMessage(error) }, "encrypted SQLite backup failed");
    });
  }, options.config.intervalSeconds * 1_000);
  timer.unref();

  const initialTimer = setTimeout(
    () => {
      void runNow().catch((error: unknown) => {
        options.logger.error({ error: errorMessage(error) }, "initial encrypted SQLite backup failed");
      });
    },
    Math.min(60, options.config.intervalSeconds) * 1_000,
  );
  initialTimer.unref();

  return {
    runNow,
    stop() {
      clearInterval(timer);
      clearTimeout(initialTimer);
    },
  };
}

export async function runSqliteBackup(options: SqliteBackupRunnerOptions): Promise<BackupRunResult> {
  const now = options.now?.() ?? new Date();
  const runId = crypto.randomUUID();
  const runDirectory = join(options.workingDirectory, `backup-${runId}`);
  const snapshotFilename = join(runDirectory, "connect.sqlite");
  const encryptedFilename = `${snapshotFilename}.enc`;
  const key = createBackupObjectKey(options.config, now, runId);
  await mkdir(runDirectory, { recursive: true });

  try {
    await options.createSnapshot(snapshotFilename);
    await encryptBackupFile(snapshotFilename, encryptedFilename, options.config.encryptionKey);
    const encryptedStat = await stat(encryptedFilename);
    await options.objectStore.put(key, encryptedFilename, {
      algorithm: "aes-256-gcm",
      format: "OCBK1",
      environment: options.config.environment,
      createdAt: now.toISOString(),
    });

    const deletedKeys = await pruneExpiredBackups(options, now);
    options.logger.info(
      { key, sizeBytes: encryptedStat.size, deletedCount: deletedKeys.length },
      "encrypted SQLite backup completed",
    );
    return { key, deletedKeys, sizeBytes: encryptedStat.size };
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}

export async function downloadAndDecryptBackup(input: {
  config: SqliteBackupConfig;
  objectStore: BackupObjectStore;
  key: string;
  encryptedFilename: string;
  outputFilename: string;
}): Promise<void> {
  await input.objectStore.get(input.key, input.encryptedFilename);
  try {
    await decryptBackupFile(input.encryptedFilename, input.outputFilename, input.config.encryptionKey);
  } finally {
    await rm(input.encryptedFilename, { force: true });
  }
}

export async function encryptBackupFile(inputFilename: string, outputFilename: string, key: Buffer): Promise<void> {
  assertEncryptionKey(key);
  const iv = randomBytes(BACKUP_IV_BYTES);
  const temporaryFilename = `${outputFilename}.${crypto.randomUUID()}.tmp`;
  await mkdir(dirname(outputFilename), { recursive: true });
  await writeFile(temporaryFilename, Buffer.concat([BACKUP_MAGIC, iv]), { flag: "wx" });
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  try {
    await pipeline(createReadStream(inputFilename), cipher, createWriteStream(temporaryFilename, { flags: "a" }));
    await appendFile(temporaryFilename, cipher.getAuthTag());
    await rename(temporaryFilename, outputFilename);
  } catch (error) {
    await rm(temporaryFilename, { force: true });
    throw error;
  }
}

export async function decryptBackupFile(inputFilename: string, outputFilename: string, key: Buffer): Promise<void> {
  assertEncryptionKey(key);
  const inputStat = await stat(inputFilename);
  const headerLength = BACKUP_MAGIC.length + BACKUP_IV_BYTES;
  if (inputStat.size <= headerLength + BACKUP_TAG_BYTES) {
    throw new Error("Encrypted backup is truncated.");
  }

  const header = await readFileRange(inputFilename, 0, headerLength - 1);
  if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error("Encrypted backup format is not supported.");
  }
  const iv = header.subarray(BACKUP_MAGIC.length);
  const tag = await readFileRange(inputFilename, inputStat.size - BACKUP_TAG_BYTES, inputStat.size - 1);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const temporaryFilename = `${outputFilename}.${crypto.randomUUID()}.tmp`;
  await mkdir(dirname(outputFilename), { recursive: true });

  try {
    await pipeline(
      createReadStream(inputFilename, { start: headerLength, end: inputStat.size - BACKUP_TAG_BYTES - 1 }),
      decipher,
      createWriteStream(temporaryFilename, { flags: "wx" }),
    );
    await rename(temporaryFilename, outputFilename);
  } catch (error) {
    await rm(temporaryFilename, { force: true });
    throw error;
  }
}

export function backupKeyFingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

async function pruneExpiredBackups(options: SqliteBackupRunnerOptions, now: Date): Promise<string[]> {
  const prefix = `${options.config.prefix}/${options.config.environment}/`;
  const cutoff = now.getTime() - options.config.retentionDays * 86_400_000;
  const objects = await options.objectStore.list(prefix);
  const expiredKeys = objects
    .filter((object) => object.lastModified !== undefined && object.lastModified.getTime() < cutoff)
    .map((object) => object.key);
  await options.objectStore.delete(expiredKeys);
  return expiredKeys;
}

function createBackupObjectKey(config: SqliteBackupConfig, now: Date, runId: string): string {
  const date = now.toISOString();
  return `${config.prefix}/${config.environment}/${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}/${date.replaceAll(":", "-")}-${runId}-connect.sqlite.enc`;
}

function parseEncryptionKey(value: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  assertEncryptionKey(key);
  return key;
}

function assertEncryptionKey(key: Buffer): void {
  if (key.length !== 32) {
    throw new Error("OOMOL_CONNECT_BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
}

function readRequired(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when OOMOL_CONNECT_BACKUP_ENABLED is true.`);
  }
  return value;
}

function readPositiveInteger(value: string | undefined, fallback: number, minimum: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`Backup interval or retention value must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
}

function readBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function normalizePrefix(value: string): string {
  const normalized = value
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Backup prefix or environment is invalid.");
  }
  return normalized;
}

async function readFileRange(filename: string, start: number, end: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of createReadStream(filename, { start, end })) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function backupFilenameForKey(key: string): string {
  return basename(key);
}
