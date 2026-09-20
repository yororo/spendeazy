import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCategoryRuleDto,
  UpdateCategoryRuleDto,
  ReplaceCategoryRulesDto,
  SpaceReplaceCategoryRulesDto,
} from './category-rule.dto';

describe('category rule DTOs', () => {
  it.each(['exact', 'contains'])(
    'accepts %s on individual creation and type-only updates',
    async (matchType) => {
      await expect(
        validate(
          plainToInstance(CreateCategoryRuleDto, {
            categoryId: '10',
            pattern: 'Rent',
            matchType,
          }),
        ),
      ).resolves.toEqual([]);
      await expect(
        validate(plainToInstance(UpdateCategoryRuleDto, { matchType })),
      ).resolves.toEqual([]);
    },
  );

  it.each([null, 'regex', 'EXACT', 1])(
    'rejects invalid individual match type %p',
    async (matchType) => {
      await expect(
        validate(
          plainToInstance(CreateCategoryRuleDto, {
            categoryId: '10',
            pattern: 'Rent',
            matchType,
          }),
        ),
      ).resolves.not.toEqual([]);
      await expect(
        validate(plainToInstance(UpdateCategoryRuleDto, { matchType })),
      ).resolves.not.toEqual([]);
    },
  );

  it.each([
    {},
    { rules: null },
    { rules: {} },
    { rules: [null] },
    { rules: [[]] },
    { rules: [{ pattern: 'Rent' }] },
    { rules: [{ pattern: ' ', matchType: 'exact' }] },
    { rules: [{ pattern: 'Rent', matchType: 'regex' }] },
    { rules: [{ pattern: 'Rent', matchType: 'exact', id: '1' }] },
    { rules: [], userId: '2' },
    { rules: [], revision: 'not-a-revision' },
  ])('rejects invalid replacement %p', async (body) => {
    await expect(
      validate(plainToInstance(ReplaceCategoryRulesDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).resolves.not.toEqual([]);
  });

  it.each([
    { rules: [], revision: '4' },
    {
      rules: [
        { pattern: 'RENT', matchType: 'exact' },
        { pattern: 'MORTGAGE', matchType: 'contains' },
      ],
    },
  ])(
    'accepts a complete replacement including an empty array',
    async (body) => {
      await expect(
        validate(plainToInstance(ReplaceCategoryRulesDto, body)),
      ).resolves.toEqual([]);
    },
  );
  it('preserves the submitted display pattern before validation', async () => {
    const rule = plainToInstance(CreateCategoryRuleDto, {
      pattern: '  Green   Market  ',
      categoryId: '10',
    });

    await expect(validate(rule)).resolves.toEqual([]);
    expect(rule).toMatchObject({
      pattern: '  Green   Market  ',
      categoryId: '10',
    });
  });

  it('rejects empty values and an empty patch', async () => {
    const emptyPattern = plainToInstance(CreateCategoryRuleDto, {
      pattern: '   ',
      categoryId: '10',
    });
    const invalidCategory = plainToInstance(CreateCategoryRuleDto, {
      pattern: 'Groceries',
      categoryId: 'not-an-id',
    });
    const emptyPatch = plainToInstance(UpdateCategoryRuleDto, {});

    await expect(validate(emptyPattern)).resolves.not.toEqual([]);
    await expect(validate(invalidCategory)).resolves.not.toEqual([]);
    await expect(validate(emptyPatch)).resolves.not.toEqual([]);
  });

  it('requires a revision for Space-scoped replacement', async () => {
    await expect(
      validate(
        plainToInstance(SpaceReplaceCategoryRulesDto, {
          rules: [],
        }),
      ),
    ).resolves.not.toEqual([]);
    await expect(
      validate(
        plainToInstance(SpaceReplaceCategoryRulesDto, {
          revision: '4',
          rules: [],
        }),
      ),
    ).resolves.toEqual([]);
  });
});
