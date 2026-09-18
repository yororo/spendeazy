import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

describe('category DTOs', () => {
  it('trims the display name before validation', async () => {
    const category = plainToInstance(CreateCategoryDto, {
      name: '  Dining Out  ',
    });

    await expect(validate(category)).resolves.toEqual([]);
    expect(category).toMatchObject({ name: 'Dining Out' });
  });

  it('accepts a named palette choice and rejects unsupported colors', async () => {
    const supported = plainToInstance(CreateCategoryDto, {
      name: 'Dining',
      color: 'teal',
    });
    const unsupported = plainToInstance(CreateCategoryDto, {
      name: 'Dining',
      color: '#ffffff',
    });
    const colorOnlyUpdate = plainToInstance(UpdateCategoryDto, {
      color: 'teal',
    });
    const unsupportedUpdate = plainToInstance(UpdateCategoryDto, {
      color: 'white',
    });

    await expect(validate(supported)).resolves.toEqual([]);
    await expect(validate(colorOnlyUpdate)).resolves.toEqual([]);
    await expect(validate(unsupported)).resolves.not.toEqual([]);
    await expect(validate(unsupportedUpdate)).resolves.not.toEqual([]);
  });

  it('rejects empty, null, and empty-patch values', async () => {
    const emptyName = plainToInstance(CreateCategoryDto, { name: '   ' });
    const nullName = plainToInstance(CreateCategoryDto, { name: null });
    const emptyPatch = plainToInstance(UpdateCategoryDto, {});
    const nullState = plainToInstance(UpdateCategoryDto, { isActive: null });

    await expect(validate(emptyName)).resolves.not.toEqual([]);
    await expect(validate(nullName)).resolves.not.toEqual([]);
    await expect(validate(emptyPatch)).resolves.not.toEqual([]);
    await expect(validate(nullState)).resolves.not.toEqual([]);
  });

  it('accepts nullable descriptions, trims text, and rejects invalid or overlong values', async () => {
    const text = plainToInstance(CreateCategoryDto, {
      name: 'Dining',
      description: '  Restaurants  ',
      color: 'teal',
    });
    const blank = plainToInstance(UpdateCategoryDto, { description: '   ' });
    const invalid = plainToInstance(CreateCategoryDto, {
      name: 'Dining',
      description: 42,
    });
    const overlong = plainToInstance(UpdateCategoryDto, {
      description: 'x'.repeat(501),
    });

    await expect(validate(text)).resolves.toEqual([]);
    expect(text.description).toBe('Restaurants');
    expect(text.color).toBe('teal');
    await expect(validate(blank)).resolves.toEqual([]);
    expect(blank.description).toBeNull();
    await expect(validate(invalid)).resolves.not.toEqual([]);
    await expect(validate(overlong)).resolves.not.toEqual([]);
  });
});
