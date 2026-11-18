import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, Text, View, StyleSheet, Platform, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import type { Corpus, EngineResponse } from '@shabad/core';
import { Button, Chip, Gurmukhi } from './components';
import { FONT, type Theme } from './theme';
import type { Strings, Lang } from './i18n';

type Open = Extract<EngineResponse, { status: 'resolved' | 'uncertain_line' }>;

export function Reader({ corpus, r, t, s, lang, scale, phase, detached, onDetach, onReturn, onAllMatches, onBack, onStop, onListen, heardText, showHeard }: {
  corpus: Corpus; r: Open; t: Theme; s: Strings; lang: Lang; scale: number; phase: string; detached: boolean;
  onDetach: (lineId: string | null) => void; onReturn: () => void; onAllMatches: (() => void) | null; onBack: () => void;
  onStop: () => void; onListen: () => void; heardText: string; showHeard: boolean;
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
  const live = r.status === 'resolved' && r.lineStatus === 'live' && phase === 'listening';
  const listening = phase === 'listening';

  const scrollTo = (lineId: string | null) => {
    if (!lineId) return;
    const y = ys.current.get(lineId);
    if (y === undefined) return;
    userIntent.current = 0;
    scroller.current?.scrollTo({ y: Math.max(0, y - 140), animated: true });
  };

  // Follow the live line unless the listener has scrolled away.
  useEffect(() => { if (!detached) scrollTo(current); }, [current, detached]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const moved = Math.abs(y - lastY.current) > 4;
    lastY.current = y;
    if (!moved || Date.now() - userIntent.current > 1200) return;
    let near: string | null = null;
    for (const [id, ly] of ys.current) if (ly <= y + 160 && (!near || ly > ys.current.get(near)!)) near = id;
    onDetach(near);
  };

  const src = r.source;
  const sourceName = lang === 'pa' ? src.sourcePa : src.sourceEn;
  const pageRef = `${lang === 'pa' ? src.pageNamePa : src.pageNameEn} ${src.page}`;
  const ref = `${sourceName} · ${pageRef}`;
  const size = Math.round(22 * scale);
  const status = !listening ? <Chip t={t} label={s.stopped} tone="muted" /> : live ? <Chip t={t} label={s.live} tone="live" /> : <Chip t={t} label={s.paused} tone="warn" />;

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.header, { borderColor: t.border, backgroundColor: t.surface }]}>
        <View style={st.headerRow}>
          <Button t={t} kind="quiet" label="‹" a11y={onAllMatches ? s.allMatches(r.candidates.length) : s.close} onPress={onBack} style={{ minWidth: 48, paddingHorizontal: 0 }} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[st.ref, { color: t.text }]} numberOfLines={1}>{sourceName}</Text>
            <Text style={[st.sub, { color: t.muted }]}>
              <Text style={{ fontFamily: FONT.uiBold, color: t.text }}>{pageRef}</Text>
              {' · '}{r.selectedBy === 'user' ? s.chosenByYou : s.openedAutomatically}
              {listening && !live ? ` · ${current ? s.pausedHint : s.notPlacedHint}` : ''}
            </Text>
          </View>
          {status}
        </View>
        <View style={[st.headerRow, { marginTop: 10, gap: 8 }]}>
          {onAllMatches && <Button t={t} kind="secondary" label={s.allMatches(r.candidates.length)} onPress={onAllMatches} style={{ flex: 1 }} />}
          {listening
            ? <Button t={t} kind="quiet" label={s.stop} onPress={onStop} style={{ flex: onAllMatches ? 0 : 1, minWidth: 96 }} />
            : <Button t={t} label={s.listen} onPress={onListen} style={{ flex: onAllMatches ? 0 : 1, minWidth: 96 }} />}
        </View>
        {showHeard && listening && !!heardText && <Text style={[st.heard, { color: t.muted }]} numberOfLines={1}>{heardText}</Text>}
      </View>

      <ScrollView ref={scroller} onScroll={onScroll} scrollEventThrottle={100}
        onScrollBeginDrag={markUser} onTouchStart={markUser} onTouchMove={markUser} {...({ onWheel: markUser } as object)} contentContainerStyle={st.body} accessibilityLabel={ref}>
        {lines.map((l) => {
          const isCur = l.id === current;
          const isPossible = possible.has(l.id);
          const heading = l.type === 1 || l.type === 2;
          return (
            <View
              key={l.id}
              onLayout={(e: LayoutChangeEvent) => ys.current.set(l.id, e.nativeEvent.layout.y)}
              accessibilityLabel={isCur ? `${live ? s.nowSung : s.maybeHere}: ${l.text}` : undefined}
              style={[
                st.line,
                isCur && { backgroundColor: live ? t.accentSoft : t.warnSoft, borderLeftColor: live ? t.accent : t.warn, borderLeftWidth: 6, borderStyle: live ? 'solid' : 'dashed' },
                !isCur && isPossible && { borderLeftColor: t.warn, borderLeftWidth: 3, borderStyle: 'dashed' },
              ]}
            >
              {isCur && <Text style={[st.marker, { color: live ? t.accent : t.warn }]} accessible={false}>{live ? '▶ ' + s.nowSung : '? ' + s.maybeHere}</Text>}
              {!isCur && isPossible && <Text style={[st.marker, { color: t.warn }]} accessible={false}>{'? ' + s.maybeHere}</Text>}
              <Gurmukhi t={t} size={heading ? Math.round(size * 0.72) : size} bold={isCur} style={heading ? { color: t.muted } : undefined}>{l.text}</Gurmukhi>
            </View>
          );
        })}
        <Text style={[st.foot, { color: t.muted }]}>{s.aboutBody}</Text>
      </ScrollView>

      {detached && current && (
        <View style={st.floating} pointerEvents="box-none">
          <Button t={t} label={`↓ ${s.returnToLive}`} onPress={() => { onReturn(); scrollTo(current); }} style={{ paddingHorizontal: 22, ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,.18)' } as object : { elevation: 4 }) }} />
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  ref: { fontFamily: FONT.uiBold, fontSize: 16 },
  sub: { fontFamily: FONT.ui, fontSize: 13, marginTop: 2 },
  heard: { fontFamily: FONT.gurmukhi, fontSize: 14, marginTop: 8 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140, maxWidth: 760, width: '100%', alignSelf: 'center' },
  line: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderLeftWidth: 0, borderLeftColor: 'transparent', marginBottom: 4 },
  marker: { fontFamily: FONT.uiBold, fontSize: 12, letterSpacing: 0.3, marginBottom: 2 },
  foot: { fontFamily: FONT.ui, fontSize: 12, marginTop: 28, lineHeight: 18 },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' },
});
