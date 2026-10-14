import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repositoryRoot = join(__dirname, '..', '..');
const roots = [
  'api/src',
  'api/test',
  'api/docs',
  'api/README.md',
  'api/ARCHITECTURE.md',
  'api/AGENTS.md',
  'web/src',
  'web/e2e',
  'web/docs',
  'web/README.md',
  'web/AGENTS.md',
  'docs',
  'GLOSSARY.md',
  'README.md',
];
const skippedPaths = [
  /^api\/src\/database\/migrations\//,
  /^api\/src\/expense-terminology-audit\.spec\.ts$/,
  /^docs\/archive\//,
  /^web\/docs\/pdf-parser\//,
  /\.pen$/,
];
const allowedLine =
  /transactionHistoryStartDate|transaction_history_start_date|Transaction\\s\+\s*History|Transaction History|Transaction Details|financial transactions|transactionDescription|Transaction description|Transaction data|\.transaction\(|migrationsTransactionMode|transaction-bound|transaction context|persistence transaction|one transaction|same transaction|Persistence and transactions|persistence-and-transactions|TRANSACTION_|rename-transactions|deleted-transactions|enforce-transaction|create-transaction|transaction-activity|transaction-edit|INTO transactions|FROM transactions|TABLE transactions|public\.transactions|\/transactions|transaction resources|transaction fields|used Transaction|transaction import|unknown transaction|duplicate transaction|transaction\.id|\[transaction\]|transactions:|'transactions'|Transaction-to-Statement|_Avoid_: Transaction|transaction history|fk_transactions|GCash\\s\+Transaction|QUASI CASH TRANSACTION FEE|Buy Load Transaction|const transaction =|transaction: jest\.fn|\{ transaction \}|expect\(transaction\)| transaction,/;

describe('expense terminology audit', () => {
  it('keeps transaction wording to the explicit allowlist', () => {
    const violations: string[] = [];
    for (const root of roots) {
      collect(join(repositoryRoot, root), violations);
    }
    expect(violations).toEqual([]);
  });
});

function collect(path: string, violations: string[]) {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (!stats) return;
  if (stats.isDirectory()) {
    for (const name of readdirSync(path)) collect(join(path, name), violations);
    return;
  }
  if (!/\.(ts|tsx|md|yaml|yml)$/.test(path)) return;
  const relativePath = relative(repositoryRoot, path).replaceAll('\\', '/');
  if (skippedPaths.some((pattern) => pattern.test(relativePath))) return;

  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (!/\btransactions?\b/i.test(line) || allowedLine.test(line)) return;
      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
}
