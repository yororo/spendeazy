import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfirmationPayload } from './confirmation-payload';
import {
  protectConfirmationReferences,
  warningIdentity,
} from './confirmation-canonicalization';
import { buildImportWarnings } from './import-warnings';
import { NodeGCashReferenceHasher } from '../infrastructure/node-gcash-reference-hasher';
function fixture() {
  const payload = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../mobile-app/src/features/statement-import/fixtures/confirmation.json',
      ),
      'utf8',
    ),
  ) as ConfirmationPayload;
  return protectConfirmationReferences(
    payload,
    '7',
    new NodeGCashReferenceHasher('fictional-key'),
  );
}
describe('shared import warnings', () => {
  it('excludes display messages from warning identity even when a runtime object contains them', () => {
    const warning = {
      type: 'reconciliation' as const,
      sourceRowIds: [],
      expenseIds: [],
      statementImportIds: [],
      message: 'First display copy',
    };
    expect(warningIdentity(warning)).toBe(
      warningIdentity({
        ...warning,
        message: 'Changed display copy',
      } as typeof warning),
    );
  });
  it('groups within-payload references, batches distinct signals, and sorts stable records independently of query order', async () => {
    const payload = fixture();
    payload.evidence.transactions[1].referenceHash =
      payload.evidence.transactions[0].referenceHash;
    const findFileMatches = jest.fn().mockResolvedValue(['10', '9']);
    const matches = [
      {
        id: '4',
        statementImportId: '10',
        importFingerprint: 'f'.repeat(64),
        referenceHash: payload.evidence.transactions[0].referenceHash,
      },
      {
        id: '3',
        statementImportId: '9',
        importFingerprint: 'f'.repeat(64),
        referenceHash: payload.evidence.transactions[0].referenceHash,
      },
    ];
    const findDuplicateHistory = jest.fn().mockResolvedValue(matches);
    const first = await buildImportWarnings(
      { findFileMatches, findDuplicateHistory },
      '7',
      payload,
    );
    expect(findDuplicateHistory).toHaveBeenCalledTimes(1);
    expect(
      first.warnings.find((row) => row.type === 'probable_duplicate'),
    ).toMatchObject({
      sourceRowIds: payload.expenses.map((row) => row.sourceRowId).sort(),
      expenseIds: ['3', '4'],
      statementImportIds: ['10', '9'],
    });
    findFileMatches.mockResolvedValue(['9', '10']);
    findDuplicateHistory.mockResolvedValue([...matches].reverse());
    expect(
      await buildImportWarnings(
        { findFileMatches, findDuplicateHistory },
        '7',
        payload,
      ),
    ).toEqual(first);
    findDuplicateHistory.mockResolvedValue([]);
    const within = await buildImportWarnings(
      { findFileMatches, findDuplicateHistory },
      '7',
      payload,
    );
    expect(
      within.warnings.find((row) => row.type === 'probable_duplicate')
        ?.expenseIds,
    ).toEqual([]);
  });
  it('keeps original discrepancies independent of edited spending and allows no warnings only with matched complete assertions', async () => {
    const payload = fixture();
    const context = {
      findFileMatches: () => Promise.resolve([]),
      findDuplicateHistory: () => Promise.resolve([]),
    };
    const first = await buildImportWarnings(context, '7', payload);
    payload.expenses[0].amount = '1.00';
    const edited = await buildImportWarnings(context, '7', payload);
    expect(edited.warnings).toEqual(first.warnings);
    expect(edited.warningDigest).not.toBe(first.warningDigest);
    payload.evidence.reconciliation = {
      status: 'matched',
      diagnostics: [],
      comparisons: [],
    };
    payload.evidence.pages = [];
    payload.evidence.completeness = {
      assessment: 'uncertain',
      failedPageIndices: [],
      unreadablePageIndices: [],
    };
    expect((await buildImportWarnings(context, '7', payload)).warnings).toEqual(
      [],
    );
    payload.evidence.completeness.assessment = 'partial';
    expect(
      (await buildImportWarnings(context, '7', payload)).warnings.map(
        (row) => row.type,
      ),
    ).toEqual(['reconciliation']);
  });
});
