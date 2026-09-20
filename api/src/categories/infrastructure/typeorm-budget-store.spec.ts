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
    const repository = {
      findOne: jest.fn().mockResolvedValue(entity),
      save: jest.fn().mockResolvedValue(entity),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmBudgetStore(entityManager);

    await expect(
      store.update('42', { amount: '1200.00', period: 'yearly' }),
    ).resolves.toMatchObject({
      id: '100',
      categoryId: '42',
      amount: '1200.00',
      period: 'yearly',
      createdAt: new Date('2026-08-29T00:00:00.123Z'),
    });
    expect(repository.save).toHaveBeenCalledWith(entity);
  });

  it('reports whether a budget row was removed', async () => {
    const repository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as EntityManager;
    const store = new TypeOrmBudgetStore(entityManager);

    await expect(store.delete('42')).resolves.toBe(true);
    expect(repository.delete).toHaveBeenCalledWith({ categoryId: '42' });
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
