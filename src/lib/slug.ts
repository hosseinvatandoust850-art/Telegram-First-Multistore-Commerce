/** Convert an arbitrary string into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Alternative for non-Latin content: fallback to a random code. */
export function slugOrCode(input: string, prefix = 'store'): string {
  const slug = slugify(input);
  if (slug && slug.length >= 3) return slug;
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
