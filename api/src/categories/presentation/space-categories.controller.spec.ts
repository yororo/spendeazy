import type { AuthenticatedRequest } from '../../authentication/authentication';
import { SpaceNotFoundError } from '../../spaces/application/space-errors';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { CategoryRecord } from '../application/category-store';
import type { CategoriesService } from '../application/categories.service';
import { RequestValidationError } from '../../http/request-validation-error';
import { SpaceCategoriesController } from './space-categories.controller';

describe('SpaceCategoriesController', () => {
  it('uses the authenticated member and requested Space for category reads', async () => {
    const category = categoryRecord();
    const categoriesService = {
      listCategoriesInSpace: jest.fn().mockResolvedValue([category]),
    };
    const spaceAccessService = {
      requireReadAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceCategoriesController(
      categoriesService as unknown as CategoriesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.listCategories(authenticatedRequest('7'), { spaceId: '10' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: category.id, name: category.name }),
    ]);

    expect(spaceAccessService.requireReadAccess).toHaveBeenCalledWith(
      '7',
      '10',
    );
    expect(categoriesService.listCategoriesInSpace).toHaveBeenCalledWith('10');
  });

  it('does not read a Space Category when membership is denied', async () => {
    const categoriesService = {
      getCategoryInSpace: jest.fn(),
    };
    const spaceAccessService = {
      requireReadAccess: jest.fn().mockRejectedValue(new SpaceNotFoundError()),
    };
    const controller = new SpaceCategoriesController(
      categoriesService as unknown as CategoriesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await expect(
      controller.getCategory(authenticatedRequest('99'), {
        spaceId: '10',
        categoryId: '42',
      }),
    ).rejects.toBeInstanceOf(SpaceNotFoundError);
    expect(categoriesService.getCategoryInSpace).not.toHaveBeenCalled();
  });

  it('passes a Category version to scoped edits', async () => {
    const category = categoryRecord({ name: 'Dining' });
    const categoriesService = {
      updateCategoryInSpace: jest.fn().mockResolvedValue(category),
    };
    const spaceAccessService = {
      requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
    };
    const controller = new SpaceCategoriesController(
      categoriesService as unknown as CategoriesService,
      spaceAccessService as unknown as SpaceAccessService,
    );

    await controller.updateCategory(
      authenticatedRequest('7'),
      { spaceId: '10', categoryId: '42' },
      { name: 'Dining', updatedAt: category.updatedAt.toISOString() },
    );

    expect(categoriesService.updateCategoryInSpace).toHaveBeenCalledWith(
      '10',
      '42',
      { name: 'Dining', expectedUpdatedAt: category.updatedAt.toISOString() },
    );
  });

  it('rejects a scoped Category edit without a version before writing', async () => {
    const updateCategoryInSpace = jest.fn();
    const controller = new SpaceCategoriesController(
      { updateCategoryInSpace } as unknown as CategoriesService,
      {
        requireWriteAccess: jest.fn().mockResolvedValue({ id: '10' }),
      } as unknown as SpaceAccessService,
    );

    await expect(
      controller.updateCategory(
        authenticatedRequest('7'),
        { spaceId: '10', categoryId: '42' },
        { name: 'Dining' } as UpdateCategoryDto,
      ),
    ).rejects.toBeInstanceOf(RequestValidationError);
    expect(updateCategoryInSpace).not.toHaveBeenCalled();
  });
});

function categoryRecord(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  const timestamp = new Date('2026-09-20T00:00:00.000Z');
  return {
    id: '42',
    userId: '7',
    spaceId: '10',
    name: 'Groceries',
    description: null,
    color: 'teal',
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function authenticatedRequest(userId: string): AuthenticatedRequest {
  return { authenticatedUserId: userId } as AuthenticatedRequest;
}
