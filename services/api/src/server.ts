// Node recognition service. Same engine as the app's on-device mode, behind HTTP, so a
// server-side recogniser (e.g. a Punjabi ASR model) can be added later without changing the
// client contract. Audio is never stored; text windows are processed and discarded.
//
//   POST   /v1/sessions                        -> { sessionId }
//   POST   /v1/sessions/:id/windows            { seq, t0, t1, text } -> EngineResponse | 409 stale
//   POST   /v1/sessions/:id/select             { shabadId }          -> EngineResponse
//   POST   /v1/sessions/:id/clear                                    -> EngineResponse
//   DELETE /v1/sessions/:id
//   GET    /v1/shabads/:id                                           -> full shabad text
//   POST   /v1/transcribe   16 kHz mono Int16 PCM (≤ 30 s)         -> { text, ms }   (kirtan model)
//   GET    /v1/health

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Corpus, RecognitionSession, type CorpusPack } from '@shabad/core';
import { asrReady, backlog, loadKirtanAsr, transcribe } from './asr';

export function loadCorpus(dir: string, sourceIds = [1, 3, 5]): Corpus {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { packs: { file: string; sourceId: number }[] };
  const packs = manifest.packs.filter((p) => sourceIds.includes(p.sourceId)).map((p) => JSON.parse(readFileSync(join(dir, p.file), 'utf8')) as CorpusPack);
  return Corpus.fromPacks(packs);
}

const SESSION_IDLE_MS = 10 * 60 * 1000;

export function createApp(corpus: Corpus) {
  const sessions = new Map<string, { s: RecognitionSession; touched: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, v] of sessions) if (now - v.touched > SESSION_IDLE_MS) sessions.delete(id);
  }, 60_000);
  sweep.unref();

  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const readJson = (req: IncomingMessage) => new Promise<any>((ok, fail) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64_000) { fail(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { ok(data ? JSON.parse(data) : {}); } catch (e) { fail(e); } });
  });
  const readBody = (req: IncomingMessage, max: number) => new Promise<Buffer>((ok, fail) => {
    const chunks: Buffer[] = []; let n = 0;
    req.on('data', (c: Buffer) => { n += c.length; if (n > max) { fail(new Error('audio too long (max 30 s)')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
  });

  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, undefined);
      const url = new URL(req.url ?? '/', 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'v1') return send(res, 404, { error: 'not found' });

      if (parts[1] === 'health') return send(res, 200, { ok: true, corpus: corpus.stats(), kirtanModel: asrReady() });

      if (parts[1] === 'transcribe' && req.method === 'POST') {
        if (!asrReady()) return send(res, 503, { error: 'kirtan model not loaded on this server' });
        if (backlog() >= 2) return send(res, 429, { error: 'busy; send the next chunk when this one returns' });
        const body = await readBody(req, 16000 * 2 * 30);
        const pcm = new Int16Array(body.buffer, body.byteOffset, Math.floor(body.byteLength / 2));
        const audio = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) audio[i] = pcm[i] / 32768;
        const r = await transcribe(audio); // in memory only; nothing is written
        return send(res, 200, { text: r.text, ms: r.ms, seconds: audio.length / 16000 });
      }

      if (parts[1] === 'shabads' && parts[2] && req.method === 'GET') {
        const sh = corpus.shabads.get(parts[2]);
        if (!sh) return send(res, 404, { error: 'unknown shabad' });
        return send(res, 200, { id: sh.id, source: corpus.sourceRef(sh.id), lines: corpus.shabadLines(sh.id).map((l) => ({ id: l.id, page: l.page, type: l.type, text: l.text })) });
      }

      if (parts[1] !== 'sessions') return send(res, 404, { error: 'not found' });
      if (parts.length === 2 && req.method === 'POST') {
        const id = randomUUID();
        sessions.set(id, { s: new RecognitionSession(corpus, id), touched: Date.now() });
        return send(res, 201, { sessionId: id });
      }
      const entry = sessions.get(parts[2]);
      if (!entry) return send(res, 404, { error: 'unknown or expired session' });
      entry.touched = Date.now();
      const s = entry.s;

      if (parts.length === 3 && req.method === 'DELETE') { sessions.delete(parts[2]); return send(res, 204, undefined); }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
      switch (parts[3]) {
        case 'windows': {
          const b = await readJson(req);
          if (typeof b.seq !== 'number' || typeof b.t0 !== 'number' || typeof b.t1 !== 'number' || typeof b.text !== 'string') return send(res, 400, { error: 'expected { seq, t0, t1, text }' });
          const r = s.process({ sessionId: parts[2], seq: b.seq, t0: b.t0, t1: b.t1, text: b.text.slice(0, 2000) });
          return r ? send(res, 200, r) : send(res, 409, { error: 'stale window (seq not newer than last processed)' });
        }
        case 'select': {
          const b = await readJson(req);
          if (!corpus.shabads.has(b.shabadId)) return send(res, 400, { error: 'unknown shabad' });
          return send(res, 200, s.select(b.shabadId));
        }
        case 'clear':
          return send(res, 200, s.clearSelection());
        default:
          return send(res, 404, { error: 'not found' });
      }
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('server.ts')) {
  const port = Number(process.env.PORT ?? 8787);
  const corpus = loadCorpus(resolve(process.env.CORPUS_DIR ?? 'corpus'));
  createApp(corpus).listen(port, () => console.log(`shabad-live api on :${port} — ${JSON.stringify(corpus.stats())}`));
  if (process.env.KIRTAN_MODEL_DIR) {
    console.log('loading kirtan model…');
    loadKirtanAsr(resolve(process.env.KIRTAN_MODEL_DIR)).then(() => console.log('kirtan model ready: POST /v1/transcribe'), (e) => console.error('kirtan model failed:', e.message));
  }
}
