// Listening orb: a gradient button ringed by spectrum bars that follow the sound, a ring that
// turns faster as it gets louder, and ripples that ring out on each detected beat.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { levelBus, subscribeFrames, BAND_COUNT } from './level';
import { Icon } from './icons';
import { NATIVE, spring, feedback } from './anim';
import type { Theme } from './theme';

const RIPPLES = 4;

export function Orb({ t, size = 200, active, onPress, disabled, a11y }: {
  t: Theme; size?: number; active: boolean; onPress?: () => void; disabled?: boolean; a11y: string;
}) {
  const box = size * 1.9;
  const bars = useMemo(() => Array.from({ length: BAND_COUNT }, () => new Animated.Value(0.12)), []);
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const ripples = useMemo(() => Array.from({ length: RIPPLES }, () => new Animated.Value(1)), []);
  const appear = useRef(new Animated.Value(active ? 1 : 0)).current;
  const next = useRef(0);
  const angle = useRef(0);

  useEffect(() => {
    Animated.timing(appear, { toValue: active ? 1 : 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
    if (!active) {
      levelBus.reset();
      const b = Animated.loop(Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]));
      b.start();
      return () => b.stop();
    }
    breathe.setValue(0);
    return subscribeFrames((beat, dt) => {
      const lv = levelBus.level;
      glow.setValue(lv);
      for (let i = 0; i < BAND_COUNT; i++) bars[i].setValue(0.12 + levelBus.bands[i] * 1.6);
      angle.current = (angle.current + (8 + lv * 140) * dt) % 360;
      spin.setValue(angle.current);
      if (beat) {
        const r = ripples[next.current++ % RIPPLES];
        r.setValue(0);
        Animated.timing(r, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
      }
    });
  }, [active]);

  const barLen = size * 0.11;
  const ringR = size / 2 + size * 0.1;

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      {/* Beat ripples */}
      {ripples.map((r, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[st.abs, {
            width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: t.tintFill,
            opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }],
          }]}
        />
      ))}

      {/* Soft glow that swells with loudness */}
      <Animated.View
        pointerEvents="none"
        style={[st.abs, {
          width: size * 1.12, height: size * 1.12, borderRadius: size, backgroundColor: t.tintSoft,
          opacity: active ? glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] }),
          transform: [{ scale: active ? glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) : breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        }]}
      />

      {/* Spectrum ring: bars follow the sound and the ring turns faster when louder */}
      <Animated.View
        pointerEvents="none"
        style={[st.abs, { width: box, height: box, opacity: appear, transform: [{ rotate: spin.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }]}
      >
        {bars.map((b, i) => (
          <View key={i} style={[st.abs, { width: box, height: box, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${(i * 360) / BAND_COUNT}deg` }] }]}>
            <Animated.View
              style={{
                width: Math.max(3, size * 0.018), height: barLen, borderRadius: 3,
                backgroundColor: i % 2 ? t.tintFill : t.grad[2],
                opacity: b.interpolate({ inputRange: [0, 1.7], outputRange: [0.35, 1] }),
                transform: [{ translateY: -ringR - barLen / 2 }, { scaleY: b }],
              }}
            />
          </View>
        ))}
      </Animated.View>

      {/* The button */}
      <Pressable
        accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled}
        onPress={() => { feedback('medium'); onPress?.(); }}
        onPressIn={() => spring(press, 0.93, { stiffness: 380 }).start()}
        onPressOut={() => spring(press, 1).start()}
      >
        <Animated.View style={{ transform: [{ scale: press }, { scale: active ? glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) : 1 }] }}>
          <LinearGradient
            colors={disabled ? [t.fill, t.fill] : t.grad}
            start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}
            style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={[st.abs, { top: size * 0.05, width: size * 0.56, height: size * 0.22, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
            <Icon name={active ? 'waveform' : 'mic.fill'} size={size * 0.34} color="#FFFFFF" weight={2.2} />
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Five-bar waveform for the floating status capsule. */
export function MiniWave({ color, active, height = 18 }: { color: string; active: boolean; height?: number }) {
  const bars = useMemo(() => Array.from({ length: 5 }, () => new Animated.Value(0.25)), []);
  useEffect(() => {
    if (!active) { bars.forEach((b) => Animated.timing(b, { toValue: 0.25, duration: 250, useNativeDriver: NATIVE }).start()); return; }
    return subscribeFrames(() => {
      for (let i = 0; i < 5; i++) bars[i].setValue(0.2 + Math.min(1, levelBus.bands[(i * 9 + 3) % BAND_COUNT] * 1.4 + levelBus.level * 0.4) * 0.8);
    });
  }, [active]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height }} accessible={false}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={{ width: 3, height, borderRadius: 2, backgroundColor: color, transform: [{ scaleY: b }] }} />
      ))}
    </View>
  );
}

const st = StyleSheet.create({ abs: { position: 'absolute' } });
