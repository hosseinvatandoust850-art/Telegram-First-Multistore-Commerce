import { describe, it, expect } from 'vitest';
import { hexToUtf8 } from '../src/services/ton.js';

describe('hexToUtf8', () => {
  it('decodes ascii', () => {
    // "order-ORD123"
    const hex = Buffer.from('order-ORD123', 'utf8').toString('hex');
    expect(hexToUtf8(hex)).toBe('order-ORD123');
  });

  it('returns empty string for empty input', () => {
    expect(hexToUtf8('')).toBe('');
  });

  it('returns empty string for malformed hex', () => {
    expect(hexToUtf8('zz')).toBe('');
  });
});
