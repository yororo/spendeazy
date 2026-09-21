import { Inject, Injectable } from '@nestjs/common';
import {
  SPACE_STORE,
  type AccessibleSpaceRecord,
  type SpaceStore,
} from './space-store';
import { SpaceNotFoundError } from './space-errors';
import { assertWritableSpace } from './assert-writable-space';

@Injectable()
export class SpaceAccessService {
  constructor(@Inject(SPACE_STORE) private readonly spaceStore: SpaceStore) {}

  listAccessibleSpaces(userId: string): Promise<AccessibleSpaceRecord[]> {
    return this.spaceStore.listAccessible(userId);
  }

  async listActiveAccessibleSpaces(
    userId: string,
  ): Promise<AccessibleSpaceRecord[]> {
    const spaces = await this.listAccessibleSpaces(userId);
    return spaces.filter((space) => space.status === 'active');
  }

  async requirePersonalSpace(userId: string): Promise<AccessibleSpaceRecord> {
    const personalSpace = (await this.listActiveAccessibleSpaces(userId)).find(
      (space) => space.kind === 'personal',
    );
    if (!personalSpace) {
      throw new SpaceNotFoundError();
    }

    return personalSpace;
  }

  async requirePersonalWriteSpace(
    userId: string,
  ): Promise<AccessibleSpaceRecord> {
    const personalSpace = await this.requirePersonalSpace(userId);
    assertWritableSpace(personalSpace.status, personalSpace.accessLevel);

    return personalSpace;
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
    assertWritableSpace(space.status, space.accessLevel);

    return space;
  }
}
