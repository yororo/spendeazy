import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAppConfig } from './app-config';
import { loadLocalEnvironment } from './load-local-environment';

describe('loadAppConfig', () => {
  it('loads a production configuration with a database URL and CORS allowlist', () => {
    const jwtKey = validJwtKey();
    const config = loadAppConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      DATABASE_URL:
        'postgresql://expense-user:secret@db.example.com:5432/expenses',
      CORS_ORIGINS: 'https://app.example.com/, https://admin.example.com',
      CLERK_JWT_KEY: jwtKey,
      CLERK_SECRET_KEY: 'sk_test_secret',
      CLERK_AUTHORIZED_PARTIES:
        'https://app.example.com/, https://admin.example.com',
      INVITATION_CODE_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
    });

    expect(config).toEqual({
      environment: 'production',
      port: 4000,
      databaseUrl:
        'postgresql://expense-user:secret@db.example.com:5432/expenses',
      corsOrigins: ['https://app.example.com', 'https://admin.example.com'],
      clerkJwtKey: jwtKey.trim(),
      clerkSecretKey: 'sk_test_secret',
      clerkAuthorizedParties: [
        'https://app.example.com',
        'https://admin.example.com',
      ],
      invitationCodeEncryptionKey: '0123456789abcdef'.repeat(4),
    });
  });

  it('rejects malformed database URLs and origins', () => {
    expect(() =>
      loadAppConfig({
        DATABASE_URL: 'mysql://localhost/expenses',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow('DATABASE_URL must be a PostgreSQL connection URL');

    expect(() =>
      loadAppConfig({
        DATABASE_URL: 'postgresql://localhost/expenses',
        CORS_ORIGINS: '*',
      }),
    ).toThrow('CORS_ORIGINS must contain explicit HTTP(S) origins');
  });

  it('rejects malformed Clerk verification configuration', () => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: 'test',
        CLERK_JWT_KEY: 'not a PEM public key',
        CLERK_AUTHORIZED_PARTIES: 'https://app.example.com',
      }),
    ).toThrow('CLERK_JWT_KEY must be a valid PEM public key');

    expect(() =>
      loadAppConfig({
        NODE_ENV: 'test',
        CLERK_JWT_KEY: validJwtKey(),
        CLERK_AUTHORIZED_PARTIES: '*',
      }),
    ).toThrow('CLERK_AUTHORIZED_PARTIES must contain explicit HTTP(S) origins');

    expect(() =>
      loadAppConfig({
        NODE_ENV: 'test',
        CLERK_SECRET_KEY: 'not-a-clerk-secret',
      }),
    ).toThrow('CLERK_SECRET_KEY must be a valid Clerk secret key');

    expect(() =>
      loadAppConfig({
        NODE_ENV: 'test',
        INVITATION_CODE_ENCRYPTION_KEY: 'too-short',
      }),
    ).toThrow(
      'INVITATION_CODE_ENCRYPTION_KEY must be a 32-byte hexadecimal key',
    );
  });

  it('ignores retired invitation delivery configuration', () => {
    expect(
      loadAppConfig({
        NODE_ENV: 'test',
        INVITATION_DELIVERY_URL: ' https://mailer.example.test/send/ ',
        INVITATION_DELIVERY_API_KEY: ' delivery-secret ',
        INVITATION_WEB_BASE_URL: 'https://app.example.test/ ',
        SPACE_NOTIFICATION_DELIVERY_URL:
          ' https://mailer.example.test/space-archive/ ',
        SPACE_NOTIFICATION_DELIVERY_API_KEY: ' space-delivery-secret ',
      }),
    ).toEqual({
      environment: 'test',
      port: 3000,
      databaseUrl: undefined,
      corsOrigins: [],
      clerkJwtKey: undefined,
      clerkSecretKey: undefined,
      clerkAuthorizedParties: [],
      spaceNotificationDeliveryUrl: 'https://mailer.example.test/space-archive',
      spaceNotificationDeliveryApiKey: 'space-delivery-secret',
    });
  });

  it('rejects Clerk public key formats unsupported by the verifier', () => {
    const rsaPkcs1Key = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ type: 'pkcs1', format: 'pem' })
      .toString();
    const ecKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString();

    for (const clerkJwtKey of [rsaPkcs1Key, ecKey]) {
      expect(() =>
        loadAppConfig({
          NODE_ENV: 'test',
          CLERK_JWT_KEY: clerkJwtKey,
          CLERK_AUTHORIZED_PARTIES: 'https://app.example.com',
        }),
      ).toThrow('CLERK_JWT_KEY must be a valid PEM public key');
    }
  });

  it.each([
    'DATABASE_URL',
    'CORS_ORIGINS',
    'CLERK_JWT_KEY',
    'CLERK_SECRET_KEY',
    'CLERK_AUTHORIZED_PARTIES',
    'INVITATION_CODE_ENCRYPTION_KEY',
  ])('rejects production startup when %s is missing', (missingVariable) => {
    const environment = {
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://expense-user:secret@db.example.com:5432/expenses',
      CORS_ORIGINS: 'https://app.example.com',
      CLERK_JWT_KEY: validJwtKey(),
      CLERK_SECRET_KEY: 'sk_test_secret',
      CLERK_AUTHORIZED_PARTIES: 'https://app.example.com',
      INVITATION_CODE_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
    };
    delete environment[missingVariable as keyof typeof environment];

    expect(() => loadAppConfig(environment)).toThrow(
      `Missing required production configuration: ${missingVariable}`,
    );
  });

  it('uses safe local defaults outside production', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' })).toEqual({
      environment: 'test',
      port: 3000,
      databaseUrl: undefined,
      corsOrigins: [],
      clerkJwtKey: undefined,
      clerkSecretKey: undefined,
      clerkAuthorizedParties: [],
    });
  });
});

describe('loadLocalEnvironment', () => {
  it('loads an existing env file without overriding an existing environment variable', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spendeazy-env-'));
    const filePath = join(directory, '.env');
    const variableName = 'SPENDEAZY_ENV_FILE_TEST_VALUE';
    const previousValue = process.env[variableName];

    writeFileSync(filePath, `${variableName}=from-file\n`);
    process.env[variableName] = 'from-process';

    try {
      loadLocalEnvironment(filePath);

      expect(process.env[variableName]).toBe('from-process');
    } finally {
      if (previousValue === undefined) {
        delete process.env[variableName];
      } else {
        process.env[variableName] = previousValue;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not attempt to load a missing env file', () => {
    const loadEnvFile = jest.fn();

    loadLocalEnvironment('missing.env', () => false, loadEnvFile);

    expect(loadEnvFile).not.toHaveBeenCalled();
  });
});

function validJwtKey(): string {
  return generateKeyPairSync('rsa', { modulusLength: 2048 })
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString();
}
