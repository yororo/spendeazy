import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  ClerkProfileService,
  ClerkUserProfile,
} from '../src/authentication/clerk-profile-service';
import type {
  ClerkSession,
  ClerkTokenVerifier,
} from '../src/authentication/authentication';

const TOKEN_PREFIX = 'spendeazy-local-test.v1';
const LOCAL_TEST_ENVIRONMENT = 'spendeazy-local-test';
export const LOCAL_TEST_USER_ID = 'local-test-populated-user';
export const LOCAL_TEST_SESSION_ID_PREFIX = 'local-test-session-';
export const LOCAL_TEST_PROFILE: ClerkUserProfile = {
  fullName: 'Local Test User',
  primaryVerifiedEmail: 'local-test-user@example.invalid',
};

interface SyntheticTokenPayload {
  readonly environment: typeof LOCAL_TEST_ENVIRONMENT;
  readonly sub: typeof LOCAL_TEST_USER_ID;
  readonly sid: string;
  readonly iat: number;
  readonly exp: number;
}

export interface SyntheticSessionTokenInput {
  readonly sessionId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export function createSyntheticSessionToken(
  secret: string,
  input: SyntheticSessionTokenInput,
): string {
  const payload: SyntheticTokenPayload = {
    environment: LOCAL_TEST_ENVIRONMENT,
    sub: LOCAL_TEST_USER_ID,
    sid: input.sessionId,
    iat: input.issuedAt,
    exp: input.expiresAt,
  };
  const encodedPayload = encodeJson(payload);
  const unsignedToken = `${TOKEN_PREFIX}.${encodedPayload}`;
  const signature = createSignature(secret, unsignedToken);
  return `${unsignedToken}.${signature}`;
}

export function createSyntheticTokenVerifier(
  secret: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): ClerkTokenVerifier {
  return {
    async verify(token: string): Promise<ClerkSession> {
      const payload = readPayload(secret, token);
      const currentTime = now();

      if (
        payload.iat > currentTime + 30 ||
        payload.exp <= currentTime ||
        payload.exp > payload.iat + 60 * 60
      ) {
        throw new Error('Synthetic session token is outside its validity window');
      }

      return {
        userId: payload.sub,
        sessionId: payload.sid,
        claims: { ...payload },
      };
    },
  };
}

export function createSyntheticProfileService(): ClerkProfileService {
  return {
    async getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
      return clerkUserId === LOCAL_TEST_USER_ID ? LOCAL_TEST_PROFILE : null;
    },
  };
}

function readPayload(secret: string, token: string): SyntheticTokenPayload {
  if (!secret) {
    throw new Error('Synthetic session secret is required');
  }

  const parts = token.split('.');
  if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== TOKEN_PREFIX) {
    throw new Error('Synthetic session token has an invalid format');
  }

  const unsignedToken = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const expectedSignature = createSignature(secret, unsignedToken);
  const receivedSignature = parts[3];
  if (!receivedSignature || !hasEqualBytes(expectedSignature, receivedSignature)) {
    throw new Error('Synthetic session token has an invalid signature');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeBase64Url(parts[2])) as unknown;
  } catch {
    throw new Error('Synthetic session token has an invalid payload');
  }

  if (!isSyntheticTokenPayload(decoded)) {
    throw new Error('Synthetic session token has an invalid payload');
  }

  return decoded;
}

function isSyntheticTokenPayload(
  value: unknown,
): value is SyntheticTokenPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  const issuedAt = payload.iat;
  const expiresAt = payload.exp;
  return (
    payload.environment === LOCAL_TEST_ENVIRONMENT &&
    payload.sub === LOCAL_TEST_USER_ID &&
    typeof payload.sid === 'string' &&
    payload.sid.startsWith(LOCAL_TEST_SESSION_ID_PREFIX) &&
    typeof issuedAt === 'number' &&
    Number.isInteger(issuedAt) &&
    typeof expiresAt === 'number' &&
    Number.isInteger(expiresAt) &&
    expiresAt > issuedAt
  );
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function createSignature(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function hasEqualBytes(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}
