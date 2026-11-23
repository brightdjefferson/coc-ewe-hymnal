// Reads many hymns at once from a Word document, a CSV file or a JSON
// file, and checks every one before anything is saved.

import { parseHymnText, type Block } from './hymnText'
import { fold } from './fold'

/** Placed between pages by the PDF reader (see pdfLines.ts). */
export const PAGE_BREAK = '\u0000page-break'

export type RightsStatus = 'public_domain' | 'permission_granted' | 'original_work' | 'unknown'

/** One hymn as found in the file, before checking. */
export interface RawHymn {
  where: string // "Hymn 12 (line 40)" or "Row 7"
  collection: string
  number: string
  title_ee: string
  title_en: string
  categories: string
  rights: string
  source: string
  other_names: string
  ewe: string
  english: string
  /** Set when the hymn's words run over a page break in a PDF. */
  crossesPage?: boolean
}

export interface Named {
  id: string
  slug: string
  name_ee: string | null
  name_en: string | null
}

export interface ExistingHymn {
  collection_id: string
  number: number
  title_ee: string | null
  title_en: string | null
}

export interface CheckedHymn {
  where: string
  ok: boolean
  errors: string[]
  warnings: string[]
  collection_id: string
  collection_name: string
  number: number | null
  title_ee: string
  title_en: string
  search_keywords: string
  source: string
  rights_status: RightsStatus
  category_ids: string[]
  ee: Block[]
  en: Block[]
}

// ---- Word documents -----------------------------------------------------------

const HYMN_RE = /^hymn\s*(?:no\.?|number|#)?\s*(\d{1,4})\b\s*[:.\-–—]?\s*(.*)$/i
const DETAIL_RE = /^(collection|ewe\s*title|english\s*title|categories|category|rights?|source|other\s*names?)\s*:\s*(.*)$/i
const LANG_RE = /^(ewe|english)\s*:?\s*$/i
const SEP_RE = /^(?:-{3,}|_{3,}|={3,}|\*{3,})$/

/**
 * Splits the lines of a Word document into hymns. `lines` holds one entry
 * per line of text; an empty string is an empty line.
 * Anything before the first "Hymn <number>" line (e.g. instructions) is ignored.
 */
export function parseWordLines(lines: string[]): RawHymn[] {
  const out: RawHymn[] = []
  let cur: RawHymn | null = null
  let lang: 'ewe' | 'english' | null = null
  const buf: Record<'ewe' | 'english', string[]> = { ewe: [], english: [] }

  const finish = () => {
    if (!cur) return
    cur.ewe = buf.ewe.join('\n')
    cur.english = buf.english.join('\n')
    out.push(cur)
    cur = null
    lang = null
    buf.ewe = []
    buf.english = []
  }

  lines.forEach((rawLine, i) => {
    if (rawLine === PAGE_BREAK) {
      if (cur && lang) (cur as RawHymn).crossesPage = true
      return
    }
    const line = rawLine.replace(/ /g, ' ').trim()
    const hymn = line.match(HYMN_RE)
    if (hymn) {
      finish() // also ends a hymn that had no "----" after it
      cur = {
        where: `Hymn ${hymn[1]} (line ${i + 1})`,
        collection: '', number: hymn[1], title_ee: hymn[2] ?? '', title_en: '', categories: '', rights: '',
        source: '', other_names: '', ewe: '', english: '',
      }
      return
    }
    if (!cur) return
    if (SEP_RE.test(line)) {
      finish()
      return
    }
    const marker = line.match(LANG_RE)
    if (marker) {
      lang = marker[1].toLowerCase() as 'ewe' | 'english'
      return
    }
    if (!lang) {
      const d = line.match(DETAIL_RE)
      if (d) {
        const key = d[1].toLowerCase().replace(/\s+/g, ' ')
        const val = d[2].trim()
        const c = cur as RawHymn
        if (key === 'collection') c.collection = val
        else if (key === 'ewe title') c.title_ee = val
        else if (key === 'english title') c.title_en = val
        else if (key.startsWith('categor')) c.categories = val
        else if (key.startsWith('right')) c.rights = val
        else if (key === 'source') c.source = val
        else if (key.startsWith('other name')) c.other_names = val
        return
      }
      // Words typed before "EWE": treat them as Ewe words.
      if (line) lang = 'ewe'
      else return
    }
    buf[lang].push(line)
  })
  finish()
  return out
}

/** Turns Word's HTML (from mammoth) into lines; each paragraph is a line. */
export function htmlToLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = [...doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')].filter(
    (el) => !el.querySelector('p, li, h1, h2, h3, h4, h5, h6'),
  )
  const lines: string[] = []
  for (const el of blocks) {
    const parts = el.innerHTML.split(/<br\s*\/?>/i)
    for (const part of parts) {
      const tmp = doc.createElement('div')
      tmp.innerHTML = part
      lines.push(tmp.textContent ?? '')
    }
  }
  return lines
}

// ---- CSV and JSON ---------------------------------------------------------------

export const CSV_COLUMNS = [
  'collection', 'number', 'ewe_title', 'english_title', 'categories', 'rights', 'source', 'other_names', 'ewe_words', 'english_words',
] as const

/** Reads CSV (comma or semicolon separated, quotes allowed, line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '')
  const firstLine = s.split(/\r?\n/, 1)[0] ?? ''
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

type TextKey = Exclude<keyof RawHymn, 'crossesPage'>
const KEY_ALIASES: Record<string, TextKey> = {
  collection: 'collection', number: 'number', no: 'number', hymn: 'number',
  ewetitle: 'title_ee', titleee: 'title_ee', englishtitle: 'title_en', titleen: 'title_en',
  categories: 'categories', category: 'categories', rights: 'rights', rightsstatus: 'rights',
  source: 'source', othernames: 'other_names', searchkeywords: 'other_names', keywords: 'other_names',
  ewewords: 'ewe', ewe: 'ewe', englishwords: 'english', english: 'english',
}
const keyOf = (h: string) => KEY_ALIASES[h.toLowerCase().replace(/[^a-z]/g, '')]

export function csvToRaw(rows: string[][]): { hymns: RawHymn[]; problem?: string } {
  if (rows.length === 0) return { hymns: [], problem: 'The file is empty.' }
  const head = rows[0].map(keyOf)
  if (!head.includes('number')) return { hymns: [], problem: 'The first row must be the column names from the template (it needs a "number" column).' }
  const hymns = rows.slice(1).map((r, i) => {
    const h: RawHymn = { where: `Row ${i + 2}`, collection: '', number: '', title_ee: '', title_en: '', categories: '', rights: '', source: '', other_names: '', ewe: '', english: '' }
    head.forEach((k, j) => {
      if (k && k !== 'where') h[k] = (r[j] ?? '').trim()
    })
    return h
  })
  return { hymns }
}

export function jsonToRaw(text: string): { hymns: RawHymn[]; problem?: string } {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { hymns: [], problem: 'This JSON file could not be read. Check it was saved from the template or from an export.' }
  }
  const list = Array.isArray(data) ? data : (data as { hymns?: unknown[] })?.hymns
  if (!Array.isArray(list)) return { hymns: [], problem: 'The JSON file should contain a list of hymns.' }
  const hymns = list.map((o, i) => {
    const h: RawHymn = { where: `Hymn #${i + 1} in file`, collection: '', number: '', title_ee: '', title_en: '', categories: '', rights: '', source: '', other_names: '', ewe: '', english: '' }
    for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) {
      const key = keyOf(k)
      if (!key || key === 'where') continue
      if (Array.isArray(v)) {
        // ["Worship","Prayer"] for categories, or verse objects/strings for words
        h[key] = v
          .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' && 'body' in x
            ? ((x as { kind?: string }).kind && (x as { kind?: string }).kind !== 'verse' ? `${capital((x as { kind: string }).kind)}:\n` : '') + String((x as { body: unknown }).body)
            : String(x)))
          .join(key === 'ewe' || key === 'english' ? '\n\n' : ', ')
      } else if (v != null) h[key] = String(v)
    }
    if (h.number) h.where = `Hymn ${h.number} (#${i + 1} in file)`
    return h
  })
  return { hymns }
}
const capital = (s: string) => (s === 'prechorus' ? 'Pre-chorus' : s[0].toUpperCase() + s.slice(1))

// ---- Checking ---------------------------------------------------------------------

function matchNamed<T extends Named>(list: T[], text: string): T | undefined {
  const f = fold(text)
  if (!f) return undefined
  return list.find((x) => fold(x.slug.replace(/-/g, ' ')) === f || fold(x.name_en) === f || fold(x.name_ee) === f)
}

function rightsOf(s: string): RightsStatus | null {
  const f = fold(s)
  if (!f || f.startsWith('unknown')) return 'unknown'
  if (f.startsWith('public')) return 'public_domain'
  if (f.startsWith('permission')) return 'permission_granted'
  if (f.startsWith('original') || f.includes('our team') || f.includes('written by')) return 'original_work'
  return null
}

const PLACEHOLDER = /\[[^\]]*(type|first verse|second verse|chorus lines|where the words|optional|e\.g\.)[^\]]*\]/i

export function checkHymns(
  raw: RawHymn[],
  collections: Named[],
  categories: Named[],
  existing: ExistingHymn[],
): CheckedHymn[] {
  const seen = new Map<string, string>()
  const defaultCol = collections[0]

  return raw.map((r) => {
    const errors: string[] = []
    const warnings: string[] = []
    const label = r.number ? `Hymn ${r.number}` : r.where

    // Collection
    let col = r.collection ? matchNamed(collections, r.collection) : defaultCol
    if (r.collection && !col) {
      errors.push(`${label}: collection “${r.collection}” doesn’t exist. Use one of: ${collections.map((c) => c.name_en || c.name_ee).join(', ')}.`)
    }
    if (!r.collection && defaultCol) warnings.push(`No collection given, so it will go into ${defaultCol.name_en || defaultCol.name_ee}.`)
    col = col ?? defaultCol

    // Number
    const n = /^\d+$/.test(r.number.trim()) ? Number(r.number.trim()) : null
    if (n === null || n < 1) errors.push(`${r.where}: the hymn number is missing or is not a number.`)

    // Duplicates
    if (n && col) {
      const key = `${col.id}:${n}`
      const clash = existing.find((e) => e.collection_id === col!.id && e.number === n)
      if (clash)
        errors.push(`${label}: hymn number ${n} already exists in ${col.name_en || col.name_ee} (“${clash.title_ee || clash.title_en}”). Change the number, or delete the old one first.`)
      if (seen.has(key)) errors.push(`${label}: number ${n} is used twice in this file (also at ${seen.get(key)}).`)
      else seen.set(key, r.where)
    }

    // Titles
    const title_ee = r.title_ee.trim()
    const title_en = r.title_en.trim()
    if (!title_ee && !title_en) errors.push(`${label}: there is no Ewe title and no English title.`)

    // Template text left in
    const all = [r.title_ee, r.title_en, r.categories, r.rights, r.source, r.other_names, r.ewe, r.english].join('\n')
    if (PLACEHOLDER.test(all)) errors.push(`${label}: still has the template’s grey example text in [square brackets]. Replace it with the real words or delete it.`)

    // Words
    const ee = parseHymnText(r.ewe)
    const en = parseHymnText(r.english)
    if (!ee.length && !en.length) warnings.push('No words yet. It will be saved as a draft without words.')
    else if (!en.length) warnings.push('No English words.')
    else if (!ee.length && col?.slug !== 'english-hymns') warnings.push('No Ewe words.')

    if (r.crossesPage)
      warnings.push('This hymn goes over a page break in the PDF. Open it and check the verses are split correctly; a verse break that falls on a page break can be missed.')

    // Rights
    let rights = rightsOf(r.rights)
    if (rights === null) {
      errors.push(`${label}: rights “${r.rights}” is not one of: Public domain, Permission granted, Original work, Unknown.`)
      rights = 'unknown'
    } else if (rights === 'unknown') warnings.push('Rights are unknown.')

    // Categories
    const category_ids: string[] = []
    for (const name of r.categories.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
      const c = matchNamed(categories, name)
      if (c) category_ids.push(c.id)
      else warnings.push(`Category “${name}” doesn’t exist and will be skipped.`)
    }

    return {
      where: r.where,
      ok: errors.length === 0,
      errors,
      warnings,
      collection_id: col?.id ?? '',
      collection_name: col ? col.name_en || col.name_ee || '' : '',
      number: n,
      title_ee,
      title_en,
      search_keywords: r.other_names.trim(),
      source: r.source.trim(),
      rights_status: rights,
      category_ids: [...new Set(category_ids)],
      ee,
      en,
    }
  })
}

// ---- Templates ----------------------------------------------------------------------

function csvCell(s: string) {
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvTemplate(): string {
  const example = [
    'Hymns', '1', '[type the Ewe title]', '[type the English title, or leave blank]', 'Worship, Prayer', 'Public domain',
    '[where the words came from]', '',
    '[first verse line one]\n[first verse line two]\n\nChorus:\n[chorus lines]\n\n[second verse]',
    '[first verse]\n\nChorus:\n[chorus lines]\n\n[second verse]',
  ]
  return '﻿' + [CSV_COLUMNS.join(','), example.map(csvCell).join(',')].join('\r\n') + '\r\n'
}

export function jsonTemplate(): string {
  return JSON.stringify(
    [
      {
        collection: 'Hymns',
        number: 1,
        ewe_title: '[type the Ewe title]',
        english_title: '[type the English title, or leave blank]',
        categories: ['Worship', 'Prayer'],
        rights: 'Public domain',
        source: '[where the words came from]',
        other_names: '',
        ewe_words: '[first verse]\n\nChorus:\n[chorus lines]\n\n[second verse]',
        english_words: '[first verse]\n\nChorus:\n[chorus lines]\n\n[second verse]',
      },
    ],
    null,
    2,
  )
}
