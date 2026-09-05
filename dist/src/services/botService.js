import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { TelegramBot } from './telegram.js';
import { getStoreByWebhookSecret } from './storeService.js';
import { upsertTelegramUser } from './userService.js';
import { listProducts } from './productService.js';
import { masterBot } from './telegram.js';
function botForStore(store) {
    const token = store.telegramBotToken || env.telegram.botToken;
    return token ? new TelegramBot(token) : null;
}
/** Build the public webhook URL for a store's bot. */
export function webhookUrlForStore(store) {
    const base = env.app.publicUrl;
    return `${base}/api/telegram/webhook/${store.botWebhookSecret}`;
}
/**
 * Register (or refresh) the Telegram webhook for a store so updates route here.
 * Uses HTTPS; supplies a secret token for verification.
 */
export async function registerStoreWebhook(store) {
    const bot = botForStore(store);
    if (!bot) {
        throw new Error('No Telegram bot token configured for this store');
    }
    const url = webhookUrlForStore(store);
    const result = await bot.setWebhook(url, store.botWebhookSecret || undefined);
    return { ok: true, url, info: result };
}
export async function registerMasterWebhook() {
    const bot = masterBot();
    if (!bot)
        throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    const url = `${env.app.publicUrl}/api/telegram/webhook/master`;
    await bot.setWebhook(url, env.telegram.webhookSecret || undefined);
    return { url, ok: true };
}
/** Parse an incoming webhook payload. */
export function parseUpdate(body) {
    try {
        return JSON.parse(body);
    }
    catch {
        return {};
    }
}
function textOf(msg) {
    return msg?.text;
}
/** Handle an incoming update from the store webhook route. */
export async function handleStoreUpdate(store, update) {
    const bot = botForStore(store);
    if (!bot) {
        logger.warn({ storeId: store.id }, 'received telegram update but no bot configured');
        return { replied: false };
    }
    const msg = update.message || update.callback_query?.message;
    if (!msg)
        return { replied: false };
    const sender = msg.from;
    if (!sender || sender.is_bot)
        return { replied: false };
    // Register / find the customer (side effect: ensure the user exists).
    await upsertTelegramUser({
        id: sender.id,
        username: sender.username,
        first_name: sender.first_name,
        last_name: sender.last_name,
    });
    const text = textOf(msg) || update.callback_query?.data || '';
    const chatId = msg.chat.id;
    const storeUrl = `${env.app.publicUrl}/store/${store.slug}`;
    const cmds = await commandsFor();
    if (text.startsWith('/start')) {
        await bot.sendMessage(chatId, [
            `Welcome to <b>${escapeHtml(store.name)}</b>! 🛍️`,
            '',
            'Browse and shop online:',
            storeUrl,
            '',
            'Use /help to see available commands.',
        ].join('\n'), { parse_mode: 'HTML' });
        return { replied: true };
    }
    if (text.startsWith('/help')) {
        await bot.sendMessage(chatId, cmds, { parse_mode: 'HTML' });
        return { replied: true };
    }
    if (text.startsWith('/catalog')) {
        const products = await listProducts(store.id, { activeOnly: true });
        if (products.length === 0) {
            await bot.sendMessage(chatId, 'No products yet. 🛒', { parse_mode: 'HTML' });
        }
        else {
            await bot.sendMessage(chatId, '🛍️ <b>Catalog</b>\n' +
                products
                    .slice(0, 20)
                    .map((p) => `• ${escapeHtml(p.name)} — ${p.price} ${p.currency}`)
                    .join('\n'), { parse_mode: 'HTML' });
        }
        return { replied: true };
    }
    // Try to find a product by search text (simple match).
    if (text && text.length > 1) {
        const products = await listProducts(store.id, { activeOnly: true, search: text });
        if (products.length > 0) {
            const p = products[0];
            await bot.sendMessage(chatId, `🔎 Found: <b>${escapeHtml(p.name)}</b>\n` +
                `${p.price} ${p.currency}\n${p.description ? escapeHtml(p.description) : ''}\n` +
                'Buy here: ' +
                `${env.app.publicUrl}/store/${store.slug}/product/${p.slug}`, { parse_mode: 'HTML' });
            return { replied: true };
        }
    }
    // Default help.
    await bot.sendMessage(chatId, cmds, { parse_mode: 'HTML' });
    return { replied: true };
}
async function commandsFor() {
    return [
        '🤖 <b>Commands</b>',
        '/start — Start shopping',
        '/catalog — View products',
        '/help — Help',
    ].join('\n');
}
/** Notify the store owner (bot) of a new order or payment event. */
export async function notifyStoreOwner(store, text) {
    const bot = botForStore(store);
    if (!bot)
        return;
    const target = store.telegramUsername
        ? store.telegramUsername.startsWith('@')
            ? store.telegramUsername
            : `@${store.telegramUsername}`
        : null;
    if (!target)
        return;
    await bot.sendMessage(target, text, { parse_mode: 'HTML' }).catch((err) => {
        logger.warn({ err }, 'failed to notify store owner');
    });
}
export function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/** Handle the master webhook (default bot) — simple onboarding help. */
export async function handleMasterUpdate(update) {
    const bot = masterBot();
    if (!bot)
        return { replied: false };
    const msg = update.message;
    if (!msg)
        return { replied: false };
    const chatId = msg.chat.id;
    const text = textOf(msg) || '';
    if (text.startsWith('/start')) {
        await bot.sendMessage(chatId, '👋 Welcome! This is the Multistore Commerce platform bot.\n\n' +
            'Use the buttons or your store to start shopping.', { parse_mode: 'HTML' });
        // upsert super-admin / default admin if configured
        if (msg.from) {
            await upsertTelegramUser({
                id: msg.from.id,
                username: msg.from.username,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name,
            });
        }
        return { replied: true };
    }
    await bot.sendMessage(chatId, 'Use /start to begin.', { parse_mode: 'HTML' });
    return { replied: true };
}
export async function resolveStoreFromSecret(secret) {
    return getStoreByWebhookSecret(secret);
}
