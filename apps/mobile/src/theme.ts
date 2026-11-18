import { Platform, useColorScheme } from 'react-native';

// iOS system colours (grouped backgrounds, labels, separators) with a saffron tint.
const light = {
  dark: false,
  bg: '#F2F2F7', card: '#FFFFFF', elevated: '#FFFFFF',
  label: '#000000', label2: 'rgba(60,60,67,0.62)', label3: 'rgba(60,60,67,0.32)',
  separator: 'rgba(60,60,67,0.18)', fill: 'rgba(120,120,128,0.12)', fill2: 'rgba(120,120,128,0.08)',
  tint: '#C45200', tintFill: '#FF9500', tintSoft: 'rgba(255,149,0,0.13)', onTint: '#FFFFFF',
  grad: ['#FFB340', '#FF7A00', '#F2450A'] as [string, string, string],
  green: '#248A3D', greenSoft: 'rgba(52,199,89,0.14)',
  amber: '#9A5B00', amberSoft: 'rgba(255,204,0,0.2)',
  red: '#D70015', redSoft: 'rgba(255,59,48,0.12)',
  glass: 'rgba(249,249,251,0.78)', shadow: 'rgba(0,0,0,0.12)',
};
const dark: typeof light = {
  dark: true,
  bg: '#000000', card: '#1C1C1E', elevated: '#2C2C2E',
  label: '#FFFFFF', label2: 'rgba(235,235,245,0.62)', label3: 'rgba(235,235,245,0.3)',
  separator: 'rgba(84,84,88,0.6)', fill: 'rgba(120,120,128,0.24)', fill2: 'rgba(120,120,128,0.16)',
  tint: '#FF9F0A', tintFill: '#FF9F0A', tintSoft: 'rgba(255,159,10,0.18)', onTint: '#1A0E00',
  grad: ['#FFB340', '#FF8A00', '#F2500A'] as [string, string, string],
  green: '#30D158', greenSoft: 'rgba(48,209,88,0.18)',
  amber: '#FFD60A', amberSoft: 'rgba(255,214,10,0.16)',
  red: '#FF453A', redSoft: 'rgba(255,69,58,0.18)',
  glass: 'rgba(28,28,30,0.72)', shadow: 'rgba(0,0,0,0.5)',
};
export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

// San Francisco on Apple devices (system font), Roboto on Android.
const SYSTEM = Platform.select({ web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, "Noto Sans Gurmukhi", system-ui, sans-serif', default: undefined });
const ROUNDED = Platform.select({ web: 'ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', default: undefined });

export const FONT = {
  gurmukhi: 'NotoSansGurmukhi_400Regular',
  gurmukhiBold: 'NotoSansGurmukhi_700Bold',
  ui: SYSTEM,
  rounded: ROUNDED,
};

/** iOS Dynamic Type sizes (default content size). */
export const TYPE = {
  largeTitle: { fontFamily: SYSTEM, fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: 0.37 },
  title2: { fontFamily: SYSTEM, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: 0.35 },
  title3: { fontFamily: SYSTEM, fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: 0.38 },
  headline: { fontFamily: SYSTEM, fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.41 },
  body: { fontFamily: SYSTEM, fontSize: 17, lineHeight: 22, letterSpacing: -0.41 },
  callout: { fontFamily: SYSTEM, fontSize: 16, lineHeight: 21, letterSpacing: -0.32 },
  subhead: { fontFamily: SYSTEM, fontSize: 15, lineHeight: 20, letterSpacing: -0.24 },
  footnote: { fontFamily: SYSTEM, fontSize: 13, lineHeight: 18, letterSpacing: -0.08 },
  caption: { fontFamily: SYSTEM, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  sectionHeader: { fontFamily: SYSTEM, fontSize: 13, lineHeight: 18, letterSpacing: -0.08, textTransform: 'uppercase' as const },
};

export const shadow = (t: Theme, y = 8, r = 24) =>
  Platform.select({
    web: { boxShadow: `0 ${y}px ${r}px ${t.shadow}` } as object,
    default: { shadowColor: '#000', shadowOpacity: t.dark ? 0.5 : 0.14, shadowRadius: r / 2, shadowOffset: { width: 0, height: y / 2 }, elevation: 6 },
  });
