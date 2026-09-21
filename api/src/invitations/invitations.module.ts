import { DynamicModule, Module } from '@nestjs/common';

import type { AppConfig } from '../config/app-config';
import { SpacesModule } from '../spaces/spaces.module';
import { UsersModule } from '../users/users.module';
import {
  INVITATION_CLOCK,
  INVITATION_DELIVERY,
  SystemInvitationClock,
} from './application/invitation-delivery';
import { INVITATION_STORE } from './application/invitation-store';
import { InvitationsService } from './application/invitations.service';
import { TypeOrmInvitationStore } from './infrastructure/typeorm-invitation-store';
import { HttpInvitationDelivery } from './infrastructure/http-invitation-delivery';
import { InvitationsController } from './presentation/invitations.controller';
import { PublicInvitationsController } from './presentation/public-invitations.controller';

const controllers = [InvitationsController, PublicInvitationsController];

@Module({})
export class InvitationsModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
    config?: AppConfig,
  ): DynamicModule {
    const shouldIncludeControllers =
      databaseIsConfigured || options.includeControllers === true;

    if (!databaseIsConfigured) {
      return {
        module: InvitationsModule,
        imports: [
          UsersModule.register(false, options),
          SpacesModule.register(false, options),
        ],
        ...(shouldIncludeControllers ? { controllers } : {}),
        providers: shouldIncludeControllers
          ? [{ provide: InvitationsService, useValue: {} }]
          : [],
      };
    }

    return {
      module: InvitationsModule,
      imports: [
        UsersModule.register(true, options),
        SpacesModule.register(true, options),
      ],
      ...(shouldIncludeControllers ? { controllers } : {}),
      providers: [
        TypeOrmInvitationStore,
        { provide: INVITATION_STORE, useExisting: TypeOrmInvitationStore },
        {
          provide: 'INVITATION_DELIVERY_CONFIG',
          useValue: {
            url: config?.invitationDeliveryUrl,
            apiKey: config?.invitationDeliveryApiKey,
          },
        },
        HttpInvitationDelivery,
        { provide: INVITATION_DELIVERY, useExisting: HttpInvitationDelivery },
        SystemInvitationClock,
        { provide: INVITATION_CLOCK, useExisting: SystemInvitationClock },
        {
          provide: 'INVITATION_WEB_BASE_URL',
          useValue: config?.invitationWebBaseUrl ?? 'http://localhost:5173',
        },
        InvitationsService,
      ],
    };
  }
}
