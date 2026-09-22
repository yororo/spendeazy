import type { SpaceMemberRecord } from './space-store';

export const SPACE_LIFECYCLE_STORE = Symbol('SPACE_LIFECYCLE_STORE');

export interface SpaceArchiveMemberRecord extends SpaceMemberRecord {
  email: string;
}

export interface ArchivedSpaceRecord {
  spaceId: string;
  actorUserId: string;
  members: readonly SpaceArchiveMemberRecord[];
  archivedAt: Date;
}

export interface IdentityDeletionResult {
  deletedUserId: string;
  archivedSpaces: readonly ArchivedSpaceRecord[];
}

export interface SpaceLifecycleStore {
  archiveSharedSpace(
    userId: string,
    spaceId: string,
    archivedAt: Date,
  ): Promise<ArchivedSpaceRecord>;
  deleteIdentity(
    userId: string,
    deletedAt: Date,
  ): Promise<IdentityDeletionResult>;
}
