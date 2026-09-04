import { query, queryOne, withTransaction } from '../db/pool.js';
import type { StoreRow } from '../db/types.js';
import { slugify } from '../lib/slug.js';
import { randomToken } from '../lib/crypto.js';

export interface CreateStoreInput {
  name: string;
  slug?: string;
  description?: string;
  locale?: string;
  currency?: string;
  currencySymbol?: string;
  userId?: string;
  publicUrl?: string;
  telegramBotToken?: string;
  telegramUsername?: string;
}

export async function createStore(input: CreateStoreInput): Promise<StoreRow> {
  let slug = input.slug ? slugify(input.slug) : slugify(input.name);
  if (!slug) slug = `store-${randomToken(4).toLowerCase()}`;

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM "Store" WHERE slug = $1',
    [slug],
  );
  if (existing) {
    // Allow a fixed slug only once; otherwise generate a unique suffix.
    slug = `${slug}-${randomToken(3).toLowerCase()}`;
  }

  const botWebhookSecret = randomToken(24);
  const row = await queryOne<StoreRow>(
    `INSERT INTO "Store"
       (slug, name, description, locale, currency, "currencySymbol", "publicUrl",
        "telegramBotToken", "telegramUsername", "botWebhookSecret")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
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
    ],
  );

  if (!row) throw new Error('Failed to create store');

  if (input.userId) {
    await query('UPDATE "User" SET "storeId" = $1, role = $2 WHERE id = $3', [
      row.id,
      'STORE_OWNER',
      input.userId,
    ]);
  } else {
    // Create the first store: make it the owner's default by linking on signup.
  }

  return row!;
}

export async function getStoreBySlug(slug: string): Promise<StoreRow | undefined> {
  return queryOne<StoreRow>('SELECT * FROM "Store" WHERE slug = $1', [slug]);
}

export async function getStoreById(id: string): Promise<StoreRow | undefined> {
  return queryOne<StoreRow>('SELECT * FROM "Store" WHERE id = $1', [id]);
}

export async function getStoreByWebhookSecret(
  secret: string,
): Promise<StoreRow | undefined> {
  return queryOne<StoreRow>(
    'SELECT * FROM "Store" WHERE "botWebhookSecret" = $1',
    [secret],
  );
}

export async function listStores(): Promise<StoreRow[]> {
  return query<StoreRow>('SELECT * FROM "Store" ORDER BY "createdAt" DESC');
}

export async function updateStore(
  id: string,
  patch: Partial<Pick<StoreRow, 'name' | 'description' | 'currency' | 'currencySymbol' | 'locale' | 'logoUrl' | 'telegramBotToken' | 'telegramUsername' | 'publicUrl' | 'status' | 'settings'>>,
): Promise<StoreRow> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) {
    return (await getStoreById(id))!;
  }
  const set = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
  const values = keys.map((k) => patch[k] as unknown);
  const row = await queryOne<StoreRow>(
    `UPDATE "Store" SET ${set}, "updatedAt" = now() WHERE id = $1 RETURNING *`,
    [id, ...values],
  );
  return row!;
}

export async function countStores(): Promise<number> {
  const row = await queryOne<{ count: string }>('SELECT COUNT(*)::text AS count FROM "Store"');
  return Number(row?.count || 0);
}

export async function settingsForStore(
  storeId: string,
): Promise<Record<string, unknown>> {
  const rows = await query<{ key: string; value: unknown }>(
    'SELECT key, value::text AS value FROM "Setting" WHERE "storeId" = $1',
    [storeId],
  );
  return rows.reduce<Record<string, unknown>>((acc, r) => {
    try {
      acc[r.key] = JSON.parse(r.value as string);
    } catch {
      acc[r.key] = r.value;
    }
    return acc;
  }, {});
}

export async function setSetting(
  storeId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO "Setting" ("storeId", key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT ("storeId", key)
       DO UPDATE SET value = $3, "updatedAt" = now()`,
      [storeId, key, JSON.stringify(value)],
    );
  });
}
