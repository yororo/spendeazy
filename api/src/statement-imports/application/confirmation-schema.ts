/** Closed privacy allowlist, also used by DTO metadata. No arbitrary diagnostic text. */
type Schema = {
  type: 'object' | 'array' | 'string' | 'integer' | 'boolean';
  nullable?: boolean;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
  enum?: readonly (string | boolean)[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
};
const text = (maxLength: number, minLength = 1): Schema => ({
  type: 'string',
  minLength,
  maxLength,
});
const choice = (...values: string[]): Schema => ({
  type: 'string',
  enum: values,
});
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const list = (items: Schema): Schema => ({ type: 'array', items });
const object = (
  properties: Record<string, Schema>,
  optional: string[] = [],
): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  additionalProperties: false,
});
const integer: Schema = { type: 'integer', minimum: 0 };
const boolean: Schema = { type: 'boolean' };
const date: Schema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const money: Schema = {
  type: 'string',
  pattern: '^-?(?:0|[1-9]\\d*)\\.\\d{2}$',
  maxLength: 100,
};
const id: Schema = { type: 'string', pattern: '^[1-9]\\d*$', maxLength: 19 };
const hash: Schema = { type: 'string', pattern: '^[0-9a-f]{64}$' };
const rowId = text(100);

/** Messages are application-owned, never copied from PDF/exception text. */
export const RECONCILIATION_DIAGNOSTICS = {
  'partial-extraction': 'Some pages or rows could not be extracted.',
  'uncertain-completeness': 'Extraction completeness has not been verified.',
  'unresolved-classification': 'Some activity could not be classified.',
  'reconciliation-mismatch':
    'Original activity differs from statement controls.',
  'missing-control': 'An original control or comparison is unavailable.',
} as const;

export const confirmationSchema = object({
  statement: object({
    fileName: text(255),
    fileHash: hash,
    provider: choice('bdo', 'eastwest', 'gcash'),
    accountFormat: choice('amex', 'visa', 'wallet'),
    statementType: choice('credit_card', 'e_wallet'),
    statementDate: nullable(date),
    historyFromDate: nullable(date),
    historyToDate: nullable(date),
  }),
  evidence: object({
    parserVersion: { ...text(100), pattern: '^[A-Za-z0-9._/-]+$' },
    extractionEngineVersion: { ...text(100), pattern: '^[A-Za-z0-9._/-]+$' },
    transactions: list(
      object(
        {
          sourceRowId: rowId,
          pageIndex: integer,
          sourceOrder: integer,
          original: object({
            dateText: text(100, 0),
            postingDateText: nullable(text(100, 0)),
            description: text(500),
            amountText: text(100, 0),
            balanceText: nullable(text(100, 0)),
          }),
          normalized: object({ date: nullable(date), amount: nullable(money) }),
          classification: choice(
            'purchase',
            'outgoing_transfer',
            'payment',
            'refund',
            'credit',
            'cash_in',
            'unknown_direction',
            'invalid_date',
            'invalid_amount',
          ),
          classificationEvidence: list(
            object({
              kind: choice(
                'debit-credit-column',
                'explicit-sign',
                'balance-movement',
                'activity-code',
                'unresolved',
              ),
              value: nullable(text(200, 0)),
            }),
          ),
          matchingSource: choice('manual', 'exact', 'contains', 'unmapped'),
          duplicateReference: text(100),
        },
        ['duplicateReference'],
      ),
    ),
    controlTotals: list(
      object({
        key: rowId,
        label: text(100),
        originalText: text(100, 0),
        amount: nullable(money),
      }),
    ),
    reconciliation: object({
      status: choice('matched', 'warning', 'unavailable'),
      comparisons: list(
        object({
          controlKey: nullable(rowId),
          equation: choice(
            'section-opening',
            'section-subtotal',
            'final-closing',
            'subtotal-sum',
            'debit-sum',
            'credit-sum',
            'closing-balance',
          ),
          expectedAmount: nullable(money),
          extractedAmount: nullable(money),
          difference: nullable(money),
        }),
      ),
      diagnostics: list(
        object({
          code: choice(...Object.keys(RECONCILIATION_DIAGNOSTICS)),
          message: choice(...Object.values(RECONCILIATION_DIAGNOSTICS)),
          sourceRowIds: list(rowId),
          pageIndices: list(integer),
        }),
      ),
    }),
    pages: list(
      object({
        pageIndex: integer,
        outcome: choice('text', 'blank', 'unreadable', 'failed'),
        hasImages: boolean,
      }),
    ),
    completeness: object({
      assessment: choice('uncertain', 'partial'),
      failedPageIndices: list(integer),
      unreadablePageIndices: list(integer),
    }),
  }),
  expenses: list(
    object({
      sourceRowId: rowId,
      expenseDate: date,
      description: text(500),
      amount: { ...money, pattern: '^(?:0|[1-9]\\d{0,12})\\.\\d{2}$' },
      categoryId: id,
    }),
  ),
  excluded: list(
    object({
      sourceRowId: rowId,
      reason: choice(
        'manual',
        'payment',
        'refund',
        'credit',
        'cash_in',
        'unknown_direction',
        'invalid_date',
        'invalid_amount',
      ),
      automatic: boolean,
    }),
  ),
  rememberedRules: list(
    object({
      pattern: text(500),
      matchType: choice('exact', 'contains'),
      categoryId: id,
    }),
  ),
  acknowledgedWarnings: list(text(100)),
  acknowledgedWarningDigest: nullable(hash),
});

export function schemaIssues(
  value: unknown,
  schema: Schema = confirmationSchema,
  path = '',
): string[] {
  if (value === null && schema.nullable) return [];
  const invalid = () => [path || '/'];
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return invalid();
    const record = value as Record<string, unknown>;
    return [
      ...Object.keys(record)
        .filter((key) => !Object.hasOwn(schema.properties!, key))
        .map(() => path || '/'),
      ...schema
        .required!.filter((key) => !Object.hasOwn(record, key))
        .map((key) => `${path}/${key}`),
      ...Object.entries(schema.properties!).flatMap(([key, child]) =>
        Object.hasOwn(record, key)
          ? schemaIssues(record[key], child, `${path}/${key}`)
          : [],
      ),
    ];
  }
  if (schema.type === 'array')
    return Array.isArray(value)
      ? value.flatMap((item, index) =>
          schemaIssues(item, schema.items, `${path}/${index}`),
        )
      : invalid();
  if (schema.type === 'integer')
    return typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= schema.minimum!
      ? []
      : invalid();
  if (schema.type === 'boolean')
    return typeof value === 'boolean' ? [] : invalid();
  return typeof value === 'string' &&
    (!schema.minLength || value.trim().length >= schema.minLength) &&
    (!schema.maxLength || value.length <= schema.maxLength) &&
    (!schema.enum || schema.enum.includes(value)) &&
    (!schema.pattern || new RegExp(schema.pattern, 'u').test(value))
    ? []
    : invalid();
}
