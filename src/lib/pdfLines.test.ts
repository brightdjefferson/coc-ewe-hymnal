import { describe, expect, it } from 'vitest'
import { PAGE_BREAK, pagesToLines, type PdfItem } from './pdfLines'

// A fake page: each entry is [text, y] with 12pt text and ~14pt line spacing.
const item = (str: string, y: number, x = 72, size = 12): PdfItem => ({ str, x, y, w: str.length * 6, size })

describe('pagesToLines', () => {
  it('rebuilds lines and finds verse breaks from bigger gaps', () => {
    const lines = pagesToLines([
      { items: [item('Hymn 5', 800), item('EWE', 786), item('line one', 772), item('line two', 758), item('Chorus:', 730), item('chorus', 716), item('1', 40)] },
      { items: [item('verse two', 800), item('----', 772)] },
    ])
    expect(lines).toEqual(['Hymn 5', 'EWE', 'line one', 'line two', '', 'Chorus:', 'chorus', PAGE_BREAK, 'verse two', '', '----'])
  })

  it('joins pieces on the same line with spaces where there is a gap', () => {
    const lines = pagesToLines([{ items: [item('Ewe', 800, 72), item('title:', 800, 72 + 18 + 4), item('x', 786)] }])
    expect(lines[0]).toBe('Ewe title:')
  })

  it('puts separately drawn tone marks back on their letter', () => {
    // "ɛɔ" drawn as one piece, with an acute accent drawn over the ɔ
    const lines = pagesToLines([{ items: [item('ɛɔ', 800, 100), { str: '́', x: 106.5, y: 800, w: 0, size: 12 }] }])
    expect(lines[0]).toBe('ɛɔ́'.normalize('NFC'))
  })

  it('removes "Page 2 of 3" footers and fixes ligatures', () => {
    const lines = pagesToLines([{ items: [item('ﬁrst line', 800), item('Page 2 of 3', 40)] }])
    expect(lines).toEqual(['first line'])
  })
})

describe('page breaks', () => {
  it('marks where a new page starts', () => {
    const lines = pagesToLines([{ items: [item('a', 800)] }, { items: [item('b', 800)] }])
    expect(lines).toEqual(['a', PAGE_BREAK, 'b'])
  })
})
