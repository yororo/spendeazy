import type { CategoryColor } from './category-color';

export const CATEGORY_STORE = Symbol('CATEGORY_STORE');
export const CATEGORY_NAME_MAX_LENGTH = 100;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 500;

export interface CategoryRecord {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  color?: CategoryColor | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCategory {
  spaceId: string;
  name: string;
  description: string | null;
  color?: CategoryColor | null;
}

export interface UpdateCategory {
  name?: string;
  description?: string | null;
  color?: CategoryColor;
  isActive?: boolean;
  expectedUpdatedAt?: string;
}

export interface CategoryStore {
  create(input: NewCategory): Promise<CategoryRecord>;
  findBySpaceId(spaceId: string, id: string): Promise<CategoryRecord | null>;
  findAllBySpaceId(spaceId: string): Promise<CategoryRecord[]>;
  findByNormalizedNameInSpace(
    spaceId: string,
    normalizedName: string,
  ): Promise<CategoryRecord | null>;
  updateInSpace(
    spaceId: string,
    id: string,
    input: UpdateCategory,
  ): Promise<CategoryRecord | null>;
}
