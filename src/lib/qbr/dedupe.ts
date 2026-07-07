/**
 * Duplicate-prevention helpers for capturing QBR items.
 *
 * Before creating a new metric/commitment/priority/upcoming item we check
 * existing items for the same normalized label/title. If one matches we update
 * it instead of creating a duplicate; only clearly distinct items create a new
 * row. Pure functions, so they're easy to unit test.
 */

/** Normalize a label/title for matching: lowercase, strip punctuation/space. */
export function normalizeKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Two labels refer to the same item when their normalized keys match. */
export function sameItem(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  return ka.length > 0 && ka === kb;
}

/**
 * Find an existing item that matches `candidate` by a chosen key field.
 * Returns the matched item or undefined when the candidate is clearly distinct.
 */
export function findExisting<T>(
  existing: T[],
  candidateKey: string | null | undefined,
  getKey: (item: T) => string | null | undefined,
): T | undefined {
  const key = normalizeKey(candidateKey);
  if (!key) return undefined;
  return existing.find((item) => normalizeKey(getKey(item)) === key);
}
