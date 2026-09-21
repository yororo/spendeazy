import type { UserRecord } from '../../users/application/user-store';

export const INVITATION_USER_READER = Symbol('INVITATION_USER_READER');

export interface InvitationUserReader {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
}
