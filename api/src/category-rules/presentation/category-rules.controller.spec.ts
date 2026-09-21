import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { CategoryRulesService } from '../application/category-rules.service';
import type { CategoryRuleRecord } from '../application/category-rule-store';
import { CategoryRulesController } from './category-rules.controller';

describe('CategoryRulesController', () => {
  it('sets the created status and relative canonical Location while serializing the rule', async () => {
    const rule = categoryRuleRecord();
    const categoryRulesService = {
      createCategoryRuleInSpace: jest.fn().mockResolvedValue(rule),
    };
    const controller = new CategoryRulesController(
      categoryRulesService as unknown as CategoryRulesService,
      personalSpaceAccess(),
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await expect(
      controller.createCategoryRule(
        authenticatedRequest(),
        { categoryId: rule.categoryId, pattern: rule.pattern },
        response,
      ),
    ).resolves.toEqual({
      id: '42',
      categoryId: '10',
      pattern: 'Green   Market',
      matchType: 'exact',
      createdAt: '2026-08-29T00:00:00.123Z',
      updatedAt: '2026-08-29T00:00:00.456Z',
    });

    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/category-rules/42',
    );
  });
});

function categoryRuleRecord(): CategoryRuleRecord {
  return {
    id: '42',
    userId: '7',
    categoryId: '10',
    pattern: 'Green   Market',
    normalizedPattern: 'green market',
    matchType: 'exact',
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}

function authenticatedRequest(): AuthenticatedRequest {
  return { authenticatedUserId: '7' } as AuthenticatedRequest;
}

function personalSpaceAccess(): SpaceAccessService {
  return {
    requirePersonalSpace: jest.fn().mockResolvedValue({ id: '9' }),
    requirePersonalWriteSpace: jest.fn().mockResolvedValue({ id: '9' }),
  } as unknown as SpaceAccessService;
}
