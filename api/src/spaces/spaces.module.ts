import { DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { SpaceAccessService } from './application/space-access.service';
import {
  SPACE_LIFECYCLE,
  SpaceLifecycleService,
} from './application/space-lifecycle.service';
import { SpaceNotificationsService } from './application/space-notifications.service';
import {
  PERSONAL_SPACE_PROVISIONER,
  SPACE_STORE,
} from './application/space-store';
import { SPACE_LIFECYCLE_STORE } from './application/space-lifecycle-store';
import { SPACE_NOTIFICATION_DELIVERY } from './application/space-notification-delivery';
import { SPACE_NOTIFICATION_STORE } from './application/space-notification';
import { SpaceNotFoundError } from './application/space-errors';
import { TypeOrmSpaceStore } from './infrastructure/typeorm-space-store';
import { TypeOrmSpaceLifecycleStore } from './infrastructure/typeorm-space-lifecycle-store';
import { TypeOrmSpaceNotificationStore } from './infrastructure/typeorm-space-notification-store';
import { HttpSpaceNotificationDelivery } from './infrastructure/http-space-notification-delivery';
import { SpacesController } from './presentation/spaces.controller';
import { SpaceNotificationsController } from './presentation/space-notifications.controller';

const controllers = [SpacesController, SpaceNotificationsController];

@Module({})
export class SpacesModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
    config?: AppConfig,
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
          {
            provide: SpaceLifecycleService,
            useValue: unconfiguredSpaceLifecycleService,
          },
          {
            provide: SPACE_LIFECYCLE,
            useExisting: SpaceLifecycleService,
          },
          {
            provide: SpaceNotificationsService,
            useValue: unconfiguredSpaceNotificationsService,
          },
        ],
        exports: [
          PERSONAL_SPACE_PROVISIONER,
          SpaceAccessService,
          SPACE_LIFECYCLE,
          SpaceLifecycleService,
        ],
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
        TypeOrmSpaceLifecycleStore,
        {
          provide: SPACE_LIFECYCLE_STORE,
          useExisting: TypeOrmSpaceLifecycleStore,
        },
        TypeOrmSpaceNotificationStore,
        {
          provide: SPACE_NOTIFICATION_STORE,
          useExisting: TypeOrmSpaceNotificationStore,
        },
        {
          provide: 'SPACE_NOTIFICATION_DELIVERY_CONFIG',
          useValue: {
            url: config?.spaceNotificationDeliveryUrl,
            apiKey: config?.spaceNotificationDeliveryApiKey,
          },
        },
        HttpSpaceNotificationDelivery,
        {
          provide: SPACE_NOTIFICATION_DELIVERY,
          useExisting: HttpSpaceNotificationDelivery,
        },
        SpaceNotificationsService,
        SpaceLifecycleService,
        { provide: SPACE_LIFECYCLE, useExisting: SpaceLifecycleService },
      ],
      exports: [
        PERSONAL_SPACE_PROVISIONER,
        SpaceAccessService,
        SPACE_STORE,
        SPACE_LIFECYCLE,
        SpaceLifecycleService,
      ],
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

const unconfiguredSpaceLifecycleService = {
  leaveSharedSpace: (): Promise<never> =>
    Promise.reject(new SpaceNotFoundError()),
  deleteIdentity: (): Promise<never> =>
    Promise.reject(new SpaceNotFoundError()),
};

const unconfiguredSpaceNotificationsService = {
  listForUser: (): Promise<never[]> => Promise.resolve([]),
  retryForUser: (): Promise<never> => Promise.reject(new SpaceNotFoundError()),
  markRead: (): Promise<never> => Promise.reject(new SpaceNotFoundError()),
  notifySharedSpaceArchived: (): Promise<never> =>
    Promise.resolve(undefined as never),
};
