import React from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import type { Candidate, EngineResponse } from '@shabad/core';
import { Button, Gurmukhi } from './components';
import { FONT, type Theme } from './theme';
import type { Strings, Lang } from './i18n';

type Amb = Extract<EngineResponse, { status: 'ambiguous' }>;

export function Matches({ r, t, s, lang, scale, onSelect, onStop, listening, heardText, showHeard }: {
  r: Amb; t: Theme; s: Strings; lang: Lang; scale: number; onSelect: (id: string) => void; onStop: () => void;
  listening: boolean; heardText: string; showHeard: boolean;
}) {
  const exact = r.candidates.filter((c) => c.match === 'exact');
  const similar = r.candidates.filter((c) => c.match === 'sound_alike');
  type Row = { kind: 'head'; label: string } | { kind: 'c'; c: Candidate };
  const rows: Row[] = [
    ...exact.map((c) => ({ kind: 'c' as const, c })),
    ...(similar.length ? [{ kind: 'head' as const, label: s.similarHeading }, ...similar.map((c) => ({ kind: 'c' as const, c }))] : []),
  ];
  const ref = (c: Candidate) => `${lang === 'pa' ? c.source.sourcePa : c.source.sourceEn} · ${lang === 'pa' ? c.source.pageNamePa : c.source.pageNameEn} ${c.source.page}`;

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.top, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[st.label, { color: t.muted }]}>{s.heard}</Text>
        <Gurmukhi t={t} size={Math.round(24 * scale)} bold a11y={`${s.heard}: ${r.heard.text}`}>{r.heard.text}</Gurmukhi>
        <Text style={[st.count, { color: t.text }]}>{s.inShabads(exact.length)}</Text>
        <Text style={[st.hint, { color: t.muted }]}>{s.chooseHint}</Text>
        {showHeard && listening && !!heardText && <Text style={[st.hint, { color: t.muted, fontFamily: FONT.gurmukhi }]} numberOfLines={1}>{heardText}</Text>}
        {listening && <Button t={t} kind="quiet" label={s.stopListening} onPress={onStop} style={{ marginTop: 10 }} />}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(x, i) => (x.kind === 'c' ? x.c.shabadId : `h${i}`)}
        contentContainerStyle={st.list}
        renderItem={({ item }) =>
          item.kind === 'head' ? (
            <Text style={[st.section, { color: t.muted }]} accessibilityRole="header">{item.label}</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.c.match === 'exact' ? s.sameLine : s.soundsSimilar}. ${ref(item.c)}. ${item.c.distinguishingLine.text}`}
              onPress={() => onSelect(item.c.shabadId)}
              style={({ pressed }) => [st.row, { backgroundColor: t.surface, borderColor: item.c.match === 'exact' ? t.border : t.warn, borderStyle: item.c.match === 'exact' ? 'solid' : 'dashed', opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={st.rowHead}>
                <Text style={[st.badge, { color: item.c.match === 'exact' ? t.live : t.warn }]}>{item.c.match === 'exact' ? `= ${s.sameLine}` : `≈ ${s.soundsSimilar}`}</Text>
                <Text style={[st.ref, { color: t.muted }]}>{ref(item.c)}</Text>
              </View>
              <Gurmukhi t={t} size={Math.round(19 * scale)}>{item.c.distinguishingLine.text}</Gurmukhi>
              <Text style={[st.open, { color: t.accent }]}>›</Text>
            </Pressable>
          )
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  top: { padding: 16, borderBottomWidth: 1 },
  label: { fontFamily: FONT.uiBold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
  count: { fontFamily: FONT.uiBold, fontSize: 16, marginTop: 6 },
  hint: { fontFamily: FONT.ui, fontSize: 14, marginTop: 4, lineHeight: 20 },
  list: { padding: 16, gap: 10, maxWidth: 760, width: '100%', alignSelf: 'center' },
  section: { fontFamily: FONT.uiBold, fontSize: 13, marginTop: 14, marginBottom: 2 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14, paddingRight: 34 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badge: { fontFamily: FONT.uiBold, fontSize: 13 },
  ref: { fontFamily: FONT.ui, fontSize: 13 },
  open: { position: 'absolute', right: 14, top: '50%', fontSize: 24, fontFamily: FONT.uiBold },
});
