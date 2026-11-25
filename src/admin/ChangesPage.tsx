import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchAdminEmails, fetchChanges, fetchHymnList, friendlyError, type HistoryEntry } from './api'
import { ACTION_TEXT } from './HistoryPanel'

const PAGE = 100
type Snap = HistoryEntry['snapshot']

/** A short description of what changed between two saved versions. */
export function whatChanged(before: Snap, after: Snap): string {
  const out: string[] = []
  if (before.number !== after.number) out.push(`number ${before.number} → ${after.number}`)
  if ((before.title_ee ?? '') !== (after.title_ee ?? '')) out.push('Ewe title')
  if ((before.title_en ?? '') !== (after.title_en ?? '')) out.push('English title')
  for (const [lang, name] of [['ee', 'Ewe'], ['en', 'English']] as const) {
    const a = before.verses.filter((v) => v.lang === lang)
    const b = after.verses.filter((v) => v.lang === lang)
    if (!a.length && b.length) out.push(`${name} words added`)
    else if (a.length && !b.length) out.push(`${name} words removed`)
    else {
      const changed = b.map((v, i) => (a[i]?.body !== v.body || a[i]?.kind !== v.kind ? i + 1 : 0)).filter(Boolean)
      if (b.length !== a.length) out.push(`${name}: ${a.length} → ${b.length} verses`)
      else if (changed.length) out.push(`${name} verse${changed.length > 1 ? 's' : ''} ${changed.join(', ')}`)
    }
  }
  return out.length ? out.join('; ') : 'details only (rights, source, categories or other names)'
}

export default function ChangesPage() {
  const [items, setItems] = useState<HistoryEntry[] | null>(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emails, setEmails] = useState<string[]>([])
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [email, setEmail] = useState('')
  const [action, setAction] = useState('')

  useEffect(() => {
    fetchAdminEmails().then(setEmails).catch(() => {})
    fetchHymnList().then((l) => setExisting(new Set(l.map((h) => h.id)))).catch(() => {})
  }, [])

  useEffect(() => {
    let live = true
    setItems(null)
    setError(null)
    fetchChanges({ email: email || undefined, action: action || undefined, limit: PAGE })
      .then((d) => {
        if (!live) return
        setItems(d)
        setMore(d.length === PAGE)
      })
      .catch((e) => live && setError(friendlyError(e)))
    return () => {
      live = false
    }
  }, [email, action])

  async function loadMore() {
    if (!items?.length) return
    setLoadingMore(true)
    try {
      const d = await fetchChanges({ before: items[items.length - 1].changed_at, email: email || undefined, action: action || undefined, limit: PAGE })
      setItems([...items, ...d])
      setMore(d.length === PAGE)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoadingMore(false)
    }
  }

  // The version before each edit, when it is on the page.
  const previous = (i: number): Snap | null => {
    const e = items![i]
    const p = items!.slice(i + 1).find((x) => x.hymn_id === e.hymn_id)
    return p ? p.snapshot : null
  }

  let lastDay = ''
  return (
    <main className="admin-main changes">
      <div className="page-head">
        <h1>Change history</h1>
      </div>
      <p className="muted">
        Every change by every admin, newest first. To go back to an earlier version, open the hymn and use its history.
      </p>
      <div className="filters">
        <select value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Who">
          <option value="">Everyone</option>
          {emails.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Type of change">
          <option value="">All changes</option>
          {Object.entries(ACTION_TEXT).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      {!items && !error && <p className="admin-loading">Loading…</p>}
      {items && items.length === 0 && <p className="muted">No changes found.</p>}
      {items && items.length > 0 && (
        <ol className="change-list">
          {items.map((e, i) => {
            const d = new Date(e.changed_at)
            const day = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            const showDay = day !== lastDay
            lastDay = day
            const prev = e.action === 'edit' || e.action === 'restore' ? previous(i) : null
            const title = `${e.snapshot.number} · ${e.snapshot.title_ee || e.snapshot.title_en || ''}`
            return (
              <li key={e.id}>
                {showDay && <h2 className="change-day">{day}</h2>}
                <div className="change-row">
                  <time dateTime={e.changed_at}>{d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
                  <span className={`badge act-${e.action}`}>{ACTION_TEXT[e.action]}</span>
                  <span className="change-what">
                    {existing.has(e.hymn_id) ? (
                      <Link to={`/admin/hymns/${e.hymn_id}`} lang="ee">
                        {title}
                      </Link>
                    ) : (
                      <span lang="ee">
                        {title} <span className="muted small">(no longer exists — see “Deleted hymns” on the Hymns page)</span>
                      </span>
                    )}
                    {prev && <span className="muted small"> — changed: {whatChanged(prev, e.snapshot)}</span>}
                  </span>
                  <span className="muted small change-who">{e.changed_by_email ?? 'unknown'}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {more && (
        <button className="btn" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Show older changes'}
        </button>
      )}
    </main>
  )
}
