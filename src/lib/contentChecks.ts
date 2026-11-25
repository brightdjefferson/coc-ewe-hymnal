// Looks through all hymns for things an admin may want to fix.
// It only reports; it never changes anything.

import { fold } from './fold'
import type { ExportHymn } from './exportHymns'
import type { Named } from './importHymns'

export type CheckKind =
  | 'old-font'
  | 'placeholder'
  | 'no-ewe'
  | 'no-title'
  | 'same-title'
  | 'same-start'
  | 'long-verse'
  | 'rights'
  | 'no-category'
  | 'gaps'
  | 'no-english'
  | 'verse-count'
  | 'draft'

export interface CheckGroup {
  kind: CheckKind
  title: string
  help: string
  /** "fix" = probably wrong; "look" = worth a look; "info" = for your information */
  level: 'fix' | 'look' | 'info'
}

export const CHECKS: CheckGroup[] = [
  { kind: 'old-font', level: 'fix', title: 'Possible leftovers from the old Capecoast font',
    help: 'A number or symbol inside a word, such as “n4” or “$”, where an Ewe letter (ɔ, Ɔ, ɖ, …) probably belongs.' },
  { kind: 'placeholder', level: 'fix', title: 'Template text not replaced',
    help: 'Text like “[type the Ewe title]” from the template is still there.' },
  { kind: 'no-ewe', level: 'fix', title: 'No Ewe words', help: 'The hymn has no Ewe verses.' },
  { kind: 'no-title', level: 'fix', title: 'No Ewe title', help: 'The hymn has words in Ewe but no Ewe title.' },
  { kind: 'same-title', level: 'look', title: 'Same title as another hymn',
    help: 'Two hymns share a title. They may be the same hymn entered twice.' },
  { kind: 'same-start', level: 'look', title: 'Starts with the same line as another hymn',
    help: 'Two hymns begin with the same words. They may be the same hymn entered twice.' },
  { kind: 'long-verse', level: 'look', title: 'Very long verse',
    help: 'A verse with many lines. A blank line between two verses may be missing.' },
  { kind: 'rights', level: 'look', title: 'Published, but rights are “Unknown”',
    help: 'Check that the church may use these words, then set the rights on the hymn’s page.' },
  { kind: 'no-category', level: 'look', title: 'No category', help: 'The hymn is not in any category yet.' },
  { kind: 'gaps', level: 'info', title: 'Missing numbers', help: 'Numbers that are skipped in a collection.' },
  { kind: 'no-english', level: 'info', title: 'No English words', help: 'The hymn has Ewe words only.' },
  { kind: 'verse-count', level: 'info', title: 'Ewe and English have a different number of verses',
    help: 'Not always wrong, but worth checking that no verse was left out.' },
  { kind: 'draft', level: 'info', title: 'Still a draft', help: 'Not visible in the reader app until published.' },
]

export interface Finding {
  kind: CheckKind
  hymnId?: string
  collectionId: string
  number?: number
  label: string // "Hymns 12 · Title"
  detail: string
}

const OLD_FONT_IN_WORD = /(?<=\p{L})[0-9$@#%^&*`~[\]{}_]+(?=\p{L}|\s|$|[,.;:!?'"’)])/u
const OLD_FONT_START = /(^|\s)[$@#%^&*`~[{_](?=\p{L})/u
const PLACEHOLDER = /\[[^\]]*(type|first verse|second verse|chorus lines|where the words|optional|e\.g\.)[^\]]*\]/i
const LONG_VERSE_LINES = 14

function firstLine(h: ExportHymn): string {
  return (h.ee[0]?.body ?? h.en[0]?.body ?? '').split('\n')[0].trim()
}

export function runChecks(hymns: ExportHymn[], collections: Named[]): Finding[] {
  const colName = new Map(collections.map((c) => [c.id, c.name_en || c.name_ee || c.slug]))
  const label = (h: ExportHymn) => `${colName.get(h.collection_id) ?? ''} ${h.number} · ${h.title_ee || h.title_en}`
  const out: Finding[] = []
  const add = (kind: CheckKind, h: ExportHymn, detail: string) =>
    out.push({ kind, hymnId: h.id, collectionId: h.collection_id, number: h.number, label: label(h), detail })

  const byTitle = new Map<string, ExportHymn[]>()
  const byStart = new Map<string, ExportHymn[]>()

  for (const h of hymns) {
    // Old font leftovers and template text, in titles and words
    const texts: [string, string][] = [
      ['Ewe title', h.title_ee],
      ['English title', h.title_en],
      ...h.ee.flatMap((b, i) => b.body.split('\n').map((l): [string, string] => [`Ewe verse ${i + 1}`, l])),
      ...h.en.flatMap((b, i) => b.body.split('\n').map((l): [string, string] => [`English verse ${i + 1}`, l])),
    ]
    const oldFont = texts.find(([, t]) => OLD_FONT_IN_WORD.test(t) || OLD_FONT_START.test(t))
    if (oldFont) add('old-font', h, `${oldFont[0]}: “${oldFont[1].trim()}”`)
    const ph = texts.find(([, t]) => PLACEHOLDER.test(t))
    if (ph) add('placeholder', h, `${ph[0]}: “${ph[1].trim()}”`)

    if (!h.ee.length) add('no-ewe', h, h.en.length ? 'English words only.' : 'No words at all.')
    else if (!h.title_ee.trim()) add('no-title', h, h.title_en ? `English title: ${h.title_en}` : '')
    if (h.ee.length && !h.en.length) add('no-english', h, '')
    if (h.ee.length && h.en.length && h.ee.length !== h.en.length)
      add('verse-count', h, `${h.ee.length} Ewe, ${h.en.length} English`)

    const long = [...h.ee.map((b, i) => ['Ewe', i, b] as const), ...h.en.map((b, i) => ['English', i, b] as const)].find(
      ([, , b]) => b.body.split('\n').length > LONG_VERSE_LINES,
    )
    if (long) add('long-verse', h, `${long[0]} verse ${long[1] + 1} has ${long[2].body.split('\n').length} lines`)

    if (h.status === 'published' && h.rights_status === 'unknown') add('rights', h, '')
    if (!h.category_ids.length) add('no-category', h, '')
    if (h.status === 'draft') add('draft', h, '')

    for (const t of [h.title_ee, h.title_en]) {
      const k = fold(t).replace(/[^a-z0-9 ]/g, '').trim()
      if (k) byTitle.set(k, [...(byTitle.get(k) ?? []), h])
    }
    const s = fold(firstLine(h)).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    if (s.length >= 8) byStart.set(s, [...(byStart.get(s) ?? []), h])
  }

  const pairs = (map: Map<string, ExportHymn[]>, kind: CheckKind) => {
    const done = new Set<string>()
    for (const list of map.values()) {
      const uniq = [...new Map(list.map((h) => [h.id, h])).values()]
      if (uniq.length < 2) continue
      for (const h of uniq) {
        if (done.has(h.id)) continue
        done.add(h.id)
        const others = uniq.filter((o) => o.id !== h.id).map((o) => `${colName.get(o.collection_id) ?? ''} ${o.number}`)
        add(kind, h, `Also: ${others.join(', ')}`)
      }
    }
  }
  pairs(byTitle, 'same-title')
  pairs(byStart, 'same-start')

  // Missing numbers in each collection (up to the highest number used)
  for (const c of collections) {
    const nums = hymns.filter((h) => h.collection_id === c.id).map((h) => h.number).sort((a, b) => a - b)
    if (!nums.length) continue
    const have = new Set(nums)
    const ranges: string[] = []
    let start = 0
    for (let n = 1; n <= nums[nums.length - 1] + 1; n++) {
      if (!have.has(n) && n <= nums[nums.length - 1]) {
        if (!start) start = n
      } else if (start) {
        ranges.push(start === n - 1 ? `${start}` : `${start}–${n - 1}`)
        start = 0
      }
    }
    if (ranges.length)
      out.push({ kind: 'gaps', collectionId: c.id, label: colName.get(c.id) ?? '', detail: `Missing: ${ranges.join(', ')}` })
  }

  return out
}
