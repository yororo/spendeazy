import { createClerkClient, type ClerkClient } from '@clerk/backend';

import type { AppConfig } from '../config/app-config';
import { OfficialClerkProfileService } from './clerk-profile-service';

jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(),
}));

describe('OfficialClerkProfileService', () => {
  const createClerkClientMock = jest.mocked(createClerkClient);

  beforeEach(() => {
    createClerkClientMock.mockReset();
  });

  it('returns the full name and every verified email from Clerk', async () => {
    const getUser = jest.fn().mockResolvedValue({
      fullName: 'Ada Lovelace',
      primaryEmailAddress: {
        emailAddress: 'ada@example.com',
        verification: { status: 'verified' },
      },
      emailAddresses: [
        {
          emailAddress: 'ada@example.com',
          verification: { status: 'verified' },
        },
        {
          emailAddress: 'ada.secondary@example.com',
          verification: { status: 'verified' },
        },
        {
          emailAddress: 'ada.unverified@example.com',
          verification: { status: 'unverified' },
        },
      ],
    });
    createClerkClientMock.mockReturnValue({
      users: { getUser },
    } as unknown as ClerkClient);
    const service = new OfficialClerkProfileService(testConfig());

    await expect(service.getUserProfile('user_42')).resolves.toEqual({
      fullName: 'Ada Lovelace',
      primaryVerifiedEmail: 'ada@example.com',
      verifiedEmails: ['ada@example.com', 'ada.secondary@example.com'],
    });
    expect(createClerkClientMock).toHaveBeenCalledWith({
      secretKey: 'sk_test_secret',
    });
    expect(getUser).toHaveBeenCalledWith('user_42');
  });

  it('does not treat an unverified primary email as suitable', async () => {
    createClerkClientMock.mockReturnValue({
      users: {
        getUser: jest.fn().mockResolvedValue({
          fullName: null,
          primaryEmailAddress: {
            emailAddress: 'ada@example.com',
            verification: { status: 'unverified' },
          },
          emailAddresses: [
            {
              emailAddress: 'ada@example.com',
              verification: { status: 'unverified' },
            },
          ],
        }),
      },
    } as unknown as ClerkClient);
    const service = new OfficialClerkProfileService(testConfig());

    await expect(service.getUserProfile('user_42')).resolves.toEqual({
      fullName: null,
      primaryVerifiedEmail: null,
      verifiedEmails: [],
    });
  });

  it('returns null for a missing Clerk profile and hides provider details otherwise', async () => {
    const getUser = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('not found'), { status: 404 }),
      )
      .mockRejectedValueOnce(new Error('secret provider response'));
    createClerkClientMock.mockReturnValue({
      users: { getUser },
    } as unknown as ClerkClient);
    const service = new OfficialClerkProfileService(testConfig());

    await expect(service.getUserProfile('missing')).resolves.toBeNull();
    await expect(service.getUserProfile('unavailable')).rejects.toThrow(
      'Clerk profile service request failed',
    );
  });
});

function testConfig(): AppConfig {
  return {
    environment: 'test',
    port: 3000,
    databaseUrl: undefined,
    corsOrigins: [],
    clerkJwtKey: 'test-jwt-key',
    clerkSecretKey: 'sk_test_secret',
    clerkAuthorizedParties: [],
  };
}
