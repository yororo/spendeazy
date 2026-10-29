import type { SpaceCategory } from '../../api/categories-api-client.ts';
import type { DecimalAmount, ImportOwner, ImportResult } from './import-model.ts';

export type ReviewScope = Readonly<{ owner: ImportOwner; draftId: string; generation: number }>;
export type ReviewRequest = ReviewScope & Readonly<{ id: string }>;
export type ReviewValues = Readonly<{
  amount: string; description: string; expenseDate: string; categoryId: string | null;
}>;
export type ReviewRule = Readonly<{
  id: string; categoryId: string; pattern: string; matchType: 'exact' | 'contains';
}>;
export type ReviewCatalog = Readonly<{
  spaceId: string; categories: readonly Readonly<SpaceCategory>[];
  rules: readonly ReviewRule[]; rulesRevision: string;
}>;
export type ReviewAssignment =
  | Readonly<{ origin: 'manual'; categoryRevision: string }>
  | Readonly<{ origin: 'rule'; categoryRevision: string; ruleIds: readonly string[]; rulesRevision: string; matchType: 'exact' | 'contains' }>;
export type ReviewRow = Readonly<{
  sourceRowId: string; values: ReviewValues; inclusion: 'included' | 'user-excluded' | 'locked-excluded';
  assignment: ReviewAssignment | null;
}>;
export type ReviewEditor = Readonly<{
  sourceRowId: string; values: ReviewValues;
  remember: boolean; matchType: 'exact' | 'contains'; pattern: string;
}>;
export type StagedReviewRule = Readonly<{
  localId: string; pattern: string; normalizedPattern: string; matchType: 'exact' | 'contains'; categoryId: string;
  categoryRevision: string; rulesRevision: string; existingRuleId: string | null;
}>;
/** Created only by the full validation boundary (task 5), never by editing commands. */
export type ReviewHandoff = Readonly<{
  owner: ImportOwner; draftId: string; reviewRevision: number; original: ImportResult;
  rows: readonly Readonly<ReviewRow & { amount: DecimalAmount | null }>[];
  stagedRules: readonly StagedReviewRule[]; catalog: ReviewCatalog;
}>;
export type ReviewState = Readonly<{
  inspectedSourceRowId?: string | null;
  errors?: readonly string[];
  validationIssues?: readonly Readonly<{ sourceRowId: string | null; message: string }>[];
  original: ImportResult; revision: number; rows: Readonly<Record<string, ReviewRow>>;
  editor: ReviewEditor | null; pendingQueueEditor: ReviewEditor | null;
  queueSourceRowId: string | null; deferredSourceRowIds: readonly string[];
  ledgerFilter: 'all' | 'unmapped' | 'excluded'; stagedRules: readonly StagedReviewRule[];
  catalog: Readonly<{
    status: 'idle' | 'loading' | 'ready' | 'failed'; request: ReviewRequest | null;
    snapshot: ReviewCatalog | null;
  }>;
  handoff: ReviewHandoff | null;
}>;
