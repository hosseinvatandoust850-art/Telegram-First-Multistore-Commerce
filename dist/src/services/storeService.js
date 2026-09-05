import { query, queryOne, withTransaction } from '../db/pool.js';
import { slugify } from '../lib/slug.js';
import { randomToken } from '../lib/crypto.js';
export async function createStore(input) {
    let slug = input.slug ? slugify(input.slug) : slugify(input.name);
    if (!slug)
        slug = `store-${randomToken(4).toLowerCase()}`;
    const existing = await queryOne('SELECT id FROM "Store" WHERE slug = $1', [slug]);
    if (existing) {
        // Allow a fixed slug only once; otherwise generate a unique suffix.
        slug = `${slug}-${randomToken(3).toLowerCase()}`;
    }
    const botWebhookSecret = randomToken(24);
    const row = await queryOne(`INSERT INTO "Store"
       (slug, name, description, locale, currency, "currencySymbol", "publicUrl",
        "telegramBotToken", "telegramUsername", "botWebhookSecret")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`, [
        slug,
        input.name,
        input.description ?? null,
        input.locale ?? 'en',
        input.currency ?? 'USDT',
        input.currencySymbol ?? '₮',
        input.publicUrl ?? null,
        input.telegramBotToken ?? null,
        input.telegramUsername ?? null,
        botWebhookSecret,
    ]);
    if (!row)
        throw new Error('Failed to create store');
    if (input.userId) {
        await query('UPDATE "User" SET "storeId" = $1, role = $2 WHERE id = $3', [
            row.id,
            'STORE_OWNER',
            input.userId,
        ]);
    }
    else {
        // Create the first store: make it the owner's default by linking on signup.
    }
    return row;
}
export async function getStoreBySlug(slug) {
    return queryOne('SELECT * FROM "Store" WHERE slug = $1', [slug]);
}
export async function getStoreById(id) {
    return queryOne('SELECT * FROM "Store" WHERE id = $1', [id]);
}
export async function getStoreByWebhookSecret(secret) {
    return queryOne('SELECT * FROM "Store" WHERE "botWebhookSecret" = $1', [secret]);
}
export async function listStores() {
    return query('SELECT * FROM "Store" ORDER BY "createdAt" DESC');
}
export async function updateStore(id, patch) {
    const keys = Object.keys(patch);
    if (keys.length === 0) {
        return (await getStoreById(id));
    }
    const set = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    const values = keys.map((k) => patch[k]);
    const row = await queryOne(`UPDATE "Store" SET ${set}, "updatedAt" = now() WHERE id = $1 RETURNING *`, [id, ...values]);
    return row;
}
export async function countStores() {
    const row = await queryOne('SELECT COUNT(*)::text AS count FROM "Store"');
    return Number(row?.count || 0);
}
export async function settingsForStore(storeId) {
    const rows = await query('SELECT key, value::text AS value FROM "Setting" WHERE "storeId" = $1', [storeId]);
    return rows.reduce((acc, r) => {
        try {
            acc[r.key] = JSON.parse(r.value);
        }
        catch {
            acc[r.key] = r.value;
        }
        return acc;
    }, {});
}
export async function setSetting(storeId, key, value) {
    await withTransaction(async (client) => {
        await client.query(`INSERT INTO "Setting" ("storeId", key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT ("storeId", key)
       DO UPDATE SET value = $3, "updatedAt" = now()`, [storeId, key, JSON.stringify(value)]);
    });
}
