import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { formatDate, noteIsEmpty, useNotes, type SermonNote } from './personal'
import { fold } from '../lib/fold'
import EweKeys from '../components/EweKeys'
import ConfirmDialog from '../admin/ConfirmDialog'

export function NotesListPage() {
  const { notes, create } = useNotes()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const f = fold(q)
    if (!f) return notes
    return notes.filter((n) => fold([n.title, n.preacher, n.scriptures, n.points, n.reflections, n.date].join(' ')).includes(f))
  }, [notes, q])

  return (
    <main className="page-pad">
      <div className="section-row">
        <h1 className="page-h">Sermon notes</h1>
        <button className="btn btn-primary" onClick={() => navigate(`/notes/${create().id}`)}>
          + New note
        </button>
      </div>
      <p className="muted small">Your notes stay on this phone. Back them up from More → Back up my data.</p>
      {notes.length > 3 && (
        <input type="search" className="notes-search" placeholder="Search your notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your notes" />
      )}
      {notes.length === 0 ? (
        <div className="card empty">
          <p>No notes yet.</p>
          <p className="muted small">Tap “New note” during the sermon to write down the scriptures and key points.</p>
        </div>
      ) : (
        <ul className="cat-list">
          {shown.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="cat-row note-row">
                <span>
                  <span className="c-name" lang="ee">
                    {n.title || n.scriptures || (noteIsEmpty(n) ? 'Empty note' : 'Sermon note')}
                  </span>
                  <span className="c-sub">
                    {formatDate(n.date)}
                    {n.preacher ? ` · ${n.preacher}` : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {shown.length === 0 && <p className="muted">No notes match.</p>}
        </ul>
      )}
    </main>
  )
}

type Field = keyof Pick<SermonNote, 'title' | 'preacher' | 'scriptures' | 'points' | 'reflections'>

export function NotePage() {
  const { id = '' } = useParams()
  const notes = useNotes()
  const note = notes.byId(id)
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const [keys, setKeys] = useState(false)
  const [focused, setFocused] = useState<Field>('points')
  const refs = {
    title: useRef<HTMLInputElement>(null),
    preacher: useRef<HTMLInputElement>(null),
    scriptures: useRef<HTMLInputElement>(null),
    points: useRef<HTMLTextAreaElement>(null),
    reflections: useRef<HTMLTextAreaElement>(null),
  }

  // Leaving a note that was never written in: tidy it away.
  useEffect(() => {
    return () => {
      const n = notes.byId(id)
      // (the time check keeps a brand-new note during React's development double-mount)
      if (n && noteIsEmpty(n) && Date.now() - Date.parse(n.createdAt) > 1500) notes.remove(id)
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!note)
    return (
      <main className="page-pad">
        <p>This note was not found on this phone.</p>
        <Link to="/notes" className="btn">
          All notes
        </Link>
      </main>
    )

  const set = (f: Field | 'date', v: string) => notes.update(note.id, { [f]: v })
  const text = (f: Field, label: string, opts: { area?: boolean; placeholder?: string } = {}) => (
    <label className="field">
      <span>{label}</span>
      {opts.area ? (
        <textarea ref={refs[f] as React.RefObject<HTMLTextAreaElement>} lang="ee" rows={7} value={note[f]} placeholder={opts.placeholder}
          onFocus={() => setFocused(f)} onChange={(e) => set(f, e.target.value)} />
      ) : (
        <input ref={refs[f] as React.RefObject<HTMLInputElement>} lang="ee" value={note[f]} placeholder={opts.placeholder}
          onFocus={() => setFocused(f)} onChange={(e) => set(f, e.target.value)} />
      )}
    </label>
  )

  return (
    <main className="page-pad note-page">
      <div className="page-title">
        <Link to="/notes" className="back" aria-label="Back to notes">
          ‹
        </Link>
        <h1>Sermon note</h1>
        <button className={`sq-btn${keys ? ' on' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => setKeys((k) => !k)} aria-pressed={keys} aria-label="Show Ewe letter buttons">
          ɛɔ
        </button>
      </div>
      {keys && (
        <div className="keys-sticky">
          <EweKeys compact target={refs[focused] as React.RefObject<HTMLInputElement>} value={note[focused]} onChange={(v) => set(focused, v)} />
        </div>
      )}
      <section className="card form-grid">
        <label className="field">
          <span>Date</span>
          <input type="date" value={note.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        {text('preacher', 'Preacher')}
        <div className="full">{text('title', 'Sermon title or topic')}</div>
        <div className="full">{text('scriptures', 'Scriptures', { placeholder: 'e.g. Yohanes 3:16; Romatɔwo 12:1-2' })}</div>
        <div className="full">{text('points', 'Key points', { area: true })}</div>
        <div className="full">{text('reflections', 'My reflections', { area: true })}</div>
      </section>
      <p className="muted small">Saved automatically on this phone as you type.</p>
      <button className="btn btn-danger-quiet" onClick={() => setConfirm(true)}>
        Delete this note
      </button>
      {confirm && (
        <ConfirmDialog title="Delete this note?" confirmLabel="Delete" danger onCancel={() => setConfirm(false)}
          onConfirm={() => { notes.remove(note.id); navigate('/notes', { replace: true }) }}>
          It will be removed from this phone. This can’t be undone unless you have a backup.
        </ConfirmDialog>
      )}
    </main>
  )
}
