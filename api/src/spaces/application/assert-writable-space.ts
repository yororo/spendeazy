import type { SpaceAccessLevel } from '../../database/entities/space-membership.entity';
import type { SpaceStatus } from '../../database/entities/space.entity';
import { SpaceNotWritableError } from './space-errors';

export function assertWritableSpace(
  status: SpaceStatus,
  accessLevel: SpaceAccessLevel,
): void {
  if (status !== 'active' || accessLevel !== 'write') {
    throw new SpaceNotWritableError();
  }
}
