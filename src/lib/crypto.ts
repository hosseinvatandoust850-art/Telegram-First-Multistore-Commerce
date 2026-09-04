import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const SALT_ROUNDS = 12;
const secret = new TextEncoder().encode(
  process.env.APP_SECRET || 'dev-insecure-secret',
);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Generate a short, human-typable referral / order code. */
export function genCode(prefix: string, len = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}${out}`;
}

export function randomToken(bytes = 32): string {
  const cryptoObj = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(cryptoObj).toString('base64url').replace(/=+$/, '');
}

export async function signJwt(
  claims: Record<string, unknown>,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(secret);
}

export async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
