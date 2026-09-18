import { isRecord } from "../api/api-response";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

const queryPolicy = {
  activityStaleTime: 30 * SECOND,
  categoryCatalogStaleTime: 15 * MINUTE,
  garbageCollectionTime: 30 * MINUTE,
  readRetryCount: 1,
  provisioningRetryCount: 1,
  provisioningRetryDelay: 0,
} as const;

function isApiErrorShape(
  error: unknown,
): error is Record<string, unknown> & { readonly kind: string } {
  return (
    error instanceof Error &&
    isRecord(error) &&
    typeof error.kind === "string"
  );
}

function isRetryableProvisioningFailure(error: unknown): boolean {
  if (!isApiErrorShape(error)) return false;

  return (
    error.kind === "network" ||
    (error.kind === "http" && error.status === 503)
  );
}

function shouldRetryProvisioning(failureCount: number, error: unknown): boolean {
  if (failureCount >= queryPolicy.provisioningRetryCount) return false;

  return isRetryableProvisioningFailure(error);
}

function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= queryPolicy.readRetryCount) return false;
  if (!isApiErrorShape(error)) return false;

  return (
    error.kind === "network" ||
    (error.kind === "http" &&
      typeof error.status === "number" &&
      error.status >= 500 &&
      error.status < 600)
  );
}

export {
  isRetryableProvisioningFailure,
  queryPolicy,
  shouldRetryProvisioning,
  shouldRetryRead,
};
