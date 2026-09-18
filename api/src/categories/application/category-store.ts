import type { CategoryColor } from './category-color';

export const CATEGORY_STORE = Symbol('CATEGORY_STORE');
export const CATEGORY_NAME_MAX_LENGTH = 100;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 500;

export interface CategoryRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  color?: CategoryColor | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCategory {
  userId: string;
  name: string;
  description: string | null;
  color?: CategoryColor | null;
}

export interface UpdateCategory {
  name?: string;
  description?: string | null;
  color?: CategoryColor;
  isActive?: boolean;
}

export interface CategoryStore {
  findById(userId: string, id: string): Promise<CategoryRecord | null>;
  findAll(userId: string): Promise<CategoryRecord[]>;
  findByNormalizedName(
    userId: string,
    normalizedName: string,
  ): Promise<CategoryRecord | null>;
  create(input: NewCategory): Promise<CategoryRecord>;
  update(
    userId: string,
    id: string,
    input: UpdateCategory,
  ): Promise<CategoryRecord | null>;
}
