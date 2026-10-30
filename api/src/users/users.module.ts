import { DynamicModule, Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { SpacesModule } from '../spaces/spaces.module';
import { UsersService } from './application/users.service';
import { USER_STORE } from './application/user-store';
import { TypeOrmUserStore } from './infrastructure/typeorm-user-store';
import { UsersController } from './presentation/users.controller';
import { AccountDeletionService } from './application/account-deletion.service';
import { AccountDeletionReconciler } from './application/account-deletion-reconciler';
import { ACCOUNT_DELETION_STORE } from './application/account-deletion-store';
import { ACTIVE_IDENTITY_EXECUTION } from './application/active-identity-execution';
import { TypeOrmAccountDeletionStore } from './infrastructure/typeorm-account-deletion-store';
import { TypeOrmActiveIdentityExecution } from './infrastructure/typeorm-active-identity-execution';

const controllers = [UsersController];

@Module({})
export class UsersModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    if (!databaseIsConfigured) {
      if (!options.includeControllers) {
        return {
          module: UsersModule,
          imports: [CategoriesModule.register(false, options)],
        };
      }

      return {
        module: UsersModule,
        imports: [
          CategoriesModule.register(false, options),
          SpacesModule.register(false, options),
        ],
        controllers,
        providers: [
          { provide: UsersService, useValue: {} },
          { provide: AccountDeletionService, useValue: {} },
        ],
      };
    }

    return {
      module: UsersModule,
      imports: [
        CategoriesModule.register(true, options),
        SpacesModule.register(true, options),
      ],
      controllers,
      providers: [
        TypeOrmUserStore,
        { provide: USER_STORE, useExisting: TypeOrmUserStore },
        UsersService,
        AccountDeletionService,
        AccountDeletionReconciler,
        TypeOrmAccountDeletionStore,
        {
          provide: ACCOUNT_DELETION_STORE,
          useExisting: TypeOrmAccountDeletionStore,
        },
        TypeOrmActiveIdentityExecution,
        {
          provide: ACTIVE_IDENTITY_EXECUTION,
          useExisting: TypeOrmActiveIdentityExecution,
        },
      ],
      exports: [USER_STORE, ACTIVE_IDENTITY_EXECUTION],
    };
  }
}
