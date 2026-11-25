// Extend a scope's identity map without reassigning markers after filtering,
// renaming, reordering, or changing periods. Recreated on identity/Space change.
export function retainCategoryMarkers(
  current: Readonly<Record<string, number>>,
  categoryIds: readonly string[],
): Readonly<Record<string, number>> {
  const missing = [...new Set(categoryIds)].filter((id) => current[id] === undefined);
  if (missing.length === 0) return current;
  missing.sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1);
  const next = { ...current };
  let index = Object.keys(current).length;
  for (const id of missing) next[id] = index++;
  return next;
}
