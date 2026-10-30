import { statementImportStore, registerPrivateCleanup } from '@/application/session-runtime';
import { createImportWorkflow } from './import-workflow';
import { pickImportFile, prepareImportFile, releasePickerCopy, sweepImportFiles, trackPickerCopy } from './native-file';

export const importWorkflow = createImportWorkflow({ store: statementImportStore,
  pick: pickImportFile, prepare: prepareImportFile,
  track: trackPickerCopy, release: releasePickerCopy, sweep: sweepImportFiles });
registerPrivateCleanup(async () => { submitPassword = null; await importWorkflow.cleanupPrivateResources(); });

// Password commands are delivered directly to the mounted engine, never stored.
let submitPassword: ((password: string) => void) | null = null;
export function registerPasswordSender(sender: ((password: string) => void) | null) { submitPassword = sender; }
export function unlockImport(password: string) { submitPassword?.(password); }
