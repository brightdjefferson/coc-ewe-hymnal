import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAdmin } from './AdminLayout'
import {
  fetchDeleted,
  fetchHymnList,
  friendlyError,
  restoreHymn,
  type HistoryEntry,
  type HymnListItem,
} from './api'
import { fold } from '../lib/fold'
import ConfirmDialog from './ConfirmDialog'

type StatusFilter = 'all' | 'draft' | 'published'

export default function HymnListPage() {
  const { collections } = useAdmin()
  const navigate = useNavigate()
  const [hymns, setHymns] = useState<HymnListItem[] | null>(null)
  const [deleted, setDeleted] = useState<HistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [toRestore, setToRestore] = useState<HistoryEntry | null>(null)

  async function load() {
    try {
      const list = await fetchHymnList()
      setHymns(list)
      setDeleted(await fetchDeleted(new Set(list.map((h) => h.id))))
    } catch (e) {
      setError(friendlyError(e))
    }
  }
  useEffect(() => {
    load()
  }, [])

  const collectionName = (id: string) => collections.find((c) => c.id === id)?.name_en ?? ''

  const shown = useMemo(() => {
    if (!hymns) return []
    const q = fold(query)
    return hymns
      .filter((h) => collection === 'all' || h.collection_id === collection)
      .filter((h) => status === 'all' || h.status === status)
      .filter((h) => {
        if (!q) return true
        if (/^\d+$/.test(q)) return String(h.number).startsWith(q)
        return fold(`${h.title_ee} ${h.title_en} ${h.search_keywords}`).includes(q)
      })
      .sort((a, b) => {
        const ca = collections.findIndex((c) => c.id === a.collection_id)
        const cb = collections.findIndex((c) => c.id === b.collection_id)
        return ca - cb || a.number - b.number
      })
  }, [hymns, query, collection, status, collections])

  const counts = useMemo(() => {
    const all = hymns ?? []
    return { published: all.filter((h) => h.status === 'published').length, draft: all.filter((h) => h.status === 'draft').length }
  }, [hymns])

  async function doRestore(entry: HistoryEntry) {
    setToRestore(null)
    try {
      const id = await restoreHymn(entry.id)
      navigate(`/admin/hymns/${id}`)
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  return (
    <main className="admin-main">
      <div className="page-head">
        <h1>Hymns</h1>
        <Link to="/admin/hymns/new" className="btn btn-primary">
          + Add hymn
        </Link>
      </div>

      <div className="filters">
        <input
          type="search"
          className="search"
          placeholder="Number or title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search hymns"
        />
        <select value={collection} onChange={(e) => setCollection(e.target.value)} aria-label="Collection">
          <option value="all">All collections</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_en}
            </option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="Status">
          {(['all', 'published', 'draft'] as StatusFilter[]).map((s) => (
            <button key={s} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)} aria-pressed={status === s}>
              {s === 'all' ? 'All' : s === 'published' ? `Published (${counts.published})` : `Drafts (${counts.draft})`}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="alert alert-error">{error}</p>}
      {!hymns && !error && <p className="admin-loading">Loading hymns…</p>}

      {hymns && hymns.length === 0 && (
        <div className="card empty">
          <h2>No hymns yet</h2>
          <p>Click “Add hymn” to type or paste your first one.</p>
        </div>
      )}
      {hymns && hymns.length > 0 && shown.length === 0 && <p className="muted">No hymns match.</p>}

      <ul className="hymn-rows">
        {shown.map((h) => (
          <li key={h.id}>
            <Link to={`/admin/hymns/${h.id}`} className="hymn-row">
              <span className="num">{h.number}</span>
              <span className="titles">
                <span className="t-ee" lang="ee">
                  {h.title_ee || <em className="muted">No Ewe title</em>}
                </span>
                {h.title_en && <span className="t-en">{h.title_en}</span>}
                <span className="meta">
                  {collectionName(h.collection_id)}
                  <span className={`tag ${h.has_ee ? 'on' : 'off'}`}>Ewe</span>
                  <span className={`tag ${h.has_en ? 'on' : 'off'}`}>English</span>
                  {h.rights_status === 'unknown' && <span className="tag warn">Rights unknown</span>}
                </span>
              </span>
              <span className={`badge ${h.status}`}>{h.status === 'published' ? 'Published' : 'Draft'}</span>
            </Link>
          </li>
        ))}
      </ul>

      {deleted.length > 0 && (
        <details className="card deleted">
          <summary>Deleted hymns ({deleted.length})</summary>
          <ul>
            {deleted.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.snapshot.number}</strong> {d.snapshot.title_ee || d.snapshot.title_en}
                  <span className="muted small"> · deleted {new Date(d.changed_at).toLocaleDateString()}</span>
                </span>
                <button className="btn btn-quiet" onClick={() => setToRestore(d)}>
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {toRestore && (
        <ConfirmDialog
          title="Bring this hymn back?"
          confirmLabel="Bring back"
          onConfirm={() => doRestore(toRestore)}
          onCancel={() => setToRestore(null)}
        >
          Hymn {toRestore.snapshot.number} will come back as a Draft, so readers won't see it until you publish it again.
        </ConfirmDialog>
      )}
    </main>
  )
}
