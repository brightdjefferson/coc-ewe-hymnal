import { describe, expect, it } from 'vitest'
import { buildIndex, search } from './search'
import { fold } from './fold'
import type { Collection, Hymn } from './types'

// Test data only: made-up words built from Ewe letters, not real hymn text.
const collections: Collection[] = [
  { id: 'c1', slug: 'hymns', name_ee: null, name_en: 'Hymns', sort_order: 1 },
  { id: 'c2', slug: 'choruses', name_ee: null, name_en: 'Choruses', sort_order: 2 },
]
function hymn(id: string, number: number, title_ee: string | null, title_en: string | null, ee = '', en = '', extra: Partial<Hymn> = {}): Hymn {
  return {
    id, collection_id: 'c1', number, title_ee, title_en, search_keywords: null, updated_at: '', category_ids: [],
    ee: ee ? ee.split('\n\n').map((body) => ({ kind: 'verse' as const, body })) : [],
    en: en ? en.split('\n\n').map((body) => ({ kind: 'verse' as const, body })) : [],
    ...extra,
  }
}
const hymns = [
  hymn('a', 12, 'Ɖɔ́ʋɛ Tɛstɔ', 'Morning Light', 'ŋkɔ ƒe gbe\nsecond line here'),
  hymn('b', 1, 'Ahɛ Kɔkɔ', 'Ahead We Go', 'first ewe line', 'first english line\nshining river'),
  hymn('c', 120, 'Gbɔ ɣe', null, 'ʋɔ zi'),
  hymn('d', 2, 'Other Title', 'Grace Abounding', '', 'all who ahead are\nmorning comes', { search_keywords: 'Blue Book 44' }),
  hymn('e', 3, 'Ahɛ in choruses', null, '', '', { collection_id: 'c2' }),
]
const index = buildIndex(hymns, collections)
const ids = (q: string, o = {}) => search(index, q, o).map((r) => r.hymn.id)

describe('fold', () => {
  it('maps Ewe letters to plain ones and drops tone marks', () => {
    expect(fold('Ɖɔ́ʋɛ ŊƑƔ ã')).toBe('dove nfg a')
    expect(fold('ɛ́ ɔ̌')).toBe('e o')
  })
})

describe('search', () => {
  it('puts an exact hymn number first, then numbers starting with it', () => {
    expect(ids('12')[0]).toBe('a')
    expect(ids('12')).toContain('c') // 120
    expect(ids('1')[0]).toBe('b')
  })

  it('finds Ewe titles typed with plain letters, with or without special letters', () => {
    expect(ids('dove')[0]).toBe('a')
    expect(ids('ɖɔʋɛ')[0]).toBe('a')
    expect(ids('Ɖɔ́ʋɛ')[0]).toBe('a')
    expect(ids('gbo ge')).toEqual(['c'])
  })

  it('finds an Ewe hymn by its English title and reports the English match', () => {
    const r = search(index, 'morning light')[0]
    expect(r.hymn.id).toBe('a')
    expect(r.field).toBe('title_en')
  })

  it('ranks titles that start with the text above titles that contain it, above lyrics', () => {
    const r = ids('ahe')
    expect(r.slice(0, 2).sort()).toEqual(['b', 'e']) // titles starting "Ahɛ" (Ewe) / "Ahead" (English)
    expect(r.indexOf('d')).toBeGreaterThan(1) // only in lyrics
  })

  it('finds three-letter fragments of Ewe and English titles', () => {
    expect(ids('tes')).toContain('a') // Tɛstɔ
    expect(ids('rac')).toContain('d') // Grace
  })

  it('searches the first line and any lyric line', () => {
    expect(ids('shining river')).toEqual(['b'])
    expect(ids('nko fe')).toEqual(['a'])
  })

  it('searches the other-names field', () => {
    expect(ids('blue book')).toEqual(['d'])
  })

  it('forgives small spelling mistakes', () => {
    expect(ids('morming')).toContain('a')
    expect(ids('graec')).toContain('d')
    expect(ids('abounidng')).toContain('d')
  })

  it('highlights the matching letters in the original text', () => {
    const r = search(index, 'dov')[0]
    expect(r.text.slice(r.ranges[0][0], r.ranges[0][1])).toBe('Ɖɔ́ʋ')
  })

  it('filters by category and collection', () => {
    expect(ids('ahe', { collectionId: 'c2' })).toEqual(['e'])
    expect(ids('ahe', { categoryId: 'nope' })).toEqual([])
  })

  it('returns nothing for an empty query and respects the limit', () => {
    expect(ids('  ')).toEqual([])
    expect(search(index, 'e', { limit: 2 })).toHaveLength(2)
  })
})
