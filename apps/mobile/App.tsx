import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, Switch, Text, TextInput, View, StyleSheet, Modal } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NotoSansGurmukhi_400Regular } from '@expo-google-fonts/noto-sans-gurmukhi/400Regular';
import { NotoSansGurmukhi_700Bold } from '@expo-google-fonts/noto-sans-gurmukhi/700Bold';
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular';
import { NotoSans_600SemiBold } from '@expo-google-fonts/noto-sans/600SemiBold';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ListenController, LocalEngineClient, type Corpus, type ControllerState, type RecognitionAdapter } from '@shabad/core';
import { STRINGS, type Lang } from './src/i18n';
import { useTheme, FONT } from './src/theme';
import { Button } from './src/components';
import { Reader } from './src/Reader';
import { Matches } from './src/Matches';
import { SpeechAdapter, speechSupport } from './src/speech';
import { PracticeAdapter, TypedAdapter, type Scenario } from './src/practice';
import { fetchManifest, loadCorpus, type PackInfo } from './src/corpusLoader';

interface Settings { lang: Lang; scale: number; asrLang: 'pa-IN' | 'hi-IN'; sources: number[]; showHeard: boolean; consented: boolean }
const DEFAULTS: Settings = { lang: 'en', scale: 1, asrLang: 'pa-IN', sources: [1, 3, 5], showHeard: false, consented: false };
const KEY = 'shabad-live/settings@1';

type Mode = { kind: 'mic' } | { kind: 'practice'; scenario: Scenario } | { kind: 'typed' };

export default function App() {
  const [fontsLoaded] = useFonts({ NotoSansGurmukhi_400Regular, NotoSansGurmukhi_700Bold, NotoSans_400Regular, NotoSans_600SemiBold });
  const t = useTheme();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const s = STRINGS[settings.lang];

  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [corpusErr, setCorpusErr] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const ctl = useRef<ListenController | null>(null);
  const [cs, setCs] = useState<ControllerState | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setSettings({ ...DEFAULTS, ...JSON.parse(v) }); }).catch(() => {}).finally(() => setSettingsLoaded(true));
  }, []);
  const update = (p: Partial<Settings>) => setSettings((old) => {
    const next = { ...old, ...p };
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return next;
  });

  // Load the selected corpus. The whole selection is searched, never a subset.
  const sourcesKey = settings.sources.join(',');
  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;
    setCorpus(null); setCorpusErr(null);
    (async () => {
      try {
        const m = packs ?? await fetchManifest();
        if (!cancelled) setPacks(m);
        const c = await loadCorpus(settings.sources, m);
        if (!cancelled) setCorpus(c);
      } catch (e) {
        if (!cancelled) setCorpusErr(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [settingsLoaded, sourcesKey, loadKey]);

  const stop = useCallback(() => ctl.current?.stop(), []);

  // Capture stops when the app is backgrounded or the page is hidden or closed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active') stop(); });
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const vis = () => { if (document.visibilityState === 'hidden') stop(); };
      document.addEventListener('visibilitychange', vis);
      window.addEventListener('pagehide', stop);
      return () => { sub.remove(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', stop); };
    }
    return () => sub.remove();
  }, [stop]);

  const begin = async (m: Mode, keepShabad?: string) => {
    if (!corpus) return;
    ctl.current?.stop();
    setNotice(null);
    let adapter: RecognitionAdapter;
    if (m.kind === 'practice') adapter = new PracticeAdapter(corpus, m.scenario);
    else if (m.kind === 'typed') adapter = new TypedAdapter();
    else {
      const sup = speechSupport();
      if (sup !== 'available') { setNotice(sup === 'needs_build' ? s.nativeNeedsBuild : s.speechUnavailable); return; }
      adapter = new SpeechAdapter(settings.asrLang);
    }
    const c = new ListenController(adapter, new LocalEngineClient(corpus));
    ctl.current = c;
    setMode(m);
    c.subscribe((st) => {
      if (ctl.current !== c) return; // a later session replaced this one
      setCs(st);
      if (st.error) {
        setNotice(st.error === 'mic_denied' ? s.micDenied : st.error === 'lang_unsupported' ? s.langUnsupported : st.error === 'speech_unavailable' ? s.speechUnavailable : st.error === 'needs_build' ? s.nativeNeedsBuild : st.error);
        if (st.phase === 'listening' && (st.error === 'mic_denied' || st.error === 'lang_unsupported')) c.stop();
      }
    });
    await c.start();
    // Listening again with a shabad open continues following that shabad.
    if (keepShabad && c.snapshot.phase === 'listening') await c.select(keepShabad);
  };

  const listen = () => {
    if (!settings.consented) { setShowConsent(true); return; }
    begin({ kind: 'mic' });
  };

  const goHome = () => { ctl.current?.stop(); ctl.current = null; setCs(null); setMode(null); };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const r = cs?.response ?? null;
  const listening = cs?.phase === 'listening';
  const open = r && (r.status === 'resolved' || r.status === 'uncertain_line') ? r : null;
  const showHeard = settings.showHeard || mode?.kind === 'typed';

  let body: React.ReactNode;
  if (open && corpus) {
    body = (
      <Reader
        corpus={corpus} r={open} t={t} s={s} lang={settings.lang} scale={settings.scale} phase={cs!.phase}
        detached={cs!.detached}
        onDetach={(id) => ctl.current?.setReadingPosition(id, true)}
        onReturn={() => ctl.current?.returnToLive()}
        onAllMatches={open.candidates.length > 1 && listening ? () => ctl.current?.clearSelection() : null}
        onBack={() => (open.candidates.length > 1 && listening ? ctl.current?.clearSelection() : goHome())}
        onStop={stop}
        onListen={() => {
          if (mode?.kind === 'mic' || !mode) { if (settings.consented) begin({ kind: 'mic' }, open.shabadId); else setShowConsent(true); }
          else begin(mode, open.shabadId);
        }}
        heardText={cs!.heardText} showHeard={showHeard}
      />
    );
  } else if (r?.status === 'ambiguous') {
    body = <Matches r={r} t={t} s={s} lang={settings.lang} scale={settings.scale} onSelect={(id) => ctl.current?.select(id)} onStop={stop} listening={listening} heardText={cs!.heardText} showHeard={showHeard} />;
  } else if (cs && cs.phase !== 'idle') {
    body = (
      <View style={st.center}>
        <View style={[st.pulse, { borderColor: listening ? t.accent : t.border, backgroundColor: t.accentSoft }]} accessibilityLabel={listening ? s.listening : s.stopped}>
          <Text style={[st.pulseText, { color: t.accent }]}>{listening ? '◉' : '■'}</Text>
        </View>
        <Text style={[st.h2, { color: t.text }]} accessibilityLiveRegion="polite">{listening ? (r?.status === 'no_match' ? s.noMatch : s.listening) : s.stopped}</Text>
        {listening && <Text style={[st.p, { color: t.muted, textAlign: 'center', maxWidth: 420 }]}>{mode?.kind === 'practice' ? s.practiceHint : s.listeningHint}</Text>}
        {showHeard && !!cs.heardText && <Text style={[st.heard, { color: t.muted }]}>{cs.heardText}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          {listening ? <Button t={t} kind="quiet" label={s.stopListening} onPress={stop} /> : <Button t={t} kind="quiet" label={s.close} onPress={goHome} />}
        </View>
      </View>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={st.home}>
        <Text style={[st.h1, { color: t.text }]}>{s.appName}</Text>
        <Text style={[st.p, { color: t.muted, marginTop: 2 }]}>{s.tagline}</Text>
        <Pressable
          accessibilityRole="button" accessibilityLabel={s.listen} disabled={!corpus} onPress={listen}
          style={({ pressed }) => [st.bigBtn, { backgroundColor: corpus ? t.accent : t.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[st.bigGlyph, { color: t.onAccent }]}>◉</Text>
          <Text style={[st.bigLabel, { color: t.onAccent }]}>{s.listen}</Text>
        </Pressable>
        <Text style={[st.p, { color: corpusErr ? t.danger : t.muted, textAlign: 'center' }]} accessibilityLiveRegion="polite">
          {corpusErr ? s.corpusError : corpus ? s.corpusReady(corpus.shabads.size) : s.loadingCorpus}
        </Text>
        {corpusErr && <Button t={t} kind="secondary" label={s.retry} onPress={() => setLoadKey((k) => k + 1)} style={{ alignSelf: 'center', marginTop: 8 }} />}

        <View style={[st.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[st.h3, { color: t.text, marginTop: 0 }]}>{s.practice}</Text>
          <Text style={[st.p, { color: t.muted, marginTop: 0 }]}>{s.practiceHint}</Text>
          {([1, 2, 3, 4] as Scenario[]).map((n) => (
            <Button key={n} t={t} kind="secondary" disabled={!corpus} label={`${n}. ${s[`scenario${n}` as 'scenario1']}`} onPress={() => begin({ kind: 'practice', scenario: n })} style={{ marginTop: 8, alignItems: 'flex-start' }} />
          ))}
          <Button t={t} kind="quiet" disabled={!corpus} label={s.typeHeard} onPress={() => begin({ kind: 'typed' })} style={{ marginTop: 8 }} />
        </View>
        <Text style={[st.small, { color: t.muted }]}>{s.phase} · {s.aboutBody}</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        <View style={[st.bar, { borderColor: t.border }]}>
          <Text style={[st.barTitle, { color: t.text }]} numberOfLines={1} onPress={goHome} accessibilityRole="header">{s.appName}</Text>
          {mode?.kind === 'practice' && <Text style={[st.tag, { color: t.warn, backgroundColor: t.warnSoft }]}>{s.practiceTag}</Text>}
          <Button t={t} kind="quiet" label={settings.lang === 'en' ? 'ਪੰਜਾਬੀ' : 'English'} a11y={s.language} onPress={() => update({ lang: settings.lang === 'en' ? 'pa' : 'en' })} style={{ minHeight: 40, paddingHorizontal: 12 }} />
          <Button t={t} kind="quiet" label="⚙" a11y={s.settings} onPress={() => setShowSettings(true)} style={{ minHeight: 40, minWidth: 44, paddingHorizontal: 0 }} />
        </View>
        {notice && (
          <Pressable onPress={() => setNotice(null)} style={[st.notice, { backgroundColor: t.warnSoft }]} accessibilityRole="alert">
            <Text style={[st.p, { color: t.text, marginTop: 0 }]}>{notice}</Text>
          </Pressable>
        )}
        {mode?.kind === 'typed' && listening && (
          <View style={[st.typed, { borderColor: t.border, backgroundColor: t.surface }]}>
            <TextInput
              value={typed} onChangeText={setTyped} placeholder={s.typeHeard} placeholderTextColor={t.muted}
              onSubmitEditing={() => { ctl.current?.injectText(typed); setTyped(''); }}
              style={[st.input, { color: t.text, borderColor: t.border, fontFamily: FONT.gurmukhi }]} accessibilityLabel={s.typeHeard}
            />
            <Button t={t} label={s.send} onPress={() => { ctl.current?.injectText(typed); setTyped(''); }} />
          </View>
        )}
        <View style={{ flex: 1 }}>{body}</View>

        <Modal visible={showConsent} transparent animationType="fade" onRequestClose={() => setShowConsent(false)}>
          <View style={st.scrim}>
            <View style={[st.sheet, { backgroundColor: t.surface }]} accessibilityViewIsModal>
              <Text style={[st.h2, { color: t.text, marginTop: 0 }]}>{s.consentTitle}</Text>
              {s.consentBody.map((p, i) => <Text key={i} style={[st.p, { color: t.text }]}>{p}</Text>)}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <Button t={t} kind="quiet" label={s.consentNotNow} onPress={() => setShowConsent(false)} style={{ flex: 1 }} />
                <Button t={t} label={s.consentAllow} onPress={() => { update({ consented: true }); setShowConsent(false); begin({ kind: 'mic' }, open?.shabadId); }} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showSettings} animationType="slide" onRequestClose={() => setShowSettings(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
            <ScrollView contentContainerStyle={st.home}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[st.h2, { color: t.text, marginTop: 0 }]}>{s.settings}</Text>
                <Button t={t} kind="quiet" label={s.close} onPress={() => setShowSettings(false)} />
              </View>
              <Text style={[st.h3, { color: t.text }]}>{s.language}</Text>
              <Segmented t={t} value={settings.lang} options={[['en', 'English'], ['pa', 'ਪੰਜਾਬੀ']]} onChange={(v) => update({ lang: v as Lang })} />
              <Text style={[st.h3, { color: t.text }]}>{s.textSize}</Text>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Button t={t} kind="secondary" label="A−" a11y="Smaller text" onPress={() => update({ scale: Math.max(0.8, +(settings.scale - 0.1).toFixed(2)) })} />
                <Text style={{ fontFamily: FONT.gurmukhi, fontSize: 22 * settings.scale, lineHeight: 40 * settings.scale, color: t.text, flex: 1, textAlign: 'center' }}>ਸਤਿ ਨਾਮੁ</Text>
                <Button t={t} kind="secondary" label="A+" a11y="Larger text" onPress={() => update({ scale: Math.min(1.8, +(settings.scale + 0.1).toFixed(2)) })} />
              </View>
              <Text style={[st.h3, { color: t.text }]}>{s.recognition}</Text>
              <Segmented t={t} value={settings.asrLang} options={[['pa-IN', s.recognitionPa], ['hi-IN', s.recognitionHi]]} onChange={(v) => update({ asrLang: v as Settings['asrLang'] })} vertical />
              <Text style={[st.h3, { color: t.text }]}>{s.sources}</Text>
              {(packs ?? []).map((p) => (
                <View key={p.sourceId} style={st.toggleRow}>
                  <Text style={[st.p, { color: t.text, flex: 1, marginTop: 0 }]}>{settings.lang === 'pa' ? p.namePa : p.nameEn} <Text style={{ color: t.muted }}>({p.shabads.toLocaleString()})</Text></Text>
                  <Switch
                    value={settings.sources.includes(p.sourceId)} disabled={p.sourceId === 1}
                    accessibilityLabel={p.nameEn}
                    onValueChange={(on) => update({ sources: on ? [...settings.sources, p.sourceId].sort((a, b) => a - b) : settings.sources.filter((x) => x !== p.sourceId) })}
                  />
                </View>
              ))}
              <View style={st.toggleRow}>
                <Text style={[st.p, { color: t.text, flex: 1, marginTop: 0 }]}>{s.showHeard}</Text>
                <Switch value={settings.showHeard} onValueChange={(v) => update({ showHeard: v })} accessibilityLabel={s.showHeard} />
              </View>
              <Text style={[st.h3, { color: t.text }]}>{s.about}</Text>
              <Text style={[st.p, { color: t.muted, marginTop: 0 }]}>{s.aboutBody}</Text>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Segmented({ t, value, options, onChange, vertical }: { t: ReturnType<typeof useTheme>; value: string; options: [string, string][]; onChange: (v: string) => void; vertical?: boolean }) {
  return (
    <View style={{ flexDirection: vertical ? 'column' : 'row', gap: 8 }} accessibilityRole="radiogroup">
      {options.map(([v, label]) => (
        <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: v === value }} onPress={() => onChange(v)}
          style={[st.seg, { borderColor: v === value ? t.accent : t.border, backgroundColor: v === value ? t.accentSoft : t.surface, flex: vertical ? undefined : 1 }]}>
          <Text style={{ fontFamily: FONT.uiBold, color: v === value ? t.accent : t.text, fontSize: 15 }}>{v === value ? '✓ ' : ''}{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  barTitle: { fontFamily: FONT.uiBold, fontSize: 17, flex: 1 },
  tag: { fontFamily: FONT.uiBold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  home: { padding: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  h1: { fontFamily: FONT.uiBold, fontSize: 28, marginTop: 8 },
  h2: { fontFamily: FONT.uiBold, fontSize: 22, marginTop: 16 },
  h3: { fontFamily: FONT.uiBold, fontSize: 16, marginTop: 20, marginBottom: 8 },
  p: { fontFamily: FONT.ui, fontSize: 15, lineHeight: 22, marginTop: 8 },
  small: { fontFamily: FONT.ui, fontSize: 12, lineHeight: 18, marginTop: 24 },
  heard: { fontFamily: FONT.gurmukhi, fontSize: 16, marginTop: 12, textAlign: 'center' },
  bigBtn: { width: 176, height: 176, borderRadius: 88, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: 28, marginBottom: 14 },
  bigGlyph: { fontSize: 40 },
  bigLabel: { fontFamily: FONT.uiBold, fontSize: 22, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  pulse: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  pulseText: { fontSize: 40 },
  notice: { paddingHorizontal: 16, paddingVertical: 10 },
  typed: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 17, minHeight: 48 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 16, padding: 20, maxWidth: 560, width: '100%', alignSelf: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  seg: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
});
