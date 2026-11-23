// "Folds" text for searching: lower-case, tone marks removed, and Ewe
// letters mapped to the plain letters people type on any keyboard.
// So "d" finds "ɖ", "e" finds "ɛ", "o" finds "ɔ", etc.

const EWE_TO_PLAIN: Record<string, string> = {
  ɖ: 'd',
  ɛ: 'e',
  ɔ: 'o',
  ŋ: 'n',
  ƒ: 'f',
  ʋ: 'v',
  ɣ: 'g',
}

export function fold(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ɖɛɔŋƒʋɣ]/g, (c) => EWE_TO_PLAIN[c])
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
