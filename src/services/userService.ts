import { query, queryOne } from '../db/pool.js';
import type { UserRow } from '../db/types.js';
import { hashPassword, verifyPassword, genCode } from '../lib/crypto.js';
import { UnauthorizedError } from '../lib/errors.js';

export interface CreateUserInput {
  telegramId?: number | string;
  telegramUsername?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role?: UserRow['role'];
  email?: string;
  password?: string;
  referralCode?: string;
  referredById?: string;
  storeId?: string;
}

export async function findByTelegramId(
  telegramId: number | string,
): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM "User" WHERE "telegramId" = $1', [
    telegramId,
  ]);
}

export async function findByEmail(email: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM "User" WHERE LOWER(email) = LOWER($1)', [
    email,
  ]);
}

export async function findById(id: string): Promise<UserRow | undefined> {
  return queryOne<UserRow>('SELECT * FROM "User" WHERE id = $1', [id]);
}

export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  let referralCode = input.referralCode;
  if (!referralCode) {
    referralCode = genCode('REF-');
    // ensure uniqueness
    while (await queryOne('SELECT id FROM "User" WHERE "referralCode" = $1', [referralCode])) {
      referralCode = genCode('REF-');
    }
  }

  const rows = await query<UserRow>(
    `INSERT INTO "User"
       ("storeId", "telegramId", "telegramUsername", "firstName", "lastName", name,
        role, email, "passwordHash", "referralCode", "referredById")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      input.storeId ?? null,
      input.telegramId != null ? BigInt(input.telegramId).toString() : null,
      input.telegramUsername ?? null,
      input.firstName ?? null,
      input.lastName ?? null,
      input.name ?? null,
      input.role ?? 'CUSTOMER',
      input.email ?? null,
      passwordHash,
      referralCode,
      input.referredById ?? null,
    ],
  );
  return rows[0];
}

export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<UserRow> {
  const user = await findByEmail(email);
  if (!user || !user.passwordHash) {
    throw new UnauthorizedError('Invalid email or password');
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid email or password');
  if (user.status !== 'ACTIVE') throw new UnauthorizedError('Account is not active');
  return user;
}

export async function upsertTelegramUser(
  tg: { id: number | string; username?: string; first_name?: string; last_name?: string },
): Promise<UserRow> {
  const existing = await findByTelegramId(tg.id);
  if (existing) {
    const patch: Partial<UserRow> = {};
    if (tg.username !== undefined) patch.telegramUsername = tg.username;
    if (tg.first_name !== undefined) patch.firstName = tg.first_name;
    if (tg.last_name !== undefined) patch.lastName = tg.last_name;
    if (Object.keys(patch).length > 0) {
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      const set = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
      const values = keys.map((k) => patch[k] as unknown);
      await query(`UPDATE "User" SET ${set} WHERE id = $1`, [existing.id, ...values]);
    }
    return existing;
  }
  return createUser({
    telegramId: tg.id,
    telegramUsername: tg.username,
    firstName: tg.first_name,
    lastName: tg.last_name,
    name: `${tg.first_name ?? ''} ${tg.last_name ?? ''}`.trim() || undefined,
    role: 'CUSTOMER',
  });
}

export async function listStoreUsers(storeId: string): Promise<UserRow[]> {
  return query<UserRow>(
    'SELECT * FROM "User" WHERE "storeId" = $1 ORDER BY "createdAt" DESC',
    [storeId],
  );
}

/** Assign a referral code to a user if they don't have one. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await findById(userId);
  if (user?.referralCode) return user.referralCode;
  // role only for existing user; gen unique code
  let code = genCode('REF-');
  while (await queryOne('SELECT id FROM "User" WHERE "referralCode" = $1', [code])) {
    code = genCode('REF-');
  }
  await query('UPDATE "User" SET "referralCode" = $1 WHERE id = $2', [code, userId]);
  return code;
}

export async function isSuperAdmin(user: UserRow): Promise<boolean> {
  return user.role === 'SUPER_ADMIN';
}
