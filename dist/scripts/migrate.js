import 'dotenv/config';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * Locate the migration files regardless of whether we run via tsx (dev) or the
 * compiled dist build (production). We walk upward from the script location
 * looking for a "migrations" directory; we also honour the current working
 * directory so a production run from the project root works too.
 */
export function resolveMigrationsDir() {
    const candidates = [
        join(process.cwd(), 'migrations'),
        join(__dirname, '..', 'migrations'),
        join(__dirname, '..', '..', 'migrations'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return candidates[0];
}
/**
 * Production-safe forward-only migration runner.
 * - Creates a _migrations ledger table.
 * - Applies not-yet-applied migration files in sorted order, each in its own
 *   transaction so a failed migration never leaves a partial schema.
 */
export async function runMigrations() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not set. Configure the Railway PostgreSQL service ' +
            'and set DATABASE_URL=${{Postgres.DATABASE_URL}} (or the internal URL).');
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        id          SERIAL PRIMARY KEY,
        name        TEXT UNIQUE NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
        const appliedRows = await pool.query('SELECT name FROM "_migrations"');
        const applied = new Set(appliedRows.rows.map((r) => r.name));
        const migrationsDir = resolveMigrationsDir();
        const files = readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        if (files.length === 0) {
            console.log('[migrate] no migration files found in ' + migrationsDir);
            return 0;
        }
        let appliedCount = 0;
        for (const file of files) {
            if (applied.has(file)) {
                console.log(`[migrate] skip   ${file} (already applied)`);
                continue;
            }
            const sql = readFileSync(join(migrationsDir, file), 'utf8');
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO "_migrations" (name) VALUES ($1)', [
                    file,
                ]);
                await client.query('COMMIT');
                console.log(`[migrate] applied ${file}`);
                appliedCount += 1;
            }
            catch (err) {
                await client.query('ROLLBACK');
                console.error(`[migrate] FAILED ${file}`);
                throw err;
            }
            finally {
                client.release();
            }
        }
        return appliedCount;
    }
    finally {
        await pool.end();
    }
}
// Detect if we are being executed directly (either via tsx in dev or from dist).
const isDirectRun = process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    runMigrations()
        .then((n) => {
        console.log(`[migrate] done. ${n} migration(s) applied.`);
        process.exit(0);
    })
        .catch((err) => {
        console.error('[migrate]', err);
        process.exit(1);
    });
}
