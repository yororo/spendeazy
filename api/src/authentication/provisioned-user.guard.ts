import {
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { API_PREFIX } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config';
import type { AppConfig } from '../config/app-config';
import { USER_STORE, type UserStore } from '../users/application/user-store';
import {
  type AuthenticatedRequest,
  requireAuthenticatedClerkUserId,
} from './authentication';
import { UnauthenticatedError } from './authentication-errors';
import { UserNotProvisionedError } from '../users/application/user-errors';
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
    @Optional()
    @Inject(APP_CONFIG)
    private readonly appConfig: AppConfig | undefined,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (
      isPublicRoute(request) ||
      isProvisioningRoute(request) ||
      (this.appConfig?.environment === 'test' &&
        isLocalTestSessionRoute(request))
    ) {
      return true;
    }

    if (!request.authenticatedSession) {
      throw new UnauthenticatedError();
    }

    if (!this.userStore) {
      throw new UserNotProvisionedError();
    }

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

export { ProvisionedUserGuard as UserProvisioningGuard };

function isProvisioningRoute(request: Request): boolean {
  return (
    request.method === 'PUT' &&
    normalizeRequestPath(request.path) === `/${API_PREFIX}/users/me`
  );
}

function isLocalTestSessionRoute(request: Request): boolean {
  const localTestSessionPath = `/${API_PREFIX}/users/me/local-test/sessions`;
  const path = normalizeRequestPath(request.path);

  return (
    request.method === 'POST' &&
    (path === localTestSessionPath ||
      path.startsWith(`${localTestSessionPath}/`))
  );
}
