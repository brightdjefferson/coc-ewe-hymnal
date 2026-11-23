import { PAGE_BREAK } from './importHymns'
export { PAGE_BREAK }

// Turns the text of a PDF into lines, like a Word document's paragraphs.
// A PDF only stores where each piece of text sits on the page, so lines are
// rebuilt from positions, and an empty line (a verse break) is assumed
// wherever the space between two lines is clearly bigger than usual.

export interface PdfItem {
  str: string
  x: number
  y: number // from the bottom of the page, as in PDF
  w: number
  size: number
}

export interface PdfPage {
  items: PdfItem[]
}

const ONLY_MARKS = /^\p{M}+$/u
const PAGE_NUMBER = /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i
const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' }

interface Line {
  y: number
  size: number
  text: string
}

function buildLines(items: PdfItem[]): Line[] {
  const real = items.filter((i) => i.str.length > 0)
  // Group into rows by height on the page.
  const sorted = [...real].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: PdfItem[][] = []
  for (const it of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - it.y) <= Math.max(row[0].size, it.size) * 0.45) row.push(it)
    else rows.push([it])
  }
  return rows.map((row) => {
    const bases = row.filter((i) => !ONLY_MARKS.test(i.str)).sort((a, b) => a.x - b.x)
    const marks = row.filter((i) => ONLY_MARKS.test(i.str))
    // Put separately-drawn tone marks back after the letter they sit on.
    const strs = bases.map((b) => [...b.str])
    for (const m of marks) {
      let best = -1
      for (let k = 0; k < bases.length; k++) if (bases[k].x <= m.x + m.size * 0.1) best = k
      if (best < 0) best = 0
      if (!strs[best]) continue
      const b = bases[best]
      const chars = strs[best]
      const per = b.w > 0 && chars.length ? b.w / chars.length : m.size * 0.5
      const idx = Math.min(chars.length - 1, Math.max(0, Math.floor((m.x - b.x + per * 0.5) / per)))
      chars[idx] = chars[idx] + m.str
    }
    let text = ''
    let end = -Infinity
    bases.forEach((b, k) => {
      const s = strs[k].join('')
      if (text && b.x - end > b.size * 0.2 && !text.endsWith(' ') && !s.startsWith(' ')) text += ' '
      text += s
      end = Math.max(end, b.x + b.w)
    })
    const size = Math.max(...row.map((i) => i.size))
    return { y: Math.max(...row.map((i) => i.y)), size, text: text.replace(/\s+/g, ' ').trim() }
  })
}

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function pagesToLines(pages: PdfPage[]): string[] {
  const perPage = pages.map((p) => {
    const lines = buildLines(p.items).filter((l) => l.text)
    // Drop page numbers at the very top or bottom of a page.
    if (lines.length && PAGE_NUMBER.test(lines[lines.length - 1].text)) lines.pop()
    if (lines.length && PAGE_NUMBER.test(lines[0].text)) lines.shift()
    return lines
  })

  // Usual distance between lines, measured in "font sizes".
  const ratios: number[] = []
  for (const lines of perPage)
    for (let i = 1; i < lines.length; i++) ratios.push((lines[i - 1].y - lines[i].y) / Math.max(lines[i].size, 1))
  const usual = median(ratios) || 1.2
  const blankAbove = Math.max(usual * 1.5, 1.7)

  const out: string[] = []
  perPage.forEach((lines, pageIndex) => {
    // Mark page breaks: an empty line between verses can be hidden by one.
    if (pageIndex > 0 && lines.length) out.push(PAGE_BREAK)
    lines.forEach((l, i) => {
      if (i > 0) {
        const gap = (lines[i - 1].y - l.y) / Math.max(l.size, 1)
        if (gap > blankAbove) out.push('')
      }
      out.push(l.text.replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c).normalize('NFC'))
    })
  })
  return out
}

/** Reads a PDF file in the browser. Returns its lines, or a problem message. */
export async function readPdfLines(data: ArrayBuffer): Promise<{ lines: string[]; problem?: string }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: PdfPage[] = []
  let chars = 0
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const items: PdfItem[] = []
    for (const it of content.items) {
      if (!('str' in it)) continue
      const [a, b, , , e, f] = it.transform as number[]
      const size = Math.hypot(a, b) || it.height || 10
      items.push({ str: it.str, x: e, y: f, w: it.width, size })
      chars += it.str.trim().length
    }
    pages.push({ items })
  }
  if (chars < 20)
    return {
      lines: [],
      problem:
        'No text could be found in this PDF. It is probably a scan (a picture of the pages), so the words can’t be read automatically. Please use the Word file the hymns were typed in instead.',
    }
  return { lines: pagesToLines(pages) }
}
