import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeleton, loose, tokenize, words, gurmukhiToDevanagari, detectScript } from '../src/index';

// REVIEW: these equivalences encode linguistic decisions; a Punjabi reviewer should confirm them.

test('word-final lagaan does not change the written-word key', () => {
  assert.equal(loose('ਨਾਮੁ'), loose('ਨਾਮ'));
  assert.equal(loose('ਸਤਿ'), loose('ਸਤ'));
  assert.notEqual(loose('ਨਾਮੁ'), loose('ਨਾਮਾ'));
});

test('nasal marks, addak and nukta do not change the written-word key', () => {
  assert.equal(loose('ਸੱਚਾ'), loose('ਸਚਾ'));
  assert.equal(loose('ਸ਼ਬਦ'), loose('ਸਬਦ'));
  assert.equal(loose('ਮੈਂ'), loose('ਮੈ'));
});

test('Gurmukhi, Devanagari and romanised spellings share one skeleton', () => {
  for (const [g, l] of [['ਨਾਨਕ', 'naanak'], ['ਅੰਮ੍ਰਿਤ', 'amrit'], ['ਪੁਰਖੁ', 'purakh'], ['ਨਿਰਭਉ', 'nirbhau'], ['ਸਚੁ', 'sach'], ['ਪ੍ਰਸਾਦਿ', 'prasaad']] as const) {
    assert.equal(skeleton(g), skeleton(l), `${g} ~ ${l}`);
    assert.equal(skeleton(g), skeleton(gurmukhiToDevanagari(g)), `${g} ~ Devanagari`);
  }
});

test('aspirated and unaspirated pairs collapse; vowel length does not matter', () => {
  assert.equal(skeleton('ਧਿਆਇ'), skeleton('ਦਿਆਇ'));
  assert.equal(skeleton('ਹਰਿ'), skeleton('ਹਰੀ'));
  assert.equal(skeleton('ਖਸਮ'), skeleton('ਖ਼ਸਮ'));
});

test('punctuation, verse numbers and the ਰਹਾਉ marker are not search words', () => {
  assert.deepEqual(words('ਹਉ ਘੋਲੀ ਜੀਉ ॥੧॥ ਰਹਾਉ ॥'), ['ਹਉ', 'ਘੋਲੀ', 'ਜੀਉ']);
  assert.equal(tokenize('॥੧॥ ; .').length, 0);
});

test('script detection', () => {
  assert.equal(detectScript('ਸਤਿ ਨਾਮੁ'), 'gurmukhi');
  assert.equal(detectScript('सति नामु'), 'devanagari');
  assert.equal(detectScript('sat naam'), 'latin');
  assert.equal(detectScript('123'), 'other');
});
