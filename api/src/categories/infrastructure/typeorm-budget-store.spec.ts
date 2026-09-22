import { QueryFailedError, type EntityManager } from 'typeorm';
import type { BudgetRecord } from '../application/budget-store';
import { TypeOrmBudgetStore } from './typeorm-budget-store';

describe('TypeOrmBudgetStore', () => {
  it('creates and maps a budget record', async () => {
    const entity = budgetEntity();
    const repository = {
      create: jest.fn().mockReturnValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmBudgetStore(entityManager);

    await expect(
      store.create({
        categoryId: '42',
        amount: '250.00',
        period: 'monthly',
      }),
    ).resolves.toEqual(budgetRecord());
    expect(repository.create).toHaveBeenCalledWith({
      categoryId: '42',
      amount: '250.00',
      period: 'monthly',
    });
  });

  it('reports an atomic create race as an absent row for scoped stale handling', async () => {
    const entity = budgetEntity();
    const repository = {
      create: jest.fn().mockReturnValue(entity),
      save: jest
        .fn()
        .mockRejectedValue(
          new QueryFailedError('INSERT', [], { code: '23505' }),
        ),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmBudgetStore(entityManager);

    await expect(
      store.createIfAbsent({
        categoryId: '42',
        amount: '250.00',
        period: 'monthly',
      }),
    ).resolves.toBeNull();
  });

  it('updates the existing entity in place so identity and creation time survive replacement', async () => {
    const entity = budgetEntity();
    const updatedEntity = {
      ...entity,
      amount: '1200.00',
      period: 'yearly' as const,
    };
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(updatedEntity),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn().mockResolvedValue(entity),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmBudgetStore(entityManager);

    await expect(
      store.update('42', {
        amount: '1200.00',
        period: 'yearly',
        expectedUpdatedAt: entity.updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({
      id: '100',
      categoryId: '42',
      amount: '1200.00',
      period: 'yearly',
      createdAt: new Date('2026-08-29T00:00:00.123Z'),
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { categoryId: '42' },
    });
    expect(queryBuilder.set).toHaveBeenCalledWith({
      amount: '1200.00',
      period: 'yearly',
    });
  });

  it('deletes a budget row only when its version still matches', async () => {
    const queryBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmBudgetStore(entityManager);

    await expect(
      store.deleteIfCurrent('42', '2026-08-29T00:00:00.456Z'),
    ).resolves.toBe(true);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'updated_at = :expectedUpdatedAt',
      { expectedUpdatedAt: new Date('2026-08-29T00:00:00.456Z') },
    );
  });
});

function budgetEntity() {
  return {
    id: '100',
    categoryId: '42',
    amount: '250.00',
    period: 'monthly' as const,
    createdAt: new Date('2026-08-29T00:00:00.123Z'),
    updatedAt: new Date('2026-08-29T00:00:00.456Z'),
  };
}

function budgetRecord(): BudgetRecord {
  return budgetEntity();
}
