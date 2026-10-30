export function importDetailPath(
  sourceSpaceId: string,
  statementImportId: string,
): string {
  return `/statement-import/${encodeURIComponent(statementImportId)}?sourceSpaceId=${encodeURIComponent(sourceSpaceId)}`;
}
export function dashboardHistoryTarget(
  sourceSpaceId: string,
  filter: { fromDate: string; toDate: string },
) {
  return {
    pathname: "/statement-import-history" as const,
    params: { sourceSpaceId, fromDate: filter.fromDate, toDate: filter.toDate },
  };
}
