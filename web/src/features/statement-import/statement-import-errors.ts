import { ApiError, type ApiErrorDetail } from "@/shared/api";

interface CategoryEligibilityDetail extends ApiErrorDetail {
  readonly code: "category_inactive";
  readonly categoryId: string;
  readonly transactionIndexes: readonly number[];
}

interface CategoryEligibilityConflict {
  readonly message: string;
  readonly details: readonly CategoryEligibilityDetail[];
}

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

function isCategoryEligibilityDetail(
  value: ApiErrorDetail,
): value is CategoryEligibilityDetail {
  return (
    value.code === "category_inactive" &&
    typeof value.categoryId === "string" &&
    /^[1-9]\d*$/u.test(value.categoryId) &&
    Array.isArray(value.transactionIndexes) &&
    value.transactionIndexes.length > 0 &&
    value.transactionIndexes.every(
      (index): index is number => Number.isInteger(index) && index >= 0,
    )
  );
}

function getCategoryEligibilityConflict(
  error: unknown,
): CategoryEligibilityConflict | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== "CATEGORY_INACTIVE"
  ) {
    return null;
  }

  const details = error.details.filter(isCategoryEligibilityDetail);
  return details.length > 0 ? { message: error.message, details } : null;
}

export { getProbableDuplicateConflict };
export { getCategoryEligibilityConflict };
export type {
  CategoryEligibilityConflict,
  CategoryEligibilityDetail,
  ProbableDuplicateConflict,
  ProbableDuplicateDetail,
};
