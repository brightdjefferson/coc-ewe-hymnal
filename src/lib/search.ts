// Hymn search that works offline, ignores tone marks and special letters,
// forgives small spelling mistakes, and ranks results as the brief asks:
//   exact number → titles starting with the text → titles containing it
//   → other names (keywords) → first line → any lyric line → near-misses.

import { foldWithMap, type Folded } from './fold'
import type { Collection, Hymn } from './types'

export type MatchField = 'number' | 'title_ee' | 'title_en' | 'keywords' | 'line'

export interface SearchResult {
  hymn: Hymn
  score: number
  field: MatchField
  /** The text that matched (a title, the keywords, or a lyric line). */
  text: string
  /** Character ranges in `text` to highlight. */
  ranges: [number, number][]
  /** For lyric matches: which language the line is in. */
  lang?: 'ee' | 'en'
}

interface Field {
  name: MatchField
  kind: 'title' | 'keywords' | 'first' | 'line'
  raw: string
  f: Folded
  lang?: 'ee' | 'en'
}

interface Entry {
  hymn: Hymn
  order: number
  number: string
  fields: Field[]
}

export interface SearchIndex {
  entries: Entry[]
}

const MARK = /\p{M}/u

export function buildIndex(hymns: Hymn[], collections: Collection[]): SearchIndex {
  const order = new Map(collections.map((c, i) => [c.id, i]))
  const entries = hymns.map((hymn) => {
    const fields: Field[] = []
    const add = (name: MatchField, kind: Field['kind'], raw: string | null, lang?: 'ee' | 'en') => {
      if (raw && raw.trim()) fields.push({ name, kind, raw, f: foldWithMap(raw), lang })
    }
    add('title_ee', 'title', hymn.title_ee, 'ee')
    add('title_en', 'title', hymn.title_en, 'en')
    add('keywords', 'keywords', hymn.search_keywords)
    for (const lang of ['ee', 'en'] as const) {
      hymn[lang].forEach((block, bi) =>
        block.body.split('\n').forEach((line, li) => add('line', bi === 0 && li === 0 ? 'first' : 'line', line, lang)),
      )
    }
    return { hymn, order: order.get(hymn.collection_id) ?? 99, number: String(hymn.number), fields }
  })
  return { entries }
}

// ---- helpers -----------------------------------------------------------------

function toRange(field: Field, start: number, len: number): [number, number] {
  const map = field.f.map
  const s = map[start]
  let e = map[start + len - 1] + 1
  while (e < field.raw.length && MARK.test(field.raw[e])) e++
  return [s, e]
}

function isWordStart(text: string, i: number) {
  return i === 0 || text[i - 1] === ' '
}

/** Edit distance with swaps (so "ahe" vs "hae" counts as one mistake). */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev2 = new Array(b.length + 1).fill(0)
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      rowMin = Math.min(rowMin, v)
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]
    prev = cur
  }
  return prev[b.length]
}

function allowedMistakes(token: string) {
  return token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0
}

/** Every query word appears somewhere in the field. Returns highlight ranges. */
function tokensMatch(field: Field, tokens: string[]): [number, number][] | null {
  const ranges: [number, number][] = []
  for (const t of tokens) {
    const i = field.f.text.indexOf(t)
    if (i < 0) return null
    ranges.push(toRange(field, i, t.length))
  }
  return ranges
}

/** Every query word is close to the start of some word in the field. */
function fuzzyMatch(field: Field, tokens: string[]): [number, number][] | null {
  const text = field.f.text
  const words: { w: string; at: number }[] = []
  let at = 0
  for (const w of text.split(' ')) {
    words.push({ w, at })
    at += w.length + 1
  }
  const ranges: [number, number][] = []
  for (const t of tokens) {
    const max = allowedMistakes(t)
    let hit: { at: number; len: number } | null = null
    for (const { w, at: wAt } of words) {
      if (w.startsWith(t)) {
        hit = { at: wAt, len: t.length }
        break
      }
      if (max === 0) continue
      // compare against the start of the word, allowing a letter more or less
      for (const len of [t.length, t.length - 1, t.length + 1]) {
        if (len < 1 || len > w.length) continue
        if (distance(t, w.slice(0, len), max) <= max) {
          hit = { at: wAt, len }
          break
        }
      }
      if (hit) break
    }
    if (!hit) return null
    ranges.push(toRange(field, hit.at, hit.len))
  }
  return ranges
}

// ---- search --------------------------------------------------------------------

export interface SearchOptions {
  limit?: number
  categoryId?: string | null
  collectionId?: string | null
}

export function search(index: SearchIndex, query: string, opts: SearchOptions = {}): SearchResult[] {
  const q = foldWithMap(query).text
  if (!q) return []
  const tokens = q.split(' ').filter(Boolean)
  const digits = /^\d+$/.test(q)
  const results: SearchResult[] = []

  for (const e of index.entries) {
    if (opts.categoryId && !e.hymn.category_ids.includes(opts.categoryId)) continue
    if (opts.collectionId && e.hymn.collection_id !== opts.collectionId) continue

    let best: SearchResult | null = null
    const offer = (r: SearchResult) => {
      if (!best || r.score > best.score) best = r
    }

    if (digits) {
      if (e.number === q) offer({ hymn: e.hymn, score: 1000, field: 'number', text: e.number, ranges: [[0, e.number.length]] })
      else if (e.number.startsWith(q))
        offer({ hymn: e.hymn, score: 900, field: 'number', text: e.number, ranges: [[0, q.length]] })
    }

    for (const f of e.fields) {
      const i = f.f.text.indexOf(q)
      const base = { hymn: e.hymn, field: f.name, text: f.raw, lang: f.lang }
      if (i >= 0) {
        const ranges = [toRange(f, i, q.length)]
        let score = 0
        if (f.kind === 'title') score = i === 0 ? 800 : isWordStart(f.f.text, i) ? 700 : 600
        else if (f.kind === 'keywords') score = isWordStart(f.f.text, i) ? 560 : 540
        else if (f.kind === 'first') score = 450
        else score = 400
        offer({ ...base, score, ranges })
        continue
      }
      if (tokens.length > 1) {
        const ranges = tokensMatch(f, tokens)
        if (ranges) {
          const score = f.kind === 'title' ? 580 : f.kind === 'keywords' ? 530 : f.kind === 'first' ? 440 : 350
          offer({ ...base, score, ranges })
        }
      }
    }
    if (best) results.push(best)
  }

  // Near-misses (small spelling mistakes), only when exact matches are few.
  const limit = opts.limit ?? 50
  if (results.length < limit && tokens.some((t) => allowedMistakes(t) > 0)) {
    const found = new Set(results.map((r) => r.hymn.id))
    for (const e of index.entries) {
      if (found.has(e.hymn.id)) continue
      if (opts.categoryId && !e.hymn.category_ids.includes(opts.categoryId)) continue
      if (opts.collectionId && e.hymn.collection_id !== opts.collectionId) continue
      let best: SearchResult | null = null
      for (const f of e.fields) {
        const score = f.kind === 'title' ? 300 : f.kind === 'keywords' ? 280 : 200
        if (best && (best as SearchResult).score >= score) continue
        const ranges = fuzzyMatch(f, tokens)
        if (ranges) best = { hymn: e.hymn, score, field: f.name, text: f.raw, ranges, lang: f.lang }
      }
      if (best) results.push(best)
    }
  }

  const order = new Map(index.entries.map((e) => [e.hymn.id, e.order]))
  results.sort(
    (a, b) => b.score - a.score || (order.get(a.hymn.id) ?? 0) - (order.get(b.hymn.id) ?? 0) || a.hymn.number - b.hymn.number,
  )
  return results.slice(0, limit)
}
