import { Module } from '@nestjs/common';
import { AuthenticationModule } from './authentication/authentication.module';
import { ProvisionedUserGuard } from './authentication/provisioned-user.guard';
import { loadAppConfig } from './config/app-config';
import { DATABASE_READINESS } from './health/database-readiness';
import { HealthModule } from './health/health.module';
import { PostgresDatabaseReadiness } from './health/postgres-database-readiness';
import { DatabaseModule } from './database/database.module';
import { DocsController } from './docs/docs.controller';
import { OpenApiDocumentService } from './docs/openapi-document.service';
import { createApiFeatureModules } from './api-feature-modules';

const appConfig = loadAppConfig();

@Module({
  imports: [
    AuthenticationModule.register(appConfig),
    DatabaseModule.register(),
    HealthModule.register({
      provide: DATABASE_READINESS,
      useClass: PostgresDatabaseReadiness,
    }),
    ...createApiFeatureModules(Boolean(appConfig.databaseUrl)),
  ],
  controllers: [DocsController],
  providers: [ProvisionedUserGuard, OpenApiDocumentService],
})
export class AppModule {}
