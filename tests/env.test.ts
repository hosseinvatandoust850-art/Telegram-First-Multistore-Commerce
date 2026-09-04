import { describe, it, expect } from 'vitest';
import { env } from '../src/config/env.js';

describe('env config', () => {
  it('derives a public url from APP_URL', () => {
    expect(env.app.publicUrl).toMatch(/^https?:\/\//);
  });

  it('exposes sane defaults', () => {
    expect(env.app.port).toBeGreaterThan(0);
    expect(env.db.url).toContain('postgres');
    expect(env.ton.network).toBe('mainnet');
    expect(env.worker.enableBackups).toBe(true);
  });

  it('never enables dev payment mode implicitly in production', () => {
    expect(env.ton.devMode).toBe(false);
  });
});
