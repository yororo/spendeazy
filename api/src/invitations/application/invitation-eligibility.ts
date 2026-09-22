import type { SpaceRecord } from '../../spaces/application/space-store';
import { InvitationIneligibleError } from './invitation-errors';

export function assertInvitationSenderEligible(
  spaces: readonly Pick<SpaceRecord, 'kind' | 'status'>[],
): void {
  if (
    spaces.some((space) => space.kind === 'shared' && space.status === 'active')
  ) {
    throw new InvitationIneligibleError();
  }
}
