import { authorizedRequest, type AuthorizedRequestOptions } from '@/api/authorized-request';

export type SpaceCategory = {
  id: string;
  name: string;
  isActive: boolean;
  color: string;
};

export function createCategoriesApiClient(options: AuthorizedRequestOptions) {
  return {
    async listCategories(spaceId: string): Promise<SpaceCategory[]> {
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/categories`,
      );
      return readSpaceCategories(payload);
    },
  };
}

export function readSpaceCategories(value: unknown): SpaceCategory[] {
  if (!Array.isArray(value)) {
    throw new Error('Categories response must be a list');
  }
  return value.map(readSpaceCategory);
}

function readSpaceCategory(value: unknown): SpaceCategory {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Categories response must contain Category records');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') {
    throw new Error('Categories response must include Category identity and name');
  }
  if (typeof record.isActive !== 'boolean' || typeof record.color !== 'string') {
    throw new Error('Categories response must include Category status and color');
  }
  return {
    id: record.id,
    name: record.name,
    isActive: record.isActive,
    color: record.color,
  };
}
