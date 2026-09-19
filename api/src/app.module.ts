import { Module, type DynamicModule } from '@nestjs/common';
import { AuthenticationModule } from './authentication/authentication.module';
import type { AuthenticationModuleOptions } from './authentication/authentication.module';
import { ProvisionedUserGuard } from './authentication/provisioned-user.guard';
import type { AppConfig } from './config/app-config';
import { DATABASE_READINESS } from './health/database-readiness';
import { HealthModule } from './health/health.module';
import { PostgresDatabaseReadiness } from './health/postgres-database-readiness';
import { DatabaseModule } from './database/database.module';
import { DocsController } from './docs/docs.controller';
import { OpenApiDocumentService } from './docs/openapi-document.service';
import { createApiFeatureModules } from './api-feature-modules';

@Module({})
export class AppModule {}

export interface AppModuleOptions {
  readonly authentication?: AuthenticationModuleOptions;
}

export function createAppModule(
  config: AppConfig,
  options: AppModuleOptions = {},
): DynamicModule {
  if (options.authentication && config.environment !== 'test') {
    throw new Error(
      'Synthetic authentication is only available in the test environment',
    );
  }

  return {
    module: AppModule,
    imports: [
      AuthenticationModule.register(config, options.authentication),
      DatabaseModule.register(config),
      HealthModule.register({
        provide: DATABASE_READINESS,
        useClass: PostgresDatabaseReadiness,
      }),
      ...createApiFeatureModules(Boolean(config.databaseUrl)),
    ],
    controllers: [DocsController],
    providers: [ProvisionedUserGuard, OpenApiDocumentService],
  };
}
