// iOS-style building blocks: glass bars, inset grouped lists, segmented control, pills,
// capsule buttons and a notice card.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Icon, type IconName } from './icons';
import { FONT, TYPE, shadow, type Theme } from './theme';
import { NATIVE, ScalePress, feedback, spring, useLoop } from './anim';

/** Frosted bar (navigation bar, floating capsules). */
export function Glass({ t, style, children, intensity = 60 }: { t: Theme; style?: StyleProp<ViewStyle>; children: React.ReactNode; intensity?: number }) {
  if (Platform.OS === 'web') {
    return <View style={[{ backgroundColor: t.glass, backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' } as object, style]}>{children}</View>;
  }
  return <BlurView tint={t.dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={intensity} style={style}>{children}</BlurView>;
}

/** Round icon button used in navigation bars. */
export function NavIcon({ t, icon, onPress, a11y, label }: { t: Theme; icon: IconName; onPress: () => void; a11y: string; label?: string }) {
  return (
    <ScalePress onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} haptic="light" hitSlop={8}
      style={[st.navIcon, { backgroundColor: t.fill, paddingHorizontal: label ? 12 : 0, width: label ? undefined : 36 }]}>
      <Icon name={icon} size={18} color={t.tint} />
      {label && <Text style={[TYPE.subhead, { color: t.tint, fontWeight: '600', marginLeft: 5 }]}>{label}</Text>}
    </ScalePress>
  );
}

/** iOS back button: chevron + label. */
export function BackButton({ t, label, onPress }: { t: Theme; label: string; onPress: () => void }) {
  return (
    <ScalePress onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginLeft: -6 }}>
      <Icon name="chevron.left" size={24} color={t.tint} weight={2.4} />
      <Text style={[TYPE.body, { color: t.tint }]} numberOfLines={1}>{label}</Text>
    </ScalePress>
  );
}

export function Pill({ t, label, tone, pulse }: { t: Theme; label: string; tone: 'live' | 'paused' | 'muted' | 'tint'; pulse?: boolean }) {
  const c = tone === 'live' ? [t.greenSoft, t.green] : tone === 'paused' ? [t.amberSoft, t.amber] : tone === 'tint' ? [t.tintSoft, t.tint] : [t.fill, t.label2];
  const loop = useLoop(1400);
  return (
    <View style={[st.pill, { backgroundColor: c[0] }]} accessibilityRole="text" accessibilityLabel={label}>
      {/* A shape carries the state as well as colour: dot = live, bars = paused, square = stopped. */}
      {tone === 'live' ? (
        <View style={{ width: 8, height: 8, marginRight: 6, alignItems: 'center', justifyContent: 'center' }}>
          {pulse && <Animated.View style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: c[1], opacity: loop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: loop.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }} />}
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c[1] }} />
        </View>
      ) : tone === 'paused' ? <View style={{ marginRight: 5 }}><Icon name="pause" size={11} color={c[1]} /></View>
        : tone === 'muted' ? <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: c[1], marginRight: 6 }} /> : null}
      <Text style={[TYPE.footnote, { color: c[1], fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

/** Inset grouped section (Settings-style). */
export function Group({ t, header, footer, children, style }: { t: Theme; header?: string; footer?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginTop: 28 }, style]}>
      {header && <Text style={[TYPE.sectionHeader, { color: t.label2, marginLeft: 16, marginBottom: 7 }]} accessibilityRole="header">{header}</Text>}
      <View style={{ backgroundColor: t.card, borderRadius: 12, overflow: 'hidden' }}>
        {items.map((c, i) => (
          <View key={i}>
            {c}
            {i < items.length - 1 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.separator, marginLeft: 16 }} />}
          </View>
        ))}
      </View>
      {footer && <Text style={[TYPE.footnote, { color: t.label2, marginHorizontal: 16, marginTop: 7 }]}>{footer}</Text>}
    </View>
  );
}

export function Row({ t, icon, iconBg, title, titleStyle, subtitle, right, chevron, onPress, a11y, disabled, check }: {
  t: Theme; icon?: IconName; iconBg?: string; title: string; titleStyle?: StyleProp<TextStyle>; subtitle?: string; right?: React.ReactNode;
  chevron?: boolean; onPress?: () => void; a11y?: string; disabled?: boolean; check?: boolean;
}) {
  const body = (
    <View style={[st.row, { opacity: disabled ? 0.4 : 1 }]}>
      {icon && (
        <View style={[st.rowIcon, { backgroundColor: iconBg ?? t.tintFill }]}>
          <Icon name={icon} size={17} color="#FFFFFF" weight={2.1} />
        </View>
      )}
      <View style={{ flex: 1, paddingVertical: subtitle ? 9 : 11 }}>
        <Text style={[TYPE.body, { color: t.label }, titleStyle]}>{title}</Text>
        {subtitle && <Text style={[TYPE.footnote, { color: t.label2, marginTop: 2 }]}>{subtitle}</Text>}
      </View>
      {right}
      {check && <Icon name="check" size={20} color={t.tint} weight={2.5} />}
      {chevron && <Icon name="chevron.right" size={16} color={t.label3} weight={2.5} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { feedback('select'); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y ?? title}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.fill2 : 'transparent' })}>
      {body}
    </Pressable>
  );
}

/** UISegmentedControl look-alike with a sliding thumb. */
export function Segmented({ t, value, options, onChange }: { t: Theme; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex(([v]) => v === value));
  const x = useRef(new Animated.Value(idx)).current;
  useEffect(() => { spring(x, idx, { stiffness: 320, damping: 26 }).start(); }, [idx]);
  const seg = w / options.length;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width - 4)} style={[st.segWrap, { backgroundColor: t.fill }]} accessibilityRole="radiogroup">
      {w > 0 && (
        <Animated.View style={[st.segThumb, { width: seg, backgroundColor: t.dark ? '#636366' : '#FFFFFF', transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, seg] }) }] }, shadow(t, 3, 8)]} />
      )}
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => { feedback('select'); onChange(v); }} style={st.segItem} accessibilityRole="radio" accessibilityState={{ checked: v === value }} accessibilityLabel={label}>
          <Text style={[TYPE.subhead, { color: t.label, fontWeight: v === value ? '600' : '500' }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Large filled or tinted button. */
export function BigButton({ t, label, onPress, kind = 'filled', icon, style }: { t: Theme; label: string; onPress: () => void; kind?: 'filled' | 'tinted' | 'plain'; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const bg = kind === 'filled' ? t.tintFill : kind === 'tinted' ? t.tintSoft : 'transparent';
  const fg = kind === 'filled' ? '#FFFFFF' : t.tint;
  return (
    <ScalePress onPress={onPress} haptic="light" accessibilityRole="button" accessibilityLabel={label} style={[st.big, { backgroundColor: bg }, style]}>
      {icon && <View style={{ marginRight: 8 }}><Icon name={icon} size={19} color={fg} /></View>}
      <Text style={[TYPE.headline, { color: fg }]}>{label}</Text>
    </ScalePress>
  );
}

/** Inline notice card with an icon, actions and an optional diagnostic code. */
export function Notice({ t, title, body, code, actions, onDismiss, tone = 'warn' }: {
  t: Theme; title: string; body: string; code?: string; tone?: 'warn' | 'info';
  actions?: { label: string; onPress: () => void; primary?: boolean }[]; onDismiss?: () => void;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { spring(v, 1).start(); }, []);
  return (
    <Animated.View
      accessibilityRole="alert"
      style={[st.notice, { backgroundColor: t.card, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }, shadow(t, 6, 22)]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={[st.noticeIcon, { backgroundColor: tone === 'warn' ? t.amberSoft : t.tintSoft }]}>
          <Icon name={tone === 'warn' ? 'warning' : 'info'} size={18} color={tone === 'warn' ? t.amber : t.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.headline, { color: t.label }]}>{title}</Text>
          <Text style={[TYPE.subhead, { color: t.label2, marginTop: 3 }]}>{body}</Text>
          {code && <Text style={[TYPE.caption, { color: t.label3, marginTop: 6, fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', ios: 'Menlo', default: 'monospace' }) }]}>{code}</Text>}
        </View>
        {onDismiss && (
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ padding: 2 }}>
            <Icon name="xmark" size={16} color={t.label3} weight={2.4} />
          </Pressable>
        )}
      </View>
      {!!actions?.length && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginLeft: 44, flexWrap: 'wrap' }}>
          {actions.map((a) => (
            <ScalePress key={a.label} onPress={a.onPress} haptic="light" accessibilityRole="button" accessibilityLabel={a.label}
              style={[st.noticeBtn, { backgroundColor: a.primary ? t.tintFill : t.fill }]}>
              <Text style={[TYPE.subhead, { fontWeight: '600', color: a.primary ? '#FFFFFF' : t.tint }]}>{a.label}</Text>
            </ScalePress>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

export function Gurmukhi({ children, size, style, bold, t, a11y, numberOfLines }: { children: string; size: number; style?: StyleProp<TextStyle>; bold?: boolean; t: Theme; a11y?: string; numberOfLines?: number }) {
  return (
    <Text accessibilityLabel={a11y} numberOfLines={numberOfLines}
      style={[{ fontFamily: bold ? FONT.gurmukhiBold : FONT.gurmukhi, fontSize: size, lineHeight: Math.round(size * 1.7), color: t.label }, style]}>
      {children}
    </Text>
  );
}

/** Animated in/out wrapper for floating UI (slides up from the bottom). */
export function Rise({ visible, children, style }: { visible: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    spring(v, visible ? 1 : 0, { stiffness: 260, damping: 24 }).start(({ finished }) => { if (finished && !visible) setMounted(false); });
  }, [visible]);
  if (!mounted) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  navIcon: { height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 26, borderRadius: 13 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 44, gap: 12 },
  rowIcon: { width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segWrap: { flexDirection: 'row', borderRadius: 9, padding: 2, height: 36 },
  segThumb: { position: 'absolute', top: 2, left: 2, bottom: 2, borderRadius: 7 },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  big: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 20 },
  notice: { borderRadius: 16, padding: 14, marginHorizontal: 16, marginTop: 8 },
  noticeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  noticeBtn: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
