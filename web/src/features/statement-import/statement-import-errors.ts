import { ApiError, type ApiErrorDetail } from "@/shared/api";

interface ProbableDuplicateDetail extends ApiErrorDetail {
  readonly code: "probable_duplicate";
  readonly transactionIndexes: readonly number[];
  readonly committedTransactionIds: readonly string[];
}

interface ProbableDuplicateConflict {
  readonly message: string;
  readonly details: readonly ProbableDuplicateDetail[];
}

function isProbableDuplicateDetail(
  value: ApiErrorDetail,
): value is ProbableDuplicateDetail {
  return (
    value.code === "probable_duplicate" &&
    Array.isArray(value.transactionIndexes) &&
    value.transactionIndexes.every(
      (index) => Number.isInteger(index) && index >= 0,
    ) &&
    Array.isArray(value.committedTransactionIds) &&
    value.committedTransactionIds.every((id) => typeof id === "string")
  );
}

function getProbableDuplicateConflict(
  error: unknown,
): ProbableDuplicateConflict | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== "STATEMENT_IMPORT_PROBABLE_DUPLICATES"
  ) {
    return null;
  }

  return {
    message: error.message,
    details: error.details.filter(isProbableDuplicateDetail),
  };
}

export { getProbableDuplicateConflict };
export type { ProbableDuplicateConflict, ProbableDuplicateDetail };
