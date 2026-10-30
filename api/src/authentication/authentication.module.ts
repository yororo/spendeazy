import { DynamicModule, Global, Module, type Provider } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config';
import type { AppConfig } from '../config/app-config';
import { CLERK_TOKEN_VERIFIER } from './authentication';
import { ClerkAuthenticationGuard } from './clerk-authentication.guard';
import {
  CLERK_PROFILE_SERVICE,
  OfficialClerkProfileService,
} from './clerk-profile-service';
import { OfficialClerkTokenVerifier } from './clerk-token-verifier';
import { ClerkIdentityDeletionProvider } from './clerk-identity-deletion-provider';
import { IDENTITY_DELETION_PROVIDER } from '../users/application/identity-deletion-provider';

export interface AuthenticationModuleOptions {
  readonly tokenVerifier?: Provider;
  readonly profileService?: Provider;
}

@Global()
@Module({})
export class AuthenticationModule {
  static register(
    config: AppConfig,
    options: AuthenticationModuleOptions = {},
  ): DynamicModule {
    const tokenVerifierProviders = options.tokenVerifier
      ? [options.tokenVerifier]
      : [
          OfficialClerkTokenVerifier,
          {
            provide: CLERK_TOKEN_VERIFIER,
            useExisting: OfficialClerkTokenVerifier,
          },
        ];
    const profileServiceProviders = options.profileService
      ? [options.profileService]
      : [
          OfficialClerkProfileService,
          {
            provide: CLERK_PROFILE_SERVICE,
            useExisting: OfficialClerkProfileService,
          },
        ];

    return {
      module: AuthenticationModule,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        ...tokenVerifierProviders,
        ...profileServiceProviders,
        ClerkIdentityDeletionProvider,
        {
          provide: IDENTITY_DELETION_PROVIDER,
          useExisting: ClerkIdentityDeletionProvider,
        },
        ClerkAuthenticationGuard,
      ],
      exports: [
        APP_CONFIG,
        CLERK_TOKEN_VERIFIER,
        CLERK_PROFILE_SERVICE,
        IDENTITY_DELETION_PROVIDER,
        ClerkAuthenticationGuard,
      ],
    };
  }
}
