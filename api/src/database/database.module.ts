import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadAppConfig } from '../config/app-config';
import { createTypeOrmOptions } from './database-options';
import { TypeOrmUnitOfWork, UNIT_OF_WORK } from './unit-of-work';

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
      providers: databaseIsConfigured
        ? [
            TypeOrmUnitOfWork,
            { provide: UNIT_OF_WORK, useExisting: TypeOrmUnitOfWork },
          ]
        : [],
      exports: databaseIsConfigured ? [UNIT_OF_WORK] : [],
    };
  }
}
