import { authorizedRequest, type AuthorizedRequestOptions } from './authorized-request.ts';
import { InvalidApiResponseError } from './request-failure.ts';

export const CATEGORY_ICON_KEYS = [
  'utensils', 'car-front', 'bus', 'heart-pulse', 'shopping-bag', 'ticket',
  'plug-zap', 'house', 'shopping-basket', 'heart-handshake', 'shield-plus',
  'baby', 'wrench', 'smartphone', 'shapes', 'plane', 'paw-print', 'book-open',
  'dumbbell', 'briefcase-business', 'gift', 'coffee', 'wallet', 'headphones',
] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export const CATEGORY_COLOR_KEYS = [
  'coral', 'scarlet', 'crimson', 'rose', 'magenta', 'orchid', 'plum', 'violet',
  'indigo', 'cobalt', 'azure', 'sky', 'cyan', 'teal', 'emerald', 'forest',
  'lime', 'olive', 'gold', 'amber', 'copper', 'cocoa', 'slate', 'steel',
] as const;
export type CategoryColorKey = (typeof CATEGORY_COLOR_KEYS)[number];

export type SpaceCategory = {
  id: string;
  name: string;
  isActive: boolean;
  iconKey: CategoryIconKey;
  colorKey: CategoryColorKey;
  revision: string;
};

export type CategoryRule = {
  id?: string;
  categoryId?: string;
  pattern: string;
  matchType: 'exact' | 'contains';
};

export type CategoryRuleCollection = {
  revision: string;
  rules: CategoryRule[];
};

export type CategoryConfigurationDraft = {
  name: string;
  iconKey: CategoryIconKey;
  colorKey: CategoryColorKey;
  isActive: boolean;
  budget: { amount: string; currency: 'PHP'; recurrence: 'monthly' | 'yearly' } | null;
  rules: CategoryRule[];
};

export type CategoryConfiguration = {
  category: SpaceCategory;
  budget: CategoryConfigurationDraft['budget'];
  rules: CategoryRule[];
  rulesRevision: string;
};

export type CategoryConfigurationSave = CategoryConfigurationDraft & {
  expectedRevision: string | null;
  expectedRulesRevision: string;
};

export function createCategoriesApiClient(options: AuthorizedRequestOptions) {
  async function getCategoryRules(spaceId: string): Promise<CategoryRuleCollection> {
    const payload = await authorizedRequest<unknown>(
      options,
      `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/category-rules`,
    );
    return readCategoryRuleCollection(payload);
  }

  return {
    async listCategories(spaceId: string): Promise<SpaceCategory[]> {
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/categories`,
      );
      return readSpaceCategories(payload);
    },
    async getCategoryConfiguration(spaceId: string, categoryId: string): Promise<CategoryConfiguration> {
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/categories/${encodeURIComponent(categoryId)}/configuration`,
      );
      return readCategoryConfiguration(payload);
    },
    async getRulesRevision(spaceId: string): Promise<string> {
      return (await getCategoryRules(spaceId)).revision;
    },
    getCategoryRules,
    async createCategoryConfiguration(spaceId: string, draft: CategoryConfigurationSave): Promise<CategoryConfiguration> {
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/categories`,
        { method: 'POST', body: draft },
      );
      return readCategoryConfiguration(payload);
    },
    async saveCategoryConfiguration(spaceId: string, categoryId: string, draft: CategoryConfigurationSave): Promise<CategoryConfiguration> {
      const payload = await authorizedRequest<unknown>(
        options,
        `/api/v1/users/me/spaces/${encodeURIComponent(spaceId)}/categories/${encodeURIComponent(categoryId)}/configuration`,
        { method: 'PUT', body: draft },
      );
      return readCategoryConfiguration(payload);
    },
  };
}

export function readSpaceCategories(value: unknown): SpaceCategory[] {
  if (!Array.isArray(value)) {
    throw new InvalidApiResponseError();
  }
  return value.map(readSpaceCategory);
}

function readSpaceCategory(value: unknown): SpaceCategory {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidApiResponseError();
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') {
    throw new InvalidApiResponseError();
  }
  if (typeof record.isActive !== 'boolean') {
    throw new InvalidApiResponseError();
  }
  const iconKey = readIconKey(record.iconKey);
  const colorKey = readColorKey(record.colorKey);
  const revision = readRevision(record.revision);
  return {
    id: record.id,
    name: record.name,
    isActive: record.isActive,
    iconKey,
    colorKey,
    revision,
  };
}

function readCategoryConfiguration(value: unknown): CategoryConfiguration {
  const record = readObject(value);
  const category = readSpaceCategory(record.category);
  const budget = record.budget === null ? null : readBudget(record.budget);
  if (!Array.isArray(record.rules)) throw new InvalidApiResponseError();
  const rules = record.rules.map(readRule);
  return {
    category,
    budget,
    rules,
    rulesRevision: readRevision(record.rulesRevision, true),
  };
}

function readCategoryRuleCollection(value: unknown): CategoryRuleCollection {
  const record = readObject(value);
  if (!Array.isArray(record.rules)) throw new InvalidApiResponseError();
  return {
    revision: readRevision(record.revision, true),
    rules: record.rules.map(readRule),
  };
}

function readBudget(value: unknown): NonNullable<CategoryConfiguration['budget']> {
  const record = readObject(value);
  if (
    typeof record.amount !== 'string' ||
    !/^\d+\.\d{2}$/u.test(record.amount) ||
    record.currency !== 'PHP' ||
    (record.recurrence !== 'monthly' && record.recurrence !== 'yearly')
  ) {
    throw new InvalidApiResponseError();
  }
  return {
    amount: record.amount,
    currency: 'PHP',
    recurrence: record.recurrence,
  };
}

function readRule(value: unknown): CategoryRule {
  const record = readObject(value);
  if (
    typeof record.pattern !== 'string' ||
    (record.matchType !== 'exact' && record.matchType !== 'contains')
  ) {
    throw new InvalidApiResponseError();
  }
  return {
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    ...(typeof record.categoryId === 'string' ? { categoryId: record.categoryId } : {}),
    pattern: record.pattern,
    matchType: record.matchType,
  };
}

function readIconKey(value: unknown): CategoryIconKey {
  if (!CATEGORY_ICON_KEYS.includes(value as CategoryIconKey)) {
    throw new InvalidApiResponseError();
  }
  return value as CategoryIconKey;
}

function readColorKey(value: unknown): CategoryColorKey {
  if (!CATEGORY_COLOR_KEYS.includes(value as CategoryColorKey)) {
    throw new InvalidApiResponseError();
  }
  return value as CategoryColorKey;
}

function readRevision(value: unknown, allowZero = false): string {
  if (
    typeof value !== 'string' ||
    !(allowZero ? /^\d+$/u : /^[1-9]\d*$/u).test(value)
  ) {
    throw new InvalidApiResponseError();
  }
  return value;
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidApiResponseError();
  }
  return value as Record<string, unknown>;
}
