import { StatementImportOperationsController } from './presentation/statement-import-operations.controller';
import { STATEMENT_IMPORT_DETAIL_STORE } from './application/statement-import-detail-store';
import { TypeOrmStatementImportDetailStore } from './infrastructure/typeorm-statement-import-detail-store';
import { ReviewedImportService } from './application/reviewed-import.service';
import { REVIEWED_IMPORT_UNIT_OF_WORK } from './application/reviewed-import-unit-of-work';
import { TypeOrmReviewedImportUnitOfWork } from './infrastructure/typeorm-reviewed-import-unit-of-work';
import { StatementImportPreviewsController } from './presentation/statement-import-previews.controller';
import { DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { SpacesModule } from '../spaces/spaces.module';
import { TypeOrmStatementImportConfirmationUnitOfWork } from '../database/unit-of-work';
import { STATEMENT_IMPORT_CONFIRMATION_UNIT_OF_WORK } from './application/statement-import-confirmation';
import { STATEMENT_IMPORT_STORE } from './application/statement-import-store';
import { StatementImportsService } from './application/statement-imports.service';
import { GCASH_REFERENCE_HASHER } from './application/gcash-reference-hasher';
import { NodeGCashReferenceHasher } from './infrastructure/node-gcash-reference-hasher';
import { TypeOrmStatementImportStore } from './infrastructure/typeorm-statement-import-store';
import { SpaceStatementImportsController } from './presentation/space-statement-imports.controller';

const controllers = [
  SpaceStatementImportsController,
  StatementImportPreviewsController,
  StatementImportOperationsController,
];

@Module({})
export class StatementImportsModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
    config?: AppConfig,
  ): DynamicModule {
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
          { provide: ReviewedImportService, useValue: {} },
        ],
      };
    }

    return {
      module: StatementImportsModule,
      imports: [SpacesModule.register(true, options)],
      controllers,
      providers: [
        ReviewedImportService,
        TypeOrmReviewedImportUnitOfWork,
        {
          provide: REVIEWED_IMPORT_UNIT_OF_WORK,
          useExisting: TypeOrmReviewedImportUnitOfWork,
        },
        TypeOrmStatementImportStore,
        {
          provide: STATEMENT_IMPORT_DETAIL_STORE,
          useClass: TypeOrmStatementImportDetailStore,
        },
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
