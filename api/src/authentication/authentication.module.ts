import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config';
import type { AppConfig } from '../config/app-config';
import { CLERK_TOKEN_VERIFIER } from './authentication';
import { ClerkAuthenticationGuard } from './clerk-authentication.guard';
import {
  CLERK_PROFILE_SERVICE,
  OfficialClerkProfileService,
} from './clerk-profile-service';
import { OfficialClerkTokenVerifier } from './clerk-token-verifier';

@Global()
@Module({})
export class AuthenticationModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AuthenticationModule,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        OfficialClerkTokenVerifier,
        {
          provide: CLERK_TOKEN_VERIFIER,
          useExisting: OfficialClerkTokenVerifier,
        },
        OfficialClerkProfileService,
        {
          provide: CLERK_PROFILE_SERVICE,
          useExisting: OfficialClerkProfileService,
        },
        ClerkAuthenticationGuard,
      ],
      exports: [
        APP_CONFIG,
        CLERK_TOKEN_VERIFIER,
        CLERK_PROFILE_SERVICE,
        ClerkAuthenticationGuard,
      ],
    };
  }
}
