import { createPublicKey } from 'node:crypto';

export const API_PREFIX = 'api/v1';
export const MAX_REQUEST_BODY_SIZE = 1024 * 1024;
export const APP_CONFIG = Symbol('APP_CONFIG');
export const DEFAULT_ENVIRONMENT = 'development';
export const PRODUCTION_ENVIRONMENT = 'production';
export const DEFAULT_PORT = 3000;
export const DATABASE_POOL_SIZE = 1;
export const DATABASE_CONNECTION_TIMEOUT_MS = 1000;
export const DATABASE_IDLE_TIMEOUT_MS = 10000;
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'If-Match',
];
export const CORS_EXPOSED_HEADERS = ['Location', 'X-Request-ID'];

export const API_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

export interface AppConfig {
  environment: string;
  port: number;
  databaseUrl: string | undefined;
  corsOrigins: string[];
  clerkJwtKey: string | undefined;
  clerkSecretKey: string | undefined;
  clerkAuthorizedParties: string[];
  spaceNotificationDeliveryUrl?: string;
  spaceNotificationDeliveryApiKey?: string;
}

export function loadAppConfig(
  processEnv: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const currentEnvironment = processEnv.NODE_ENV?.trim() || DEFAULT_ENVIRONMENT;
  const port = parsePort(processEnv.PORT);
  const databaseUrl = readDatabaseUrl(processEnv.DATABASE_URL);
  const corsOrigins = readCorsOrigins(processEnv.CORS_ORIGINS);
  const clerkJwtKey = readClerkJwtKey(processEnv.CLERK_JWT_KEY);
  const clerkSecretKey = readClerkSecretKey(processEnv.CLERK_SECRET_KEY);
  const clerkAuthorizedParties = readClerkAuthorizedParties(
    processEnv.CLERK_AUTHORIZED_PARTIES,
  );
  const spaceNotificationDeliveryUrl = readOptionalHttpUrl(
    processEnv.SPACE_NOTIFICATION_DELIVERY_URL,
    'SPACE_NOTIFICATION_DELIVERY_URL',
  );
  const spaceNotificationDeliveryApiKey = readOptionalSecret(
    processEnv.SPACE_NOTIFICATION_DELIVERY_API_KEY,
  );

  if (currentEnvironment === PRODUCTION_ENVIRONMENT) {
    requireProductionValue('DATABASE_URL', databaseUrl);
    requireProductionValue('CORS_ORIGINS', processEnv.CORS_ORIGINS?.trim());
    requireProductionValue('CLERK_JWT_KEY', clerkJwtKey);
    requireProductionValue('CLERK_SECRET_KEY', clerkSecretKey);
    requireProductionValue(
      'CLERK_AUTHORIZED_PARTIES',
      clerkAuthorizedParties.length > 0 ? 'configured' : undefined,
    );
  }

  return {
    environment: currentEnvironment,
    port,
    databaseUrl,
    corsOrigins,
    clerkJwtKey,
    clerkSecretKey,
    clerkAuthorizedParties,
    ...(spaceNotificationDeliveryUrl ? { spaceNotificationDeliveryUrl } : {}),
    ...(spaceNotificationDeliveryApiKey
      ? { spaceNotificationDeliveryApiKey }
      : {}),
  };
}

function parsePort(value: string | undefined): number {
  if (!value?.trim()) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function readDatabaseUrl(value: string | undefined): string | undefined {
  const databaseUrl = value?.trim();
  if (!databaseUrl) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    parsedUrl.pathname === '/'
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }

  return databaseUrl;
}

function readCorsOrigins(value: string | undefined): string[] {
  return readExplicitHttpOrigins(value, 'CORS_ORIGINS');
}

function readClerkAuthorizedParties(value: string | undefined): string[] {
  return readExplicitHttpOrigins(value, 'CLERK_AUTHORIZED_PARTIES');
}

function readExplicitHttpOrigins(
  value: string | undefined,
  variableName: string,
): string[] {
  const configuredOrigins = value?.trim();
  if (!configuredOrigins) {
    return [];
  }

  const origins = configuredOrigins
    .split(',')
    .map((origin) => normalizeExplicitHttpOrigin(origin.trim()));
  if (origins.some((origin) => origin === undefined)) {
    throw new Error(`${variableName} must contain explicit HTTP(S) origins`);
  }

  return origins as string[];
}

function readOptionalHttpUrl(
  value: string | undefined,
  variableName: string,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error('invalid URL');
    }
    return parsed.toString().replace(/\/$/u, '');
  } catch {
    throw new Error(`${variableName} must be an HTTP(S) URL`);
  }
}

function readOptionalSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readClerkJwtKey(value: string | undefined): string | undefined {
  const jwtKey = value?.trim().replaceAll('\\n', '\n');
  if (!jwtKey) {
    return undefined;
  }

  const pemPublicKeyPattern =
    /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/;
  if (!pemPublicKeyPattern.test(jwtKey)) {
    throw new Error('CLERK_JWT_KEY must be a valid PEM public key');
  }

  try {
    const publicKey = createPublicKey(jwtKey);
    if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'rsa') {
      throw new Error('Not a public key');
    }
  } catch {
    throw new Error('CLERK_JWT_KEY must be a valid PEM public key');
  }

  return jwtKey;
}

function readClerkSecretKey(value: string | undefined): string | undefined {
  const secretKey = value?.trim();
  if (!secretKey) {
    return undefined;
  }

  if (!/^sk_(?:test|live)_[^\s]+$/.test(secretKey)) {
    throw new Error('CLERK_SECRET_KEY must be a valid Clerk secret key');
  }

  return secretKey;
}

function normalizeExplicitHttpOrigin(origin: string): string | undefined {
  if (!origin || origin === '*') {
    return undefined;
  }

  try {
    const parsedOrigin = new URL(origin);
    if (
      ['http:', 'https:'].includes(parsedOrigin.protocol) &&
      Boolean(parsedOrigin.hostname) &&
      parsedOrigin.pathname === '/' &&
      !parsedOrigin.search &&
      !parsedOrigin.hash &&
      !parsedOrigin.username &&
      !parsedOrigin.password
    ) {
      return parsedOrigin.origin;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function requireProductionValue(name: string, value: string | undefined): void {
  if (!value) {
    throw new Error(`Missing required production configuration: ${name}`);
  }
}
