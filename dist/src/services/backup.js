import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { queryOne, query } from '../db/pool.js';
import { env } from '../config/env.js';
import { storeFile } from './storage.js';
import { logger } from '../lib/logger.js';
const execAsync = promisify(exec);
/**
 * Real backup strategy.
 * - Produces a full SQL dump with pg_dump (logical backup independent of the
 *   primary app database).
 * - Stores it in object storage (S3) when BACKUP_S3=true, or in a local
 *   directory that must be a Railway Volume so it survives redeploys.
 * - Records every run in "BackupJob" for observability.
 *
 * Restore: `psql "$DATABASE_URL" -f /path/to/dump.sql` (see README).
 */
export async function createBackup() {
    const url = env.db.directUrl || env.db.url;
    if (!url)
        throw new Error('DATABASE_URL is required for backups');
    const started = await queryOne(`INSERT INTO "BackupJob" (status, type) VALUES ('RUNNING', 'full') RETURNING *`);
    const jobId = started.id;
    try {
        const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`;
        // Use --no-owner so the dump can be restored onto a different instance.
        const dumpCmd = `pg_dump --dbname="${url}" --no-owner --no-privileges | gzip`;
        const { stdout } = await execAsync(dumpCmd, { maxBuffer: 200 * 1024 * 1024 });
        const buf = Buffer.from(stdout, 'utf8');
        if (env.worker.backupS3) {
            const { key } = await storeFile('backups', filename, buf, 'application/gzip');
            await queryOne(`UPDATE "BackupJob" SET status = 'COMPLETED', "storageKey" = $2,
           "sizeBytes" = $3, "completedAt" = now() WHERE id = $1 RETURNING *`, [jobId, key, BigInt(buf.length).toString()]);
            await pruneBackups();
            return (await getBackupJob(jobId));
        }
        // Local volume.
        const dir = join(env.storage.localDir, 'backups');
        await mkdir(dir, { recursive: true });
        const filePath = join(dir, filename);
        await writeFile(filePath, buf);
        const size = (await stat(filePath)).size;
        await query(`UPDATE "BackupJob" SET status = 'COMPLETED', "storageKey" = $2,
         "sizeBytes" = $3, "completedAt" = now() WHERE id = $1`, [jobId, `backups/${filename}`, BigInt(size).toString()]);
        await pruneBackups();
        return (await getBackupJob(jobId));
    }
    catch (err) {
        logger.error({ err }, 'backup failed');
        await query(`UPDATE "BackupJob" SET status = 'FAILED', error = $2, "completedAt" = now() WHERE id = $1`, [jobId, err.message]);
        throw err;
    }
}
export async function getBackupJob(id) {
    return queryOne('SELECT * FROM "BackupJob" WHERE id = $1', [id]);
}
export async function listBackups(limit = 20) {
    return query('SELECT * FROM "BackupJob" ORDER BY "createdAt" DESC LIMIT $1', [limit]);
}
/** Keep only the newest N local backups. */
async function pruneBackups() {
    const retention = env.worker.backupRetention;
    const dir = join(env.storage.localDir, 'backups');
    const files = [];
    try {
        const items = await readdir(dir, { withFileTypes: true });
        for (const item of items) {
            const full = join(dir, item.name);
            const s = await stat(full).catch(() => null);
            if (s && item.isFile())
                files.push({ name: item.name, mtime: s.mtimeMs });
        }
        files.sort((a, b) => b.mtime - a.mtime);
        for (const f of files.slice(retention)) {
            await unlink(join(dir, f.name)).catch(() => undefined);
        }
    }
    catch {
        // no backups dir yet -> nothing to prune
    }
}
/** Verify pg_dump is available (used by the health check). */
export async function pgDumpAvailable() {
    try {
        await execAsync('pg_dump --version');
        return true;
    }
    catch {
        return false;
    }
}
