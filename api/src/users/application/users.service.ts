import { Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { ClerkProfileUnavailableError } from '../../authentication/authentication-errors';
import {
  DEFAULT_CATEGORY_PROVISIONER,
  type DefaultCategoryProvisioner,
} from '../../categories/application/default-categories.service';
import {
  PERSONAL_SPACE_PROVISIONER,
  type PersonalSpaceProvisioner,
} from '../../spaces/application/space-store';
import type {
  ClerkProfileService,
  ClerkUserProfile,
} from '../../authentication/clerk-profile-service';
import { CLERK_PROFILE_SERVICE } from '../../authentication/clerk-profile-service';
import {
  UserEmailConflictError,
  UserNotFoundError,
  UserProfileEmailRequiredError,
  UserProfileInvalidError,
} from './user-errors';
import {
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_STORE,
  type NewUser,
  type UpdateUser,
  type UserRecord,
  type UserStore,
} from './user-store';

export interface UserProvisioningResult {
  user: UserRecord;
  created: boolean;
}

const DEFAULT_USER_NAME = 'Spendeazy User';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_STORE) private readonly userStore: UserStore,
    @Inject(CLERK_PROFILE_SERVICE)
    private readonly clerkProfileService: ClerkProfileService,
    @Inject(DEFAULT_CATEGORY_PROVISIONER)
    private readonly defaultCategoryProvisioner: DefaultCategoryProvisioner,
    @Inject(PERSONAL_SPACE_PROVISIONER)
    private readonly personalSpaceProvisioner: PersonalSpaceProvisioner = {
      ensurePersonalSpace: () => Promise.resolve(),
    },
  ) {}

  async provisionUser(clerkUserId: string): Promise<UserProvisioningResult> {
    const profile = await this.fetchProfile(clerkUserId);
    if (!profile) {
      throw new UserNotFoundError();
    }

    const input = toProvisionedUserInput(clerkUserId, profile);
    const currentUser = await this.userStore.findByClerkUserId(clerkUserId);
    if (!currentUser) {
      await this.ensureEmailAvailable(input.email);
      return this.createProvisionedUser(input);
    }

    if (input.email !== currentUser.email) {
      await this.ensureEmailAvailable(input.email, currentUser.id);
    }

    const changes: UpdateUser = {
      name: input.name,
      email: input.email,
    };
    if (isNoOp(currentUser, changes)) {
      await this.personalSpaceProvisioner.ensurePersonalSpace(currentUser.id);
      return { user: currentUser, created: false };
    }

    const updatedUser = await this.userStore.update(currentUser.id, changes);
    if (!updatedUser) {
      throw new UserNotFoundError();
    }

    await this.personalSpaceProvisioner.ensurePersonalSpace(updatedUser.id);
    return { user: updatedUser, created: false };
  }

  async getUserById(id: string): Promise<UserRecord> {
    const user = await this.userStore.findById(id);
    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  private async fetchProfile(clerkUserId: string) {
    try {
      return await this.clerkProfileService.getUserProfile(clerkUserId);
    } catch {
      throw new ClerkProfileUnavailableError();
    }
  }

  private async ensureEmailAvailable(
    email: string,
    currentUserId?: string,
  ): Promise<void> {
    const existingUser = await this.userStore.findByEmail(email);
    if (existingUser && existingUser.id !== currentUserId) {
      throw new UserEmailConflictError();
    }
  }

  private async createProvisionedUser(
    input: NewUser,
  ): Promise<UserProvisioningResult> {
    let user: UserRecord;
    try {
      user = await this.userStore.create(input);
    } catch (error: unknown) {
      if (!(error instanceof UserEmailConflictError)) {
        throw error;
      }

      const racedUser = await this.userStore.findByClerkUserId(
        input.clerkUserId,
      );
      if (!racedUser) {
        throw error;
      }

      await this.personalSpaceProvisioner.ensurePersonalSpace(racedUser.id);
      return { user: racedUser, created: false };
    }

    await this.personalSpaceProvisioner.ensurePersonalSpace(user.id);
    await this.defaultCategoryProvisioner.createForNewUser(user.id);
    return { user, created: true };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeName(name: string): string {
  return name.trim();
}

function isNoOp(
  currentUser: { name: string; email: string },
  changes: UpdateUser,
): boolean {
  return (
    (changes.name === undefined || changes.name === currentUser.name) &&
    (changes.email === undefined || changes.email === currentUser.email)
  );
}

function toProvisionedUserInput(
  clerkUserId: string,
  profile: ClerkUserProfile,
): NewUser {
  const email = profile.primaryVerifiedEmail
    ? normalizeEmail(profile.primaryVerifiedEmail)
    : '';
  if (!email || email.length > USER_EMAIL_MAX_LENGTH || !isEmail(email)) {
    throw new UserProfileEmailRequiredError();
  }

  const name = normalizeName(profile.fullName ?? '') || DEFAULT_USER_NAME;
  if (name.length > USER_NAME_MAX_LENGTH) {
    throw new UserProfileInvalidError();
  }

  return { clerkUserId, name, email };
}
