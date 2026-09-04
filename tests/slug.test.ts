import { describe, it, expect } from 'vitest';
import { slugify, slugOrCode } from '../src/lib/slug.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('My Cool Store')).toBe('my-cool-store');
  });

  it('strips accents and punctuation', () => {
    expect(slugify('Café Délice!')).toBe('cafe-delice');
  });

  it('collapses multiple hyphens and trims edges', () => {
    expect(slugify('  a--b  ')).toBe('a-b');
  });

  it('returns empty for non-latin input', () => {
    expect(slugify('کافه')).toBe('');
  });
});

describe('slugOrCode', () => {
  it('returns a code when the slug is empty', () => {
    const out = slugOrCode('商店', 'store');
    expect(out.startsWith('store-')).toBe(true);
  });

  it('returns the slug when valid', () => {
    expect(slugOrCode('Shop One', 'store')).toBe('shop-one');
  });
});
