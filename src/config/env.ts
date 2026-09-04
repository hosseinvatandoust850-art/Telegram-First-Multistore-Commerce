import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated environment configuration.
 *
 * - On Railway, variables come from the service Variables / references.
 * - We fail fast with a clear, human-readable diagnostic so operators know
 *   exactly which requirement is missing instead of hitting a cryptic error.
 * - Optional integrations degrade gracefully (the app still boots without
 *   Telegram, TON API keys, S3, etc.).
 */

const bool = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return undefined;
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
  });

function publicUrl(): { url: string } | { error: string } {
  const explicit = process.env.APP_URL;
  if (explicit && explicit.trim()) {
    return { url: explicit.trim().replace(/\/+$/, '') };
  }
  // Railway provides the public domain of the service.
  const railwayDomain =
    process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
  if (railwayDomain && railwayDomain.trim()) {
    return { url: `https://${railwayDomain.trim().replace(/\/+$/, '')}` };
  }
  const port = process.env.PORT || '8080';
  if (process.env.NODE_ENV !== 'production') {
    return { url: `http://localhost:${port}` };
  }
  return {
    error:
      'APP_URL is required in production (or expose RAILWAY_PUBLIC_DOMAIN). ' +
      'Set it to e.g. https://your-app.up.railway.app.',
  };
}

const appUrl = publicUrl();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

export interface Env {
  isProduction: boolean;
  isDevelopment: boolean;
  app: {
    port: number;
    publicUrl: string;
    env: string;
  };
  db: {
    url: string;
    poolMax: number;
    directUrl?: string;
  };
  security: {
    appSecret: string;
    sessionTtlSeconds: number;
    superAdminTelegramIds: string[];
  };
  telegram: {
    botToken?: string;
    botUsername?: string;
    webhookHttps: boolean;
    webhookSecret?: string;
  };
  ton: {
    network: 'mainnet' | 'testnet';
    provider: 'toncenter' | 'tonapi';
    apiUrl: string;
    apiKey?: string;
    paymentAddress?: string;
    allowTestnet: boolean;
    devMode: boolean;
    pollIntervalMs: number;
  };
  storage: {
    type: 's3' | 'local';
    endpoint?: string;
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
    publicBaseUrl: string;
    localDir: string;
  };
  worker: {
    enableInlineWorker: boolean;
    backupCron: string;
    tonPollCron?: string;
    enableBackups: boolean;
    backupS3: boolean;
    backupRetention: number;
  };
  optional: {
    allowedEmailDomains: string[];
    defaultLocale: string;
    smtpHost?: string;
    smtpPort: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
    sentryDsn?: string;
  };
}

function parse(): Env {
  const missing: string[] = [];

  if (isProduction && !process.env.APP_SECRET) {
    missing.push('APP_SECRET — set a long random string (e.g. openssl rand -hex 32).');
  }
  if (isProduction && !process.env.DATABASE_URL) {
    missing.push(
      'DATABASE_URL — connect a Railway PostgreSQL service and set ' +
        'DATABASE_URL=${{Postgres.DATABASE_URL}} (or its internal connection string).',
    );
  }
  if ('error' in appUrl) {
    missing.push(appUrl.error);
  }

  if (missing.length > 0) {
    throw new Error(
      `\n[env] Missing required configuration:\n${missing.map((m) => '  - ' + m).join('\n')}\n` +
        'See .env.example for the full reference and README for Railway setup.\n',
    );
  }

  return {
    isProduction,
    isDevelopment: !isProduction && nodeEnv !== 'test',
    app: {
      port: Number(process.env.PORT || 8080),
      publicUrl: 'url' in appUrl ? appUrl.url : 'http://localhost:8080',
      env: nodeEnv,
    },
    db: {
      url: process.env.DATABASE_URL || '',
      poolMax: Number(process.env.DATABASE_POOL_MAX || 10),
      directUrl: process.env.DIRECT_URL || undefined,
    },
    security: {
      appSecret: process.env.APP_SECRET || 'dev-insecure-secret',
      sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 604800),
      superAdminTelegramIds: (process.env.SUPER_ADMIN_TELEGRAM_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || undefined,
      webhookHttps: bool.parse(process.env.TELEGRAM_WEBHOOK_HTTPS) ?? true,
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
    },
    ton: {
      network: (process.env.TON_NETWORK as 'mainnet' | 'testnet') || 'mainnet',
      provider: (process.env.TON_PROVIDER as 'toncenter' | 'tonapi') || 'toncenter',
      apiUrl:
        process.env.TON_API_URL ||
        (process.env.TON_PROVIDER === 'tonapi'
          ? 'https://tonapi.io/v2'
          : 'https://toncenter.com/api/v2'),
      apiKey: process.env.TON_API_KEY || undefined,
      paymentAddress: process.env.TON_PAYMENT_ADDRESS || undefined,
      allowTestnet: bool.parse(process.env.PAYMENT_ALLOW_TESTNET) ?? false,
      devMode: bool.parse(process.env.PAYMENT_DEV_MODE) ?? false,
      pollIntervalMs: Number(process.env.TON_POLL_INTERVAL_MS || 15000),
    },
    storage: {
      type: process.env.S3_ENDPOINT && process.env.S3_BUCKET ? 's3' : 'local',
      endpoint: process.env.S3_ENDPOINT || undefined,
      bucket: process.env.S3_BUCKET || undefined,
      region: process.env.S3_REGION || 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle: bool.parse(process.env.S3_FORCE_PATH_STYLE) ?? true,
      publicBaseUrl:
        process.env.STORAGE_URL ||
        (process.env.S3_ENDPOINT && process.env.S3_BUCKET
          ? `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com`
          : '/storage'),
      localDir: process.env.STORAGE_DIR || '/app/storage',
    },
    worker: {
      enableInlineWorker: bool.parse(process.env.ENABLE_INLINE_WORKER) ?? true,
      backupCron: process.env.BACKUP_CRON || '0 3 * * *',
      tonPollCron: process.env.TON_POLL_CRON || undefined,
      enableBackups: bool.parse(process.env.ENABLE_BACKUPS) ?? true,
      backupS3: bool.parse(process.env.BACKUP_S3) ?? false,
      backupRetention: Number(process.env.BACKUP_RETENTION || 7),
    },
    optional: {
      allowedEmailDomains: (process.env.ALLOWED_EMAIL_DOMAINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      defaultLocale: process.env.DEFAULT_LOCALE || 'en',
      smtpHost: process.env.SMTP_HOST || undefined,
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpUser: process.env.SMTP_USER || undefined,
      smtpPass: process.env.SMTP_PASS || undefined,
      smtpFrom: process.env.SMTP_FROM || undefined,
      sentryDsn: process.env.SENTRY_DSN || undefined,
    },
  };
}

// Intentionally throw at import time so a misconfigured process fails fast
// with a clear diagnostic. Production must not silently boot half-configured.
export const env = parse();
