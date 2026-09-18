import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../authentication/authentication';
import type { CategoriesService } from '../application/categories.service';
import type { CategoryRecord } from '../application/category-store';
import { CategoriesController } from './categories.controller';

describe('CategoriesController', () => {
  it('sets the created status and relative canonical Location while serializing the category', async () => {
    const category = categoryRecord();
    const categoriesService = {
      createCategory: jest.fn().mockResolvedValue(category),
    };
    const controller = new CategoriesController(
      categoriesService as unknown as CategoriesService,
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
