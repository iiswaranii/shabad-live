import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NotoSansGurmukhi_400Regular } from '@expo-google-fonts/noto-sans-gurmukhi/400Regular';
import { NotoSansGurmukhi_700Bold } from '@expo-google-fonts/noto-sans-gurmukhi/700Bold';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ListenController, LocalEngineClient, type Corpus, type ControllerState, type RecognitionAdapter } from '@shabad/core';
import { STRINGS, type Lang, type Strings } from './src/i18n';
import { useTheme, FONT, TYPE, shadow, type Theme } from './src/theme';
import { BackButton, BigButton, Glass, Group, NavIcon, Notice, Rise, Row, Segmented } from './src/components';
import { FadeIn, NATIVE, ScalePress, feedback, spring } from './src/anim';
import { Icon } from './src/icons';
import { Orb, MiniWave } from './src/Visualizer';
import { Reader } from './src/Reader';
import { Matches } from './src/Matches';
import { SpeechAdapter, speechSupport, isIOS, isStandalone } from './src/speech';
import { primeMeter, attachMeter, detachMeter, meterConflictSuspected } from './src/meter';
import { levelBus } from './src/level';
import { PracticeAdapter, TypedAdapter, type Scenario } from './src/practice';
import { fetchManifest, loadCorpus, type PackInfo } from './src/corpusLoader';
import { KirtanModelAdapter, kirtanModelSupported, onModelStatus, checkKirtanServer, type ModelStatus } from './src/kirtanModel';
import { startVocalCapture, type VocalCapture } from './src/vocal';

/** 'kirtan' = kirtan model on a server (recommended for singing); 'kirtan-device' = in the browser (experimental, slow). */
type Engine = 'phone' | 'kirtan' | 'kirtan-device';
interface Settings { lang: Lang; scale: number; asrLang: 'pa-IN' | 'hi-IN'; sources: number[]; showHeard: boolean; consented: boolean; engine: Engine; vocalFocus: boolean; serverUrl: string }
const DEFAULTS: Settings = { lang: 'en', scale: 1, asrLang: 'pa-IN', sources: [1, 3, 5], showHeard: false, consented: false, engine: 'phone', vocalFocus: true, serverUrl: '' };
const KEY = 'shabad-live/settings@1';

type Mode = { kind: 'mic' } | { kind: 'practice'; scenario: Scenario } | { kind: 'typed' };

export default function App() {
  return <SafeAreaProvider><Main /></SafeAreaProvider>;
}

function Main() {
  const [fontsLoaded] = useFonts({ NotoSansGurmukhi_400Regular, NotoSansGurmukhi_700Bold });
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const s = STRINGS[settings.lang];

  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [corpusErr, setCorpusErr] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  const ctl = useRef<ListenController | null>(null);
  const adapterRef = useRef<RecognitionAdapter | null>(null);
  const [cs, setCs] = useState<ControllerState | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [typed, setTyped] = useState('');
  const pendingKeep = useRef<string | undefined>(undefined);
  const vocalRef = useRef<VocalCapture | null>(null);
  const [model, setModel] = useState<ModelStatus>({ phase: 'idle' });
  const [chunkMs, setChunkMs] = useState<number | null>(null);
  useEffect(() => onModelStatus(setModel), []);

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

  const stop = useCallback(() => { ctl.current?.stop(); detachMeter(); vocalRef.current?.stop(); vocalRef.current = null; }, []);

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

  // Gentle success haptic when a shabad opens by itself.
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    const st = cs?.response?.status ?? null;
    if (st === 'resolved' && prevStatus.current === 'ambiguous') feedback('success');
    if (st === 'resolved' && prevStatus.current !== 'resolved' && prevStatus.current !== 'uncertain_line') feedback('success');
    prevStatus.current = st;
  }, [cs?.response?.status]);

  // Must stay synchronous up to adapter.start(): mobile Safari only starts speech recognition inside the tap.
  const begin = (m: Mode, keepShabad?: string) => {
    if (!corpus) return;
    ctl.current?.stop();
    detachMeter();
    vocalRef.current?.stop(); vocalRef.current = null;
    setNotice(null);
    let adapter: RecognitionAdapter;
    let vocalFirst = false;
    if (m.kind === 'practice') adapter = new PracticeAdapter(corpus, m.scenario);
    else if (m.kind === 'typed') adapter = new TypedAdapter();
    else if (settings.engine === 'kirtan' && kirtanModelSupported()) {
      if (!settings.serverUrl.trim()) { setNotice('needs_server'); return; }
      const ka = new KirtanModelAdapter({ kind: 'server', url: settings.serverUrl.trim() }); // captures vocal-filtered audio itself
      ka.onTiming = setChunkMs;
      adapter = ka;
    } else if (settings.engine === 'kirtan-device' && kirtanModelSupported()) {
      const ka = new KirtanModelAdapter({ kind: 'device' });
      ka.onTiming = setChunkMs;
      adapter = ka;
    } else {
      const sup = speechSupport();
      if (sup !== 'available') { setNotice(sup === 'needs_build' ? 'needs_build' : 'speech_unavailable'); return; }
      const sa = new SpeechAdapter(settings.asrLang);
      // Chrome (not iPhone Safari, which must start inside the tap) can recognise a
      // vocal-filtered track instead of the raw microphone.
      vocalFirst = Platform.OS === 'web' && settings.vocalFocus && !isIOS() && kirtanModelSupported();
      if (!vocalFirst) { primeMeter(); sa.onAudioStart = () => { attachMeter(); }; }
      adapter = sa;
    }
    levelBus.reset();
    adapterRef.current = adapter;
    const c = new ListenController(adapter, new LocalEngineClient(corpus));
    ctl.current = c;
    setMode(m);
    c.subscribe((st) => {
      if (ctl.current !== c) return; // a later session replaced this one
      setCs(st);
      if (st.error) {
        // A failure right after the loudness meter attached: the phone cannot share the
        // microphone. The meter is now off for this device; a tap continues listening.
        const code = meterConflictSuspected() ? 'needs_tap' : st.error;
        setNotice(code);
        if (code === 'needs_tap') feedback('warning');
      }
    });
    const go = () => c.start().then(() => { if (keepShabad && c.snapshot.phase === 'listening') c.select(keepShabad); });
    if (vocalFirst) {
      startVocalCapture()
        .then((cap) => { if (ctl.current !== c) { cap.stop(); return; } vocalRef.current = cap; (adapter as SpeechAdapter).track = cap.track; })
        .catch(() => { /* filtering unavailable: recognise the raw microphone */ })
        .finally(() => { if (ctl.current === c) go(); });
    } else go();
  };

  const listen = (keep?: string) => {
    if (!settings.consented) { pendingKeep.current = keep; setShowConsent(true); return; }
    begin({ kind: 'mic' }, keep);
  };

  const resume = () => {
    const a = adapterRef.current as (RecognitionAdapter & { resume?: () => void }) | null;
    setNotice(null);
    if (a?.resume && ctl.current?.snapshot.phase === 'listening') { a.resume(); ctl.current.clearError(); }
    else listen(openShabad());
  };

  const goHome = () => { stop(); ctl.current = null; adapterRef.current = null; setCs(null); setMode(null); setNotice(null); };

  const r = cs?.response ?? null;
  const listening = cs?.phase === 'listening';
  const open = r && (r.status === 'resolved' || r.status === 'uncertain_line') ? r : null;
  const openShabad = () => (open ? open.shabadId : undefined);
  const showHeard = settings.showHeard || mode?.kind === 'typed';
  const inSession = !!cs && cs.phase !== 'idle';
  const capsuleH = 64;
  const bottomInset = insets.bottom + (inSession ? capsuleH + 16 : 0);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  // ------------------------------------------------------------------ screens
  let screenKey = 'home';
  let body: React.ReactNode;
  if (open && corpus) {
    screenKey = `reader-${open.shabadId}`;
    body = (
      <Reader corpus={corpus} r={open} t={t} s={s} lang={settings.lang} scale={settings.scale} phase={cs!.phase}
        detached={cs!.detached} bottomInset={bottomInset}
        onDetach={(id) => ctl.current?.setReadingPosition(id, true)} onReturn={() => ctl.current?.returnToLive()} />
    );
  } else if (r?.status === 'ambiguous') {
    screenKey = 'matches';
    body = <Matches r={r} t={t} s={s} lang={settings.lang} scale={settings.scale} onSelect={(id) => ctl.current?.select(id)} listening={listening} heardText={cs!.heardText} showHeard={showHeard} bottomInset={bottomInset} />;
  } else if (inSession) {
    screenKey = 'listening';
    body = (
      <ScrollView contentContainerStyle={[st.center, { paddingBottom: bottomInset + 24 }]}>
        <Orb t={t} size={168} active={listening} a11y={listening ? s.stopListening : s.listen} onPress={listening ? stop : () => (mode?.kind === 'mic' ? listen() : mode && begin(mode))} />
        <FadeIn delay={120}>
          <Text style={[TYPE.title2, { color: t.label, textAlign: 'center', marginTop: 4 }]} accessibilityLiveRegion="polite">
            {listening ? (r?.status === 'no_match' ? s.noMatch : s.listening) : s.stopped}
          </Text>
          <Text style={[TYPE.subhead, { color: t.label2, textAlign: 'center', marginTop: 8, maxWidth: 340 }]}>
            {mode?.kind === 'practice' ? s.practiceHint : s.listeningHint}
          </Text>
        </FadeIn>
        {showHeard && !!cs!.heardText && <Text style={[st.heard, { color: t.label2 }]}>{cs!.heardText}</Text>}
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={[st.home, { paddingBottom: insets.bottom + 40 }]}>
        <FadeIn>
          <Text style={[TYPE.largeTitle, { color: t.label }]} accessibilityRole="header">{s.appName}</Text>
          <Text style={[TYPE.subhead, { color: t.label2, marginTop: 2 }]}>{s.tagline}</Text>
        </FadeIn>
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <Orb t={t} size={150} active={false} disabled={!corpus} a11y={s.listen} onPress={() => listen()} />
          <Text style={[TYPE.headline, { color: corpus ? t.tint : t.label3, marginTop: -6 }]}>{s.tapToListen}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }} accessibilityLiveRegion="polite">
            {!corpus && !corpusErr && <ActivityIndicator size="small" color={t.label2} />}
            <Text style={[TYPE.footnote, { color: corpusErr ? t.red : t.label2 }]}>
              {corpusErr ? s.corpusError : corpus ? s.corpusReady(corpus.shabads.size) : s.loadingCorpus}
            </Text>
          </View>
          {corpusErr && <BigButton t={t} kind="tinted" label={s.retry} onPress={() => setLoadKey((k) => k + 1)} style={{ marginTop: 10, height: 40 }} />}
        </View>

        <FadeIn delay={120}>
          <Group t={t} header={s.practice} footer={s.practiceHint}>
            {([1, 2, 3, 4] as Scenario[]).map((n) => (
              <Row key={n} t={t} icon={n === 4 ? 'music' : 'play'} iconBg={['#FF9500', '#34C759', '#5856D6', '#FF2D55'][n - 1]}
                title={s[`scenario${n}` as 'scenario1']} chevron disabled={!corpus} onPress={() => begin({ kind: 'practice', scenario: n })} />
            ))}
            <Row t={t} icon="keyboard" iconBg="#8E8E93" title={s.typeHeard} subtitle={s.typeHeardSub} chevron disabled={!corpus} onPress={() => begin({ kind: 'typed' })} />
          </Group>
          {kirtanModelSupported() && (
            <Group t={t} footer={settings.engine === 'kirtan' ? (settings.serverUrl ? `${s.engineServerSub}${chunkMs ? ` · ${s.chunkTiming(chunkMs)}` : ''}` : s.kirtanNeedsServer) : settings.engine === 'kirtan-device' ? s.engineDeviceExpSub : s.kirtanHomeSub}>
              <Row t={t} icon="music" iconBg="#AF52DE" title={s.kirtanHome}
                right={<Switch value={settings.engine !== 'phone'} onValueChange={(v) => { update({ engine: v ? 'kirtan' : 'phone' }); if (v && !settings.serverUrl) setShowSettings(true); }} accessibilityLabel={s.kirtanHome}
                  trackColor={{ true: '#34C759', false: t.fill }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />} />
            </Group>
          )}
          <Group t={t}>
            <Row t={t} icon="question" iconBg="#007AFF" title={s.micHelp} chevron onPress={() => setNotice('help')} />
          </Group>
          <Text style={[TYPE.caption, { color: t.label3, marginTop: 20, marginHorizontal: 16 }]}>{s.phase} · {s.aboutBody}</Text>
        </FadeIn>
      </ScrollView>
    );
  }

  // ------------------------------------------------------------------ chrome
  const navTitle = open ? `${settings.lang === 'pa' ? open.source.pageNamePa : open.source.pageNameEn} ${open.source.page}` : r?.status === 'ambiguous' ? s.matches : inSession ? (mode?.kind === 'practice' ? s.practiceTag : s.listening) : '';
  const canBackToMatches = !!open && open.candidates.length > 1 && listening;
  const statusText = !listening ? s.stopped : open ? (open.status === 'resolved' && open.lineStatus === 'live' ? s.live : s.paused) : r?.status === 'ambiguous' ? s.matches : s.listening;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Glass t={t} style={[st.nav, { paddingTop: insets.top + 6, borderBottomColor: inSession ? t.separator : 'transparent' }]}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          {inSession && <BackButton t={t} label={canBackToMatches ? s.matchesShort : s.home} onPress={canBackToMatches ? () => ctl.current?.clearSelection() : goHome} />}
        </View>
        {!!navTitle && <Text style={[TYPE.headline, { color: t.label, maxWidth: '45%' }]} numberOfLines={1}>{navTitle}</Text>}
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <NavIcon t={t} icon="globe" label={settings.lang === 'en' ? 'ਪੰ' : 'EN'} a11y={s.language} onPress={() => update({ lang: settings.lang === 'en' ? 'pa' : 'en' })} />
          <NavIcon t={t} icon="sliders" a11y={s.settings} onPress={() => setShowSettings(true)} />
        </View>
      </Glass>

      {notice && <NoticeFor code={notice} t={t} s={s} asr={settings.asrLang} onSettings={() => { setNotice(null); setShowSettings(true); }}
        onDismiss={() => setNotice(null)} onResume={resume}
        onHindi={() => { update({ asrLang: 'hi-IN' }); setNotice(null); }}
        onRetry={() => { setNotice(null); listen(openShabad()); }} />}

      {(model.phase === 'downloading' || model.phase === 'loading') && settings.engine === 'kirtan-device' && (
        <Notice t={t} tone="info" title={model.phase === 'downloading' ? s.modelDownloading(model.progress) : s.modelLoading} body={s.modelDownloadingSub} />
      )}
      {model.phase === 'error' && settings.engine === 'kirtan-device' && (
        <Notice t={t} title={s.modelErrorTitle} body={s.engineKirtanSub} code={`${s.errCode}: ${model.message.slice(0, 120)}`} />
      )}
            {mode?.kind === 'typed' && listening && (
        <FadeIn style={[st.typed, { backgroundColor: t.card }]} from={-8}>
          <Icon name="keyboard" size={20} color={t.label2} />
          <TextInput
            value={typed} onChangeText={setTyped} placeholder={s.typePlaceholder} placeholderTextColor={t.label3}
            onSubmitEditing={() => { ctl.current?.injectText(typed); levelBus.pulse(0.8); setTyped(''); }}
            style={[st.input, { color: t.label, fontFamily: FONT.gurmukhi }]} accessibilityLabel={s.typeHeard} returnKeyType="send"
          />
          <ScalePress onPress={() => { ctl.current?.injectText(typed); levelBus.pulse(0.8); setTyped(''); }} haptic="light" accessibilityRole="button" accessibilityLabel={s.send}
            style={[st.sendBtn, { backgroundColor: t.tintFill }]}>
            <Icon name="arrow.down" size={16} color="#FFFFFF" weight={2.6} />
          </ScalePress>
        </FadeIn>
      )}

      <View style={{ flex: 1 }}>
        <FadeIn key={screenKey} style={{ flex: 1 }} from={10} duration={320}>{body}</FadeIn>
      </View>

      {/* Floating "now listening" capsule */}
      <Rise visible={inSession} style={[st.capsuleWrap, { bottom: insets.bottom + 10 }]}>
        <Glass t={t} style={[st.capsule, shadow(t, 10, 30)]}>
          <View style={[st.capsuleIcon, { backgroundColor: listening ? t.tintSoft : t.fill }]}>
            <MiniWave color={listening ? t.tintFill : t.label3} active={listening} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[TYPE.headline, { color: t.label }]} numberOfLines={1}>{statusText}</Text>
            <Text style={[TYPE.footnote, { color: t.label2 }]} numberOfLines={1}>
              {mode?.kind === 'practice' ? s.practice : mode?.kind === 'typed' ? s.typeHeard : open ? (settings.lang === 'pa' ? open.source.sourcePa : open.source.sourceEn) : s.listeningHint}
            </Text>
          </View>
          {canBackToMatches && (
            <ScalePress onPress={() => ctl.current?.clearSelection()} haptic="select" accessibilityRole="button" accessibilityLabel={s.allMatches(open!.candidates.length)}
              style={[st.capsuleBtn, { backgroundColor: t.fill, marginRight: 8 }]}>
              <Icon name="list" size={18} color={t.tint} />
            </ScalePress>
          )}
          {listening ? (
            <ScalePress onPress={stop} haptic="medium" accessibilityRole="button" accessibilityLabel={s.stopListening} style={[st.capsuleBtn, { backgroundColor: t.redSoft }]}>
              <Icon name="stop" size={18} color={t.red} />
            </ScalePress>
          ) : (
            <ScalePress onPress={() => (mode?.kind === 'mic' || !mode ? listen(openShabad()) : begin(mode, openShabad()))} haptic="medium" accessibilityRole="button" accessibilityLabel={s.listen}
              style={[st.capsuleBtn, { backgroundColor: t.tintFill }]}>
              <Icon name="mic.fill" size={18} color="#FFFFFF" />
            </ScalePress>
          )}
        </Glass>
      </Rise>

      <ConsentSheet visible={showConsent} t={t} s={s} engine={kirtanModelSupported() ? settings.engine : 'phone'}
        onClose={() => setShowConsent(false)}
        onAllow={() => { update({ consented: true }); setShowConsent(false); begin({ kind: 'mic' }, pendingKeep.current); }} />

      <SettingsSheet visible={showSettings} t={t} s={s} settings={settings} packs={packs} update={update} onClose={() => setShowSettings(false)} />
    </View>
  );
}

// ------------------------------------------------------------------ notices

function NoticeFor({ code, t, s, asr, onDismiss, onResume, onHindi, onRetry, onSettings }: {
  code: string; t: Theme; s: Strings; asr: string; onDismiss: () => void; onResume: () => void; onHindi: () => void; onRetry: () => void; onSettings: () => void;
}) {
  const standaloneNote = isIOS() && isStandalone() ? ` ${s.openInSafari}` : '';
  const hindi = asr !== 'hi-IN' ? [{ label: s.useHindi, onPress: onHindi }] : [];
  const show = (title: string, body: string, actions: { label: string; onPress: () => void; primary?: boolean }[] = [], tone: 'warn' | 'info' = 'warn', diag = true) =>
    <Notice t={t} title={title} body={body} tone={tone} code={diag ? `${s.errCode}: ${code}` : undefined} actions={actions} onDismiss={onDismiss} />;
  switch (code) {
    case 'help': return show(s.micHelp, s.micHelpBody, [], 'info', false);
    case 'needs_tap': return show(s.needsTapTitle, s.needsTapBody, [{ label: s.keepListening, onPress: onResume, primary: true }], 'info');
    case 'mic_blocked': return show(s.micBlockedTitle, s.micBlockedBody + standaloneNote, [{ label: s.retry, onPress: onRetry, primary: true }]);
    case 'speech_service_off': return show(s.serviceOffTitle, s.serviceOffBody + standaloneNote, [...hindi, { label: s.retry, onPress: onRetry, primary: !hindi.length }]);
    case 'lang_unsupported': return show(s.langUnsupportedTitle, s.langUnsupported, [...hindi.map((h) => ({ ...h, primary: true })), { label: s.retry, onPress: onRetry }]);
    case 'audio_capture': return show(s.audioCaptureTitle, s.audioCaptureBody, [{ label: s.retry, onPress: onRetry, primary: true }]);
    case 'network': return show(s.networkTitle, s.networkBody);
    case 'speech_unavailable': return show(s.genericTitle, s.speechUnavailable, [], 'info');
    case 'needs_build': return show(s.genericTitle, s.nativeNeedsBuild, [], 'info');
    case 'needs_server': return show(s.serverUrl, s.kirtanNeedsServer, [{ label: s.openSettings, onPress: onSettings, primary: true }], 'info', false);
    case 'server_unreachable': return show(s.serverUnreachableTitle, s.serverUnreachableBody, [{ label: s.openSettings, onPress: onSettings }, { label: s.retry, onPress: onRetry, primary: true }]);
    case 'server_no_model': return show(s.serverUnreachableTitle, s.serverNoModel, [{ label: s.openSettings, onPress: onSettings }, { label: s.retry, onPress: onRetry, primary: true }]);
    default: return show(s.genericTitle, s.micHelpBody, [{ label: s.retry, onPress: onRetry, primary: true }]);
  }
}

// ------------------------------------------------------------------ sheets

function Sheet({ visible, onClose, children, t }: { visible: boolean; onClose: () => void; children: React.ReactNode; t: Theme }) {
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    if (visible) spring(v, 1, { damping: 22, stiffness: 210 }).start();
    else Animated.timing(v, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE }).start(() => setMounted(false));
  }, [visible]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', opacity: v }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[st.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 12, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [700, 0] }) }] }]} accessibilityViewIsModal>
        <View style={[st.grabber, { backgroundColor: t.label3 }]} />
        {children}
      </Animated.View>
    </Modal>
  );
}

function ConsentSheet({ visible, t, s, engine, onClose, onAllow }: { visible: boolean; t: Theme; s: Strings; engine: Engine; onClose: () => void; onAllow: () => void }) {
  const points = engine === 'kirtan' ? [s.consentPoints[0], s.consentServer, s.consentPoints[2]]
    : engine === 'kirtan-device' ? [s.consentPoints[0], s.consentKirtan, s.consentPoints[2]] : s.consentPoints;
  return (
    <Sheet visible={visible} onClose={onClose} t={t}>
      <ScrollView contentContainerStyle={{ padding: 22, paddingTop: 10 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={[st.bigIcon, { backgroundColor: t.tintFill }]}><Icon name="mic.fill" size={34} color="#FFFFFF" /></View>
          <Text style={[TYPE.title2, { color: t.label, marginTop: 14, textAlign: 'center' }]}>{s.consentTitle}</Text>
        </View>
        {points.map((p, i) => (
          <FadeIn key={p.title} delay={visible ? 120 + i * 70 : 0}>
            <View style={{ flexDirection: 'row', marginTop: 20, gap: 14 }}>
              <Icon name={p.icon} size={26} color={t.tint} />
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.headline, { color: t.label }]}>{p.title}</Text>
                <Text style={[TYPE.subhead, { color: t.label2, marginTop: 2 }]}>{p.body}</Text>
              </View>
            </View>
          </FadeIn>
        ))}
        <BigButton t={t} label={s.consentAllow} icon="mic.fill" onPress={onAllow} style={{ marginTop: 28 }} />
        <BigButton t={t} kind="plain" label={s.consentNotNow} onPress={onClose} style={{ marginTop: 4 }} />
      </ScrollView>
    </Sheet>
  );
}

function SettingsSheet({ visible, t, s, settings, packs, update, onClose }: {
  visible: boolean; t: Theme; s: Strings; settings: Settings; packs: PackInfo[] | null; update: (p: Partial<Settings>) => void; onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} t={t}>
      <View style={st.sheetNav}>
        <Text style={[TYPE.headline, { color: t.label }]}>{s.settings}</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={s.done} style={{ position: 'absolute', right: 16 }}>
          <Text style={[TYPE.headline, { color: t.tint }]}>{s.done}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <Group t={t} header={s.language} style={{ marginTop: 12 }}>
          <View style={{ padding: 10 }}>
            <Segmented t={t} value={settings.lang} options={[['en', 'English'], ['pa', 'ਪੰਜਾਬੀ']]} onChange={(v) => update({ lang: v as Lang })} />
          </View>
        </Group>
        <Group t={t} header={s.textSize}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }}>
            <ScalePress onPress={() => update({ scale: Math.max(0.8, +(settings.scale - 0.1).toFixed(2)) })} haptic="select" accessibilityRole="button" accessibilityLabel={s.smaller} style={[st.stepBtn, { backgroundColor: t.fill }]}>
              <Text style={[TYPE.subhead, { color: t.label, fontWeight: '600' }]}>A</Text>
            </ScalePress>
            <Text style={{ flex: 1, textAlign: 'center', fontFamily: FONT.gurmukhi, color: t.label, fontSize: 22 * settings.scale, lineHeight: 38 * settings.scale }}>ਸਤਿ ਨਾਮੁ</Text>
            <ScalePress onPress={() => update({ scale: Math.min(1.8, +(settings.scale + 0.1).toFixed(2)) })} haptic="select" accessibilityRole="button" accessibilityLabel={s.larger} style={[st.stepBtn, { backgroundColor: t.fill }]}>
              <Text style={[TYPE.title3, { color: t.label }]}>A</Text>
            </ScalePress>
          </View>
        </Group>
        <Group t={t} header={s.engine} footer={kirtanModelSupported() ? undefined : s.engineKirtanUnsupported}>
          <Row t={t} title={s.enginePhone} subtitle={s.enginePhoneSub} check={settings.engine === 'phone'} onPress={() => update({ engine: 'phone' })} />
          <Row t={t} title={s.engineServer} subtitle={s.engineServerSub} check={settings.engine === 'kirtan'} disabled={!kirtanModelSupported()} onPress={() => update({ engine: 'kirtan' })} />
          <Row t={t} title={s.engineDeviceExp} subtitle={s.engineDeviceExpSub} check={settings.engine === 'kirtan-device'} disabled={!kirtanModelSupported()} onPress={() => update({ engine: 'kirtan-device' })} />
        </Group>
        {settings.engine === 'kirtan' && <ServerField t={t} s={s} value={settings.serverUrl} onChange={(v) => update({ serverUrl: v })} />}
        <Group t={t} footer={s.vocalFocusSub}>
          <Row t={t} icon="waveform" iconBg="#34C759" title={s.vocalFocus}
            right={<Switch value={settings.vocalFocus} onValueChange={(v) => update({ vocalFocus: v })} accessibilityLabel={s.vocalFocus}
              trackColor={{ true: '#34C759', false: t.fill }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />} />
        </Group>
        <Group t={t} header={s.recognition}>
          <Row t={t} title={s.recognitionPa} subtitle={s.recognitionPaSub} check={settings.asrLang === 'pa-IN'} onPress={() => update({ asrLang: 'pa-IN' })} />
          <Row t={t} title={s.recognitionHi} subtitle={s.recognitionHiSub} check={settings.asrLang === 'hi-IN'} onPress={() => update({ asrLang: 'hi-IN' })} />
        </Group>
        <Group t={t} header={s.sources}>
          {(packs ?? []).map((p) => (
            <Row key={p.sourceId} t={t} icon="book" iconBg={['#FF9500', '#AF52DE', '#34C759', '#5856D6'][[1, 2, 3, 5].indexOf(p.sourceId)] ?? '#8E8E93'}
              title={settings.lang === 'pa' ? p.namePa : p.nameEn} titleStyle={settings.lang === 'pa' ? { fontFamily: FONT.gurmukhi } : undefined}
              subtitle={`${p.shabads.toLocaleString()}`}
              right={<Switch value={settings.sources.includes(p.sourceId)} disabled={p.sourceId === 1} accessibilityLabel={p.nameEn}
                trackColor={{ true: '#34C759', false: t.fill }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)}
                onValueChange={(on) => update({ sources: on ? [...settings.sources, p.sourceId].sort((a, b) => a - b) : settings.sources.filter((x) => x !== p.sourceId) })} />} />
          ))}
        </Group>
        <Group t={t}>
          <Row t={t} icon="waveform" iconBg="#FF2D55" title={s.showHeard}
            right={<Switch value={settings.showHeard} onValueChange={(v) => update({ showHeard: v })} accessibilityLabel={s.showHeard} trackColor={{ true: '#34C759', false: t.fill }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />} />
        </Group>
        <Group t={t} header={s.micHelp} footer={s.micHelpBody}><Row t={t} icon="mic" iconBg="#007AFF" title={s.micHelp} /></Group>
        <Group t={t} header={s.about} footer={s.aboutBody}><Row t={t} icon="info" iconBg="#8E8E93" title="Shabad OS Database 4.8.7" /></Group>
      </ScrollView>
    </Sheet>
  );
}

function ServerField({ t, s, value, onChange }: { t: Theme; s: Strings; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'no_model' | 'unreachable'>('idle');
  const test = async () => {
    const url = draft.trim().replace(/\/+$/, '');
    onChange(url);
    setState('checking');
    setState(await checkKirtanServer(url));
  };
  const msg = state === 'ok' ? s.serverOk : state === 'no_model' ? s.serverNoModel : state === 'unreachable' ? s.serverUnreachable : '';
  return (
    <Group t={t} header={s.serverUrl} footer={msg || undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, gap: 8, minHeight: 50 }}>
        <TextInput value={draft} onChangeText={setDraft} onBlur={() => onChange(draft.trim().replace(/\/+$/, ''))} placeholder={s.serverUrlPlaceholder} placeholderTextColor={t.label3}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel={s.serverUrl}
          style={[TYPE.body, { flex: 1, color: t.label, height: 44 }]} />
        <Pressable onPress={test} accessibilityRole="button" accessibilityLabel={s.serverTest} style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: t.tintSoft, alignItems: 'center', justifyContent: 'center' }}>
          {state === 'checking' ? <ActivityIndicator size="small" color={t.tint} /> : <Text style={[TYPE.subhead, { color: t.tint, fontWeight: '600' }]}>{s.serverTest}</Text>}
        </Pressable>
      </View>
    </Group>
  );
}

const st = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10 },
  home: { paddingHorizontal: 16, paddingTop: 6, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  heard: { fontFamily: FONT.gurmukhi, fontSize: 16, marginTop: 16, textAlign: 'center' },
  typed: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 10, paddingLeft: 14, paddingRight: 6, borderRadius: 14, height: 50 },
  input: { flex: 1, fontSize: 17, height: 48 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '180deg' }] },
  capsuleWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  capsule: { flexDirection: 'row', alignItems: 'center', height: 64, borderRadius: 32, paddingLeft: 8, paddingRight: 8, width: '100%', maxWidth: 560, overflow: 'hidden' },
  capsuleIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  capsuleBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '92%', borderTopLeftRadius: 14, borderTopRightRadius: 14, overflow: 'hidden', maxWidth: 640, width: '100%', alignSelf: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 6, marginBottom: 4 },
  sheetNav: { height: 44, alignItems: 'center', justifyContent: 'center' },
  bigIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepBtn: { width: 44, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
