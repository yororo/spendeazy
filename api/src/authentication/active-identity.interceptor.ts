import {
  Inject,
  Injectable,
  Optional,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { defer, lastValueFrom } from 'rxjs';
import {
  ACTIVE_IDENTITY_EXECUTION,
  type ActiveIdentityExecution,
} from '../users/application/active-identity-execution';
import type { AuthenticatedRequest } from './authentication';

@Injectable()
export class ActiveIdentityInterceptor implements NestInterceptor {
  constructor(
    @Optional()
    @Inject(ACTIVE_IDENTITY_EXECUTION)
    private readonly execution?: ActiveIdentityExecution,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Reviewed imports own separate durable admission/execution/recovery commits.
    // Their unit of work checks and locks the active actor in each transaction.
    if (/\/statement-import-(operations|previews)(\/|$)/u.test(request.path))
      return next.handle();
    if (!this.execution || !request.authenticatedUserId) return next.handle();
    const mutation = request.method !== 'GET' && request.method !== 'HEAD';
    const membership =
      mutation &&
      (/\/invitations(?:\/|$)/u.test(request.path) ||
        /\/leave\/?$/u.test(request.path));
    return defer(() =>
      this.execution!.execute(
        request.authenticatedUserId!,
        membership ? 'membership' : mutation ? 'write' : 'read',
        () => lastValueFrom(next.handle()),
      ),
    );
  }
}
