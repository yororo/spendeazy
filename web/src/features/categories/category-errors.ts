import { ApiError } from "@/shared/api";

function isCategoryNameConflict(error: Error | null) {
  if (!(error instanceof ApiError)) return false;

  return (
    error.code === "CATEGORY_NAME_ALREADY_EXISTS" ||
    error.details.some(
      (detail) =>
        detail.field === "/name" && detail.code === "not_unique",
    )
  );
}

export { isCategoryNameConflict };
