import type { Hymn } from './types'

/** The local date as YYYY-MM-DD (changes at midnight on the phone). */
export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Picks the same hymn for everyone on a given day, from hymns that have
 * words. Works offline: it only uses the hymns saved on the phone.
 */
export function hymnOfTheDay(hymns: Hymn[], day = todayKey()): Hymn | null {
  const withWords = hymns.filter((h) => h.ee.length || h.en.length)
  if (!withWords.length) return null
  const sorted = [...withWords].sort((a, b) => a.id.localeCompare(b.id))
  return sorted[hash(day) % sorted.length]
}

/** First line of a hymn in the preferred language (falls back to the other). */
export function firstLine(h: Hymn, lang: 'ee' | 'en' | 'both'): { text: string; lang: 'ee' | 'en' } | null {
  const order: ('ee' | 'en')[] = lang === 'en' ? ['en', 'ee'] : ['ee', 'en']
  for (const l of order) {
    const line = h[l][0]?.body.split('\n')[0]?.trim()
    if (line) return { text: line, lang: l }
  }
  return null
}
