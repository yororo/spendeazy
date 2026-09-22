import { DynamicModule, Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { SpacesModule } from '../spaces/spaces.module';
import { UsersService } from './application/users.service';
import { USER_STORE } from './application/user-store';
import { TypeOrmUserStore } from './infrastructure/typeorm-user-store';
import { UsersController } from './presentation/users.controller';
import type { AppConfig } from '../config/app-config';

const controllers = [UsersController];

@Module({})
export class UsersModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
    config?: AppConfig,
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
          SpacesModule.register(false, options, config),
        ],
        controllers,
        providers: [{ provide: UsersService, useValue: {} }],
      };
    }

    return {
      module: UsersModule,
      imports: [
        CategoriesModule.register(true, options),
        SpacesModule.register(true, options, config),
      ],
      controllers,
      providers: [
        TypeOrmUserStore,
        { provide: USER_STORE, useExisting: TypeOrmUserStore },
        UsersService,
      ],
      exports: [USER_STORE],
    };
  }
}
