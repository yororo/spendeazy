import { isRecord, type ApiDataErrorFactory } from "@/shared/api";

interface BudgetResponse {
  readonly id: string;
  readonly categoryId: string;
  readonly amount: string;
  readonly period: "monthly" | "yearly";
  readonly createdAt?: string;
  readonly updatedAt: string;
}

const ID_PATTERN = /^[1-9]\d*$/u;
const MONEY_PATTERN = /^(?=.*[1-9])\d{1,13}\.\d{2}$/u;

function isBudgetResponse(value: unknown): value is BudgetResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    ID_PATTERN.test(value.id) &&
    typeof value.categoryId === "string" &&
    ID_PATTERN.test(value.categoryId) &&
    typeof value.amount === "string" &&
    MONEY_PATTERN.test(value.amount) &&
    (value.period === "monthly" || value.period === "yearly") &&
    (value.createdAt === undefined || typeof value.createdAt === "string") &&
    typeof value.updatedAt === "string"
  );
}

function requireBudgetResponse(
  response: unknown,
  createError: ApiDataErrorFactory,
): BudgetResponse {
  if (!isBudgetResponse(response)) {
    throw createError("The API returned an invalid Budget.");
  }

  return response;
}

export { requireBudgetResponse };
export type { BudgetResponse };
