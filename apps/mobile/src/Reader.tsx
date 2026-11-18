import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, ScrollView, Text, View, StyleSheet, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import type { Corpus, EngineResponse, Line } from '@shabad/core';
import { Gurmukhi, Pill, Rise } from './components';
import { FadeIn, ScalePress, spring } from './anim';
import { Icon } from './icons';
import { TYPE, FONT, shadow, type Theme } from './theme';
import type { Strings, Lang } from './i18n';

type Open = Extract<EngineResponse, { status: 'resolved' | 'uncertain_line' }>;

export function Reader({ corpus, r, t, s, lang, scale, phase, detached, onDetach, onReturn, bottomInset }: {
  corpus: Corpus; r: Open; t: Theme; s: Strings; lang: Lang; scale: number; phase: string; detached: boolean;
  onDetach: (lineId: string | null) => void; onReturn: () => void; bottomInset: number;
}) {
  const lines = useMemo(() => corpus.shabadLines(r.shabadId), [corpus, r.shabadId]);
  const ys = useRef(new Map<string, number>());
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const lastY = useRef(0);
  // Only a listener's own touch, drag or wheel detaches the view from the live line;
  // the app's automatic scrolling and layout changes never do.
  const userIntent = useRef(0);
  const markUser = () => { userIntent.current = Date.now(); };

  const current = r.status === 'resolved' ? r.currentLineId : r.lastLineId;
  const possible = new Set(r.status === 'uncertain_line' ? r.possibleLineIds : []);
  const listening = phase === 'listening';
  const live = r.status === 'resolved' && r.lineStatus === 'live' && listening;

  const scrollTo = (lineId: string | null) => {
    if (!lineId) return;
    const y = ys.current.get(lineId);
    if (y === undefined) return;
    userIntent.current = 0;
    scroller.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
  };
  useEffect(() => { if (!detached) scrollTo(current); }, [current, detached]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const moved = Math.abs(y - lastY.current) > 4;
    lastY.current = y;
    if (!moved || Date.now() - userIntent.current > 1200) return;
    let near: string | null = null;
    for (const [id, ly] of ys.current) if (ly <= y + 180 && (!near || ly > ys.current.get(near)!)) near = id;
    onDetach(near);
  };

  const src = r.source;
  const sourceName = lang === 'pa' ? src.sourcePa : src.sourceEn;
  const pageRef = `${lang === 'pa' ? src.pageNamePa : src.pageNameEn} ${src.page}`;
  const size = Math.round(22 * scale);
  const paperY = useRef(0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scroller} onScroll={onScroll} scrollEventThrottle={64}
        onScrollBeginDrag={markUser} onTouchStart={markUser} onTouchMove={markUser} {...({ onWheel: markUser } as object)}
        contentContainerStyle={[st.body, { paddingBottom: bottomInset + 150 }]}
        accessibilityLabel={`${sourceName} ${pageRef}`}
      >
        <FadeIn>
          <Text style={[TYPE.largeTitle, { color: t.label }]} accessibilityRole="header">{pageRef}</Text>
          <Text style={[TYPE.subhead, { color: t.label2, marginTop: 2 }]}>{sourceName}</Text>
          <View style={st.metaRow}>
            {!listening ? <Pill t={t} label={s.stopped} tone="muted" /> : live ? <Pill t={t} label={s.live} tone="live" pulse /> : <Pill t={t} label={s.paused} tone="paused" />}
            <Pill t={t} label={r.selectedBy === 'user' ? s.chosenByYou : s.openedAutomatically} tone="tint" />
          </View>
          {listening && !live && <Text style={[TYPE.footnote, { color: t.label2, marginTop: 8 }]}>{current ? s.pausedHint : s.notPlacedHint}</Text>}
        </FadeIn>

        <View onLayout={(e) => { paperY.current = e.nativeEvent.layout.y; }} style={[st.paper, { backgroundColor: t.card }, shadow(t, 2, 12)]}>
          {lines.map((l) => (
            <LineRow
              key={l.id} l={l} t={t} s={s} size={size}
              state={l.id === current ? (live ? 'live' : 'held') : possible.has(l.id) ? 'possible' : 'none'}
              // Line positions are relative to the card; add the card's offset for scrolling.
              onLayout={(e) => ys.current.set(l.id, paperY.current + e.nativeEvent.layout.y)}
            />
          ))}
        </View>
        <Text style={[TYPE.caption, { color: t.label3, marginTop: 18, marginHorizontal: 4 }]}>{s.aboutBody}</Text>
      </ScrollView>

      <Rise visible={detached && !!current} style={[st.floating, { bottom: bottomInset + 92 }]}>
        <ScalePress onPress={() => { onReturn(); scrollTo(current); }} haptic="light" accessibilityRole="button" accessibilityLabel={s.returnToLive}
          style={[st.returnBtn, { backgroundColor: t.tintFill }, shadow(t, 6, 18)]}>
          <Icon name="arrow.down" size={16} color="#FFFFFF" weight={2.5} />
          <Text style={[TYPE.subhead, { color: '#FFFFFF', fontWeight: '600', marginLeft: 6 }]}>{s.returnToLive}</Text>
        </ScalePress>
      </Rise>
    </View>
  );
}

function LineRow({ l, t, s, size, state, onLayout }: {
  l: Line; t: Theme; s: Strings; size: number; state: 'live' | 'held' | 'possible' | 'none'; onLayout: (e: LayoutChangeEvent) => void;
}) {
  const on = state === 'live' || state === 'held';
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { spring(v, on ? 1 : 0, { stiffness: 200, damping: 22 }).start(); }, [on]);
  const heading = l.type === 1 || l.type === 2;
  const accent = state === 'live' ? t.tintFill : t.amber;
  const onAccent = state === 'live' || !t.dark ? '#FFFFFF' : '#000000';

  return (
    <View onLayout={onLayout} accessibilityLabel={on ? `${state === 'live' ? s.nowSung : s.maybeHere}: ${l.text}` : undefined} style={st.line}>
      {/* Highlight that glides in when this becomes the current line. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.hl, {
        backgroundColor: state === 'live' ? t.tintSoft : t.amberSoft, opacity: v,
        transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }]} />
      <Animated.View pointerEvents="none" style={[st.bar, { backgroundColor: accent, opacity: v, transform: [{ scaleY: v }] }]} />
      {state === 'possible' && <View pointerEvents="none" style={[st.bar, { backgroundColor: 'transparent', borderLeftWidth: 3, borderColor: t.amber, borderStyle: 'dashed' }]} />}

      {on && (
        <Animated.View style={[st.tag, { backgroundColor: accent, opacity: v }]}>
          <Icon name={state === 'live' ? 'waveform' : 'pause'} size={11} color={onAccent} weight={2.6} />
          <Text style={[st.tagText, { color: onAccent }]}>{state === 'live' ? s.nowShort : s.maybeHere}</Text>
        </Animated.View>
      )}
      {state === 'possible' && <Text style={[TYPE.caption, { color: t.amber, fontWeight: '600', marginBottom: 2 }]}>? {s.maybeHere}</Text>}
      <Gurmukhi t={t} size={heading ? Math.round(size * 0.7) : size} bold={on} style={heading ? { color: t.label2 } : undefined}>{l.text}</Gurmukhi>
    </View>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, maxWidth: 760, width: '100%', alignSelf: 'center' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  paper: { borderRadius: 18, paddingVertical: 10, paddingHorizontal: 8, marginTop: 18 },
  line: { paddingVertical: 10, paddingLeft: 16, paddingRight: 12, marginVertical: 1 },
  hl: { borderRadius: 12 },
  bar: { position: 'absolute', left: 4, top: 10, bottom: 10, width: 4, borderRadius: 2 },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 7, height: 20, borderRadius: 10, marginBottom: 4, gap: 4 },
  tagText: { fontFamily: FONT.ui, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  floating: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  returnBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, height: 40, borderRadius: 20 },
});
