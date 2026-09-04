import { query, queryOne, withTransaction } from '../db/pool.js';
import type { ProductRow } from '../db/types.js';
import { slugify } from '../lib/slug.js';
import { randomToken } from '../lib/crypto.js';
import { NotFoundError } from '../lib/errors.js';

export interface ProductInput {
  name: string;
  slug?: string;
  description?: string;
  type?: 'DIGITAL' | 'PHYSICAL';
  price: number | string;
  currency?: string;
  stock?: number | null;
  category?: string;
  images?: Array<{ url: string; alt?: string }>;
  files?: Array<{ key: string; name: string; size?: number; url?: string }>;
  attributes?: Record<string, unknown>;
  active?: boolean;
  featured?: boolean;
}

export async function listProducts(
  storeId: string,
  opts: { activeOnly?: boolean; search?: string } = {},
): Promise<ProductRow[]> {
  const conditions: string[] = ['"storeId" = $1'];
  const params: unknown[] = [storeId];
  if (opts.activeOnly) {
    conditions.push('active = true');
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }
  return query<ProductRow>(
    `SELECT * FROM "Product" WHERE ${conditions.join(' AND ')} ORDER BY featured DESC, "createdAt" DESC`,
    params,
  );
}

export async function getProduct(
  storeId: string,
  idOrSlug: string,
): Promise<ProductRow | undefined> {
  return queryOne<ProductRow>(
    'SELECT * FROM "Product" WHERE "storeId" = $1 AND (id = $2 OR slug = $2)',
    [storeId, idOrSlug],
  );
}

export async function createProduct(
  storeId: string,
  input: ProductInput,
): Promise<ProductRow> {
  let slug = input.slug ? slugify(input.slug) : slugify(input.name);
  if (!slug) slug = `product-${randomToken(4).toLowerCase()}`;
  // ensure unique within store
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM "Product" WHERE "storeId" = $1 AND slug = $2',
    [storeId, slug],
  );
  if (existing) slug = `${slug}-${randomToken(3).toLowerCase()}`;

  const rows = await query<ProductRow>(
    `INSERT INTO "Product"
       ("storeId", name, slug, description, type, price, currency, stock, category,
        images, files, attributes, active, featured)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      storeId,
      input.name,
      slug,
      input.description ?? null,
      input.type ?? 'DIGITAL',
      String(input.price),
      input.currency ?? 'USDT',
      input.stock ?? null,
      input.category ?? null,
      JSON.stringify(input.images ?? []),
      JSON.stringify(input.files ?? []),
      JSON.stringify(input.attributes ?? {}),
      input.active ?? true,
      input.featured ?? false,
    ],
  );
  return rows[0];
}

export async function updateProduct(
  storeId: string,
  id: string,
  patch: Partial<ProductInput>,
): Promise<ProductRow> {
  const existing = await getProduct(storeId, id);
  if (!existing) throw new NotFoundError('Product not found');

  const set: string[] = [];
  const values: unknown[] = [storeId, id];

  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    set.push(`"${k}" = $${values.length + 1}`);
    values.push(typeof v === 'object' || Array.isArray(v) ? JSON.stringify(v) : String(v));
  }
  if (set.length === 0) return existing;
  const row = await queryOne<ProductRow>(
    `UPDATE "Product" SET ${set.join(', ')}, "updatedAt" = now()
     WHERE "storeId" = $1 AND id = $2 RETURNING *`,
    values,
  );
  return row!;
}

export async function deleteProduct(storeId: string, id: string): Promise<boolean> {
  const res = await withTransaction(async (client) => {
    const r = await client.query(
      'DELETE FROM "Product" WHERE "storeId" = $1 AND id = $2',
      [storeId, id],
    );
    return r.rowCount ?? 0;
  });
  return (res ?? 0) > 0;
}

export async function decrementStock(
  storeId: string,
  productId: string,
  qty: number,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE "Product" SET stock = GREATEST(stock - $1, 0), "updatedAt" = now()
       WHERE "storeId" = $2 AND id = $3 AND type = 'PHYSICAL'`,
      [qty, storeId, productId],
    );
  });
}
