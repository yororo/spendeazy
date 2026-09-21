import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { SpaceAccessService } from '../../spaces/application/space-access.service';
import type { CategoriesService } from '../application/categories.service';
import type { CategoryRecord } from '../application/category-store';
import { CategoriesController } from './categories.controller';

describe('CategoriesController', () => {
  it('does not query Categories when Personal Space access is denied', async () => {
    const categoriesService = { listCategoriesInSpace: jest.fn() };
    const access = {
      requirePersonalSpace: jest.fn().mockRejectedValue(new Error('denied')),
    } as unknown as SpaceAccessService;
    const controller = new CategoriesController(
      categoriesService as unknown as CategoriesService,
      access,
    );

    await expect(
      controller.listCategories(authenticatedRequest()),
    ).rejects.toThrow('denied');
    expect(categoriesService.listCategoriesInSpace).not.toHaveBeenCalled();
  });

  it('sets the created status and relative canonical Location while serializing the category', async () => {
    const category = categoryRecord();
    const categoriesService = {
      createCategoryInSpace: jest.fn().mockResolvedValue(category),
    };
    const controller = new CategoriesController(
      categoriesService as unknown as CategoriesService,
      personalSpaceAccess(),
    );
    const status = jest.fn();
    const setHeader = jest.fn();
    const response = { status, setHeader } as unknown as Response;

    await expect(
      controller.createCategory(
        authenticatedRequest(),
        { name: category.name },
        response,
      ),
    ).resolves.toEqual({
      id: '42',
      name: 'Groceries',
      description: 'Food staples',
      color: 'teal',
      isActive: true,
      createdAt: '2026-08-29T00:00:00.123Z',
      updatedAt: '2026-08-29T00:00:00.456Z',
    });

    expect(status).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/users/me/categories/42',
    );
  });
});

function categoryRecord(): CategoryRecord {
  return {
    id: '42',
    userId: '7',
    name: 'Groceries',
    description: 'Food staples',
    color: 'teal',
    isActive: true,
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
