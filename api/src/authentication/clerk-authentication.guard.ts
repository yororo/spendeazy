import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  CLERK_TOKEN_VERIFIER,
  type AuthenticatedRequest,
  type ClerkTokenVerifier,
  isClerkSession,
} from './authentication';
import { UnauthenticatedError } from './authentication-errors';
import { isPublicRoute } from '../http/public-route-paths';

@Injectable()
export class ClerkAuthenticationGuard implements CanActivate {
  constructor(
    @Inject(CLERK_TOKEN_VERIFIER)
    private readonly tokenVerifier: ClerkTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (isPublicRoute(request)) {
      return true;
    }

    const token = extractBearerToken(request.headers.authorization);
    if (token === undefined) {
      throw new UnauthenticatedError();
    }

    try {
      const session = await this.tokenVerifier.verify(token);
      if (!isClerkSession(session)) {
        throw new Error('Clerk token verifier returned an invalid session');
      }

      request.authenticatedSession = session;
      return true;
    } catch {
      throw new UnauthenticatedError();
    }
  }
}

export function extractBearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  if (typeof authorization !== 'string') {
    return undefined;
  }

  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1];
}
