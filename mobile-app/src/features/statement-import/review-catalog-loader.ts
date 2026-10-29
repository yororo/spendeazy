import type { createCategoriesApiClient } from '../../api/categories-api-client.ts';
import type { createImportStore } from './import-store.ts';
import { reviewCatalog } from './review-rules.ts';

/** The store fences both reads by authentication generation, draft and attempt identity. */
export async function loadReviewCatalog(store: ReturnType<typeof createImportStore>,
  client: Pick<ReturnType<typeof createCategoriesApiClient>, 'listCategories' | 'getCategoryRules'>, id: string) {
  const scope = store.captureReview();
  if (!scope) return;
  const request = { ...scope, id };
  if (!store.updateReview(scope, { type: 'catalogRequested', request })) return;
  try {
    const [categories, rules] = await Promise.all([client.listCategories(scope.owner.spaceId), client.getCategoryRules(scope.owner.spaceId)]);
    store.updateReview(scope, { type: 'catalogSucceeded', request, catalog: reviewCatalog(scope.owner.spaceId, categories, rules) });
  } catch {
    store.updateReview(scope, { type: 'catalogFailed', request });
  }
}
