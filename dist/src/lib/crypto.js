import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
const SALT_ROUNDS = 12;
const secret = new TextEncoder().encode(process.env.APP_SECRET || 'dev-insecure-secret');
export async function hashPassword(plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
}
export async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
/** Generate a short, human-typable referral / order code. */
export function genCode(prefix, len = 8) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `${prefix}${out}`;
}
export function randomToken(bytes = 32) {
    const cryptoObj = crypto.getRandomValues(new Uint8Array(bytes));
    return Buffer.from(cryptoObj).toString('base64url').replace(/=+$/, '');
}
export async function signJwt(claims, expiresInSeconds = 60 * 60 * 24 * 7) {
    return new SignJWT({ ...claims })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime(`${expiresInSeconds}s`)
        .sign(secret);
}
export async function verifyJwt(token) {
    try {
        const { payload } = await jwtVerify(token, secret);
        return payload;
    }
    catch {
        return null;
    }
}
