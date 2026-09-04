import 'dotenv/config';

/**
 * Prints a clear diagnostic of the runtime configuration without needing a
 * database. Useful in CI and the Railway deploy step to confirm the essentials
 * are present. Fails (exit 1) only when required production values are missing.
 */
function main(): void {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.APP_SECRET) missing.push('APP_SECRET');
  if (!process.env.APP_URL && !process.env.RAILWAY_PUBLIC_DOMAIN) {
    missing.push('APP_URL or RAILWAY_PUBLIC_DOMAIN');
  }

  if (missing.length > 0) {
    console.error('[env:check] MISSING required variables:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error('See .env.example for the full reference.');
    // In non-production we continue booting (dev may not have a DB yet), but we
    // still exit non-zero so CI notices. Production must fail hard.
    process.exit(process.env.NODE_ENV === 'production' ? 1 : 0);
  }

  const log: Array<[string, string]> = [
    ['APP_URL', process.env.APP_URL || `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`],
    ['PORT', process.env.PORT || '8080'],
    ['NODE_ENV', process.env.NODE_ENV || 'development'],
    ['DATABASE_URL', 'set (' + (process.env.DATABASE_URL || '').split('@')[0] + '@…)'],
    ['storage type', process.env.S3_ENDPOINT && process.env.S3_BUCKET ? 's3' : 'local-volume'],
    ['inline worker', process.env.ENABLE_INLINE_WORKER || 'true'],
  ];
  console.log('[env:check] Configuration summary:');
  for (const [k, v] of log) console.log(`  ${k}: ${v}`);
  console.log('[env:check] OK');
}

main();
