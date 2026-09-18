import { DynamicModule, Module } from '@nestjs/common';
import { StatementImportsService } from './application/statement-imports.service';
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
      providers: [StatementImportsService],
    };
  }
}
