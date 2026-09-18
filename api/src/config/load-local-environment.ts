import { existsSync } from 'node:fs';

export const LOCAL_ENV_FILE = '.env';

export function loadLocalEnvironment(
  filePath: string = LOCAL_ENV_FILE,
  fileExists: (path: string) => boolean = existsSync,
  loadEnvFile: (path: string) => void = process.loadEnvFile,
): void {
  if (fileExists(filePath)) {
    loadEnvFile(filePath);
  }
}
