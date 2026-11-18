import React from 'react';
import { Pressable, Text, View, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { FONT, type Theme } from './theme';

export function Button({ t, label, onPress, kind = 'primary', style, a11y, disabled }: {
  t: Theme; label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'quiet'; style?: ViewStyle; a11y?: string; disabled?: boolean;
}) {
  const bg = kind === 'primary' ? t.accent : kind === 'secondary' ? t.accentSoft : 'transparent';
  const fg = kind === 'primary' ? t.onAccent : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, borderColor: kind === 'quiet' ? t.border : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
    >
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ t, label, tone }: { t: Theme; label: string; tone: 'live' | 'warn' | 'muted' }) {
  const c = tone === 'live' ? [t.liveSoft, t.live] : tone === 'warn' ? [t.warnSoft, t.warn] : [t.border, t.muted];
  // A shape glyph carries the state too, so it does not rely on colour.
  const glyph = tone === 'live' ? '●' : tone === 'warn' ? '❚❚' : '■';
  return (
    <View style={[styles.chip, { backgroundColor: c[0] }]} accessibilityRole="text" accessibilityLabel={label}>
      <Text style={[styles.chipText, { color: c[1] }]}>{glyph}  {label}</Text>
    </View>
  );
}

export function Gurmukhi({ children, size, style, bold, t, a11y }: { children: string; size: number; style?: TextStyle; bold?: boolean; t: Theme; a11y?: string }) {
  return (
    <Text
      accessibilityLabel={a11y}
      style={[{ fontFamily: bold ? FONT.gurmukhiBold : FONT.gurmukhi, fontSize: size, lineHeight: Math.round(size * 1.75), color: t.text }, style]}
    >
      {children}
    </Text>
  );
}

export const styles = StyleSheet.create({
  btn: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  btnText: { fontFamily: FONT.uiBold, fontSize: 16 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
  chipText: { fontFamily: FONT.uiBold, fontSize: 13 },
});
