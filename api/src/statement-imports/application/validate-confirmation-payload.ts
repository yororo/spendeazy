import { isValidDomainDate } from '../../http/domain-date';
import { todayInManila } from '../../http/manila-clock';
import { RequestValidationError } from '../../http/request-validation-error';
import { ApplicationError } from '../../errors/application-error';
import {
  CATEGORY_INACTIVE_CODE,
  CATEGORY_NOT_FOUND_CODE,
} from '../../categories/application/category-errors';
import { validateRulePattern } from '../../category-rules/application/category-rule-validation';
import type { ConfirmationPayload } from './confirmation-payload';
import {
  RECONCILIATION_DIAGNOSTICS,
  schemaIssues,
} from './confirmation-schema';

/** No input values in errors: malformed evidence can contain private document text. */
export function validateConfirmationPayload(
  value: unknown,
  now: Date,
): ConfirmationPayload {
  const issues = schemaIssues(value);
  if (issues.length) reject(issues);
  const payload = structuredClone(value) as ConfirmationPayload;
  const { statement, evidence, expenses, excluded, rememberedRules } = payload;
  const check = (condition: boolean, path: string) => {
    if (!condition) issues.push(path);
  };
  const validDate = (date: string | null) =>
    date !== null && isValidDomainDate(date);
  const wallet = statement.provider === 'gcash';
  check(
    wallet
      ? statement.accountFormat === 'wallet' &&
          statement.statementType === 'e_wallet'
      : statement.statementType === 'credit_card' &&
          statement.accountFormat ===
            (statement.provider === 'bdo' ? 'amex' : 'visa'),
    '/statement',
  );
  check(
    wallet
      ? statement.statementDate === null &&
          validDate(statement.historyFromDate) &&
          validDate(statement.historyToDate) &&
          statement.historyFromDate <= statement.historyToDate
      : validDate(statement.statementDate) &&
          statement.historyFromDate === null &&
          statement.historyToDate === null,
    '/statement',
  );
  check(expenses.length > 0, '/expenses');
  const sources = new Map(
    evidence.transactions.map((row) => [row.sourceRowId, row]),
  );
  check(
    sources.size === evidence.transactions.length,
    '/evidence/transactions',
  );
  const dispositions = new Set<string>();
  for (const [index, expense] of expenses.entries()) {
    const row = sources.get(expense.sourceRowId);
    check(
      !!row && ['purchase', 'outgoing_transfer'].includes(row.classification),
      `/expenses/${index}/sourceRowId`,
    );
    check(
      !dispositions.has(expense.sourceRowId),
      `/expenses/${index}/sourceRowId`,
    );
    dispositions.add(expense.sourceRowId);
    check(
      validDate(expense.expenseDate) &&
        expense.expenseDate <= todayInManila(now),
      `/expenses/${index}/expenseDate`,
    );
    check(
      BigInt(expense.amount.replace('.', '')) > 0n,
      `/expenses/${index}/amount`,
    );
    expense.description = expense.description.trim();
  }
  for (const [index, entry] of excluded.entries()) {
    const row = sources.get(entry.sourceRowId);
    check(
      !!row && !dispositions.has(entry.sourceRowId),
      `/excluded/${index}/sourceRowId`,
    );
    dispositions.add(entry.sourceRowId);
    const eligible =
      !!row && ['purchase', 'outgoing_transfer'].includes(row.classification);
    check(
      eligible
        ? !entry.automatic && entry.reason === 'manual'
        : entry.automatic && entry.reason === row?.classification,
      `/excluded/${index}`,
    );
  }
  check(dispositions.size === sources.size, '/excluded');
  const controls = new Map(
    evidence.controlTotals.map((control) => [control.key, control]),
  );
  check(
    controls.size === evidence.controlTotals.length,
    '/evidence/controlTotals',
  );
  for (const [
    index,
    comparison,
  ] of evidence.reconciliation.comparisons.entries()) {
    check(
      comparison.controlKey === null || controls.has(comparison.controlKey),
      `/evidence/reconciliation/comparisons/${index}/controlKey`,
    );
    const expected = comparison.expectedAmount;
    const actual = comparison.extractedAmount;
    const difference = comparison.difference;
    check(
      expected == null || actual === null
        ? difference === null
        : difference !== null &&
            cents(actual) - cents(expected) === cents(difference),
      `/evidence/reconciliation/comparisons/${index}/difference`,
    );
  }
  for (const [
    index,
    diagnostic,
  ] of evidence.reconciliation.diagnostics.entries()) {
    check(
      RECONCILIATION_DIAGNOSTICS[
        diagnostic.code as keyof typeof RECONCILIATION_DIAGNOSTICS
      ] === diagnostic.message,
      `/evidence/reconciliation/diagnostics/${index}`,
    );
  }
  const pages = new Set(evidence.pages.map((page) => page.pageIndex));
  check(
    pages.size === evidence.pages.length && pages.size > 0,
    '/evidence/pages',
  );
  check(
    evidence.pages.every((page, index) => page.pageIndex === index),
    '/evidence/pages',
  );
  for (const [
    index,
    diagnostic,
  ] of evidence.reconciliation.diagnostics.entries()) {
    check(
      diagnostic.sourceRowIds.every((id) => sources.has(id)) &&
        diagnostic.pageIndices.every((page) => pages.has(page)),
      `/evidence/reconciliation/diagnostics/${index}`,
    );
  }
  for (const [key, outcome] of [
    ['failedPageIndices', 'failed'],
    ['unreadablePageIndices', 'unreadable'],
  ] as const) {
    const actual = evidence.pages
      .filter((page) => page.outcome === outcome)
      .map((page) => page.pageIndex);
    const declared = evidence.completeness[key];
    check(
      declared.length === actual.length &&
        new Set(declared).size === declared.length &&
        declared.every((page) => actual.includes(page)),
      `/evidence/completeness/${key}`,
    );
  }
  const comparisons = evidence.reconciliation.comparisons;
  const mismatch = comparisons.some(
    (comparison) =>
      comparison.difference !== null && cents(comparison.difference) !== 0n,
  );
  check(
    evidence.reconciliation.status === 'matched'
      ? comparisons.length > 0 &&
          comparisons.every(
            (comparison) =>
              comparison.difference !== null &&
              cents(comparison.difference) === 0n,
          )
      : evidence.reconciliation.status === 'warning'
        ? mismatch
        : !mismatch,
    '/evidence/reconciliation/status',
  );
  for (const [index, row] of evidence.transactions.entries()) {
    check(
      pages.has(row.pageIndex),
      `/evidence/transactions/${index}/pageIndex`,
    );
    check(
      row.normalized.date === null || validDate(row.normalized.date),
      `/evidence/transactions/${index}/normalized/date`,
    );
    check(
      row.duplicateReference === undefined || wallet,
      `/evidence/transactions/${index}/duplicateReference`,
    );
  }
  for (const [index, rule] of rememberedRules.entries()) {
    validateRulePattern(rule.pattern, `/rememberedRules/${index}/pattern`);
    rule.pattern = rule.pattern.trim().replace(/\s+/gu, ' ');
  }
  statement.fileName = statement.fileName.trim();
  // Reject obvious account/document secrets, plus reference copies in admitted text.
  const references = evidence.transactions.flatMap((row) =>
    row.duplicateReference ? [row.duplicateReference] : [],
  );
  function privateText(value: unknown, path = ''): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => privateText(item, `${path}/${index}`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value))
        if (key !== 'duplicateReference') privateText(child, `${path}/${key}`);
      return;
    }
    if (
      typeof value !== 'string' ||
      /\/(?:fileHash|categoryId|sourceRowId|acknowledgedWarningDigest)$/u.test(
        path,
      ) ||
      path.startsWith('/acknowledgedWarnings/')
    )
      return;
    const humanText = /\/(?:description|fileName|label|pattern|message)$/u.test(
      path,
    );
    if (
      /%PDF-|data:application\/pdf|\bpassword\s*[:=]|\b(?:card|account|wallet|mobile)\s*(?:number|no\.?|id)\s*[:=]/iu.test(
        value,
      ) ||
      (humanText &&
        /\b(?:\d[ -]?){12,19}\b|\b09\d{9}\b|\+63\d{10}\b/u.test(value)) ||
      references.some(
        (reference) => reference.length >= 4 && value.includes(reference),
      )
    )
      issues.push(path);
  }
  privateText(payload);
  check(
    new Set(payload.acknowledgedWarnings).size ===
      payload.acknowledgedWarnings.length,
    '/acknowledgedWarnings',
  );
  check(
    (payload.acknowledgedWarnings.length === 0) ===
      (payload.acknowledgedWarningDigest === null),
    '/acknowledgedWarningDigest',
  );
  if (issues.length) reject(issues);
  return payload;
}

/** Check every proposed target, including Rules whose source was excluded later. */
export async function validateConfirmationCategories(
  payload: ConfirmationPayload,
  find: (id: string) => Promise<{ isActive: boolean } | null>,
): Promise<void> {
  const ids = new Set(
    [...payload.expenses, ...payload.rememberedRules].map(
      (value) => value.categoryId,
    ),
  );
  for (const id of ids) {
    const category = await find(id);
    if (!category?.isActive) {
      const issues: string[] = [];
      for (const [index, expense] of payload.expenses.entries())
        if (expense.categoryId === id)
          issues.push(`/expenses/${index}/categoryId`);
      for (const [index, rule] of payload.rememberedRules.entries())
        if (rule.categoryId === id)
          issues.push(`/rememberedRules/${index}/categoryId`);
      throw new ApplicationError(
        category ? CATEGORY_INACTIVE_CODE : CATEGORY_NOT_FOUND_CODE,
        category ? 'Category is inactive.' : 'Category was not found.',
        issues.map((field) => ({
          field,
          code: 'ineligible',
          message: 'An active Category in the destination Space is required.',
        })),
      );
    }
  }
}

function cents(value: string): bigint {
  return BigInt(value.replace('.', ''));
}
function reject(paths: string[]): never {
  throw new RequestValidationError(
    [...new Set(paths)].map((field) => ({
      field,
      code: 'invalid',
      message: 'Invalid reviewed import field.',
    })),
  );
}
