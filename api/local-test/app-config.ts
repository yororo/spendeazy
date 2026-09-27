import { loadAppConfig, type AppConfig } from '../src/config/app-config';

const LOCAL_TEST_INVITATION_CODE_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
const LOCAL_TEST_GCASH_REFERENCE_HASH_KEY = 'abcdef0123456789'.repeat(4);

export function loadLocalTestAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return loadAppConfig({
    ...environment,
    INVITATION_CODE_ENCRYPTION_KEY:
      environment.INVITATION_CODE_ENCRYPTION_KEY ||
      LOCAL_TEST_INVITATION_CODE_ENCRYPTION_KEY,
    GCASH_REFERENCE_HASH_KEY:
      environment.GCASH_REFERENCE_HASH_KEY ||
      LOCAL_TEST_GCASH_REFERENCE_HASH_KEY,
  });
}
