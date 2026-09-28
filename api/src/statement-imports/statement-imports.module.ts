import { DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { SpacesModule } from '../spaces/spaces.module';
import { TypeOrmStatementImportConfirmationUnitOfWork } from '../database/unit-of-work';
import { STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK } from './application/statement-import-confirmation';
import { STATEMENT_IMPORT_STORE } from './application/statement-import-store';
import { StatementImportsService } from './application/statement-imports.service';
import {
  STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE,
  STATEMENT_CATEGORY_SUGGESTION_EVALUATOR,
  type CategorySuggestionEvaluator,
} from './application/statement-category-suggestions';
import { StatementCategorySuggestionsService } from './application/statement-category-suggestions.service';
import { GCASH_REFERENCE_HASHER } from './application/gcash-reference-hasher';
import { NodeGCashReferenceHasher } from './infrastructure/node-gcash-reference-hasher';
import { TypeOrmStatementCategorySuggestionCatalog } from './infrastructure/typeorm-statement-category-suggestion-catalog';
import { TypeSafeCategorySuggestionEvaluator } from './infrastructure/typesafe-category-suggestion-evaluator';
import { TypeOrmStatementImportStore } from './infrastructure/typeorm-statement-import-store';
import { StatementImportsController } from './presentation/statement-imports.controller';
import { SpaceStatementImportsController } from './presentation/space-statement-imports.controller';

const controllers = [
  StatementImportsController,
  SpaceStatementImportsController,
];

@Module({})
export class StatementImportsModule {
  static register(
    databaseIsConfigured: boolean,
    options: {
      includeControllers?: boolean;
      categorySuggestionEvaluator?: CategorySuggestionEvaluator;
    } = {},
    config?: AppConfig,
  ): DynamicModule {
    if (options.categorySuggestionEvaluator && config?.environment !== 'test') {
      throw new Error(
        'Category Suggestion evaluator overrides are only available in the test environment',
      );
    }

    if (!databaseIsConfigured) {
      if (!options.includeControllers) {
        return { module: StatementImportsModule };
      }

      return {
        module: StatementImportsModule,
        imports: [SpacesModule.register(false, options)],
        controllers,
        providers: [
          { provide: StatementImportsService, useValue: {} },
          { provide: StatementCategorySuggestionsService, useValue: {} },
        ],
      };
    }

    return {
      module: StatementImportsModule,
      imports: [SpacesModule.register(true, options)],
      controllers,
      providers: [
        TypeOrmStatementImportStore,
        TypeOrmStatementCategorySuggestionCatalog,
        {
          provide: STATEMENT_CATEGORY_SUGGESTION_CATALOG_STORE,
          useExisting: TypeOrmStatementCategorySuggestionCatalog,
        },
        {
          provide: STATEMENT_CATEGORY_SUGGESTION_EVALUATOR,
          useFactory: () =>
            options.categorySuggestionEvaluator ??
            new TypeSafeCategorySuggestionEvaluator(config?.typesafeApiKey),
        },
        StatementCategorySuggestionsService,
        TypeOrmStatementImportConfirmationUnitOfWork,
        {
          provide: STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK,
          useExisting: TypeOrmStatementImportConfirmationUnitOfWork,
        },
        {
          provide: STATEMENT_IMPORT_STORE,
          useExisting: TypeOrmStatementImportStore,
        },
        {
          provide: GCASH_REFERENCE_HASHER,
          useFactory: () =>
            new NodeGCashReferenceHasher(config?.gcashReferenceHashKey),
        },
        StatementImportsService,
      ],
    };
  }
}
