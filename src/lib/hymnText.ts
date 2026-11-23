// Turns a pasted hymn into verse blocks, and back again.
//
// Rules (the same ones shown to the admin under each text box):
//   * A blank line starts a new verse.
//   * A block whose first line starts with "Chorus:" is a chorus.
//     "Refrain:" and "Pre-chorus:" work the same way.
//   * A verse number at the start ("1.", "2)") is removed; the app numbers
//     verses itself.

export type VerseKind = 'verse' | 'chorus' | 'prechorus' | 'refrain'

export interface Block {
  kind: VerseKind
  body: string
}

const LABELS: Record<VerseKind, string> = {
  verse: 'Verse',
  chorus: 'Chorus',
  prechorus: 'Pre-chorus',
  refrain: 'Refrain',
}

const LABEL_RE = /^(chorus|refrain|pre[\s-]?chorus)\s*:\s*(.*)$/i
const NUMBER_RE = /^\d{1,3}\s*[.)]\s+/

/** Tidies text so the same words are always stored the same way. */
export function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+$/g, ''))
    .join('\n')
}

export function parseHymnText(text: string): Block[] {
  const clean = normalizeText(text).trim()
  if (!clean) return []
  return clean
    .split(/\n\s*\n+/)
    .map((chunk) => {
      const lines = chunk.split('\n').map((l) => l.trim())
      let kind: VerseKind = 'verse'
      const m = lines[0].match(LABEL_RE)
      if (m) {
        const label = m[1].toLowerCase().replace(/[\s-]/g, '')
        kind = label === 'refrain' ? 'refrain' : label === 'prechorus' ? 'prechorus' : 'chorus'
        lines[0] = m[2].trim()
        if (!lines[0]) lines.shift()
      } else {
        lines[0] = lines[0].replace(NUMBER_RE, '')
      }
      return { kind, body: lines.join('\n').trim() }
    })
    .filter((b) => b.body !== '')
}

/** Turns stored blocks back into the text an admin edits. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => (b.kind === 'verse' ? b.body : `${LABELS[b.kind]}:\n${b.body}`))
    .join('\n\n')
}

export function blockLabel(kind: VerseKind): string {
  return LABELS[kind]
}
