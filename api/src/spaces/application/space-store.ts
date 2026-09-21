import type {
  SpaceKind,
  SpaceStatus,
} from '../../database/entities/space.entity';
import type { SpaceAccessLevel } from '../../database/entities/space-membership.entity';

export const SPACE_STORE = Symbol('SPACE_STORE');
export const PERSONAL_SPACE_PROVISIONER = Symbol('PERSONAL_SPACE_PROVISIONER');

export type { SpaceAccessLevel, SpaceKind, SpaceStatus };

export interface SpaceRecord {
  id: string;
  kind: SpaceKind;
  status: SpaceStatus;
  personalOwnerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessibleSpaceRecord extends SpaceRecord {
  userId: string;
  accessLevel: SpaceAccessLevel;
}

export interface SpaceStore {
  listAccessible(userId: string): Promise<AccessibleSpaceRecord[]>;
  findAccessible(
    userId: string,
    spaceId: string,
  ): Promise<AccessibleSpaceRecord | null>;
}

export interface PersonalSpaceProvisioner {
  ensurePersonalSpace(userId: string): Promise<string>;
}
