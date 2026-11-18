import { useColorScheme } from 'react-native';

const light = {
  bg: '#FBF8F2', surface: '#FFFFFF', text: '#1F2430', muted: '#596070', accent: '#A9500C', onAccent: '#FFFFFF',
  accentSoft: '#FBEBDC', border: '#E4DCCF', live: '#1F6F43', liveSoft: '#E3F2E8', warn: '#8A5A00', warnSoft: '#FFF3D6', danger: '#A12A2A',
};
const dark: typeof light = {
  bg: '#13151A', surface: '#1C1F26', text: '#ECE8E1', muted: '#A6ABB6', accent: '#F2A665', onAccent: '#1A1206',
  accentSoft: '#3A2918', border: '#2E323B', live: '#7FD3A0', liveSoft: '#1C3326', warn: '#F0C46A', warnSoft: '#3A2F17', danger: '#F08A8A',
};
export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

export const FONT = {
  gurmukhi: 'NotoSansGurmukhi_400Regular',
  gurmukhiBold: 'NotoSansGurmukhi_700Bold',
  ui: 'NotoSans_400Regular',
  uiBold: 'NotoSans_600SemiBold',
};
