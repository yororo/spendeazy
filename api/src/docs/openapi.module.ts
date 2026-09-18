import { Module } from '@nestjs/common';
import { createApiFeatureModules } from '../api-feature-modules';
import { DATABASE_READINESS } from '../health/database-readiness';
import { HealthModule } from '../health/health.module';

const offlineDatabaseReadiness = {
  isReady: (): Promise<boolean> => Promise.resolve(false),
};

@Module({
  imports: [
    HealthModule.register({
      provide: DATABASE_READINESS,
      useValue: offlineDatabaseReadiness,
    }),
    ...createApiFeatureModules(false, { includeControllers: true }),
  ],
})
export class OpenApiModule {}
