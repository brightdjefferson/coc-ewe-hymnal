import { useEffect, useState } from 'react'
import { fetchHistory, friendlyError, restoreHymn, type HistoryEntry } from './api'
import HymnText from '../components/HymnText'
import ConfirmDialog from './ConfirmDialog'

const ACTION_TEXT: Record<HistoryEntry['action'], string> = {
  create: 'Created',
  edit: 'Edited',
  publish: 'Published',
  unpublish: 'Unpublished',
  delete: 'Deleted',
  restore: 'Restored an earlier version',
}

interface Props {
  hymnId: string
  refreshKey: string
  disabled: boolean
  onRestored: () => void
}

export default function HistoryPanel({ hymnId, refreshKey, disabled, onRestored }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null)

  useEffect(() => {
    fetchHistory(hymnId).then(setEntries).catch((e) => setError(friendlyError(e)))
  }, [hymnId, refreshKey])

  async function restore(e: HistoryEntry) {
    setConfirm(null)
    try {
      await restoreHymn(e.id)
      onRestored()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  if (error) return <p className="alert alert-error">{error}</p>
  if (!entries) return <p className="muted">Loading history…</p>

  return (
    <div className="history">
      <h3>Change history</h3>
      {disabled && <p className="alert alert-info">Save or discard your current changes before restoring an older version.</p>}
      <ol>
        {entries.map((e, i) => {
          const verses = e.snapshot.verses ?? []
          const ee = verses.filter((v) => v.lang === 'ee')
          const en = verses.filter((v) => v.lang === 'en')
          return (
            <li key={e.id} className="history-item">
              <div className="history-line">
                <span>
                  <strong>{ACTION_TEXT[e.action]}</strong>
                  <span className="muted small">
                    {' '}
                    · {new Date(e.changed_at).toLocaleString()} · {e.changed_by_email ?? 'unknown'}
                  </span>
                </span>
                <span className="row">
                  <button className="btn btn-quiet" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                    {open === e.id ? 'Hide' : 'View'}
                  </button>
                  {i > 0 && (
                    <button className="btn btn-quiet" onClick={() => setConfirm(e)} disabled={disabled}>
                      Restore
                    </button>
                  )}
                </span>
              </div>
              {open === e.id && (
                <div className="history-view">
                  <p>
                    <strong>{e.snapshot.number}</strong> <span lang="ee">{e.snapshot.title_ee}</span>
                    {e.snapshot.title_en && <> · {e.snapshot.title_en}</>}
                  </p>
                  <div className="lyrics-grid">
                    <HymnText blocks={ee} lang="ee" emptyMessage="No Ewe text." />
                    <HymnText blocks={en} lang="en" emptyMessage="No English text." />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {confirm && (
        <ConfirmDialog
          title="Restore this version?"
          confirmLabel="Restore"
          onConfirm={() => restore(confirm)}
          onCancel={() => setConfirm(null)}
        >
          The titles, words, categories and rights will go back to how they were on{' '}
          {new Date(confirm.changed_at).toLocaleString()}. Draft/Published status stays as it is now. The current version
          stays in the history, so you can undo this.
        </ConfirmDialog>
      )}
    </div>
  )
}
