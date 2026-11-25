import { describe, expect, it } from 'vitest'
import { runChecks } from './contentChecks'
import type { ExportHymn } from './exportHymns'

// Made-up test text only.
const collections = [{ id: 'c1', slug: 'hymns', name_ee: null, name_en: 'Hymns' }]
const base = (o: Partial<ExportHymn>): ExportHymn => ({
  id: 'x', collection_id: 'c1', number: 1, title_ee: 'Title', title_en: '', search_keywords: '', source: '',
  rights_status: 'public_domain', status: 'published', category_ids: ['k1'],
  ee: [{ kind: 'verse', body: 'a good first line here' }], en: [{ kind: 'verse', body: 'english' }], ...o,
})

describe('content checks', () => {
  it('finds nothing in a clean hymn', () => {
    expect(runChecks([base({})], collections)).toEqual([])
  })
  it('finds old-font leftovers, but not normal punctuation', () => {
    const f = runChecks([
      base({ id: 'a', number: 1, ee: [{ kind: 'verse', body: 'Mawu n4 lɔlɔ̃' }] }),
      base({ id: 'b', number: 2, title_ee: '$e ŋutɔ', ee: [{ kind: 'verse', body: 'other start of words' }] }),
      base({ id: 'c', number: 3, title_ee: 'Fine', ee: [{ kind: 'verse', body: "It's 3 o'clock, fine! Yes." }] }),
    ], collections)
    expect(f.filter((x) => x.kind === 'old-font').map((x) => x.number)).toEqual([1, 2])
  })
  it('finds duplicates, gaps, rights and drafts', () => {
    const f = runChecks([
      base({ id: 'a', number: 1, title_ee: 'Ŋkeke Nyui' }),
      base({ id: 'b', number: 4, title_ee: 'ŋkeke nyui!', rights_status: 'unknown', category_ids: [] }),
      base({ id: 'c', number: 5, title_ee: 'Other', status: 'draft', rights_status: 'unknown', en: [],
        ee: [{ kind: 'verse', body: Array(16).fill('line').join('\n') }] }),
    ], collections)
    const kinds = (k: string) => f.filter((x) => x.kind === k).map((x) => x.number ?? x.detail)
    expect(kinds('same-title')).toEqual([1, 4])
    expect(kinds('same-start')).toEqual([1, 4])
    expect(kinds('gaps')).toEqual(['Missing: 2–3'])
    expect(kinds('rights')).toEqual([4])
    expect(kinds('no-category')).toEqual([4])
    expect(kinds('draft')).toEqual([5])
    expect(kinds('long-verse')).toEqual([5])
    expect(kinds('no-english')).toEqual([5])
  })
  it('finds template text left in', () => {
    const f = runChecks([base({ title_ee: '[type the Ewe title]' })], collections)
    expect(f.map((x) => x.kind)).toContain('placeholder')
  })
})
