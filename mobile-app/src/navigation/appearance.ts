export type AppearancePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export function parseAppearancePreference(value: string | null): AppearancePreference {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return 'system';
}

export function resolveColorScheme(
  preference: AppearancePreference,
  systemScheme: ColorScheme | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
