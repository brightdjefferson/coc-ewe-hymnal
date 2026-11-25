import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAdmin } from './AdminLayout'
import { fetchAllHymns, friendlyError } from './api'
import { CHECKS, runChecks, type Finding } from '../lib/contentChecks'

const LEVEL_TEXT = { fix: 'Probably needs fixing', look: 'Worth a look', info: 'For your information' } as const

export default function ChecksPage() {
  const { collections } = useAdmin()
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [count, setCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stamp, setStamp] = useState(0)

  useEffect(() => {
    let live = true
    setFindings(null)
    setError(null)
    fetchAllHymns()
      .then((all) => {
        if (!live) return
        setCount(all.length)
        setFindings(runChecks(all.map((h) => ({ ...h, number: h.number ?? 0 })), collections))
      })
      .catch((e) => live && setError(friendlyError(e)))
    return () => {
      live = false
    }
  }, [collections, stamp])

  const groups = useMemo(
    () => CHECKS.map((c) => ({ ...c, items: (findings ?? []).filter((f) => f.kind === c.kind) })).filter((g) => g.items.length),
    [findings],
  )
  const fixCount = groups.filter((g) => g.level === 'fix').reduce((n, g) => n + g.items.length, 0)

  return (
    <main className="admin-main checks">
      <div className="page-head">
        <h1>Content checks</h1>
        <button className="btn" onClick={() => setStamp(Date.now())} disabled={!findings}>
          Check again
        </button>
      </div>
      <p className="muted">
        Looks through every hymn for things you may want to fix. Nothing is changed here; click a hymn to open it.
      </p>
      {error && <p className="alert alert-error">{error}</p>}
      {!findings && !error && <p className="admin-loading">Checking hymns…</p>}
      {findings && (
        <p className={fixCount ? 'alert alert-warn' : 'alert alert-info'} role="status">
          Checked {count} hymn{count === 1 ? '' : 's'}.{' '}
          {fixCount ? `${fixCount} thing${fixCount === 1 ? '' : 's'} probably need${fixCount === 1 ? 's' : ''} fixing.` : 'Nothing that clearly needs fixing.'}
        </p>
      )}
      {(['fix', 'look', 'info'] as const).map((level) => {
        const gs = groups.filter((g) => g.level === level)
        if (!gs.length) return null
        return (
          <section key={level}>
            <h2 className={`check-level ${level}`}>{LEVEL_TEXT[level]}</h2>
            {gs.map((g) => (
              <details key={g.kind} className="card check-group" open={level === 'fix'}>
                <summary>
                  <strong>{g.title}</strong> <span className="count">{g.items.length}</span>
                </summary>
                <p className="muted small">{g.help}</p>
                <ul>
                  {g.items.map((f, i) => (
                    <li key={(f.hymnId ?? f.collectionId) + i}>
                      {f.hymnId ? (
                        <Link to={`/admin/hymns/${f.hymnId}`} lang="ee">
                          {f.label}
                        </Link>
                      ) : (
                        <strong>{f.label}</strong>
                      )}
                      {f.detail && (
                        <span className="small muted" lang="ee">
                          {' '}— {f.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
        )
      })}
    </main>
  )
}
