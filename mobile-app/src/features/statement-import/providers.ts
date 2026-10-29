import type { ExtractedPage } from './extraction-bridge.ts';
import type { ImportAccount, ImportControl, ImportFile, ImportOwner, ImportResult, ImportRow, ImportWarning } from './import-model.ts';
import { cardDate, MONEY, minorUnits, parseDate } from './values.ts';
import { reconcile } from './reconciliation.ts';

export class InterpretationFailure extends Error {
  readonly code: 'unsupported' | 'no-usable-rows';
  constructor(code: 'unsupported' | 'no-usable-rows') { super(code); this.code = code; }
}
type SourceLine = { text: string; pageIndex: number; sourceOrder: number };
const normalize = (text: string) => text.trim().replace(/\s+/gu, ' ');
const amountAtEnd = new RegExp(`(?:^|\\s)(${MONEY})$`, 'iu');

function recognize(text: string): ImportAccount {
  const accounts: ImportAccount[] = [];
  const nonPhp = /\bdual[- ]currency\b|\bstatement\b[^\n]*(?:\bUSD\b|\bEUR\b|\bUS dollars?\b)|^(?:SALE POST )?CURRENCY\s+(?:USD|EUR)\b|\((?:USD|EUR)\)/imu.test(text);
  if (!nonPhp && /\bBDO\b/iu.test(text) && /\bAMEX\b/iu.test(text) && /\bPHP\b/iu.test(text)) accounts.push({ provider: 'bdo', format: 'amex', statementType: 'credit-card' });
  if (!nonPhp && /\bEastWest\b/iu.test(text) && /\bVisa\b/iu.test(text) && /\b(?:PHP|PESO)\b/iu.test(text)) accounts.push({ provider: 'eastwest', format: 'visa', statementType: 'credit-card' });
  if (/\bGCash Transaction History\b/iu.test(text)) accounts.push({ provider: 'gcash', format: 'e-wallet', statementType: 'e-wallet' });
  if (accounts.length !== 1) throw new InterpretationFailure('unsupported');
  return accounts[0];
}

function classification(amount: bigint | null, date: string | null, description: string, wallet: boolean): ImportRow['classification'] {
  if (!date) return { eligible: false, reason: 'invalid-date' };
  if (amount === null || amount === 0n) return { eligible: false, reason: 'unknown-direction' };
  if (amount < 0n) return { eligible: false, reason: /\brefund\b/iu.test(description) ? 'refund' : /\bpayment\b/iu.test(description) ? 'payment' : wallet ? 'cash-in' : 'credit' };
  return { eligible: true, kind: wallet ? 'outgoing-transfer' : 'purchase', expenseMinor: amount };
}

export function interpretStatement(input: {
  pages: readonly ExtractedPage[]; draftId: string; owner: ImportOwner; file: ImportFile;
}): ImportResult {
  const lines: SourceLine[] = input.pages.flatMap(page => page.text.split(/\r?\n/u).map((text, sourceOrder) => ({ text: normalize(text), pageIndex: page.pageIndex, sourceOrder })));
  const allText = lines.map(line => line.text).join('\n');
  const account = recognize(allText);
  const wallet = account.provider === 'gcash';
  const controls: ImportControl[] = [];
  const structuralDifferences: (bigint | null)[] = [];
  const values = new Map<string, bigint | null>();
  function control(label: string, kind: ImportControl['kind']) {
    const index = lines.findIndex(line => line.text.toLowerCase().startsWith(`${label.toLowerCase()} `) || line.text.toLowerCase() === label.toLowerCase());
    if (index < 0) { values.set(label, null); return; }
    const suffix = lines[index].text.slice(label.length).trim();
    const originalValue = suffix || lines[index + 1]?.text || '';
    const amountMinor = minorUnits(originalValue);
    controls.push({ kind, sourceLabel: label, originalValue, amountMinor }); values.set(label, amountMinor);
  }
  const openingLabel = wallet ? 'STARTING BALANCE' : 'Previous Balance';
  const closingLabel = wallet ? 'ENDING BALANCE' : account.provider === 'bdo' ? 'Total Amount Due' : 'Total Statement Balance';
  control(openingLabel, 'opening-balance'); control(closingLabel, wallet ? 'closing-balance' : 'statement-total');
  const debitLabels = wallet ? ['Total Debit'] : account.provider === 'bdo'
    ? ['Purchases and Advances (+)', 'Finance Charge (+)', 'Fees/Other Debits (+)', 'Late Charge (+)']
    : ['Plus: Purchases/Debits', 'Cash Advances', 'Installment', 'Fees/Charges'];
  const creditLabels = wallet ? ['Total Credit'] : account.provider === 'bdo' ? ['Payments/Other Credits (-)'] : ['Less: Payments', 'Credits'];
  for (const label of debitLabels) control(label, wallet ? 'total-debits' : 'component');
  for (const label of creditLabels) control(label, wallet ? 'total-credits' : 'component');
  const sumControls = (labels: string[]) => labels.some(label => values.get(label) == null) ? null : labels.reduce((sum, label) => sum + values.get(label)!, 0n);
  const statementDate = parseDate(lines.find(line => /^Statement Date\s/iu.test(line.text))?.text.replace(/^Statement Date\s+/iu, '') ?? '');
  const range = allText.match(/^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/mu);
  const from = range ? parseDate(range[1]) : null;
  const to = range ? parseDate(range[2]) : null;
  const historyPeriod = from && to && from <= to ? { from, to } : null;
  const rows: ImportRow[] = [];
  const uncertainPages = new Set<number>();
  let previousBalance = values.get(openingLabel) ?? null;
  let previousPage = -1;
  let activeCardSection = false;
  let sectionBalance: bigint | null = null;
  const subtotals: bigint[] = [];
  let finalTotal: bigint | null = null;
  const cardPattern = account.provider === 'bdo'
    ? /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+)$/u
    : /^([A-Za-z]{3} \d{1,2})\s+([A-Za-z]{3} \d{1,2})\s+(.+)$/u;
  const walletPrefix = /^(\d{4}-\d{2}-\d{2})\s+(?:0?[1-9]|1[0-2]):[0-5]\d\s+[AP]M\s+(.+)$/iu;
  const rowStart = wallet ? /^\d{4}-\d{2}-\d{2}\s+(?:0?[1-9]|1[0-2]):/u : account.provider === 'bdo' ? /^\d{2}\/\d{2}\/\d{2}\s/u : /^[a-z]{3}\s+\d{1,2}\s+[a-z]{3}\s+\d{1,2}\s/iu;
  for (let index = 0; index < lines.length; index++) {
    const source = lines[index];
    if (wallet && source.pageIndex !== previousPage) {
      // Never bridge a missing page's balance movement.
      if (input.pages.some(page => page.pageIndex < source.pageIndex && page.pageIndex > previousPage && ['failed', 'unreadable'].includes(page.outcome))) previousBalance = null;
      previousPage = source.pageIndex;
    }
    if (!wallet) {
      if (account.provider === 'bdo' && /^PREVIOUS STATEMENT BALANCE\b/iu.test(source.text)) {
        const originalValue = source.text.replace(/^PREVIOUS STATEMENT BALANCE\s*/iu, '');
        sectionBalance = minorUnits(originalValue);
        controls.push({ kind: 'opening-balance', sourceLabel: 'PREVIOUS STATEMENT BALANCE', originalValue, amountMinor: sectionBalance });
        structuralDifferences.push(sectionBalance !== null && previousBalance !== null ? sectionBalance - previousBalance : null);
      }
      if (/^CARD NUMBER\b|^YOUR CARD ACTIVITIES$/iu.test(source.text)) {
        if (activeCardSection && account.provider === 'bdo') uncertainPages.add(source.pageIndex);
        activeCardSection = true;
        if (account.provider === 'bdo' && sectionBalance === null && subtotals.length) sectionBalance = 0n;
      }
      if (account.provider === 'bdo' && /^(?:SUBTOTAL|TOTAL)\s/iu.test(source.text)) {
        const label = /^SUBTOTAL\b/iu.test(source.text) ? 'SUBTOTAL' : 'TOTAL';
        const originalValue = source.text.slice(label.length).trim(); const amountMinor = minorUnits(originalValue);
        controls.push({ kind: label === 'SUBTOTAL' ? 'subtotal' : 'statement-total', sourceLabel: label, originalValue, amountMinor });
        if (label === 'SUBTOTAL') {
          structuralDifferences.push(sectionBalance !== null && amountMinor !== null ? sectionBalance - amountMinor : null);
          if (amountMinor !== null) subtotals.push(amountMinor);
          sectionBalance = null;
        } else finalTotal = amountMinor;
        activeCardSection = false;
      }
    }
    if (!rowStart.test(source.text)) {
      if (activeCardSection && account.provider === 'eastwest' && /^\d{1,2}\/\d{1,2}\b/u.test(source.text)) uncertainPages.add(source.pageIndex);
      continue;
    }
    if (!wallet && !activeCardSection) { uncertainPages.add(source.pageIndex); continue; }
    let text = source.text;
    if (wallet) {
      // Wrapped description/reference, only up to the next row, page or control/header.
      while (index + 1 < lines.length && lines[index + 1].pageIndex === source.pageIndex && !rowStart.test(lines[index + 1].text) &&
        !/^(?:STARTING BALANCE|ENDING BALANCE|Total Debit|Total Credit|GCash|Date and Time|\d{4}-\d{2}-\d{2} to)/iu.test(lines[index + 1].text)) text += ` ${lines[++index].text}`;
    }
    const prefix = (wallet ? walletPrefix : cardPattern).exec(text);
    if (!prefix) { uncertainPages.add(source.pageIndex); previousBalance = null; continue; }
    const originalDate = prefix[1];
    let date = wallet || account.provider === 'bdo' ? parseDate(originalDate) : cardDate(originalDate, statementDate);
    if (wallet && (!historyPeriod || !date || date < historyPeriod.from || date > historyPeriod.to)) date = null;
    let description = '';
    let reference: string | null = null;
    let originalAmount = '';
    let amount: bigint | null = null;
    let originalBalance: string | undefined;
    let evidence: ImportRow['evidence'] = [{ kind: 'unresolved', value: null }];
    if (wallet) {
      const body = prefix[2];
      const parts = new RegExp(`^(.+?)\\s+(\\d+)\\s+(${MONEY})(?:\\s+(${MONEY}|-))?\\s+(${MONEY})$`, 'iu').exec(body);
      if (!parts) { uncertainPages.add(source.pageIndex); previousBalance = null; continue; }
      description = parts[1]; reference = parts[2]; originalAmount = parts[3];
      const magnitude = minorUnits(parts[3]); const balance = minorUnits(parts[5]);
      originalBalance = parts[5];
      if (parts[4] !== undefined) {
        const credit = parts[4] === '-' ? 0n : minorUnits(parts[4]);
        const tableEvidence = /Date and Time Description Reference No\. Debit Credit Balance/iu.test(allText);
        if (tableEvidence && magnitude !== null && credit !== null && magnitude >= 0n && credit >= 0n && (magnitude === 0n || credit === 0n)) {
          amount = magnitude - credit; originalAmount = `${parts[3]} / ${parts[4]}`;
          evidence = [{ kind: 'debit-credit-column', value: originalAmount }];
        }
      } else if (magnitude !== null && balance !== null && previousBalance !== null) {
        const movement = previousBalance - balance;
        if (movement === magnitude || movement === -magnitude) {
          amount = movement; evidence = [{ kind: 'balance-movement', value: `${previousBalance} -> ${balance}` }];
        }
      }
      previousBalance = balance;
    } else {
      const body = prefix[3]; const end = amountAtEnd.exec(body);
      if (!end) { uncertainPages.add(source.pageIndex); continue; }
      description = body.slice(0, end.index).trim(); originalAmount = end[1]; amount = minorUnits(originalAmount);
      evidence = [{ kind: 'explicit-sign', value: originalAmount }];
      if (account.provider === 'bdo' && sectionBalance !== null && amount !== null) sectionBalance += amount;
      const next = lines[index + 1];
      if (next && /^Reference:/iu.test(next.text)) {
        reference = next.text.replace(/^Reference:\s*/iu, ''); index++;
        if (!reference && lines[index + 1] && /^\S+$/u.test(lines[index + 1].text)) reference = lines[++index].text;
      }
    }
    if (!description) { uncertainPages.add(source.pageIndex); continue; }
    rows.push({ sourceRowId: `p${source.pageIndex}:r${source.sourceOrder}`, pageIndex: source.pageIndex, sourceOrder: source.sourceOrder,
      description, originalDate, ...(wallet ? {} : { originalPostingDate: prefix[2] }), date, reference, originalAmount,
      ...(originalBalance === undefined ? {} : { originalBalance }),
      signedActivityMinor: amount, evidence, classification: classification(amount, date, description, wallet) });
  }
  if (!rows.length) throw new InterpretationFailure('no-usable-rows');
  const positive = rows.reduce((sum, row) => sum + (row.signedActivityMinor !== null && row.signedActivityMinor > 0n ? row.signedActivityMinor : 0n), 0n);
  const negative = rows.reduce((sum, row) => sum - (row.signedActivityMinor !== null && row.signedActivityMinor < 0n ? row.signedActivityMinor : 0n), 0n);
  const opening = values.get(openingLabel) ?? null; const closing = values.get(closingLabel) ?? null;
  const debits = sumControls(debitLabels); const credits = sumControls(creditLabels);
  const unresolved = rows.some(row => row.signedActivityMinor === null);
  if (account.provider === 'bdo') {
    if (activeCardSection) uncertainPages.add(rows[rows.length - 1].pageIndex);
    structuralDifferences.push(finalTotal === null || closing === null ? null : finalTotal - closing,
      finalTotal === null || !subtotals.length ? null : subtotals.reduce((sum, value) => sum + value, 0n) - finalTotal);
  }
  const difference = (expected: bigint | null, actual: bigint) => expected === null ? null : actual - expected;
  const reconciliation = reconcile([unresolved ? null : difference(debits, positive), unresolved ? null : difference(credits, negative),
    unresolved || opening === null || closing === null ? null : opening + (wallet ? negative - positive : positive - negative) - closing,
    ...structuralDifferences], unresolved);
  const pages = input.pages.map(({ text: _text, ...page }) => page);
  const failedPageIndices = pages.filter(page => page.outcome === 'failed').map(page => page.pageIndex);
  const unreadablePageIndices = pages.filter(page => page.outcome === 'unreadable').map(page => page.pageIndex);
  const partial = failedPageIndices.length + unreadablePageIndices.length + uncertainPages.size > 0;
  const warnings: ImportWarning[] = [{ code: 'uncertain-completeness', sourceRowIds: [], pageIndices: [] }];
  if (partial) warnings.push({ code: 'partial-extraction', sourceRowIds: [], pageIndices: [...new Set([...failedPageIndices, ...unreadablePageIndices, ...uncertainPages])] });
  if (rows.some(row => !row.classification.eligible && ['unknown-direction', 'invalid-date', 'invalid-amount'].includes(row.classification.reason))) warnings.push({ code: 'unresolved-classification', sourceRowIds: rows.filter(row => !row.classification.eligible && ['unknown-direction', 'invalid-date', 'invalid-amount'].includes(row.classification.reason)).map(row => row.sourceRowId), pageIndices: [] });
  if (reconciliation.outcome === 'mismatch') warnings.push({ code: 'reconciliation-mismatch', sourceRowIds: [], pageIndices: [] });
  if ([...values.values(), ...structuralDifferences].some(value => value === null)) warnings.push({ code: 'missing-control', sourceRowIds: [], pageIndices: [] });
  return { draftId: input.draftId, owner: input.owner, file: input.file, account,
    dates: { statementDate: wallet ? null : statementDate, historyPeriod }, controls, rows, pages,
    completeness: { assessment: partial ? 'partial' : 'uncertain', failedPageIndices, unreadablePageIndices },
    recognitionEvidence: [{ kind: 'provider', value: account.provider }, { kind: 'account-format', value: account.format }], reconciliation, warnings };
}
