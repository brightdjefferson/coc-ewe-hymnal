import { describe, expect, it } from 'vitest'
import { checkHymns, csvToRaw, jsonToRaw, parseCsv, parseWordLines, csvTemplate } from './importHymns'

// Made-up test text only.
const collections = [
  { id: 'c1', slug: 'hymns', name_ee: null, name_en: 'Hymns' },
  { id: 'c4', slug: 'english-hymns', name_ee: null, name_en: 'English Hymns' },
]
const categories = [
  { id: 'k1', slug: 'worship', name_ee: null, name_en: 'Worship' },
  { id: 'k2', slug: 'lords-supper', name_ee: null, name_en: "Lord's Supper" },
]

const word = `COC Ewe Hymnal
The rules
Collection:
Start every hymn with a line that says Hymn and its number, e.g. Hymn 12.
Hymns
Hymn 1
Collection: Hymns
Ewe title: Tɛst Ɖekɛ
English title: Test One
Categories: Worship, Lord’s Supper
Rights: Public domain
Source: Test book 1901
Other names: Old test
EWE
ewe line a ɔ
ewe line b

Chorus:
ewe chorus

ewe verse two
ENGLISH
english line a

Chorus:
english chorus
----
Hymn 2
Ewe title: Tɛst Eve
Rights: Original work
EWE
only ewe
----
Hymn 3
Ewe title: [type the Ewe title]
EWE
[first verse, one line per line of the hymn]
----`.split('\n')

describe('Word layout', () => {
  const raw = parseWordLines(word)
  it('finds each hymn and ignores the instructions', () => {
    expect(raw.map((r) => r.number)).toEqual(['1', '2', '3'])
  })
  it('reads the detail lines and the words', () => {
    expect(raw[0]).toMatchObject({ collection: 'Hymns', title_ee: 'Tɛst Ɖekɛ', title_en: 'Test One', rights: 'Public domain', other_names: 'Old test' })
    expect(raw[0].ewe).toBe('ewe line a ɔ\newe line b\n\nChorus:\newe chorus\n\newe verse two')
    expect(raw[0].english).toBe('english line a\n\nChorus:\nenglish chorus')
  })
  it('checks hymns and explains problems', () => {
    const c = checkHymns(raw, collections, categories, [{ collection_id: 'c1', number: 2, title_ee: 'Existing', title_en: null }])
    expect(c[0].ok).toBe(true)
    expect(c[0].category_ids).toEqual(['k1', 'k2']) // curly apostrophe still matches
    expect(c[0].ee.map((b) => b.kind)).toEqual(['verse', 'chorus', 'verse'])
    expect(c[0].rights_status).toBe('public_domain')
    expect(c[1].ok).toBe(false)
    expect(c[1].errors[0]).toMatch(/hymn number 2 already exists in Hymns \(“Existing”\)/)
    expect(c[1].warnings).toContain('No English words.')
    expect(c[2].errors.join(' ')).toMatch(/template’s grey example text/)
  })
  it('a new "Hymn" line ends the previous hymn even without ----', () => {
    const r = parseWordLines(['Hymn 5', 'Ewe title: A', 'EWE', 'x', 'Hymn 6', 'Ewe title: B', 'EWE', 'y'])
    expect(r.map((h) => [h.number, h.ewe])).toEqual([['5', 'x'], ['6', 'y']])
  })
})

describe('CSV', () => {
  it('reads quotes, commas and line breaks inside cells, and semicolon files', () => {
    const text = 'number,ewe_title,english_title,ewe_words\r\n7,"Tɛst, with comma","Say ""hi""","line 1\nline 2\n\nChorus:\nc"\r\n'
    const { hymns } = csvToRaw(parseCsv(text))
    expect(hymns[0]).toMatchObject({ where: 'Row 2', number: '7', title_ee: 'Tɛst, with comma', title_en: 'Say "hi"' })
    expect(hymns[0].ewe).toBe('line 1\nline 2\n\nChorus:\nc')
    expect(csvToRaw(parseCsv('number;ewe_title\n8;X\n')).hymns[0]).toMatchObject({ number: '8', title_ee: 'X' })
  })
  it('flags duplicate numbers within the file, bad rights and unknown collections', () => {
    const { hymns } = csvToRaw(parseCsv('collection,number,ewe_title,rights\nHymns,4,A,Public domain\nHymns,4,B,maybe\nPsalms,5,C,\n'))
    const c = checkHymns(hymns, collections, categories, [])
    expect(c[0].ok).toBe(true)
    expect(c[1].errors.join(' ')).toMatch(/used twice in this file \(also at Row 2\)/)
    expect(c[1].errors.join(' ')).toMatch(/rights “maybe” is not one of/)
    expect(c[2].errors[0]).toMatch(/collection “Psalms” doesn’t exist/)
  })
  it('the template downloads with every column', () => {
    expect(parseCsv(csvTemplate())[0]).toHaveLength(10)
  })
})

describe('JSON', () => {
  it('reads lists of hymns, with category lists and verse objects', () => {
    const { hymns } = jsonToRaw(JSON.stringify([{ number: 9, ewe_title: 'T', categories: ['Worship'], ewe_words: [{ kind: 'verse', body: 'a' }, { kind: 'chorus', body: 'c' }] }]))
    expect(hymns[0]).toMatchObject({ number: '9', categories: 'Worship', ewe: 'a\n\nChorus:\nc' })
    expect(jsonToRaw('nope').problem).toMatch(/could not be read/)
  })
})

describe('PDF page breaks', () => {
  it('warns about hymns whose words cross a page break', () => {
    const raw = parseWordLines(['Hymn 1', 'Ewe title: A', 'Rights: Original work', 'EWE', 'a', '\u0000page-break', 'b', '----', '\u0000page-break', 'Hymn 2', 'Ewe title: B', 'EWE', 'c'])
    const c = checkHymns(raw, collections, categories, [])
    expect(raw.map((r) => r.ewe)).toEqual(['a\nb', 'c'])
    expect(c[0].warnings.join(' ')).toMatch(/page break/)
    expect(c[1].warnings.join(' ')).not.toMatch(/page break/)
  })
})
