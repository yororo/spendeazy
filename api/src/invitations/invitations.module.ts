import { DynamicModule, Module } from '@nestjs/common';

import type { AppConfig } from '../config/app-config';
import { SpacesModule } from '../spaces/spaces.module';
import { INVITATION_CODE_SECURITY } from './application/invitation-code-security';
import {
  INVITATION_ATTEMPT_LIMITER,
  InMemoryInvitationAttemptLimiter,
} from './application/invitation-attempt-limiter';
import {
  INVITATION_CLOCK,
  SystemInvitationClock,
} from './application/invitation-clock';
import { INVITATION_STORE } from './application/invitation-store';
import { InvitationsService } from './application/invitations.service';
import { NodeInvitationCodeSecurity } from './infrastructure/node-invitation-code-security';
import { TypeOrmInvitationStore } from './infrastructure/typeorm-invitation-store';
import { InvitationsController } from './presentation/invitations.controller';

const controllers = [InvitationsController];

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
        imports: [SpacesModule.register(false, options, config)],
        ...(shouldIncludeControllers ? { controllers } : {}),
        providers: shouldIncludeControllers
          ? [{ provide: InvitationsService, useValue: {} }]
          : [],
      };
    }

    return {
      module: InvitationsModule,
      imports: [SpacesModule.register(true, options, config)],
      ...(shouldIncludeControllers ? { controllers } : {}),
      providers: [
        TypeOrmInvitationStore,
        { provide: INVITATION_STORE, useExisting: TypeOrmInvitationStore },
        {
          provide: INVITATION_CODE_SECURITY,
          useFactory: () =>
            new NodeInvitationCodeSecurity(config?.invitationCodeEncryptionKey),
        },
        SystemInvitationClock,
        { provide: INVITATION_CLOCK, useExisting: SystemInvitationClock },
        InMemoryInvitationAttemptLimiter,
        {
          provide: INVITATION_ATTEMPT_LIMITER,
          useExisting: InMemoryInvitationAttemptLimiter,
        },
        InvitationsService,
      ],
    };
  }
}
