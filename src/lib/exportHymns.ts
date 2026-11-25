// Turns hymns from the database into files: CSV (Excel), JSON (full backup)
// and the lines of a Word document. All three use the same layout that
// "Upload many" reads, so an export can always be uploaded again.

import { blocksToText, type Block } from './hymnText'
import { CSV_COLUMNS, type Named, type RightsStatus } from './importHymns'

export interface ExportHymn {
  id: string
  collection_id: string
  number: number
  title_ee: string
  title_en: string
  search_keywords: string
  source: string
  rights_status: RightsStatus
  status: 'draft' | 'published'
  category_ids: string[]
  ee: Block[]
  en: Block[]
}

export const RIGHTS_TEXT: Record<RightsStatus, string> = {
  public_domain: 'Public domain',
  permission_granted: 'Permission granted',
  original_work: 'Original work',
  unknown: 'Unknown',
}

const nameOf = (x: Named | undefined) => (x ? x.name_en || x.name_ee || x.slug : '')

/** Sorts by collection order, then number. */
export function sortForExport(hymns: ExportHymn[], collections: Named[]): ExportHymn[] {
  const order = new Map(collections.map((c, i) => [c.id, i]))
  return [...hymns].sort(
    (a, b) => (order.get(a.collection_id) ?? 99) - (order.get(b.collection_id) ?? 99) || a.number - b.number,
  )
}

export interface ExportRow {
  collection: string
  number: string
  ewe_title: string
  english_title: string
  categories: string
  rights: string
  source: string
  other_names: string
  ewe_words: string
  english_words: string
  status: string
}

export function toRows(hymns: ExportHymn[], collections: Named[], categories: Named[]): ExportRow[] {
  const col = new Map(collections.map((c) => [c.id, c]))
  const cat = new Map(categories.map((c) => [c.id, c]))
  return sortForExport(hymns, collections).map((h) => ({
    collection: nameOf(col.get(h.collection_id)),
    number: String(h.number),
    ewe_title: h.title_ee,
    english_title: h.title_en,
    categories: h.category_ids
      .map((id) => cat.get(id))
      .filter(Boolean)
      .sort((a, b) => categories.indexOf(a!) - categories.indexOf(b!))
      .map(nameOf)
      .join(', '),
    rights: RIGHTS_TEXT[h.rights_status],
    source: h.source,
    other_names: h.search_keywords,
    ewe_words: blocksToText(h.ee),
    english_words: blocksToText(h.en),
    status: h.status === 'published' ? 'Published' : 'Draft',
  }))
}

function csvCell(s: string) {
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV with a byte-order mark so Excel shows Ewe letters correctly. */
export function toCsv(rows: ExportRow[]): string {
  const cols = [...CSV_COLUMNS, 'status'] as (keyof ExportRow)[]
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c].replace(/\r?\n/g, '\r\n'))).join(','))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function toJson(rows: ExportRow[], when = new Date()): string {
  return JSON.stringify(
    {
      app: 'COC Ewe Hymnal',
      exported_at: when.toISOString(),
      count: rows.length,
      hymns: rows.map((r) => ({
        ...r,
        number: Number(r.number),
        categories: r.categories ? r.categories.split(', ') : [],
      })),
    },
    null,
    2,
  )
}

/**
 * The lines of a Word document in the typing-template layout.
 * '' is an empty line.
 */
export function toWordLines(rows: ExportRow[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    out.push(`Hymn ${r.number}`)
    out.push(`Collection: ${r.collection}`)
    out.push(`Ewe title: ${r.ewe_title}`)
    out.push(`English title: ${r.english_title}`)
    out.push(`Categories: ${r.categories}`)
    out.push(`Rights: ${r.rights}`)
    out.push(`Source: ${r.source}`)
    out.push(`Other names: ${r.other_names}`)
    out.push('')
    out.push('EWE')
    if (r.ewe_words) out.push(...r.ewe_words.split('\n'))
    out.push('')
    out.push('ENGLISH')
    if (r.english_words) out.push(...r.english_words.split('\n'))
    out.push('')
    out.push('----')
    out.push('')
  }
  return out
}

/** A file name such as "COC Ewe Hymnal backup 2026-11-25.json". */
export function exportFileName(kind: string, ext: string, when = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `COC Ewe Hymnal ${kind} ${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}.${ext}`
}
