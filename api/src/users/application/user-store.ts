import type { AccountDeletionOperationRecord } from './account-deletion-operation';

export const USER_STORE = Symbol('USER_STORE');
export const USER_NAME_MAX_LENGTH = 200;
export const USER_EMAIL_MAX_LENGTH = 320;

// Normal lookups return active Users only; scrubbed tombstones have no email.
export interface UserRecord {
  id: string;
  clerkUserId: string;
  name: string;
  email: string;
  photoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUser {
  clerkUserId: string;
  name: string;
  email: string;
  photoUrl?: string | null;
}

export interface UpdateUser {
  name?: string;
  email?: string;
  photoUrl?: string | null;
}

export interface UserStore {
  // Restricted protocol lookup; this record grants no normal-route authority.
  findDeletionOperationByClerkUserId(
    clerkUserId: string,
  ): Promise<AccountDeletionOperationRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findByClerkUserId(clerkUserId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: NewUser): Promise<UserRecord>;
  update(id: string, input: UpdateUser): Promise<UserRecord | null>;
}
