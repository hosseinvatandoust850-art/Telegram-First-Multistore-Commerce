import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, writeFile, readFile, stat, unlink, readdir } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
/**
 * Storage abstraction.
 * - If S3-compatible storage is configured (S3_ENDPOINT + S3_BUCKET), uploads go
 *   to object storage (recommended so files survive redeploys and scale across
 *   instances).
 * - Otherwise we fall back to a local directory — on Railway this should point
 *   at a Volume so the data is not lost when the container is replaced.
 */
let s3 = null;
function getS3() {
    if (s3)
        return s3;
    s3 = new S3Client({
        endpoint: env.storage.endpoint,
        region: env.storage.region,
        forcePathStyle: env.storage.forcePathStyle,
        credentials: env.storage.accessKeyId
            ? {
                accessKeyId: env.storage.accessKeyId,
                secretAccessKey: env.storage.secretAccessKey || '',
            }
            : undefined,
    });
    return s3;
}
let localRoot = null;
function isWritableDir(dir) {
    try {
        mkdirSync(dir, { recursive: true });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Resolve a writable local directory. Prefers the configured STORAGE_DIR (e.g.
 * a Railway volume at /app/storage); falls back to ./storage in the working
 * directory so the app still works in dev or on a fresh container without a
 * volume.
 */
function dataRoot() {
    if (localRoot)
        return localRoot;
    const candidates = [env.storage.localDir, join(process.cwd(), 'storage')];
    for (const dir of candidates) {
        if (isWritableDir(dir)) {
            localRoot = resolve(dir);
            return localRoot;
        }
    }
    localRoot = resolve(env.storage.localDir);
    return localRoot;
}
function localSafePath(prefix, name) {
    const base = dataRoot();
    const safeName = normalize(name).replace(/\.\./g, '').replace(/^[/\\]+/, '');
    return join(base, prefix, safeName);
}
export async function storeFile(prefix, name, data, contentType) {
    const key = `${prefix}/${randomUUID()}-${name.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
    if (env.storage.type === 's3') {
        await getS3().send(new PutObjectCommand({
            Bucket: env.storage.bucket,
            Key: key,
            Body: data,
            ContentType: contentType,
        }));
        const url = env.storage.publicBaseUrl.replace(/\/+$/, '');
        return { key, url: `${url}/${key}` };
    }
    const filePath = localSafePath(prefix, key);
    await mkdir(join(dataRoot(), prefix), { recursive: true });
    await writeFile(filePath, data);
    // STORAGE_URL may be a base path (served by the app) or a fully-qualified URL.
    const base = env.storage.publicBaseUrl;
    const url = base.startsWith('http')
        ? `${base.replace(/\/+$/, '')}/${key}`
        : `${base.replace(/\/+$/, '')}/${key}`;
    return { key, url };
}
export async function deleteFile(key) {
    if (env.storage.type === 's3') {
        await getS3().send(new DeleteObjectCommand({ Bucket: env.storage.bucket, Key: key }));
        return;
    }
    await unlink(localSafePath('', key)).catch(() => undefined);
}
export async function readLocalFile(key) {
    if (env.storage.type === 's3')
        return undefined; // handled by presigned URL
    try {
        return await readFile(localSafePath('', key));
    }
    catch {
        return undefined;
    }
}
export async function presignRead(key) {
    if (env.storage.type === 's3') {
        return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: env.storage.bucket, Key: key }), { expiresIn: 3600 });
    }
    return `${env.storage.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
}
export async function storageHealth() {
    try {
        if (env.storage.type === 's3') {
            await getS3().send(new PutObjectCommand({
                Bucket: env.storage.bucket,
                Key: `health/${randomUUID()}.txt`,
                Body: Buffer.from('ok'),
            }));
            return true;
        }
        await mkdir(dataRoot(), { recursive: true });
        return true;
    }
    catch (err) {
        logger.warn({ err, type: env.storage.type }, 'storage health check failed');
        return false;
    }
}
export async function localFileSize(prefix) {
    const base = dataRoot();
    try {
        const dir = prefix ? join(base, prefix) : base;
        const items = await readdir(dir, { withFileTypes: true });
        let total = 0;
        for (const item of items) {
            if (item.isDirectory()) {
                total += await localFileSize(join(prefix || '', item.name));
            }
            else {
                total += (await stat(join(dir, item.name))).size;
            }
        }
        return total;
    }
    catch {
        return 0;
    }
}
