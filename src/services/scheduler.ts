import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { attemptTonVerification, listPendingTonPayments } from './paymentService.js';
import { createBackup } from './backup.js';
import { queryOne } from '../db/pool.js';

const running = new Map<string, boolean>();

/**
 * Run a scheduled task with a guard so overlapping runs never stack up when a
 * database is slow or a lock is held.
 */
async function guarded(key: string, fn: () => Promise<void>): Promise<void> {
  if (running.get(key)) {
    logger.warn({ key }, 'skipping overlapping scheduled run');
    return;
  }
  running.set(key, true);
  try {
    await fn();
  } catch (err) {
    logger.error({ err, key }, 'scheduled task failed');
  } finally {
    running.delete(key);
  }
}

async function pollTonPayments(): Promise<void> {
  const pending = await listPendingTonPayments();
  logger.debug({ count: pending.length }, 'polling TON payments');
  for (const payment of pending) {
    try {
      await attemptTonVerification(payment.id);
    } catch (err) {
      logger.warn({ paymentId: payment.id, err }, 'TON payment poll error');
    }
  }
}

async function runBackup(): Promise<void> {
  if (!env.worker.enableBackups) return;
  logger.info('running scheduled database backup');
  await createBackup();
}

export interface JobRegistrations {
  [name: string]: { kind: 'cron' | 'interval'; schedule: string; handler: () => Promise<void> };
}

function register(jobKey: string, schedule: string, handler: () => Promise<void>): void {
  if (cron.validate(schedule)) {
    cron.schedule(schedule, () => guarded(jobKey, handler), {
      timezone: 'UTC',
    });
    logger.info({ jobKey, schedule }, 'scheduled job registered');
  } else {
    logger.warn({ jobKey, schedule }, 'invalid cron expression; job not registered');
  }
}

/** Start all background jobs. Call once at service startup. */
export function startScheduler(): void {
  const inlineOnly = env.worker.enableInlineWorker;

  // TON payment polling.
  if (env.worker.tonPollCron) {
    register('ton-poll', env.worker.tonPollCron, pollTonPayments);
  } else {
    const ms = env.ton.pollIntervalMs;
    const minutes = Math.max(1, Math.round(ms / 60000));
    register('ton-poll', `*/${minutes} * * * *`, pollTonPayments);
  }
  logger.info(
    { enableInlineWorker: inlineOnly, enableBackups: env.worker.enableBackups },
    'scheduler started',
  );

  // Backup job.
  if (env.worker.enableBackups) {
    register('backup', env.worker.backupCron, runBackup);
  }

  // Optional: re-register webhook/refresh tasks can be added here.
}

/**
 * Toggle the health "ok" based on a simple DB heartbeat. Used by the health
 * endpoint to confirm the app can reach its critical dependency.
 */
export async function dbHeartbeat(): Promise<boolean> {
  try {
    const row = await queryOne<{ n: number }>('SELECT 1 AS n');
    return row?.n === 1;
  } catch {
    return false;
  }
}
