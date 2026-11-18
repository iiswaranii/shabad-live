# Input and output formats

## Corpus pack (`corpus/*.json`, format `shabad-live-corpus@1`)

```jsonc
{
  "format": "shabad-live-corpus@1",
  "provenance": { "dataset": "Shabad OS Database", "version": "4.8.7", "gurbaniLicence": "Public Domain Mark 1.0", ... },
  "source": { "id": 1, "nameEn": "Sri Guru Granth Sahib Ji", "namePa": "…", "pageNameEn": "Ang", "pageNamePa": "ਅੰਗ", "length": 1430 },
  "writers": { "1": { "en": "…", "pa": "…" } },
  "sections": { "1": { "en": "…", "pa": "…" } },
  "lineTypes": { "1": "Manglacharan", "2": "Sirlekh", "3": "Rahao", "4": "Pankti" },
  "shabads": [
    { "id": "MRB", "order": 1234, "writer": 5, "section": 3,
      "lines": [ ["70NE", 96, 4, "ਮੇਰਾ ਮਨੁ ਲੋਚੈ ਗੁਰ ਦਰਸਨ ਤਾਈ ॥"], ... ] }   // [lineId, page, type, original text], original order
  ]
}
```

Any permissioned, verified source can be converted to this shape. IDs must be stable, and
shabad lines must be contiguous and in original order. The importer checks both.

## Labelled clips (`format: shabad-live-clips@1`)

```jsonc
{
  "format": "shabad-live-clips@1",
  "synthetic": false,
  "note": "…",
  "clips": [
    {
      "id": "MRB-raagi1-phone",
      "shabadId": "MRB",                 // label: the shabad actually performed
      "split": "eval",                   // "tune" or "eval" — keep evaluation performances out of tuning
      "synthetic": false,
      "performance": { "id": "raagi1", "note": "distant phone, gurdwara hall" },
      "audio": "audio/MRB-raagi1.wav",   // needs an ASR adapter (see below), OR:
      "windows": [ { "t0": 0, "t1": 5, "text": "recogniser output…" } ],
      "truth": [ { "t0": 0, "t1": 6.2, "lineId": null }, { "t0": 6.2, "t1": 14.0, "lineId": "BHSH" } ]
    }
  ]
}
```

`truth` segments give what was being sung at each moment (`null` = instrumental or speech).
Clips may also be listed as `{ "file": "clips/x.json" }`.

**Audio:** the CLI does not yet include an ASR adapter, so clips with only `audio` are reported
as skipped. To evaluate real recordings now, run them through a recogniser and store its
output as `windows` (about 5 s windows every 1.5 s).

## Engine responses (app, API and CLI)

See `packages/core/src/types.ts`. Every response carries `sessionId`, `seq`, `t0`, `t1` and a
`reason`.

| status | meaning | key fields |
|---|---|---|
| `listening` | nothing usable heard yet (silence, instruments, a single common word) | — |
| `no_match` | words heard but no line matched | — |
| `ambiguous` | heard a line found in several shabads, or not yet distinctive | `heard {lineId, text}`, `candidates[]` with `shabadId`, `match: exact\|sound_alike`, `matchedLineIds`, `distinguishingLine`, `source {sourceEn, pageNameEn, page}` |
| `resolved` | shabad open | `shabadId`, `selectedBy: auto\|user`, `currentLineId`, `lineStatus: live\|paused`, `matchedLineIds`, `source`, `candidates` (for "all matches") |
| `uncertain_line` | shabad open, two or more places plausible: indicator paused | `possibleLineIds`, `lastLineId` |

## HTTP API (`services/api`)

```
POST   /v1/sessions                       -> { sessionId }
POST   /v1/sessions/:id/windows           { seq, t0, t1, text } -> response | 409 if seq is not newer
POST   /v1/sessions/:id/select            { shabadId }
POST   /v1/sessions/:id/clear
DELETE /v1/sessions/:id
GET    /v1/shabads/:id
POST   /v1/sessions/:id/audio             -> 501 until a server-side ASR adapter is configured
```

Sessions expire after 10 idle minutes. Audio is never stored.
