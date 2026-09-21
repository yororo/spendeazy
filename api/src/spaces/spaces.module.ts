import { DynamicModule, Module } from '@nestjs/common';
import { SpaceAccessService } from './application/space-access.service';
import {
  PERSONAL_SPACE_PROVISIONER,
  SPACE_STORE,
} from './application/space-store';
import { SpaceNotFoundError } from './application/space-errors';
import { TypeOrmSpaceStore } from './infrastructure/typeorm-space-store';
import { SpacesController } from './presentation/spaces.controller';

const controllers = [SpacesController];

@Module({})
export class SpacesModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    const shouldIncludeControllers =
      databaseIsConfigured || options.includeControllers === true;

    if (!databaseIsConfigured) {
      return {
        module: SpacesModule,
        ...(shouldIncludeControllers ? { controllers } : {}),
        providers: [
          {
            provide: SpaceAccessService,
            useValue: unconfiguredSpaceAccessService,
          },
          {
            provide: PERSONAL_SPACE_PROVISIONER,
            useValue: unconfiguredPersonalSpaceProvisioner,
          },
        ],
        exports: [PERSONAL_SPACE_PROVISIONER, SpaceAccessService],
      };
    }

    return {
      module: SpacesModule,
      ...(shouldIncludeControllers ? { controllers } : {}),
      providers: [
        TypeOrmSpaceStore,
        { provide: SPACE_STORE, useExisting: TypeOrmSpaceStore },
        {
          provide: PERSONAL_SPACE_PROVISIONER,
          useExisting: TypeOrmSpaceStore,
        },
        SpaceAccessService,
      ],
      exports: [PERSONAL_SPACE_PROVISIONER, SpaceAccessService, SPACE_STORE],
    };
  }
}

const unconfiguredPersonalSpaceProvisioner = {
  ensurePersonalSpace: (): Promise<never> =>
    Promise.reject(new SpaceNotFoundError()),
};

const unconfiguredSpaceAccessService = {
  listAccessibleSpaces: (): Promise<never[]> => Promise.resolve([]),
  listActiveAccessibleSpaces: (): Promise<never[]> => Promise.resolve([]),
  requirePersonalSpace: (): Promise<never> =>
    Promise.reject(new SpaceNotFoundError()),
  requirePersonalWriteSpace: (): Promise<never> =>
    Promise.reject(new SpaceNotFoundError()),
  requireReadAccess: (): Promise<never> =>
    Promise.reject(new SpaceNotFoundError()),
  requireWriteAccess: (): Promise<never> =>
    Promise.reject(new SpaceNotFoundError()),
};
