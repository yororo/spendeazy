import type { CategorySummaryResult } from '../application/category-summaries.service';
import {
  CategorySummaryItemResponseDto,
  CategorySummaryResponseDto,
} from './category-summary-response.dto';

export function toCategorySummaryResponse(
  summary: CategorySummaryResult,
): CategorySummaryResponseDto {
  return {
    period: summary.period,
    year: summary.year,
    month: summary.month,
    categories: summary.categories.map(toCategorySummaryItemResponse),
  };
}

function toCategorySummaryItemResponse(
  item: CategorySummaryResult['categories'][number],
): CategorySummaryItemResponseDto {
  return {
    categoryId: item.categoryId,
    name: item.name,
    isActive: item.isActive,
    totalAmount: item.totalAmount,
    expenseCount: item.expenseCount,
    budgetAmount: item.budgetAmount,
    remainingAmount: item.remainingAmount,
  };
}
