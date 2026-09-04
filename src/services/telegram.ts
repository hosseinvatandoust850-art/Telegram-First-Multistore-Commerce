import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const API_BASE = 'https://api.telegram.org';

export interface TgMessage {
  update_id?: number;
  message?: TgMessageContent;
  callback_query?: { id: string; data: string; message?: TgMessageContent };
  [k: string]: unknown;
}

export interface TgMessageContent {
  message_id: number;
  from?: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
  chat: { id: number; type: string; username?: string };
  text?: string;
  [k: string]: unknown;
}

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: Record<string, unknown>;
  disable_web_page_preview?: boolean;
}

function botUrl(token: string, method: string): string {
  return `${API_BASE}/bot${token}/${method}`;
}

/** Thin wrapper over a single bot token. */
export class TelegramBot {
  constructor(private token: string) {}

  async call<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(botUrl(this.token, method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!json.ok) {
      // Telegram returns 429 too many requests; surface helpful context.
      logger.warn({ method, description: json.description }, 'telegram api error');
      throw new Error(`Telegram ${method} failed: ${json.description || 'unknown'}`);
    }
    return json.result as T;
  }

  sendMessage(chatId: number | string, text: string, opts: SendMessageOptions = {}) {
    return this.call('sendMessage', { chat_id: chatId, text, ...opts });
  }

  setWebhook(url: string, secretToken?: string) {
    const payload: Record<string, unknown> = { url };
    if (secretToken) payload.secret_token = secretToken;
    return this.call('setWebhook', payload);
  }

  deleteWebhook() {
    return this.call('deleteWebhook');
  }

  getWebhookInfo() {
    return this.call('getWebhookInfo');
  }

  setMyCommands(commands: Array<{ command: string; description: string }>) {
    return this.call('setMyCommands', { commands });
  }

  getMe() {
    return this.call('getMe');
  }
}

/** The configured master bot (empty token returns null). */
export function masterBot(): TelegramBot | null {
  return env.telegram.botToken ? new TelegramBot(env.telegram.botToken) : null;
}
