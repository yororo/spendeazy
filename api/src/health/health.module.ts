import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({})
export class HealthModule {
  static register(databaseReadinessProvider: Provider): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [databaseReadinessProvider],
    };
  }
}
