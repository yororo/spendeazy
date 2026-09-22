import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { isClerkAPIResponseError } from '@clerk/backend/errors';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config';
import type { AppConfig } from '../config/app-config';

export const CLERK_PROFILE_SERVICE = Symbol('CLERK_PROFILE_SERVICE');

export interface ClerkUserProfile {
  fullName: string | null;
  primaryVerifiedEmail: string | null;
  /** All verified addresses currently attached to the identity. */
  verifiedEmails?: readonly string[];
}

export interface ClerkProfileService {
  getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null>;
}

@Injectable()
export class OfficialClerkProfileService implements ClerkProfileService {
  private readonly clerkClient: ClerkClient | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.clerkClient = config.clerkSecretKey
      ? createClerkClient({ secretKey: config.clerkSecretKey })
      : null;
  }

  async getUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
    if (!this.clerkClient) {
      throw new Error('Clerk profile service is not configured');
    }

    try {
      const user = await this.clerkClient.users.getUser(clerkUserId);
      const primaryEmail = user.primaryEmailAddress;
      const verifiedEmails = Array.isArray(user.emailAddresses)
        ? user.emailAddresses.flatMap((emailAddress) =>
            emailAddress.verification?.status === 'verified'
              ? [emailAddress.emailAddress]
              : [],
          )
        : [];
      const primaryVerifiedEmail =
        primaryEmail?.verification?.status === 'verified'
          ? primaryEmail.emailAddress
          : null;

      if (
        primaryVerifiedEmail !== null &&
        !verifiedEmails.includes(primaryVerifiedEmail)
      ) {
        verifiedEmails.push(primaryVerifiedEmail);
      }

      return {
        fullName: user.fullName,
        primaryVerifiedEmail,
        verifiedEmails,
      };
    } catch (error: unknown) {
      if (isProfileNotFoundError(error)) {
        return null;
      }

      throw new Error('Clerk profile service request failed');
    }
  }
}

function isProfileNotFoundError(error: unknown): boolean {
  return readErrorStatus(error) === 404;
}

function readErrorStatus(error: unknown): number | undefined {
  if (isClerkAPIResponseError(error)) {
    return error.status;
  }

  return isObjectWithStatus(error) ? error.status : undefined;
}

function isObjectWithStatus(value: unknown): value is { status: number } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'status' in value &&
    typeof value.status === 'number'
  );
}
