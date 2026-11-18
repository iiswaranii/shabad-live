// The five required acceptance scenarios, run against the full Sri Guru Granth Sahib Ji
// corpus. Inputs are recogniser-style text windows (synthetic). They test the software's
// decisions, not real-world recognition accuracy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecognitionSession, ListenController, LocalEngineClient, type RecognitionAdapter, type EngineResponse } from '../src/index';
import { sggs, Singer, last } from './helpers';

// Ang 96, "ਮੇਰਾ ਮਨੁ ਲੋਚੈ ਗੁਰ ਦਰਸਨ ਤਾਈ": four verses, each followed by its own rahao line.
const MRB = { shabad: 'MRB', verse2: ['BHSH', 'DGQH', 'HP28'], verse1: ['70NE', 'KSQ5', 'YDMN'], rahao1: '77D6', rahao2: 'WK9S' };
// "ਮੇਰੇ ਮਨ ਹਰਿ ਹਰਿ ਨਾਮੁ ਧਿਆਇ ॥" is the rahao line of two different shabads (Ang 44 and Ang 47).
const SHARED = { line: 'ਮੇਰੇ ਮਨ ਹਰਿ ਹਰਿ ਨਾਮੁ ਧਿਆਇ', a: 'QNL', b: '5BC' };

test('1. starting midway through a distinctive verse opens the full shabad on that verse', () => {
  const s = new RecognitionSession(sggs(), 's1');
  const sing = new Singer(s);
  sing.silence(2);
  const rs = sing.line(MRB.verse2[1]); // second line of verse 2, not the opening
  const resolved = rs.find((r) => r.status === 'resolved');
  assert.ok(resolved, `expected resolution, got ${rs.map((r) => r.status).join(',')}`);
  assert.equal(resolved.status === 'resolved' && resolved.shabadId, MRB.shabad);
  const end = last(rs);
  assert.equal(end.status, 'resolved');
  if (end.status === 'resolved') {
    assert.equal(end.currentLineId, MRB.verse2[1]);
    assert.equal(end.lineStatus, 'live');
    assert.equal(end.selectedBy, 'auto');
    assert.equal(end.source.page, 96);
  }
  // Following lines move the highlight.
  const next = last(sing.line(MRB.verse2[2]));
  assert.equal(next.status === 'resolved' && next.currentLineId, MRB.verse2[2]);
});

test('2. a line shared by two shabads lists both, keeps both through a repeat, resolves on a distinguishing line', () => {
  const c = sggs();
  const s = new RecognitionSession(c, 's2');
  const sing = new Singer(s);
  const sharedIds = c.lines.filter((l) => l.text.startsWith(SHARED.line)).map((l) => l.id);
  assert.ok(sharedIds.length >= 2, 'fixture: shared line present in both shabads');

  const first = last(sing.line(sharedIds[0]));
  assert.equal(first.status, 'ambiguous');
  if (first.status !== 'ambiguous') return;
  const exact = first.candidates.filter((x) => x.match === 'exact').map((x) => x.shabadId);
  assert.ok(exact.includes(SHARED.a) && exact.includes(SHARED.b), `both shabads listed as exact: ${exact}`);
  assert.ok(first.heard.text.startsWith(SHARED.line), 'heard pangti shown once');
  for (const cand of first.candidates) {
    assert.ok(cand.distinguishingLine.text.length > 0);
    assert.ok(cand.source.page > 0, 'Ang reference present');
  }
  const a = first.candidates.find((x) => x.shabadId === SHARED.a)!;
  const b = first.candidates.find((x) => x.shabadId === SHARED.b)!;
  assert.notEqual(a.distinguishingLine.lineId, b.distinguishingLine.lineId);

  // The refrain is sung again: no new distinguishing evidence, both stay.
  sing.silence(4);
  const again = last(sing.line(sharedIds[0]));
  assert.equal(again.status, 'ambiguous');
  if (again.status === 'ambiguous') {
    const ex = again.candidates.filter((x) => x.match === 'exact').map((x) => x.shabadId);
    assert.ok(ex.includes(SHARED.a) && ex.includes(SHARED.b));
    assert.equal(again.candidates.find((x) => x.shabadId === SHARED.a)!.support, a.support, 'repeat adds no support');
  }

  // A verse line that only shabad A has.
  const verse = c.shabadLines(SHARED.a).find((l) => l.indexed && l.type === 4 && c.groupShabads(l.group).length === 1)!;
  const after = sing.line(verse.id);
  const res = after.find((r) => r.status === 'resolved');
  assert.ok(res && res.status === 'resolved' && res.shabadId === SHARED.a, `resolved to ${SHARED.a}`);
  const endState = last(after);
  assert.equal(endState.status === 'resolved' && endState.currentLineId, verse.id);
});

test('3. a return to the refrain moves the highlight back, even out of verse order', () => {
  const s = new RecognitionSession(sggs(), 's3');
  const sing = new Singer(s);
  sing.line(MRB.verse2[0]);
  sing.line(MRB.verse2[1]);
  let r = last(sing.line(MRB.rahao2));
  assert.equal(r.status === 'resolved' && r.currentLineId, MRB.rahao2);
  // Raagi jumps back to verse 1 (out of order), then to the first rahao line.
  r = last(sing.line(MRB.verse1[0]));
  assert.equal(r.status === 'resolved' && r.currentLineId, MRB.verse1[0]);
  r = last(sing.line(MRB.rahao1));
  assert.equal(r.status === 'resolved' && r.currentLineId, MRB.rahao1);
});

test('4. instruments or unclear audio: keep listening, assert no new line', () => {
  const s = new RecognitionSession(sggs(), 's4');
  const sing = new Singer(s);
  // Before identification: silence and noise give listening / no_match, never a shabad.
  for (const r of [...sing.silence(3), sing.window('ਵਾਹਿਗੁਰੂ'), sing.window('ਹਰਿ'), sing.window('ਜੀ ਜੀ ਹਾਂ')]) {
    assert.ok(r.status === 'listening' || r.status === 'no_match', r.status);
  }
  // After identification: instrumental passages hold the current line; time passing does not advance it.
  const before = last(sing.line(MRB.verse2[1]));
  assert.equal(before.status, 'resolved');
  const held = [...sing.silence(10), sing.window('ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ'), sing.window('ਹਰਿ')];
  for (const r of held) {
    assert.equal(r.status, 'resolved');
    if (r.status === 'resolved') assert.equal(r.currentLineId, MRB.verse2[1]);
  }
});

test('5. manual selection, scroll and stop: reading position kept, capture stopped', async () => {
  const c = sggs();
  let started = 0, stopped = 0;
  let push: ((t: string, f: boolean) => void) | null = null;
  const adapter: RecognitionAdapter = {
    name: 'test',
    start: ({ onText }) => { started++; push = onText; },
    stop: () => { stopped++; push = null; },
  };
  let now = 1000;
  const ticks: (() => void)[] = [];
  const ctl = new ListenController(adapter, new LocalEngineClient(c), {
    now: () => now, setInterval: (fn) => { ticks.push(fn); return ticks.length; }, clearInterval: () => { ticks.length = 0; },
  });
  await ctl.start();
  assert.equal(ctl.snapshot.phase, 'listening');
  assert.equal(started, 1);
  push!(`${SHARED.line}`, true);
  now += 1.5; ticks[0]();
  await new Promise((r) => setTimeout(r, 0));
  const amb = ctl.snapshot.response!;
  assert.equal(amb.status, 'ambiguous');

  await ctl.select(SHARED.b);
  const sel = ctl.snapshot.response!;
  assert.equal(sel.status === 'resolved' && sel.selectedBy, 'user');
  assert.equal(sel.status === 'resolved' && sel.shabadId, SHARED.b);

  // A distinguishing line for the *other* shabad does not override the user's choice.
  const otherVerse = c.shabadLines(SHARED.a).find((l) => l.indexed && l.type === 4 && c.groupShabads(l.group).length === 1)!;
  push!(otherVerse.text, true);
  now += 1.5; ticks[0]();
  await new Promise((r) => setTimeout(r, 0));
  const kept = ctl.snapshot.response!;
  assert.ok((kept.status === 'resolved' || kept.status === 'uncertain_line') && kept.shabadId === SHARED.b, 'user selection preserved');

  const readAt = c.shabadLines(SHARED.b)[5].id;
  ctl.setReadingPosition(readAt, true);
  ctl.stop();
  assert.equal(stopped, 1, 'capture stopped');
  assert.equal(ticks.length, 0, 'window timer cleared');
  assert.equal(ctl.snapshot.phase, 'stopped');
  assert.equal(ctl.snapshot.readingLineId, readAt, 'reading position preserved');
  assert.equal(ctl.snapshot.detached, true);
  const shown = ctl.snapshot.response!;
  assert.ok((shown.status === 'resolved' || shown.status === 'uncertain_line') && shown.shabadId === SHARED.b, 'shabad stays open after stop');

  // Return to all matches keeps both shabads available.
  ctl['state'].phase = 'listening';
  await ctl.clearSelection();
  const all = ctl.snapshot.response!;
  assert.equal(all.status, 'ambiguous');
});

test('late responses from earlier sessions or older windows are discarded', async () => {
  const ctl = new ListenController({ name: 'x', start() {}, stop() {} }, new LocalEngineClient(sggs()), { setInterval: () => 0, clearInterval: () => {} });
  await ctl.start();
  const id = ctl.snapshot.sessionId!;
  const mk = (sessionId: string, seq: number): EngineResponse => ({ status: 'listening', sessionId, seq, t0: 0, t1: 0, reason: '' });
  assert.equal(ctl.apply(mk(id, 5)), true);
  assert.equal(ctl.apply(mk(id, 4)), false, 'older window');
  assert.equal(ctl.apply(mk('old-session', 9)), false, 'earlier session');
  ctl.stop();
  await ctl.start();
  assert.equal(ctl.apply(mk(id, 10)), false, 'response for the previous session after restart');
});

test('two plausible locations pause the live indicator, fresh evidence resumes it', () => {
  // MRB's rahao lines share "ਹਉ ਘੋਲੀ ਜੀਉ ਘੋਲਿ ਘੁਮਾਈ" and differ only at the end.
  const s = new RecognitionSession(sggs(), 's6');
  const sing = new Singer(s);
  sing.line(MRB.verse2[0]);
  sing.line(MRB.verse2[1]);
  const r = sing.window('ਹਉ ਘੋਲੀ ਜੀਉ ਘੋਲ ਘੁਮਾਈ');
  assert.equal(r.status, 'uncertain_line');
  if (r.status === 'uncertain_line') {
    assert.equal(r.lineStatus, 'paused');
    assert.ok(r.possibleLineIds.length >= 2);
    assert.equal(r.lastLineId, MRB.verse2[1], 'highlight not moved');
  }
  const resumed = last(sing.line(MRB.rahao1));
  assert.equal(resumed.status === 'resolved' && resumed.currentLineId, MRB.rahao1);
  assert.equal(resumed.status === 'resolved' && resumed.lineStatus, 'live');
});
