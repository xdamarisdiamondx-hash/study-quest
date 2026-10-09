/**
 * File store (P5, ADR-027).
 *
 * Cloudflare R2 via S3-compatible API when configured, otherwise local disk.
 * The interface is the same so the rest of the app doesn't care where bytes live.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Where the local store keeps bytes; exported so export/backup can walk it (P21). */
export const DATA_ROOT = join(__dirname, "..", "..", "..", "data", "files");

export interface FileStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

function localStore(): FileStore {
  return {
    async put(key: string, body: Buffer, _contentType: string) {
      const fullPath = join(DATA_ROOT, key);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, body);
    },
    async getUrl(key: string) {
      // Local dev: serve via the API route
      return `/api/files/${encodeURIComponent(key)}`;
    },
    async delete(key: string) {
      const fullPath = join(DATA_ROOT, key);
      await unlink(fullPath).catch(() => {}); // ignore missing
    },
  };
}

function r2Store(): FileStore {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const bucket = process.env.R2_BUCKET || "studyquest";

  return {
    async put(key: string, body: Buffer, contentType: string) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async getUrl(key: string, expiresIn = 3600) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn });
    },
    async delete(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export const fileStore: FileStore = process.env.R2_ACCOUNT_ID ? r2Store() : localStore();

/** Serve local files in development (mounted at /api/files/:key) */
export async function serveLocalFile(key: string) {
  const fullPath = join(DATA_ROOT, key);
  const stream = createReadStream(fullPath);
  return stream;
}