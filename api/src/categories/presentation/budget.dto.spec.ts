import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertBudgetDto } from './budget.dto';

describe('budget DTOs', () => {
  it('accepts a positive exact two-decimal amount and supported period', async () => {
    const budget = plainToInstance(UpsertBudgetDto, {
      amount: '250.00',
      period: 'monthly',
    });

    await expect(validate(budget)).resolves.toEqual([]);
  });

  it('rejects non-positive, imprecise, oversized, and unsupported budget values', async () => {
    const invalidAmounts = [
      '0.00',
      '-1.00',
      '1',
      '1.0',
      '1.000',
      '10000000000000.00',
    ];

    for (const amount of invalidAmounts) {
      const budget = plainToInstance(UpsertBudgetDto, {
        amount,
        period: 'monthly',
      });
      await expect(validate(budget)).resolves.not.toEqual([]);
    }

    const invalidPeriod = plainToInstance(UpsertBudgetDto, {
      amount: '250.00',
      period: 'quarterly',
    });
    await expect(validate(invalidPeriod)).resolves.not.toEqual([]);
  });

  it('rejects missing, null, and non-string budget fields', async () => {
    const missingFields = plainToInstance(UpsertBudgetDto, {});
    const nullFields = plainToInstance(UpsertBudgetDto, {
      amount: null,
      period: null,
    });
    const numericAmount = plainToInstance(UpsertBudgetDto, {
      amount: 250,
      period: 'monthly',
    });

    await expect(validate(missingFields)).resolves.not.toEqual([]);
    await expect(validate(nullFields)).resolves.not.toEqual([]);
    await expect(validate(numericAmount)).resolves.not.toEqual([]);
  });
});
