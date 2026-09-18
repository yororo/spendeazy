import { NestFactory } from '@nestjs/core';
import { configureApp } from './bootstrap';
import { loadAppConfig } from './config/app-config';
import { setupOpenApi } from './docs/openapi-document.factory';
import { OpenApiDocumentService } from './docs/openapi-document.service';
import { exceptionLogger, SafeNestLogger } from './logging/exception-logger';

export async function bootstrap(): Promise<void> {
  await import('./config/local-environment.setup.js');
  const config = loadAppConfig();
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    abortOnError: false,
    logger: new SafeNestLogger(),
  });
  const document = await app.get(OpenApiDocumentService).getDocument();
  app.useLogger(new SafeNestLogger());
  configureApp(app, config);
  setupOpenApi(app, document);
  await app.listen(config.port);
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
