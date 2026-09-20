import { Inject, Injectable } from '@nestjs/common';
import {
  SPACE_STORE,
  type AccessibleSpaceRecord,
  type SpaceStore,
} from './space-store';
import { SpaceNotFoundError, SpaceNotWritableError } from './space-errors';

@Injectable()
export class SpaceAccessService {
  constructor(@Inject(SPACE_STORE) private readonly spaceStore: SpaceStore) {}

  listAccessibleSpaces(userId: string): Promise<AccessibleSpaceRecord[]> {
    return this.spaceStore.listAccessible(userId);
  }

  async requireReadAccess(
    userId: string,
    spaceId: string,
  ): Promise<AccessibleSpaceRecord> {
    const space = await this.spaceStore.findAccessible(userId, spaceId);
    if (!space) {
      throw new SpaceNotFoundError();
    }

    return space;
  }

  async requireWriteAccess(
    userId: string,
    spaceId: string,
  ): Promise<AccessibleSpaceRecord> {
    const space = await this.requireReadAccess(userId, spaceId);
    if (space.status !== 'active' || space.accessLevel !== 'write') {
      throw new SpaceNotWritableError();
    }

    return space;
  }
}
