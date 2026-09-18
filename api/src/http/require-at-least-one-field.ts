import { registerDecorator, type ValidationArguments } from 'class-validator';

export function requireAtLeastOneField(
  fields: string[],
  message: string,
): ClassDecorator {
  return (target) => {
    registerDecorator({
      name: 'atLeastOneUpdateField',
      target,
      propertyName: '_update',
      validator: {
        validate(_: unknown, args: ValidationArguments): boolean {
          const update = args.object as Record<string, unknown>;
          return fields.some((field) => update[field] !== undefined);
        },
        defaultMessage: () => message,
      },
    });
  };
}
