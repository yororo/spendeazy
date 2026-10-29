import type { CategoryRuleCollection, SpaceCategory } from '../../api/categories-api-client.ts';
import { prepareManualExpense } from '../expenses/manual-draft.ts';
import type { ReviewCatalog, ReviewEditor, ReviewHandoff, ReviewRow, ReviewState, StagedReviewRule } from './review-model.ts';

export const normalizeReviewText = (value: string) => value.trim().replace(/\s+/gu, ' ').toLowerCase();
export const ruleKey = (rule: { matchType: string; pattern: string }) => `${rule.matchType}:${normalizeReviewText(rule.pattern)}`;
export const validPattern = (value: string) => normalizeReviewText(value).length > 0 && [...value].length <= 500;

export function reviewCatalog(spaceId: string, categories: SpaceCategory[], collection: CategoryRuleCollection): ReviewCatalog {
  const ids = new Set<string>();
  const rules = collection.rules.map(rule => {
    if (!rule.id?.trim() || !rule.categoryId?.trim() || !validPattern(rule.pattern) || ids.has(rule.id)) {
      throw new Error('The Category Rule collection is incomplete.');
    }
    ids.add(rule.id);
    return { ...rule, id: rule.id, categoryId: rule.categoryId };
  });
  return { spaceId, categories, rules, rulesRevision: collection.revision };
}

export function validAssignment(state: ReviewState, row: ReviewRow) {
  return !!row.values.categoryId && !!state.catalog.snapshot?.categories.some(c => c.id === row.values.categoryId && c.isActive);
}
export function orderedRows(state: ReviewState) { return state.original.rows.map(row => state.rows[row.sourceRowId]); }
export function unmappedRows(state: ReviewState) {
  return orderedRows(state).filter(row => row.inclusion === 'included' && !validAssignment(state, row));
}
export function editorFor(row: ReviewRow): ReviewEditor {
  return { sourceRowId: row.sourceRowId, values: { ...row.values }, remember: false, matchType: 'exact', pattern: row.values.description };
}
export function editorDirty(state: ReviewState, editor: ReviewEditor | null) {
  if (!editor) return false;
  const applied = state.rows[editor.sourceRowId].values;
  return editor.remember || (Object.keys(applied) as (keyof typeof applied)[]).some(key => applied[key] !== editor.values[key]);
}
export function matchUnmapped(state: ReviewState): ReviewState {
  const catalog = state.catalog.snapshot;
  if (!catalog || state.catalog.status !== 'ready') return state;
  const rows = { ...state.rows };
  const rules = [...catalog.rules, ...state.stagedRules.map(rule => ({ ...rule, id: rule.localId }))]
    .filter(rule => catalog.categories.some(c => c.id === rule.categoryId && c.isActive));
  let changed = false;
  for (const row of unmappedRows(state)) {
    // Inactive/missing mappings require an explicit correction, including manual choices.
    if (row.values.categoryId) continue;
    const text = normalizeReviewText(row.values.description);
    const exact = rules.filter(rule => rule.matchType === 'exact' && normalizeReviewText(rule.pattern) === text);
    const matches = exact.length ? exact : rules.filter(rule => rule.matchType === 'contains' && text.includes(normalizeReviewText(rule.pattern)));
    if (new Set(matches.map(rule => rule.categoryId)).size !== 1) continue;
    const category = catalog.categories.find(c => c.id === matches[0].categoryId)!;
    rows[row.sourceRowId] = { ...row, values: { ...row.values, categoryId: category.id }, assignment: {
      origin: 'rule', categoryRevision: category.revision, ruleIds: matches.map(rule => rule.id), rulesRevision: catalog.rulesRevision,
    } };
    changed = true;
  }
  if (!changed) return state;
  // Matching must not manufacture pending edits in an untouched retained buffer.
  const sync = (editor: ReviewEditor | null) => editor && !editorDirty(state, editor) && rows[editor.sourceRowId] !== state.rows[editor.sourceRowId]
    ? { ...editor, values: rows[editor.sourceRowId].values } : editor;
  return { ...state, rows, editor: sync(state.editor), pendingQueueEditor: sync(state.pendingQueueEditor),
    revision: state.revision + 1, handoff: null };
}

export function prepareReviewEdit(state: ReviewState, now: Date, localId: string):
  { ok: false; errors: string[] } | { ok: true; row: ReviewRow; rule: StagedReviewRule | null } {
  const catalog = state.catalog.snapshot;
  const editor = state.editor;
  if (!catalog || state.catalog.status !== 'ready' || !editor) return { ok: false, errors: ['Load Categories and Rules before saving.'] };
  const row = state.rows[editor.sourceRowId];
  if (row.inclusion !== 'included') return { ok: false, errors: ['This Transaction is excluded.'] };
  const prepared = prepareManualExpense(editor.values, { now, spaceId: state.original.owner.spaceId, categories: { spaceId: catalog.spaceId, items: catalog.categories } });
  if (!prepared.ok) return { ok: false, errors: prepared.issues.map(issue => issue.message) };
  const category = catalog.categories.find(c => c.id === prepared.input.categoryId)!;
  let rule: StagedReviewRule | null = null;
  if (editor.remember) {
    if (!validPattern(editor.pattern)) return { ok: false, errors: ['Enter a Rule pattern of 1–500 characters with nonblank content.'] };
    const duplicates = [...catalog.rules, ...state.stagedRules].filter(rule => ruleKey(rule) === ruleKey(editor));
    if (duplicates.some(rule => rule.categoryId !== category.id)) return { ok: false, errors: ['Another Category already owns this Rule, including inactive Categories. Nothing was applied.'] };
    if (!duplicates.length) rule = {
      localId, pattern: editor.pattern.trim(), normalizedPattern: normalizeReviewText(editor.pattern), matchType: editor.matchType,
      categoryId: category.id, categoryRevision: category.revision, rulesRevision: catalog.rulesRevision, existingRuleId: null,
    };
  }
  return { ok: true, row: { ...row, values: prepared.input, assignment: { origin: 'manual', categoryRevision: category.revision } }, rule };
}

export type ReviewIssue = Readonly<{ sourceRowId: string | null; message: string }>;
export function validateReview(state: ReviewState, now: Date): { handoff: ReviewHandoff | null; issues: ReviewIssue[] } {
  const issues: ReviewIssue[] = [];
  const catalog = state.catalog.snapshot;
  if (!catalog || state.catalog.status !== 'ready' || catalog.spaceId !== state.original.owner.spaceId) {
    return { handoff: null, issues: [{ sourceRowId: null, message: 'Load the destination Categories and Rules before continuing.' }] };
  }
  for (const editor of [state.editor, state.pendingQueueEditor]) if (editorDirty(state, editor)) {
    issues.push({ sourceRowId: editor!.sourceRowId, message: 'Save & next or explicitly abandon the pending edits before continuing.' });
  }
  const rows = orderedRows(state);
  if (!rows.some(row => row.inclusion === 'included')) issues.push({ sourceRowId: null, message: 'Include at least one eligible spending Transaction.' });
  const amounts = new Map<string, string>();
  for (const row of rows.filter(row => row.inclusion === 'included')) {
    const result = prepareManualExpense(row.values, { now, spaceId: state.original.owner.spaceId, categories: { spaceId: catalog.spaceId, items: catalog.categories } });
    if (!result.ok) for (const issue of result.issues) issues.push({ sourceRowId: row.sourceRowId, message: issue.message });
    else amounts.set(row.sourceRowId, result.input.amount);
  }
  for (const rule of state.stagedRules) {
    const category = catalog.categories.find(c => c.id === rule.categoryId && c.isActive);
    if (!category || rule.categoryRevision !== category.revision || rule.rulesRevision !== catalog.rulesRevision ||
      [...catalog.rules, ...state.stagedRules].some(other => ruleKey(other) === ruleKey(rule) && other.categoryId !== rule.categoryId)) {
      issues.push({ sourceRowId: null, message: 'A staged Rule has stale or conflicting Category context. Refresh Categories and Rules.' });
    }
  }
  if (issues.length) return { handoff: null, issues };
  const handoff: ReviewHandoff = {
    owner: state.original.owner, draftId: state.original.draftId, original: state.original, reviewRevision: state.revision,
    rows: rows.map(row => ({ ...row, amount: amounts.get(row.sourceRowId) ?? null })), stagedRules: state.stagedRules, catalog,
  };
  return { handoff: immutableCopy(handoff), issues: [] };
}
function immutableCopy<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const copy = Array.isArray(value) ? value.map(immutableCopy)
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutableCopy(child)]));
  return Object.freeze(copy) as T;
}
