import { NestFactory } from '@nestjs/core';
import { Module, type DynamicModule, type Provider } from '@nestjs/common';

import { CLERK_TOKEN_VERIFIER } from '../src/authentication/authentication';
import { CLERK_PROFILE_SERVICE } from '../src/authentication/clerk-profile-service';
import { configureApp } from '../src/bootstrap';
import { createAppModule } from '../src/app.module';
import { setupOpenApi } from '../src/docs/openapi-document.factory';
import { OpenApiDocumentService } from '../src/docs/openapi-document.service';
import {
  exceptionLogger,
  SafeNestLogger,
} from '../src/logging/exception-logger';
import {
  createSyntheticSessionAuthority,
  createSyntheticProfileService,
  createSyntheticTokenVerifier,
} from './synthetic-authentication';
import { validateLocalTestDatabaseTarget } from './database-target';
import { createLocalTestClock } from './clock';
import { loadLocalTestAppConfig } from './app-config';
import { LocalTestSessionModule } from './session-control';

@Module({})
class LocalTestApplicationModule {}

async function bootstrap(): Promise<void> {
  validateLocalTestDatabaseTarget();

  const secret = process.env.SPENDEAZY_TEST_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error('The local test session secret is required');
  }

  const config = loadLocalTestAppConfig();
  if (config.environment !== 'test') {
    throw new Error('The local test API requires NODE_ENV=test');
  }

  const clock = createLocalTestClock();
  const sessionAuthority = createSyntheticSessionAuthority(secret, clock.now);
  const appModule: DynamicModule = {
    module: LocalTestApplicationModule,
    imports: [
      createAppModule(config, {
        authentication: {
          tokenVerifier: {
            provide: CLERK_TOKEN_VERIFIER,
            useValue: createSyntheticTokenVerifier(
              secret,
              clock.now,
              sessionAuthority.isRevoked,
            ),
          } satisfies Provider,
          profileService: {
            provide: CLERK_PROFILE_SERVICE,
            useValue: createSyntheticProfileService(),
          } satisfies Provider,
        },
      }),
      LocalTestSessionModule.register(sessionAuthority),
    ],
  };
  const app = await NestFactory.create(appModule, {
    bodyParser: false,
    abortOnError: false,
    logger: new SafeNestLogger(),
  });
  const document = await app.get(OpenApiDocumentService).getDocument();
  app.useLogger(new SafeNestLogger());
  configureApp(app, config);
  setupOpenApi(app, document);
  await app.listen(config.port, '127.0.0.1');
  console.log(`Local test API listening on http://127.0.0.1:${config.port}`);
}

if (require.main === module) {
  process.on('uncaughtException', (error: Error) => {
    exceptionLogger.report('uncaught_exception', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (error: unknown) => {
    exceptionLogger.report('unhandled_rejection', error);
    process.exit(1);
  });
  bootstrap().catch((error: unknown) => {
    exceptionLogger.report('startup_failed', error);
    process.exit(1);
  });
}
