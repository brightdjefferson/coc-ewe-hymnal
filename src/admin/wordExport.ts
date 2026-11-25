// Builds a Word document in the typing-template layout (loaded only when
// an admin exports, so the reader app stays small).
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

const FONT = 'Calibri'

export async function wordFile(lines: string[], title: string): Promise<Blob> {
  const paras: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, font: FONT })] }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'This file uses the same layout as the typing template, so it can be uploaded again with “Upload many”.',
          italics: true, font: FONT, size: 20,
        }),
      ],
    }),
    new Paragraph({ text: '' }),
  ]
  for (const line of lines) {
    const isHymn = /^Hymn \d+$/.test(line)
    const isMarker = line === 'EWE' || line === 'ENGLISH'
    paras.push(
      new Paragraph({
        pageBreakBefore: false,
        keepNext: isHymn || isMarker,
        alignment: AlignmentType.LEFT,
        spacing: { before: isHymn ? 240 : 0, after: 0, line: 276 },
        children: [new TextRun({ text: line, font: FONT, size: isHymn ? 28 : 24, bold: isHymn || isMarker })],
      }),
    )
  }
  const doc = new Document({
    creator: 'COC Ewe Hymnal',
    title,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: paras }],
  })
  return Packer.toBlob(doc)
}
