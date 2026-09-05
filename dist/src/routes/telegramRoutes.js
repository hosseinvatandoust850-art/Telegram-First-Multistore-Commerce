import { Hono } from 'hono';
import { resolveStoreFromSecret, handleStoreUpdate, handleMasterUpdate, parseUpdate, } from '../services/botService.js';
import { logger } from '../lib/logger.js';
export const telegramRoutes = new Hono();
async function handleMaster(c) {
    const secret = c.req.header('x-telegram-bot-api-secret-token');
    if (secret && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return c.text('forbidden', 403);
    }
    const body = await c.req.text();
    const update = parseUpdate(body);
    try {
        await handleMasterUpdate(update);
    }
    catch (err) {
        logger.error({ err }, 'master telegram update handling failed');
    }
    return c.text('ok');
}
/**
 * Telegram sends updates to the webhook URL we registered:
 *   {APP_URL}/api/telegram/webhook/:storeSecret
 * Register the /master route explicitly (before :secret), and also guard inside
 * the :secret handler so a reserved "master" secret always routes correctly
 * regardless of router precedence.
 */
telegramRoutes.post('/telegram/webhook/master', handleMaster);
telegramRoutes.post('/telegram/webhook/:secret', async (c) => {
    const secret = c.req.param('secret');
    if (secret === 'master')
        return handleMaster(c);
    const headerSecret = c.req.header('x-telegram-bot-api-secret-token');
    // Resolve and handle defensively: Telegram retries on any non-2xx, so we
    // always return 200 for unknown secrets or transient DB errors and log them,
    // rather than triggering an infinite retry storm on the bot.
    let store;
    try {
        store = await resolveStoreFromSecret(secret);
    }
    catch (err) {
        logger.error({ err, secret }, 'telegram webhook: store lookup failed');
        return c.text('ok');
    }
    if (!store) {
        logger.warn({ secret }, 'telegram webhook: unknown store secret');
        return c.text('ok');
    }
    if (store.botWebhookSecret && headerSecret && headerSecret !== store.botWebhookSecret) {
        logger.warn({ secret }, 'telegram webhook: secret token mismatch');
        return c.text('forbidden', 403);
    }
    const body = await c.req.text();
    const update = parseUpdate(body);
    try {
        await handleStoreUpdate(store, update);
    }
    catch (err) {
        logger.error({ err, storeId: store.id }, 'telegram update handling failed');
    }
    return c.text('ok');
});
