import { Hono } from 'hono';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { healthRoutes } from './routes/health.js';
import { storefrontRoutes } from './routes/storefrontRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { telegramRoutes } from './routes/telegramRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { setupRoutes } from './routes/setupRoutes.js';
import { readLocalFile } from './services/storage.js';
import { registerMasterWebhook } from './services/botService.js';
export function buildApp() {
    const app = new Hono();
    // Trust proxy headers so we can derive the real public URL behind Railway.
    app.use('*', async (c, next) => {
        // Standard request logging (redact handled by pino).
        const start = Date.now();
        await next();
        logger.info({
            method: c.req.method,
            path: c.req.path,
            status: c.res.status,
            ms: Date.now() - start,
        }, 'request');
    });
    app.route('/', healthRoutes);
    app.route('/api', authRoutes);
    app.route('/api', setupRoutes);
    app.route('/', storefrontRoutes);
    app.route('/api', telegramRoutes);
    app.route('/api', adminRoutes);
    // Serve local storage (S3 assets are served by the object store URL).
    app.get('/storage/*', async (c) => {
        if (env.storage.type === 's3')
            return c.notFound();
        const key = c.req.path.replace(/^\/storage\//, '');
        const buf = await readLocalFile(key);
        if (!buf)
            return c.notFound();
        const path = c.req.path;
        const ext = path.slice(path.lastIndexOf('.'));
        const ct = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] ||
            'application/octet-stream';
        return c.body(new Uint8Array(buf), 200, {
            'Content-Type': ct,
            'Content-Length': String(buf.length),
        });
    });
    // 404 for unmatched API routes.
    app.notFound((c) => c.json({ ok: false, error: 'Not found' }, 404));
    // Central error handler — never leak internal error details to clients.
    app.onError((err, c) => {
        if (err instanceof AppError) {
            return c.json({ ok: false, error: err.message, code: err.code }, err.status);
        }
        logger.error({ err }, 'unhandled error');
        return c.json({ ok: false, error: 'Internal server error', code: 'INTERNAL' }, 500);
    });
    return app;
}
/** Start the web server. */
export async function startServer() {
    const app = buildApp();
    const { serve } = await import('@hono/node-server');
    serve({
        fetch: app.fetch,
        port: env.app.port,
        hostname: '0.0.0.0',
    }, (info) => {
        logger.info({ port: info.port, address: info.address, url: env.app.publicUrl }, 'server started');
    });
    // Register the default/master webhook if configured.
    if (env.telegram.botToken) {
        registerMasterWebhook()
            .then((r) => logger.info({ url: r.url }, 'master webhook registered'))
            .catch((err) => logger.warn({ err }, 'could not register master webhook (manual setup needed)'));
    }
}
