import type { Provider } from '@nestjs/common';

import { CLERK_TOKEN_VERIFIER } from './authentication/authentication';
import { CLERK_PROFILE_SERVICE } from './authentication/clerk-profile-service';
import { AppModule, createAppModule } from './app.module';
import type { AppConfig } from './config/app-config';

describe('createAppModule', () => {
  it('rejects synthetic authentication outside the test environment', () => {
    const authentication = syntheticAuthenticationProviders();

    expect(() =>
      createAppModule(
        { ...testConfig, environment: 'production' },
        { authentication },
      ),
    ).toThrow(
      'Synthetic authentication is only available in the test environment',
    );
  });

  it('accepts injected authentication providers in the dedicated test environment', () => {
    const authentication = syntheticAuthenticationProviders();

    expect(createAppModule(testConfig, { authentication }).module).toBe(
      AppModule,
    );
  });
});

function syntheticAuthenticationProviders() {
  return {
    tokenVerifier: {
      provide: CLERK_TOKEN_VERIFIER,
      useValue: { verify: jest.fn() },
    } satisfies Provider,
    profileService: {
      provide: CLERK_PROFILE_SERVICE,
      useValue: { getUserProfile: jest.fn() },
    } satisfies Provider,
  };
}

const testConfig: AppConfig = {
  environment: 'test',
  port: 3000,
  databaseUrl: undefined,
  corsOrigins: [],
  clerkJwtKey: undefined,
  clerkSecretKey: undefined,
  clerkAuthorizedParties: [],
};
