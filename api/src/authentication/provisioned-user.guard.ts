import {
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { API_PREFIX } from '../config/app-config';
import { USER_STORE, type UserStore } from '../users/application/user-store';
import {
  type AuthenticatedRequest,
  requireAuthenticatedClerkUserId,
} from './authentication';
import { UnauthenticatedError } from './authentication-errors';
import {
  UserNotProvisionedError,
  AccountDeletionError,
} from '../users/application/user-errors';
import {
  isPublicRoute,
  normalizeRequestPath,
} from '../http/public-route-paths';

@Injectable()
export class ProvisionedUserGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(USER_STORE)
    private readonly userStore: UserStore | undefined,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (isPublicRoute(request) || isDeletionProtocolRoute(request)) {
      return true;
    }

    if (!request.authenticatedSession) {
      throw new UnauthenticatedError();
    }

    if (!this.userStore) {
      throw new UserNotProvisionedError();
    }

    const operation = await this.userStore.findDeletionOperationByClerkUserId?.(
      requireAuthenticatedClerkUserId(request),
    );
    if (operation) throw new AccountDeletionError(operation.status);
    if (isProvisioningRoute(request)) return true;

    const user = await this.userStore.findByClerkUserId(
      requireAuthenticatedClerkUserId(request),
    );
    if (!user) {
      throw new UserNotProvisionedError();
    }

    request.authenticatedUserId = user.id;
    return true;
  }
}

function isDeletionProtocolRoute(request: Request): boolean {
  const path = normalizeRequestPath(request.path);
  return (
    (request.method === 'DELETE' && path === `/${API_PREFIX}/users/me`) ||
    (request.method === 'GET' && path === `/${API_PREFIX}/users/me/deletion`)
  );
}

export { ProvisionedUserGuard as UserProvisioningGuard };

function isProvisioningRoute(request: Request): boolean {
  return (
    request.method === 'PUT' &&
    normalizeRequestPath(request.path) === `/${API_PREFIX}/users/me`
  );
}
