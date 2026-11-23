import { blockLabel, type Block } from '../lib/hymnText'
import './HymnText.css'

interface Props {
  blocks: Block[]
  lang: 'ee' | 'en'
  emptyMessage?: string
}

// Shows a hymn's verses the way readers will see them: verses numbered,
// choruses labelled and indented.
export default function HymnText({ blocks, lang, emptyMessage }: Props) {
  if (blocks.length === 0) {
    return <p className="hymn-empty">{emptyMessage ?? 'No text yet.'}</p>
  }
  const numbers = blocks.reduce<number[]>((acc, b) => {
    const last = acc.length ? acc[acc.length - 1] : 0
    acc.push(b.kind === 'verse' ? last + 1 : last)
    return acc
  }, [])
  return (
    <div className="hymn-text" lang={lang}>
      {blocks.map((b, i) => {
        const isVerse = b.kind === 'verse'
        return (
          <section key={i} className={`hymn-block ${b.kind}`}>
            <span className="hymn-label">{isVerse ? `Verse ${numbers[i]}` : blockLabel(b.kind)}</span>
            <p className="hymn-lines">{b.body}</p>
          </section>
        )
      })}
    </div>
  )
}
