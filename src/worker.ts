import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { startScheduler } from './services/scheduler.js';

/**
 * Dedicated background worker process.
 * Run as a separate Railway service with ENABLE_INLINE_WORKER=false on the web
 * service so background polling/backups don't compete with request handling.
 */
async function main(): Promise<void> {
  logger.info(
    { enableBackups: env.worker.enableBackups, tonPoll: env.worker.tonPollCron || env.ton.pollIntervalMs },
    'worker starting',
  );
  startScheduler();

  // Keep the process alive (node-cron holds the loop open; add a keepalive for safety).
  process.stdin.resume();
  const tick = setInterval(() => {}, 60_000);
  tick.unref();
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
