import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { displayName, useLibrary } from './library'
import { HymnRow, JumpToNumber } from './components'
import { CategoryChips } from './CategoryChips'

type Sort = 'number' | 'ee' | 'en'

const collator = new Intl.Collator(['ee', 'en'], { sensitivity: 'base', numeric: true })

export default function CollectionPage() {
  const { slug } = useParams()
  const { collectionBySlug, hymnsIn } = useLibrary()
  const [params, setParams] = useSearchParams()
  const [jump, setJump] = useState(false)
  const col = collectionBySlug(slug ?? '')
  const sort = (params.get('sort') as Sort) || 'number'
  const cat = params.get('cat')

  const hymns = useMemo(() => {
    if (!col) return []
    let list = hymnsIn(col.id)
    if (cat) list = list.filter((h) => h.category_ids.includes(cat))
    if (sort === 'number') return list
    const key = (h: (typeof list)[0]) => (sort === 'ee' ? h.title_ee : h.title_en) ?? ''
    // Hymns without that title go to the end, in number order.
    return [...list].sort((a, b) => {
      const ka = key(a), kb = key(b)
      if (!ka !== !kb) return ka ? -1 : 1
      return collator.compare(ka, kb) || a.number - b.number
    })
  }, [col, hymnsIn, sort, cat])

  if (!col)
    return (
      <main className="page-pad">
        <p>That collection was not found.</p>
        <Link to="/">Back to home</Link>
      </main>
    )

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  return (
    <main className="page-pad">
      <div className="page-title">
        <Link to="/" className="back" aria-label="Back to home">
          ‹
        </Link>
        <div>
          <h1 lang={col.name_ee ? 'ee' : 'en'}>{displayName(col)}</h1>
          {col.name_ee && col.name_en && <p className="sub">{col.name_en}</p>}
        </div>
        <button className="btn jump-btn" onClick={() => setJump(true)}>
          # Go to number
        </button>
      </div>

      <div className="segmented sort" role="group" aria-label="Sort by">
        {(
          [
            ['number', 'Number'],
            ['ee', 'A–Z Ewe'],
            ['en', 'A–Z English'],
          ] as [Sort, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" className={sort === k ? 'on' : ''} aria-pressed={sort === k}
            onClick={() => setParam('sort', k === 'number' ? null : k)}>
            {label}
          </button>
        ))}
      </div>

      <CategoryChips selected={cat} onChange={(id) => setParam('cat', id)} onlyFor={hymnsIn(col.id)} />

      {hymns.length === 0 ? (
        <p className="muted">{cat ? 'No hymns in this category here.' : 'No hymns in this collection yet.'}</p>
      ) : (
        <ul className="hymn-rows">
          {hymns.map((h) => (
            <HymnRow key={h.id} hymn={h} />
          ))}
        </ul>
      )}
      {jump && <JumpToNumber collectionId={col.id} onClose={() => setJump(false)} />}
    </main>
  )
}
