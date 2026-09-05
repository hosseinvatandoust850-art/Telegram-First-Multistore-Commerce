import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
const API_BASE = 'https://api.telegram.org';
function botUrl(token, method) {
    return `${API_BASE}/bot${token}/${method}`;
}
/** Thin wrapper over a single bot token. */
export class TelegramBot {
    token;
    constructor(token) {
        this.token = token;
    }
    async call(method, payload = {}) {
        const res = await fetch(botUrl(this.token, method), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({ ok: false })));
        if (!json.ok) {
            // Telegram returns 429 too many requests; surface helpful context.
            logger.warn({ method, description: json.description }, 'telegram api error');
            throw new Error(`Telegram ${method} failed: ${json.description || 'unknown'}`);
        }
        return json.result;
    }
    sendMessage(chatId, text, opts = {}) {
        return this.call('sendMessage', { chat_id: chatId, text, ...opts });
    }
    setWebhook(url, secretToken) {
        const payload = { url };
        if (secretToken)
            payload.secret_token = secretToken;
        return this.call('setWebhook', payload);
    }
    deleteWebhook() {
        return this.call('deleteWebhook');
    }
    getWebhookInfo() {
        return this.call('getWebhookInfo');
    }
    setMyCommands(commands) {
        return this.call('setMyCommands', { commands });
    }
    getMe() {
        return this.call('getMe');
    }
}
/** The configured master bot (empty token returns null). */
export function masterBot() {
    return env.telegram.botToken ? new TelegramBot(env.telegram.botToken) : null;
}
