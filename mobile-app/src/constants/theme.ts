import type { ColorScheme } from '@/navigation/appearance';

/**
 * Declared and derived tokens from mobile-app/design/design-token.md.
 * Navigation and Add fills are opaque so contrast does not depend on blur.
 * The light navigation edge uses the field border because a white glass stroke
 * disappears on an opaque white bar.
 */
export const palette = {
  light: {
    textPrimary: '#25334D',
    textSecondary: '#64738B',
    brandPrimary: '#5361D8',
    onBrand: '#FFFFFF',
    surfaceModal: '#FAFAFE',
    stateWarning: '#986224',
    statePositive: '#397F7A',
    stateNegative: '#A64F3D',
    canvas: '#F6F7FC',
    navigation: '#FFFFFF',
    navigationBorder: '#E5E7EF',
    fieldBorder: '#E5E7EF',
    glassTint: '#FFFFFF66',
    glassBorder: '#FFFFFFE6',
    summaryCardShadow: '#646A9D12',
    scrim: '#20283B66',
    add: '#6976E6',
    onAdd: '#FFFFFF',
    shadow: '#4E558F20',
  },
  dark: {
    textPrimary: '#EEF1FC',
    textSecondary: '#A6B1C8',
    brandPrimary: '#A4AEFF',
    onBrand: '#141A2B',
    surfaceModal: '#22283D',
    stateWarning: '#F1C17E',
    statePositive: '#85D3C4',
    stateNegative: '#F3A594',
    canvas: '#141A2B',
    navigation: '#272E41',
    navigationBorder: '#A7B1DC26',
    fieldBorder: '#A7B1DC26',
    glassTint: '#272E4180',
    glassBorder: '#A7B1DC26',
    summaryCardShadow: '#00000040',
    scrim: '#06091399',
    add: '#6976E6',
    onAdd: '#FFFFFF',
    shadow: '#00000040',
  },
} as const;

export type AppPalette = (typeof palette)[ColorScheme];

export const fontFamily = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
} as const;

export const typeScale = {
  pageTitle: 27,
  sectionTitle: 15,
  button: 15,
  body: 16,
  metadata: 12,
  summaryMetric: 23,
  pageTitleTracking: -0.9,
} as const;

export const space = {
  screenHorizontal: 20,
  screenBottom: 16,
  cardGap: 14,
  cardInset: 22,
  dialogInset: 24,
  dialogGap: 24,
  sheetPaddingTop: 12,
  sheetPaddingBottom: 30,
  sheetGap: 20,
  fieldLabelGap: 6,
  rowGap: 4,
} as const;

export const radius = {
  control: 16,
  summaryCard: 30,
  dialog: 26,
  sheet: 28,
  navigation: 32,
} as const;

export const controlSize = {
  primaryAction: 52,
  field: 58,
  navigation: 64,
  addAction: 64,
  minimumTarget: 48,
} as const;

export function paletteFor(scheme: ColorScheme): AppPalette {
  return palette[scheme];
}

// Light values are extracted from the design; dark values adapt the composition.
export const designRecipes = {
  light: {
    canvas: [
      { colors: ['#CBC5F1A0', '#DFDAF400'], center: [1, 0.22], size: [1.6, 0.8] },
      { colors: ['#BCE8E690', '#D4ECE900'], center: [0, 0.43], size: [1.6, 0.65] },
      { colors: ['#E2D5F276', '#EAE0F000'], center: [0.85, 0.87], size: [1.7, 0.6] },
    ],
    glass: ['#FFFFFFD9', '#FFFFFF66', '#FFFFFFA6'],
    highlight: '#FFFFFFCC',
  },
  dark: {
    canvas: [
      { colors: ['#51437D40', '#141A2B00'], center: [1, 0.22], size: [1.6, 0.8] },
      { colors: ['#28636130', '#141A2B00'], center: [0, 0.43], size: [1.6, 0.65] },
    ],
    glass: ['#272E41D9', '#272E4180', '#272E41D9'],
    highlight: '#C5CDFF12',
  },
} as const;
