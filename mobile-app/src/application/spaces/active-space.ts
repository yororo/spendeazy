export type SpaceKind = 'personal' | 'shared';
export type SpaceStatus = 'active' | 'archived';
export type SpaceAccessLevel = 'read' | 'write';

export type SpaceMember = {
  id: string;
  name: string;
};

export type AccessibleSpace = {
  id: string;
  kind: SpaceKind;
  status: SpaceStatus;
  accessLevel: SpaceAccessLevel;
  members: SpaceMember[];
};

const POSITIVE_ID = /^[1-9]\d*$/;

export function selectActiveSpace(
  spaces: AccessibleSpace[],
  rememberedSpaceId: string | null,
): AccessibleSpace | null {
  const remembered = rememberedSpaceId
    ? spaces.find((space) => space.id === rememberedSpaceId)
    : undefined;
  if (remembered) return remembered;
  return spaces.find((space) => space.kind === 'personal') ?? null;
}

export function spaceIdentityLabel(space: AccessibleSpace): string {
  if (space.kind === 'personal') return 'Personal';
  const names = space.members.map((member) => member.name).join(', ');
  const prefix = space.status === 'archived' ? 'Archived Shared' : 'Shared';
  return names ? `${prefix} · ${names}` : prefix;
}

export function rememberedSpaceStorageKey(userId: string): string {
  return `active-space:${userId}`;
}

export function parseAccessibleSpaces(value: unknown): AccessibleSpace[] {
  if (!Array.isArray(value)) {
    throw new Error('Spaces response must be an array');
  }
  return value.map(parseAccessibleSpace);
}

function parseAccessibleSpace(value: unknown): AccessibleSpace {
  if (!isRecord(value)) {
    throw new Error('Spaces response must contain Space objects');
  }
  const id = requiredId(value.id, 'Space id');
  const kind = requiredEnum(value.kind, ['personal', 'shared'] as const, 'Space kind');
  const status = requiredEnum(
    value.status,
    ['active', 'archived'] as const,
    'Space status',
  );
  const accessLevel = requiredEnum(
    value.accessLevel,
    ['read', 'write'] as const,
    'Space access',
  );
  if (!Array.isArray(value.members) || value.members.length === 0) {
    throw new Error('Spaces response must include members');
  }
  return {
    id,
    kind,
    status,
    accessLevel,
    members: value.members.map(parseMember),
  };
}

function parseMember(value: unknown): SpaceMember {
  if (!isRecord(value)) {
    throw new Error('Spaces response must include members');
  }
  const name = value.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Spaces response must include member names');
  }
  return { id: requiredId(value.id, 'Member id'), name };
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !POSITIVE_ID.test(value)) {
    throw new Error(`${label} must be a positive decimal string`);
  }
  return value;
}

function requiredEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T;
  }
  throw new Error(`${label} is not recognized`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
