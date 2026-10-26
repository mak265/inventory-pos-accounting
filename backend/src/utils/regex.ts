export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a safe RegExp from user-provided input by escaping special chars.
 * Returns a RegExp instance (never throws) — useful for search inputs.
 */
export const buildSafeRegex = (input: string, flags = 'i'): RegExp => {
  const pattern = escapeRegExp(input || '');
  return new RegExp(pattern, flags);
}
