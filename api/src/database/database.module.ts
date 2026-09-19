import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/app-config';
import { createTypeOrmOptions } from './database-options';

@Global()
@Module({})
export class DatabaseModule {
  static register(config: AppConfig): DynamicModule {
    const databaseIsConfigured = Boolean(config.databaseUrl);

    return {
      module: DatabaseModule,
      imports: databaseIsConfigured
        ? [TypeOrmModule.forRoot(createTypeOrmOptions(config))]
        : [],
    };
  }
}
