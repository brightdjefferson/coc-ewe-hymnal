import { describe, expect, it } from 'vitest'
import { blocksToText, parseHymnText } from './hymnText'

describe('parseHymnText', () => {
  it('splits verses on blank lines and keeps line breaks', () => {
    const blocks = parseHymnText('line one\nline two\n\nline three\nline four')
    expect(blocks).toEqual([
      { kind: 'verse', body: 'line one\nline two' },
      { kind: 'verse', body: 'line three\nline four' },
    ])
  })

  it('recognises Chorus: on its own line or followed by text', () => {
    expect(parseHymnText('v1\n\nChorus:\nc1\nc2')[1]).toEqual({ kind: 'chorus', body: 'c1\nc2' })
    expect(parseHymnText('v1\n\nchorus: c1\nc2')[1]).toEqual({ kind: 'chorus', body: 'c1\nc2' })
    expect(parseHymnText('Refrain:\nr')[0].kind).toBe('refrain')
    expect(parseHymnText('Pre-chorus:\np')[0].kind).toBe('prechorus')
    expect(parseHymnText('Pre chorus: p')[0].kind).toBe('prechorus')
  })

  it('removes verse numbers but not other numbers', () => {
    expect(parseHymnText('1. first\nsecond')[0].body).toBe('first\nsecond')
    expect(parseHymnText('2) first')[0].body).toBe('first')
    expect(parseHymnText('3 days later')[0].body).toBe('3 days later')
  })

  it('copes with Windows line endings, extra blank lines and trailing spaces', () => {
    const blocks = parseHymnText('a  \r\nb\r\n\r\n\r\n   \r\nc\r\n')
    expect(blocks).toEqual([
      { kind: 'verse', body: 'a\nb' },
      { kind: 'verse', body: 'c' },
    ])
  })

  it('keeps Ewe letters and combining tone marks', () => {
    const s = 'ɖ ɛ ɔ ŋ ƒ ʋ ɣ Ɖ Ɛ Ɔ Ŋ Ƒ Ʋ Ɣ ɛ́ ɔ̌'
    expect(parseHymnText(s)[0].body).toBe(s.normalize('NFC'))
  })

  it('returns nothing for an empty box', () => {
    expect(parseHymnText('  \n\n ')).toEqual([])
  })

  it('round-trips through blocksToText', () => {
    const text = 'v1 a\nv1 b\n\nChorus:\nc\n\nv2'
    expect(blocksToText(parseHymnText(text))).toBe(text)
    expect(parseHymnText(blocksToText(parseHymnText(text)))).toEqual(parseHymnText(text))
  })
})
