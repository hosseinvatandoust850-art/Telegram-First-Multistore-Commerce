import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { startServer } from './app.js';
import { startScheduler } from './services/scheduler.js';
import { assertProductionPaymentConfig } from './services/ton.js';
// Fail fast if critical configuration is missing (validation runs at import).
assertProductionPaymentConfig();
async function main() {
    // In a single-service deployment, run the scheduler inside the web process.
    // For scale-out, set ENABLE_INLINE_WORKER=false and run the worker service.
    if (env.worker.enableInlineWorker) {
        startScheduler();
    }
    else {
        logger.info('inline worker disabled (ENABLE_INLINE_WORKER=false); run a dedicated worker');
    }
    await startServer();
}
main().catch((err) => {
    logger.error({ err }, 'failed to start application');
    process.exit(1);
});
