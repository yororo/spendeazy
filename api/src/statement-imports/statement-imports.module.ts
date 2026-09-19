import { DynamicModule, Module } from '@nestjs/common';
import { STATEMENT_IMPORT_STORE } from './application/statement-import-store';
import { StatementImportsService } from './application/statement-imports.service';
import { TypeOrmStatementImportStore } from './infrastructure/typeorm-statement-import-store';
import { StatementImportsController } from './presentation/statement-imports.controller';

const controllers = [StatementImportsController];

@Module({})
export class StatementImportsModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    if (!databaseIsConfigured) {
      if (!options.includeControllers) {
        return { module: StatementImportsModule };
      }

      return {
        module: StatementImportsModule,
        controllers,
        providers: [{ provide: StatementImportsService, useValue: {} }],
      };
    }

    return {
      module: StatementImportsModule,
      controllers,
      providers: [
        TypeOrmStatementImportStore,
        {
          provide: STATEMENT_IMPORT_STORE,
          useExisting: TypeOrmStatementImportStore,
        },
        StatementImportsService,
      ],
    };
  }
}
