import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

export const NATIVE = Platform.OS !== 'web';

/** iOS-like spring used across the app. */
export const spring = (v: Animated.Value, toValue: number, extra: Partial<Animated.SpringAnimationConfig> = {}) =>
  Animated.spring(v, { toValue, useNativeDriver: NATIVE, damping: 18, stiffness: 220, mass: 0.9, ...extra });

/** Fades and lifts its children in on mount. */
export function FadeIn({ children, delay = 0, from = 12, style, duration = 380 }: { children: React.ReactNode; delay?: number; from?: number; style?: StyleProp<ViewStyle>; duration?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: NATIVE }).start();
  }, []);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Pressable that shrinks slightly while pressed, like iOS controls. */
export function ScalePress({ children, style, scaleTo = 0.96, haptic, onPress, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: 'light' | 'medium' | 'select' }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      {...rest}
      onPress={(e) => { if (haptic) feedback(haptic); onPress?.(e); }}
      onPressIn={(e) => { spring(s, scaleTo, { stiffness: 400 }).start(); rest.onPressIn?.(e); }}
      onPressOut={(e) => { spring(s, 1, { stiffness: 300 }).start(); rest.onPressOut?.(e); }}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children as React.ReactNode}</Animated.View>
    </Pressable>
  );
}

export function feedback(kind: 'light' | 'medium' | 'select' | 'success' | 'warning') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'select') Haptics.selectionAsync();
    else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  } catch { /* no haptics */ }
}

/** A looping 0→1 value, e.g. for a pulsing live dot. */
export function useLoop(duration: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE }));
    a.start();
    return () => a.stop();
  }, [duration]);
  return v;
}
