import type { AccessibleSpaceRecord } from '../spaces/application/space-store';
import type { SpaceResponseDto } from './space-response.dto';

export function toSpaceResponse(
  space: AccessibleSpaceRecord,
): SpaceResponseDto {
  return {
    id: space.id,
    kind: space.kind,
    status: space.status,
    accessLevel: space.accessLevel,
    members: space.members.map((member) => ({
      id: member.id,
      name: member.name,
    })),
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
  };
}
