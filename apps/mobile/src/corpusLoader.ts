import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Corpus, type CorpusPack } from '@shabad/core';

export interface PackInfo { file: string; sourceId: number; nameEn: string; namePa: string; shabads: number; lines: number; bytes: number }

// On the web the packs are served next to the page. Native builds fetch them from the
// published site (configured in app.json `extra.corpusUrl`).
const base = (): string =>
  Platform.OS === 'web' ? 'corpus/' : ((Constants.expoConfig?.extra as { corpusUrl?: string } | undefined)?.corpusUrl ?? '');

export async function fetchManifest(): Promise<PackInfo[]> {
  const r = await fetch(`${base()}manifest.json`);
  if (!r.ok) throw new Error(`manifest ${r.status}`);
  return (await r.json()).packs;
}

const cache = new Map<string, CorpusPack>();

export async function loadCorpus(sourceIds: number[], packs: PackInfo[]): Promise<Corpus> {
  const wanted = packs.filter((p) => sourceIds.includes(p.sourceId));
  const loaded = await Promise.all(wanted.map(async (p) => {
    const hit = cache.get(p.file);
    if (hit) return hit;
    const r = await fetch(`${base()}${p.file}`);
    if (!r.ok) throw new Error(`${p.file} ${r.status}`);
    const json = (await r.json()) as CorpusPack;
    cache.set(p.file, json);
    return json;
  }));
  // Let the loading message paint before the index is built.
  await new Promise((r) => setTimeout(r, 30));
  return Corpus.fromPacks(loaded);
}
