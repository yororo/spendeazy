import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

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
export const LOCAL_TEST_SECONDARY_USER_ID = 'local-test-secondary-user';
export const LOCAL_TEST_FRESH_USER_ID_PREFIX = 'local-test-fresh-';
export const LOCAL_TEST_SESSION_ID_PREFIX = 'local-test-session-';
export const LOCAL_TEST_PROFILE: ClerkUserProfile = {
  fullName: 'Local Test User',
  primaryVerifiedEmail: 'local-test-user@example.invalid',
  verifiedEmails: ['local-test-user@example.invalid'],
};
export const LOCAL_TEST_SECONDARY_PROFILE: ClerkUserProfile = {
  fullName: 'Local Test Companion',
  primaryVerifiedEmail: 'local-test-companion@example.invalid',
  verifiedEmails: ['local-test-companion@example.invalid'],
};

export const LOCAL_TEST_SESSION_SCENARIOS = [
  'primary',
  'secondary',
  'new',
] as const;

export type LocalTestSessionScenario =
  (typeof LOCAL_TEST_SESSION_SCENARIOS)[number];

interface SyntheticTokenPayload {
  readonly environment: typeof LOCAL_TEST_ENVIRONMENT;
  readonly sub: string;
  readonly sid: string;
  readonly iat: number;
  readonly exp: number;
}

export interface SyntheticSessionTokenInput {
  readonly userId?: string;
  readonly sessionId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface SyntheticSession {
  readonly token: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly profile: ClerkUserProfile;
}

export interface SyntheticExpiredSessionPair {
  readonly expired: SyntheticSession;
  readonly refreshed: SyntheticSession;
}

export interface SyntheticSessionAuthority {
  readonly issueForScenario: (
    scenario: LocalTestSessionScenario,
  ) => SyntheticSession;
  readonly issue: (userId: string) => SyntheticSession;
  readonly issueExpired: (userId: string) => SyntheticExpiredSessionPair;
  readonly revoke: (sessionId: string) => void;
  readonly isRevoked: (sessionId: string) => boolean;
}

export function createSyntheticSessionToken(
  secret: string,
  input: SyntheticSessionTokenInput,
): string {
  const userId = input.userId ?? LOCAL_TEST_USER_ID;
  if (!isSupportedSyntheticUserId(userId)) {
    throw new Error('Synthetic identity is not allowed');
  }

  const payload: SyntheticTokenPayload = {
    environment: LOCAL_TEST_ENVIRONMENT,
    sub: userId,
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
  isRevoked: (sessionId: string) => boolean = () => false,
): ClerkTokenVerifier {
  return {
    verify(token: string): Promise<ClerkSession> {
      return Promise.resolve().then(() => {
        const payload = readPayload(secret, token);
        const currentTime = now();

        if (
          payload.iat > currentTime + 30 ||
          payload.exp <= currentTime ||
          payload.exp > payload.iat + 60 * 60
        ) {
          throw new Error(
            'Synthetic session token is outside its validity window',
          );
        }
        if (isRevoked(payload.sid)) {
          throw new Error('Synthetic session token has been revoked');
        }

        return {
          userId: payload.sub,
          sessionId: payload.sid,
          claims: { ...payload },
        };
      });
    },
  };
}

export function createSyntheticProfileService(): ClerkProfileService {
  return {
    getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
      return Promise.resolve(getSyntheticProfile(clerkUserId));
    },
  };
}

export function createSyntheticSessionAuthority(
  secret: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): SyntheticSessionAuthority {
  const revokedSessionIds = new Set<string>();

  const authority: SyntheticSessionAuthority = {
    issueForScenario: (scenario) => {
      switch (scenario) {
        case 'primary':
          return authority.issue(LOCAL_TEST_USER_ID);
        case 'secondary':
          return authority.issue(LOCAL_TEST_SECONDARY_USER_ID);
        case 'new':
          return authority.issue(
            `${LOCAL_TEST_FRESH_USER_ID_PREFIX}${randomId()}`,
          );
      }
    },
    issue: (userId) => {
      const profile = getSyntheticProfile(userId);
      if (!profile) {
        throw new Error('Synthetic identity is not allowed');
      }

      const issuedAt = Math.floor(now());
      const sessionId = `${LOCAL_TEST_SESSION_ID_PREFIX}${randomId()}`;
      return {
        token: createSyntheticSessionToken(secret, {
          userId,
          sessionId,
          issuedAt,
          expiresAt: issuedAt + 60 * 60,
        }),
        sessionId,
        userId,
        profile,
      };
    },
    issueExpired: (userId) => {
      const refreshed = authority.issue(userId);
      const expiredIssuedAt = Math.floor(now()) - 901;
      const expiredSessionId = `${LOCAL_TEST_SESSION_ID_PREFIX}${randomId()}`;
      const profile = getSyntheticProfile(userId);
      if (!profile) {
        throw new Error('Synthetic identity is not allowed');
      }

      return {
        refreshed,
        expired: {
          token: createSyntheticSessionToken(secret, {
            userId,
            sessionId: expiredSessionId,
            issuedAt: expiredIssuedAt,
            expiresAt: expiredIssuedAt + 900,
          }),
          sessionId: expiredSessionId,
          userId,
          profile,
        },
      };
    },
    revoke: (sessionId) => {
      revokedSessionIds.add(sessionId);
    },
    isRevoked: (sessionId) => {
      return revokedSessionIds.has(sessionId);
    },
  };

  return authority;
}

export function isSupportedSyntheticUserId(value: string): boolean {
  return (
    value === LOCAL_TEST_USER_ID ||
    value === LOCAL_TEST_SECONDARY_USER_ID ||
    new RegExp(`^${LOCAL_TEST_FRESH_USER_ID_PREFIX}[a-f0-9]{6,64}$`).test(value)
  );
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
  if (
    !receivedSignature ||
    !hasEqualBytes(expectedSignature, receivedSignature)
  ) {
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

function getSyntheticProfile(clerkUserId: string): ClerkUserProfile | null {
  if (clerkUserId === LOCAL_TEST_USER_ID) return LOCAL_TEST_PROFILE;
  if (clerkUserId === LOCAL_TEST_SECONDARY_USER_ID) {
    return LOCAL_TEST_SECONDARY_PROFILE;
  }
  if (!isSupportedSyntheticUserId(clerkUserId)) return null;

  const suffix = clerkUserId.slice(LOCAL_TEST_FRESH_USER_ID_PREFIX.length);
  return {
    fullName: `Fresh Local User ${suffix}`,
    primaryVerifiedEmail: `${clerkUserId}@example.invalid`,
    verifiedEmails: [`${clerkUserId}@example.invalid`],
  };
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
    typeof payload.sub === 'string' &&
    isSupportedSyntheticUserId(payload.sub) &&
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

function randomId(): string {
  return randomUUID().replaceAll('-', '');
}
