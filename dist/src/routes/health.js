import { Hono } from 'hono';
import { dbHeartbeat } from '../services/scheduler.js';
import { storageHealth } from '../services/storage.js';
import { pgDumpAvailable } from '../services/backup.js';
import { env } from '../config/env.js';
/**
 * Production health endpoint.
 * - Always returns HTTP 200 if the app process is alive (so Railway's health
 *   check does not kill the container).
 * - Reports readiness of critical dependencies (database, storage) in the body.
 * - Never exposes secrets.
 */
export const healthRoutes = new Hono();
healthRoutes.get('/health', async (c) => {
    const [dbOk, storageOk, dumpOk] = await Promise.all([
        dbHeartbeat(),
        storageHealth(),
        pgDumpAvailable(),
    ]);
    const ok = dbOk;
    const body = {
        status: ok ? 'ok' : 'degraded',
        service: 'telegram-commerce',
        version: '1.0.0',
        env: env.app.env,
        checks: {
            database: dbOk,
            storage: storageOk,
            backupTooling: dumpOk,
        },
        time: new Date().toISOString(),
    };
    return c.json(body, ok ? 200 : 503);
});
