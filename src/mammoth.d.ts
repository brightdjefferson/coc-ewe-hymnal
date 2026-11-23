// The browser build of the Word-file reader has no type information of its own.
declare module 'mammoth/mammoth.browser' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: { ignoreEmptyParagraphs?: boolean }): Promise<{ value: string; messages: unknown[] }>
}
