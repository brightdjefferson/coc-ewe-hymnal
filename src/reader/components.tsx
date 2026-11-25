import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { search, type SearchResult } from '../lib/search'
import EweKeys from '../components/EweKeys'
import ConfirmDialog from '../admin/ConfirmDialog'
import { useLibrary } from './library'
import type { Hymn } from '../lib/types'

/** Text with some character ranges highlighted. */
export function Highlight({ text, ranges }: { text: string; ranges?: [number, number][] }) {
  if (!ranges || ranges.length === 0) return <>{text}</>
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const parts: React.ReactNode[] = []
  let at = 0
  sorted.forEach(([s, e], i) => {
    if (s < at) return
    if (s > at) parts.push(text.slice(at, s))
    parts.push(<mark key={i}>{text.slice(s, e)}</mark>)
    at = e
  })
  parts.push(text.slice(at))
  return <>{parts}</>
}

/** Small tags: which languages a hymn has. */
export function LangTags({ hymn }: { hymn: Hymn }) {
  const ee = hymn.ee.length > 0
  const en = hymn.en.length > 0
  return (
    <span className="lang-tags">
      {ee && <span className="tag on">Ewe</span>}
      {en && <span className="tag on">English</span>}
      {!ee && <span className="tag off" title="No Ewe text yet">No Ewe</span>}
      {!en && <span className="tag off" title="No English text yet">No English</span>}
    </span>
  )
}

/** One hymn in a list. If the match came from a lyric or other name, shows it. */
export function HymnRow({ hymn, result, showCollection }: { hymn: Hymn; result?: SearchResult; showCollection?: boolean }) {
  const { hymnPath, collectionById } = useLibrary()
  const r = result
  const col = collectionById(hymn.collection_id)
  return (
    <li>
      <Link to={hymnPath(hymn)} className="hymn-row">
        <span className="num">
          {r?.field === 'number' ? <mark>{hymn.number}</mark> : hymn.number}
          {showCollection && col && <small>{col.name_en}</small>}
        </span>
        <span className="titles">
          {hymn.title_ee && (
            <span className="t-ee" lang="ee">
              <Highlight text={hymn.title_ee} ranges={r?.field === 'title_ee' ? r.ranges : undefined} />
            </span>
          )}
          {hymn.title_en && (
            <span className={hymn.title_ee ? 't-en' : 't-ee'} lang="en">
              <Highlight text={hymn.title_en} ranges={r?.field === 'title_en' ? r.ranges : undefined} />
            </span>
          )}
          {r?.field === 'line' && (
            <span className="t-line" lang={r.lang}>
              “<Highlight text={r.text} ranges={r.ranges} />”
            </span>
          )}
          {r?.field === 'keywords' && (
            <span className="t-line">
              Also called: <Highlight text={r.text} ranges={r.ranges} />
            </span>
          )}
        </span>
        <LangTags hymn={hymn} />
      </Link>
    </li>
  )
}

/** Search box with instant suggestions (works without network). */
export function SearchBox({ autoFocus, initial = '', onQuery, categoryId }: {
  autoFocus?: boolean
  initial?: string
  onQuery?: (q: string) => void
  categoryId?: string | null
}) {
  const { index, hymnPath } = useLibrary()
  const navigate = useNavigate()
  const [q, setQ] = useState(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [keys, setKeys] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const isNumber = /^\d+$/.test(q.trim())
  const suggestions = useMemo(
    () => (q.trim().length >= 2 || (isNumber && q.trim().length >= 1) ? search(index, q, { limit: 8, categoryId }) : []),
    [q, index, isNumber, categoryId],
  )
  const showList = open && !onQuery && suggestions.length > 0

  useEffect(() => setActive(-1), [q])

  function change(v: string) {
    setQ(v)
    setOpen(true)
    onQuery?.(v)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (showList && active >= 0) {
      navigate(hymnPath(suggestions[active].hymn))
      return
    }
    if (!onQuery && q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
    inputRef.current?.blur()
  }

  return (
    <form role="search" className="searchbox" onSubmit={submit}>
      <div className="searchbox-row">
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="Search number, title or words"
          aria-label="Search hymns by number, title or words, in Ewe or English"
          value={q}
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!showList) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)) }
            if (e.key === 'Escape') setOpen(false)
          }}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        />
        <button type="button" className={`btn btn-quiet ewe-toggle${keys ? ' on' : ''}`} aria-pressed={keys}
          onClick={() => setKeys((k) => !k)} title="Show Ewe letters">
          <span aria-hidden="true">ɛɔ</span>
          <span className="sr-only">Ewe letters</span>
        </button>
      </div>
      {keys && <EweKeys compact target={inputRef} value={q} onChange={change} />}
      {showList && (
        <ul className="suggestions" id={listId} role="listbox">
          {suggestions.map((r, i) => (
            <li key={r.hymn.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); navigate(hymnPath(r.hymn)) }}>
              <SuggestionContent r={r} />
            </li>
          ))}
          <li className="see-all" onMouseDown={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(q.trim())}`) }}>
            See all results for “{q.trim()}”
          </li>
        </ul>
      )}
    </form>
  )
}

function SuggestionContent({ r }: { r: SearchResult }) {
  const { collectionById } = useLibrary()
  const h = r.hymn
  return (
    <>
      <span className="num">
        {r.field === 'number' ? <mark>{h.number}</mark> : h.number}
        <small>{collectionById(h.collection_id)?.name_en}</small>
      </span>
      <span className="titles">
        {h.title_ee && (
          <span className="t-ee" lang="ee">
            <Highlight text={h.title_ee} ranges={r.field === 'title_ee' ? r.ranges : undefined} />
          </span>
        )}
        {h.title_en && (
          <span className={h.title_ee ? 't-en' : 't-ee'}>
            <Highlight text={h.title_en} ranges={r.field === 'title_en' ? r.ranges : undefined} />
          </span>
        )}
        {(r.field === 'line' || r.field === 'keywords') && (
          <span className="t-line" lang={r.lang}>
            {r.field === 'keywords' ? 'Also called: ' : '“'}
            <Highlight text={r.text} ranges={r.ranges} />
            {r.field === 'line' ? '”' : ''}
          </span>
        )}
      </span>
    </>
  )
}

/** "Go to number" dialog for one collection. */
export function JumpToNumber({ collectionId, onClose }: { collectionId: string; onClose: () => void }) {
  const { hymnsIn, hymnPath, collectionById } = useLibrary()
  const navigate = useNavigate()
  const [n, setN] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const hymns = hymnsIn(collectionId)
  const col = collectionById(collectionId)
  function go() {
    const h = hymns.find((x) => String(x.number) === n.trim())
    if (!h) {
      setErr(`There is no number ${n.trim() || '…'} in ${col?.name_en ?? 'this collection'} yet.`)
      return
    }
    onClose()
    navigate(hymnPath(h))
  }
  return (
    <ConfirmDialog title={`Go to number — ${col?.name_en ?? ''}`} confirmLabel="Go" onConfirm={go} onCancel={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); go() }}>
        <input
          className="jump-input"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus
          aria-label="Hymn number"
          value={n}
          onChange={(e) => { setN(e.target.value.replace(/\D/g, '')); setErr(null) }}
          placeholder={hymns.length ? `${hymns[0].number}–${hymns[hymns.length - 1].number}` : ''}
        />
        {err && <p className="field-error" role="alert">{err}</p>}
      </form>
    </ConfirmDialog>
  )
}
