import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createApp, loadCorpus } from '../src/server';

test('API: session flow, stale windows rejected, shabad text, audio not accepted', async () => {
  const server = createApp(loadCorpus(join(__dirname, '../../../corpus'), [1])).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  const post = (p: string, b?: unknown) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  try {
    const { sessionId } = await (await post('/sessions')).json();
    let r = await (await post(`/sessions/${sessionId}/windows`, { seq: 1, t0: 0, t1: 5, text: 'ਮੇਰੇ ਮਨ ਹਰਿ ਹਰਿ ਨਾਮੁ ਧਿਆਇ' })).json();
    assert.equal(r.status, 'ambiguous');
    assert.ok(r.candidates.some((c: any) => c.shabadId === 'QNL'));
    const stale = await post(`/sessions/${sessionId}/windows`, { seq: 1, t0: 0, t1: 5, text: 'x' });
    assert.equal(stale.status, 409);
    r = await (await post(`/sessions/${sessionId}/select`, { shabadId: 'QNL' })).json();
    assert.equal(r.status, 'resolved');
    assert.equal(r.selectedBy, 'user');
    const sh = await (await fetch(`${base}/shabads/QNL`)).json();
    assert.ok(sh.lines.length > 3 && sh.source.page === 44);
    assert.equal((await post('/transcribe')).status, 503, 'no kirtan model loaded in this test');
    assert.equal((await fetch(`${base}/sessions/${sessionId}`, { method: 'DELETE' })).status, 204);
    assert.equal((await post(`/sessions/${sessionId}/clear`)).status, 404);
  } finally {
    server.close();
  }
});
