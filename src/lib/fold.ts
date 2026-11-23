// "Folds" text for searching: lower-case, tone marks removed, and Ewe
// letters mapped to the plain letters people type on any keyboard.
// So "d" finds "ɖ", "e" finds "ɛ", "o" finds "ɔ", "n" finds "ŋ",
// "f" finds "ƒ", "v" finds "ʋ", "g" finds "ɣ".

const EWE_TO_PLAIN: Record<string, string> = {
  ɖ: 'd',
  ɛ: 'e',
  ɔ: 'o',
  ŋ: 'n',
  ƒ: 'f',
  ʋ: 'v',
  ɣ: 'g',
}

const MARK = /\p{M}/u
const WORDCHAR = /[\p{L}\p{N}]/u

export interface Folded {
  /** The folded text. */
  text: string
  /** map[i] = index in the original string of folded character i. */
  map: number[]
}

/**
 * Folds text and remembers where every folded character came from, so a
 * match in the folded text can be highlighted in the original.
 * Punctuation becomes a single space; runs of spaces are collapsed.
 */
export function foldWithMap(s: string | null | undefined): Folded {
  const out: string[] = []
  const map: number[] = []
  if (!s) return { text: '', map }
  let lastSpace = true
  for (let j = 0; j < s.length; j++) {
    const decomposed = s[j].normalize('NFD')
    for (const ch of decomposed) {
      if (MARK.test(ch)) continue
      const lower = ch.toLowerCase()
      for (const l of lower) {
        if (MARK.test(l)) continue
        const plain = EWE_TO_PLAIN[l] ?? l
        if (WORDCHAR.test(plain)) {
          out.push(plain)
          map.push(j)
          lastSpace = false
        } else if (!lastSpace) {
          out.push(' ')
          map.push(j)
          lastSpace = true
        }
      }
    }
  }
  while (out.length && out[out.length - 1] === ' ') {
    out.pop()
    map.pop()
  }
  return { text: out.join(''), map }
}

export function fold(s: string | null | undefined): string {
  return foldWithMap(s).text
}
