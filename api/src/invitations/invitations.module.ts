import { DynamicModule, Module } from '@nestjs/common';

import { SpacesModule } from '../spaces/spaces.module';
import { UsersModule } from '../users/users.module';
import {
  INVITATION_CLOCK,
  INVITATION_DELIVERY,
  SystemInvitationClock,
  HttpInvitationDelivery,
} from './application/invitation-delivery';
import { INVITATION_STORE } from './application/invitation-store';
import { InvitationsService } from './application/invitations.service';
import { TypeOrmInvitationStore } from './infrastructure/typeorm-invitation-store';
import { InvitationsController } from './presentation/invitations.controller';
import { PublicInvitationsController } from './presentation/public-invitations.controller';

const controllers = [InvitationsController, PublicInvitationsController];

@Module({})
export class InvitationsModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
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
          useFactory: () => ({
            url: readOptionalUrl(process.env.INVITATION_DELIVERY_URL),
            apiKey:
              process.env.INVITATION_DELIVERY_API_KEY?.trim() || undefined,
          }),
        },
        HttpInvitationDelivery,
        { provide: INVITATION_DELIVERY, useExisting: HttpInvitationDelivery },
        SystemInvitationClock,
        { provide: INVITATION_CLOCK, useExisting: SystemInvitationClock },
        {
          provide: 'INVITATION_WEB_BASE_URL',
          useFactory: () =>
            readOptionalUrl(process.env.INVITATION_WEB_BASE_URL) ??
            'http://localhost:5173',
        },
        InvitationsService,
      ],
    };
  }
}

function readOptionalUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return url.toString().replace(/\/$/u, '');
  } catch {
    return undefined;
  }
}
