import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json, raw, urlencoded } from 'express';
import { MAX_REQUEST_BODY_SIZE } from './config/app-config';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { JsonContractGuard } from './http/json-contract.guard';
import { RequestValidationError } from './http/request-validation-error';
import { toValidationDetails } from './http/validation-details';
import { configureApiRouting } from './http/api-routing';
import { ClerkAuthenticationGuard } from './authentication/clerk-authentication.guard';
import { ProvisionedUserGuard } from './authentication/provisioned-user.guard';
import { exceptionRequestContext } from './logging/exception-logger';
import { ActiveIdentityInterceptor } from './authentication/active-identity.interceptor';
import {
  ACTIVE_IDENTITY_EXECUTION,
  type ActiveIdentityExecution,
} from './users/application/active-identity-execution';

export function configureApp(app: INestApplication): void {
  configureApiRouting(app);

  app.use(exceptionRequestContext);
  app.use(json({ limit: MAX_REQUEST_BODY_SIZE }));
  app.use(urlencoded({ extended: true, limit: MAX_REQUEST_BODY_SIZE }));
  app.use(raw({ limit: MAX_REQUEST_BODY_SIZE, type: () => true }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      exceptionFactory: (errors) =>
        new RequestValidationError(toValidationDetails(errors)),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  let identityExecution: ActiveIdentityExecution | undefined;
  try {
    identityExecution = app.get(ACTIVE_IDENTITY_EXECUTION);
  } catch {
    /* Metadata-only and unit-test compositions have no database. */
  }
  app.useGlobalInterceptors(new ActiveIdentityInterceptor(identityExecution));
  app.useGlobalGuards(
    app.get(ClerkAuthenticationGuard),
    app.get(ProvisionedUserGuard),
    new JsonContractGuard(),
  );
}
