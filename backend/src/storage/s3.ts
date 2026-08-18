import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import type { StorageDriver } from './index.js';

/** Compatible con AWS S3, Cloudflare R2, MinIO, Backblaze B2… */
export class S3Storage implements StorageDriver {
  private client = new S3Client({
    region: env.S3_REGION ?? 'auto',
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });

  private bucket = env.S3_BUCKET!;

  async save({
    key,
    body,
    mimeType,
    filename,
  }: {
    key: string;
    body: Buffer;
    mimeType: string;
    filename: string;
  }) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ContentDisposition: `inline; filename="${encodeURIComponent(filename)}"`,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: await this.urlFor(key), size: body.byteLength, mimeType };
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async urlFor(key: string) {
    // Con bucket público basta con componer la URL; si no, se firma por 7 días.
    if (env.S3_PUBLIC_URL) return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 60 * 60 * 24 * 7,
    });
  }
}
