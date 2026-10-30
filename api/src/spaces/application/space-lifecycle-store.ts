import type { SpaceMemberRecord } from './space-store';

export const SPACE_LIFECYCLE_STORE = Symbol('SPACE_LIFECYCLE_STORE');

export interface ArchivedSpaceRecord {
  spaceId: string;
  actorUserId: string;
  members: readonly SpaceMemberRecord[];
  archivedAt: Date;
}

export interface SpaceLifecycleStore {
  archiveSharedSpace(
    userId: string,
    spaceId: string,
    archivedAt: Date,
  ): Promise<ArchivedSpaceRecord>;
}
