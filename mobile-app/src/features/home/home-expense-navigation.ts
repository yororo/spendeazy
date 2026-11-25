export function homeExpenseFilterBelongsToSpace(
  sourceSpaceId: string | null,
  activeSpaceId: string | null,
): boolean {
  return sourceSpaceId !== null && sourceSpaceId === activeSpaceId;
}
