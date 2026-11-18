import React from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable } from 'react-native';
import type { Candidate, EngineResponse } from '@shabad/core';
import { Gurmukhi } from './components';
import { FadeIn, feedback } from './anim';
import { Icon } from './icons';
import { MiniWave } from './Visualizer';
import { TYPE, shadow, type Theme } from './theme';
import type { Strings, Lang } from './i18n';

type Amb = Extract<EngineResponse, { status: 'ambiguous' }>;

export function Matches({ r, t, s, lang, scale, onSelect, listening, heardText, showHeard, bottomInset }: {
  r: Amb; t: Theme; s: Strings; lang: Lang; scale: number; onSelect: (id: string) => void;
  listening: boolean; heardText: string; showHeard: boolean; bottomInset: number;
}) {
  const exact = r.candidates.filter((c) => c.match === 'exact');
  const similar = r.candidates.filter((c) => c.match === 'sound_alike');
  const ref = (c: Candidate) => `${lang === 'pa' ? c.source.sourcePa : c.source.sourceEn} · ${lang === 'pa' ? c.source.pageNamePa : c.source.pageNameEn} ${c.source.page}`;

  const row = (c: Candidate, i: number, last: boolean) => (
    <FadeIn key={c.shabadId} delay={80 + i * 45} from={8}>
      <Pressable
        onPress={() => { feedback('select'); onSelect(c.shabadId); }}
        accessibilityRole="button"
        accessibilityLabel={`${c.match === 'exact' ? s.sameLine : s.soundsSimilar}. ${ref(c)}. ${c.distinguishingLine.text}`}
        style={({ pressed }) => [st.row, { backgroundColor: pressed ? t.fill2 : 'transparent' }]}
      >
        <View style={[st.badge, { backgroundColor: c.match === 'exact' ? t.greenSoft : t.amberSoft }]}>
          <Icon name={c.match === 'exact' ? 'equal' : 'approx'} size={16} color={c.match === 'exact' ? t.green : t.amber} weight={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Gurmukhi t={t} size={Math.round(18 * scale)}>{c.distinguishingLine.text}</Gurmukhi>
          <Text style={[TYPE.footnote, { color: t.label2, marginTop: 1 }]}>{ref(c)}</Text>
        </View>
        <Icon name="chevron.right" size={15} color={t.label3} weight={2.6} />
      </Pressable>
      {!last && <View style={[st.sep, { backgroundColor: t.separator }]} />}
    </FadeIn>
  );

  return (
    <ScrollView contentContainerStyle={[st.wrap, { paddingBottom: bottomInset + 110 }]}>
      <FadeIn>
        <Text style={[TYPE.largeTitle, { color: t.label, marginTop: 4 }]} accessibilityRole="header">{s.matches}</Text>
      </FadeIn>

      <FadeIn delay={40}>
        <View style={[st.heard, { backgroundColor: t.card }, shadow(t, 4, 18)]}>
          <View style={st.heardHead}>
            <Text style={[TYPE.sectionHeader, { color: t.tint, fontWeight: '600' }]}>{s.heard}</Text>
            {listening && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MiniWave color={t.tintFill} active height={14} />
                <Text style={[TYPE.footnote, { color: t.label2 }]}>{s.listening}</Text>
              </View>
            )}
          </View>
          <Gurmukhi t={t} size={Math.round(24 * scale)} bold a11y={`${s.heard}: ${r.heard.text}`}>{r.heard.text}</Gurmukhi>
          <Text style={[TYPE.subhead, { color: t.label2, marginTop: 6 }]}>{s.chooseHint}</Text>
          {showHeard && !!heardText && <Text style={[TYPE.footnote, { color: t.label3, marginTop: 6 }]} numberOfLines={1}>{heardText}</Text>}
        </View>
      </FadeIn>

      <Text style={[TYPE.sectionHeader, st.section, { color: t.label2 }]} accessibilityRole="header">{s.sameLineSection(exact.length)}</Text>
      <View style={[st.group, { backgroundColor: t.card }]}>{exact.map((c, i) => row(c, i, i === exact.length - 1))}</View>

      {similar.length > 0 && (
        <>
          <Text style={[TYPE.sectionHeader, st.section, { color: t.label2 }]} accessibilityRole="header">{s.similarHeading}</Text>
          <View style={[st.group, { backgroundColor: t.card }]}>{similar.map((c, i) => row(c, exact.length + i, i === similar.length - 1))}</View>
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 8, maxWidth: 720, width: '100%', alignSelf: 'center' },
  heard: { borderRadius: 18, padding: 16, marginTop: 14 },
  heardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  section: { marginLeft: 16, marginTop: 26, marginBottom: 7 },
  group: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 14, paddingRight: 14, gap: 12 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
});
