import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { CategoryRulesService } from '../application/category-rules.service';
import type { CategoryRuleRecord } from '../application/category-rule-store';
import { SpaceCategoryRuleReplacementController } from './space-category-rule-replacement.controller';
import { SpaceCategoryRulesController } from './space-category-rules.controller';

describe('Space Category Rule controllers', () => {
  it('reads the authorized Space collection with its revision', async () => {
    const collection = {
      rules: [categoryRuleRecord()],
      revision: '4',
    };
    const categoryRulesService = {
      listCategoryRulesInSpace: jest.fn().mockResolvedValue(collection),
    };
    const spaceAccessService = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceCategoryRulesController(
      categoryRulesService as unknown as CategoryRulesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.listCategoryRules(authenticatedRequest('7'), {
        spaceId: '10',
      }),
    ).resolves.toEqual({
      rules: [expect.objectContaining({ id: '42', categoryId: '100' })],
      revision: '4',
    });
    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
  });

  it('writes through Space membership and carries revision and rule version', async () => {
    const rule = categoryRuleRecord();
    const categoryRulesService = {
      createCategoryRuleInSpace: jest.fn().mockResolvedValue(rule),
      updateCategoryRuleInSpace: jest.fn().mockResolvedValue(rule),
    };
    const requireWriteAccess = jest
      .fn()
      .mockResolvedValue({ id: '10', accessLevel: 'write' });
    const spaceAccessService = { requireWriteAccess };
    const controller = new SpaceCategoryRulesController(
      categoryRulesService as unknown as CategoryRulesService,
      spaceAccessService as unknown as SpaceAccessService,
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await controller.createCategoryRule(
      authenticatedRequest('7'),
      { spaceId: '10' },
      { categoryId: '100', pattern: 'Groceries' },
      response,
    );
    await controller.updateCategoryRule(
      authenticatedRequest('7'),
      { spaceId: '10', ruleId: '42' },
      {
        pattern: 'Groceries',
        updatedAt: rule.updatedAt.toISOString(),
      },
    );

    expect(requireWriteAccess).toHaveBeenCalledTimes(2);
    expect(categoryRulesService.createCategoryRuleInSpace).toHaveBeenCalledWith(
      '10',
      { categoryId: '100', pattern: 'Groceries' },
    );
    expect(categoryRulesService.updateCategoryRuleInSpace).toHaveBeenCalledWith(
      '10',
      '42',
      {
        pattern: 'Groceries',
        expectedUpdatedAt: rule.updatedAt.toISOString(),
      },
    );
    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/spaces/10/category-rules/42',
    );
  });

  it('atomically replaces one Category and passes the Space revision', async () => {
    const categoryRulesService = {
      replaceCategoryRulesInSpace: jest.fn().mockResolvedValue({
        rules: [categoryRuleRecord()],
        revision: '5',
      }),
    };
    const spaceAccessService = {
      requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceCategoryRuleReplacementController(
      categoryRulesService as unknown as CategoryRulesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.replaceCategoryRules(
        authenticatedRequest('7'),
        { spaceId: '10', categoryId: '100' },
        {
          revision: '4',
          rules: [{ pattern: 'Groceries', matchType: 'exact' }],
        },
      ),
    ).resolves.toEqual({
      rules: [expect.objectContaining({ id: '42' })],
      revision: '5',
    });
    expect(
      categoryRulesService.replaceCategoryRulesInSpace,
    ).toHaveBeenCalledWith(
      '10',
      '100',
      [{ pattern: 'Groceries', matchType: 'exact' }],
      '4',
    );
  });
});

function categoryRuleRecord(): CategoryRuleRecord {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '42',
    spaceId: '10',
    categoryId: '100',
    pattern: 'Groceries',
    normalizedPattern: 'groceries',
    matchType: 'exact',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function authenticatedRequest(userId: string): AuthenticatedRequest {
  return { authenticatedUserId: userId } as AuthenticatedRequest;
}
