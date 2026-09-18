import { verifyToken } from '@clerk/backend';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config';
import type { AppConfig } from '../config/app-config';
import { type ClerkSession, type ClerkTokenVerifier } from './authentication';

@Injectable()
export class OfficialClerkTokenVerifier implements ClerkTokenVerifier {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async verify(token: string): Promise<ClerkSession> {
    if (
      !this.config.clerkJwtKey ||
      this.config.clerkAuthorizedParties.length === 0
    ) {
      throw new Error('Clerk authentication is not configured');
    }

    const claims = await verifyToken(token, {
      jwtKey: this.config.clerkJwtKey,
      authorizedParties: this.config.clerkAuthorizedParties,
      headerType: 'JWT',
    });

    if (!hasUserId(claims)) {
      throw new Error('Clerk session token does not identify a user');
    }

    return {
      userId: claims.sub,
      sessionId: typeof claims.sid === 'string' ? claims.sid : null,
      claims,
    };
  }
}

function hasUserId(
  value: unknown,
): value is Record<string, unknown> & { sub: string } {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const userId = (value as Record<string, unknown>).sub;
  return typeof userId === 'string' && userId.length > 0;
}
