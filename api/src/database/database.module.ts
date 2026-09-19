import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadAppConfig } from '../config/app-config';
import { createTypeOrmOptions } from './database-options';

@Global()
@Module({})
export class DatabaseModule {
  static register(): DynamicModule {
    const config = loadAppConfig();

    const databaseIsConfigured = Boolean(config.databaseUrl);

    return {
      module: DatabaseModule,
      imports: databaseIsConfigured
        ? [TypeOrmModule.forRoot(createTypeOrmOptions(config))]
        : [],
    };
  }
}
