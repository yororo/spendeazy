import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CategorySummaryQueryDto } from './category-summary.dto';

describe('category summary DTOs', () => {
  it('accepts one complete monthly or yearly calendar period', async () => {
    await expect(
      validate(
        plainToInstance(CategorySummaryQueryDto, {
          period: 'monthly',
          year: '2026',
          month: '08',
        }),
      ),
    ).resolves.toEqual([]);
    await expect(
      validate(
        plainToInstance(CategorySummaryQueryDto, {
          period: 'yearly',
          year: '2028',
        }),
      ),
    ).resolves.toEqual([]);
  });

  it('rejects incomplete periods, invalid calendar fields, and unknown query fields', async () => {
    for (const input of [
      { period: 'monthly', year: '2026' },
      { period: 'yearly', year: '2026', month: '08' },
      { period: 'monthly', year: '2026', month: '13' },
      { period: 'monthly', year: '26', month: '08' },
      { period: 'quarterly', year: '2026', month: '08' },
    ]) {
      await expect(
        validate(plainToInstance(CategorySummaryQueryDto, input)),
      ).resolves.not.toEqual([]);
    }

    await expect(
      validate(
        plainToInstance(CategorySummaryQueryDto, {
          period: 'yearly',
          year: '2026',
          date: '2026',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'date' })]),
    );
  });
});
