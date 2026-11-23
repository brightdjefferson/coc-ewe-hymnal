import { displayName, useLibrary } from './library'
import type { Hymn } from '../lib/types'

/** Category filter chips. Only shows categories that have hymns in `onlyFor`. */
export function CategoryChips({ selected, onChange, onlyFor }: {
  selected: string | null
  onChange: (id: string | null) => void
  onlyFor?: Hymn[]
}) {
  const { library } = useLibrary()
  const used = new Set((onlyFor ?? library.hymns).flatMap((h) => h.category_ids))
  const cats = library.categories.filter((c) => used.has(c.id))
  if (cats.length === 0) return null
  return (
    <div className="chip-row" role="group" aria-label="Filter by category">
      <button type="button" className={`chip${!selected ? ' on' : ''}`} aria-pressed={!selected} onClick={() => onChange(null)}>
        All
      </button>
      {cats.map((c) => (
        <button key={c.id} type="button" className={`chip${selected === c.id ? ' on' : ''}`} aria-pressed={selected === c.id}
          onClick={() => onChange(selected === c.id ? null : c.id)} lang={c.name_ee ? 'ee' : 'en'}>
          {displayName(c)}
        </button>
      ))}
    </div>
  )
}
