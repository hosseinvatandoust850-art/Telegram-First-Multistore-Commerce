import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  genCode,
  randomToken,
  signJwt,
  verifyJwt,
} from '../src/lib/crypto.js';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('s3cret!pass');
    expect(hash).not.toContain('s3cret');
    expect(await verifyPassword('s3cret!pass', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('code & token generation', () => {
  it('generates a code with the given prefix and length', () => {
    const code = genCode('ORD-', 10);
    expect(code.startsWith('ORD-')).toBe(true);
    expect(code.length).toBe(4 + 10);
  });

  it('generates a url-safe random token', () => {
    const t = randomToken(24);
    expect(t.length).toBeGreaterThan(0);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('JWT', () => {
  it('signs and verifies a token round-trip', async () => {
    const token = await signJwt({ userId: 'u1', role: 'owner' }, 60);
    const payload = await verifyJwt(token);
    expect(payload?.['userId']).toBe('u1');
    expect(payload?.['role']).toBe('owner');
  });

  it('returns null for a tampered token', async () => {
    const token = await signJwt({ userId: 'u1' }, 60);
    const tampered = token.slice(0, -2) + 'xx';
    expect(await verifyJwt(tampered)).toBeNull();
  });
});
