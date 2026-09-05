import { Pool } from 'pg';
import { env } from '../config/env.js';
/**
 * Shared connection pool. Railway exposes a pooled connection for the primary
 * Postgres service; we honour DIRECT_URL (Prisma-style) when provided for
 * migrations. We create the pool lazily so importing the config never opens a
 * connection before it is needed (important for the health check).
 */
let pool = null;
export function getPool() {
    if (pool)
        return pool;
    pool = new Pool({
        connectionString: env.db.directUrl || env.db.url,
        max: env.db.poolMax,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    });
    return pool;
}
export async function withTransaction(fn) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
export async function query(text, params = []) {
    const res = await getPool().query(text, params);
    return res.rows;
}
export async function queryOne(text, params = []) {
    const rows = await query(text, params);
    return rows[0];
}
