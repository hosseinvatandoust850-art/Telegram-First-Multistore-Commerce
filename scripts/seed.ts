import 'dotenv/config';

/**
 * DEVELOPMENT demo seed.
 *
 * IMPORTANT: This NEVER runs implicitly, and refuses to create demo data in
 * production. It only seeds when NODE_ENV is not "production", OR when
 * ALLOW_SEED=true is explicitly set (for a regulated staging test).
 *
 * Production installations create data through the first-run setup flow
 * (create store -> add products -> connect payments), never through a seed.
 */
const isProd = process.env.NODE_ENV === 'production';
const force = process.env.ALLOW_SEED === 'true';

async function main(): Promise<void> {
  if (isProd && !force) {
    console.error(
      '[seed] Refusing to run in production. Production data is created via ' +
        'the first-run setup flow, never a demo seed.',
    );
    process.exit(1);
  }

  // Dynamically import so production never loads the demo modules at startup.
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { runMigrations } = await import('../scripts/migrate.js');
    await runMigrations();
  } catch (err) {
    console.error('[seed] migrations failed:', (err as Error).message);
  }

  // Create a demo store + a couple of demo products if none exist.
  const [storeRow] = (await pool.query('SELECT id FROM "Store" LIMIT 1')).rows;
  if (!storeRow) {
    const { randomToken } = await import('../src/lib/crypto.js');
    const slug = `demo-${randomToken(3).toLowerCase()}`;
    const res = await pool.query(
      `INSERT INTO "Store" (slug, name, description, currency, "currencySymbol")
       VALUES ($1,$2,$3,'USDT','₮') RETURNING id`,
      [slug, 'Demo Store', 'A demo store for development.', 'https://demo.local'],
    );
    const storeId = res.rows[0].id;
    await pool.query(
      `INSERT INTO "Product" ("storeId", name, slug, type, price, currency, description, active)
       VALUES ($1,'Demo Digital Product','demo-digital','DIGITAL',10,'USDT','Instant digital delivery.',true)
        ,($1,'Demo Physical Item','demo-physical','PHYSICAL',25,'USDT','A physical demo item.',true)`,
      [storeId],
    );
    console.log('[seed] created demo store + 2 products (storeId=' + storeId + ')');
  } else {
    console.log('[seed] store already exists; skipping demo creation.');
  }

  await pool.end();
  console.log('[seed] done.');
}

main().catch((err) => {
  console.error('[seed]', err);
  process.exit(1);
});
