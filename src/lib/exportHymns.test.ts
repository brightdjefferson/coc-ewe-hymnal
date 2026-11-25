import { describe, expect, it } from 'vitest'
import { checkHymns, csvToRaw, jsonToRaw, parseCsv, parseWordLines } from './importHymns'
import { toCsv, toJson, toRows, toWordLines, type ExportHymn } from './exportHymns'

// Made-up test text only.
const collections = [
  { id: 'c1', slug: 'hymns', name_ee: 'Hawo', name_en: 'Hymns' },
  { id: 'c2', slug: 'choruses', name_ee: null, name_en: 'Choruses' },
]
const categories = [
  { id: 'k1', slug: 'worship', name_ee: null, name_en: 'Worship' },
  { id: 'k2', slug: 'lords-supper', name_ee: null, name_en: "Lord's Supper" },
]
const hymns: ExportHymn[] = [
  {
    id: 'h2', collection_id: 'c2', number: 3, title_ee: 'Kpɔ ɖa', title_en: '', search_keywords: '',
    source: '', rights_status: 'unknown', status: 'draft', category_ids: [],
    ee: [{ kind: 'verse', body: 'ŋkeke ƒe "line", with comma' }], en: [],
  },
  {
    id: 'h1', collection_id: 'c1', number: 12, title_ee: 'Tɛst Ɖekɛ', title_en: 'Test One', search_keywords: 'Old test',
    source: 'Test book 1901', rights_status: 'public_domain', status: 'published', category_ids: ['k2', 'k1'],
    ee: [
      { kind: 'verse', body: 'ewe a ɔ̃\newe b' },
      { kind: 'chorus', body: 'ha ʋ ɣ' },
      { kind: 'verse', body: 'ewe c' },
    ],
    en: [{ kind: 'verse', body: 'english a\nenglish b' }],
  },
]

const rows = toRows(hymns, collections, categories)

function same(checked: ReturnType<typeof checkHymns>) {
  expect(checked.map((c) => c.errors)).toEqual([[], []])
  const byNum = new Map(checked.map((c) => [c.number, c]))
  for (const h of hymns) {
    const c = byNum.get(h.number)!
    expect(c.collection_id).toBe(h.collection_id)
    expect(c.title_ee).toBe(h.title_ee)
    expect(c.title_en).toBe(h.title_en)
    expect(c.source).toBe(h.source)
    expect(c.search_keywords).toBe(h.search_keywords)
    expect(c.rights_status).toBe(h.rights_status)
    expect([...c.category_ids].sort()).toEqual([...h.category_ids].sort())
    expect(c.ee).toEqual(h.ee)
    expect(c.en).toEqual(h.en)
  }
}

describe('export', () => {
  it('sorts by collection then number and lists categories in order', () => {
    expect(rows.map((r) => r.collection + r.number)).toEqual(['Hymns12', 'Choruses3'])
    expect(rows[0].categories).toBe("Worship, Lord's Supper")
    expect(rows[1].status).toBe('Draft')
  })
  it('CSV loads back unchanged', () => {
    const csv = toCsv(rows)
    expect(csv.startsWith('﻿')).toBe(true)
    same(checkHymns(csvToRaw(parseCsv(csv)).hymns, collections, categories, []))
  })
  it('JSON loads back unchanged', () => {
    same(checkHymns(jsonToRaw(toJson(rows)).hymns, collections, categories, []))
  })
  it('Word layout loads back unchanged', () => {
    same(checkHymns(parseWordLines(toWordLines(rows)), collections, categories, []))
  })
})
