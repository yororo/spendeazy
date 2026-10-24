import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  useFonts,
} from '@expo-google-fonts/outfit';
import * as SystemUI from 'expo-system-ui';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { fontFamily, paletteFor, type AppPalette } from '@/constants/theme';
import { resolveColorScheme, type AppearancePreference, type ColorScheme } from '@/navigation/appearance';
import { readAppearancePreference, writeAppearancePreference } from '@/navigation/device-memory';

type AppTheme = {
  ready: boolean;
  scheme: ColorScheme;
  palette: AppPalette;
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => Promise<boolean>;
  fonts: typeof fontFamily;
};

const AppThemeContext = createContext<AppTheme | null>(null);

export function AppearanceGate({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });
  const scheme = resolveColorScheme(preference, systemScheme);
  const palette = paletteFor(scheme);

  useEffect(() => {
    let active = true;
    readAppearancePreference().then((stored) => {
      if (!active) return;
      setPreferenceState(stored);
      setPreferenceReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferenceReady) return;
    void SystemUI.setBackgroundColorAsync(palette.canvas);
  }, [palette.canvas, preferenceReady]);

  async function setPreference(next: AppearancePreference): Promise<boolean> {
    const saved = await writeAppearancePreference(next);
    if (saved) setPreferenceState(next);
    return saved;
  }

  const ready = preferenceReady && (fontsLoaded || fontError !== null);
  const theme: AppTheme = {
    ready,
    scheme,
    palette,
    preference,
    setPreference,
    fonts: fontFamily,
  };

  return <AppThemeContext value={theme}>{children}</AppThemeContext>;
}

export function useAppTheme(): AppTheme {
  const theme = use(AppThemeContext);
  if (!theme) throw new Error('useAppTheme must be used within AppearanceGate');
  return theme;
}
