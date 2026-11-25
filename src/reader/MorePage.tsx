import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { makeBackup, mergeBackup, parseBackup, type Backup } from './personal'
import ConfirmDialog from '../admin/ConfirmDialog'

const ICONS: Record<string, string> = {
  categories: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
  privacy: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4',
  favourites: 'M12 20s-7-4.4-8.7-8.6C2 8.3 4 5 7.2 5c1.9 0 3.2 1 4.8 2.8C13.6 6 14.9 5 16.8 5 20 5 22 8.3 20.7 11.4 19 15.6 12 20 12 20z',
}

export default function MorePage() {
  return (
    <main className="page-pad">
      <h1 className="page-h">More</h1>
      <ul className="cat-list">
        {[
          ['/categories', 'Categories', 'categories', 'Hymns for worship, the Lord’s Supper, baptism…'],
          ['/notes', 'Sermon notes', 'notes', 'Write down scriptures and key points'],
          ['/favorites', 'Favourites & recent', 'favourites', 'Hymns you saved with ♡'],
          ['/settings', 'Settings', 'settings', 'Text size, dark mode, language, reminder, updates'],
          ['/privacy', 'Privacy', 'privacy', 'What the app keeps, and where'],
        ].map(([to, label, icon, sub]) => (
          <li key={to}>
            <Link to={to} className="cat-row more-row">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICONS[icon]} />
              </svg>
              <span>
                <span className="c-name">{label}</span>
                <span className="c-sub">{sub}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <BackupCard />
    </main>
  )
}

function backupName() {
  return `coc-ewe-hymnal-backup-${new Date().toISOString().slice(0, 10)}.json`
}

export function BackupCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [found, setFound] = useState<Backup | null>(null)
  const [withSettings, setWithSettings] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const counts = (b: Backup) =>
    `${b.services.length} service${b.services.length === 1 ? '' : 's'}, ${b.notes.length} sermon note${b.notes.length === 1 ? '' : 's'}, ${b.favorites.length} favourite${b.favorites.length === 1 ? '' : 's'}`

  async function backUp() {
    setMsg(null)
    const b = makeBackup()
    const file = new File([JSON.stringify(b, null, 1)], backupName(), { type: 'application/json' })
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    try {
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'COC Ewe Hymnal backup' })
        setMsg({ ok: true, text: `Backup shared (${counts(b)}). Keep it somewhere safe, e.g. send it to yourself on WhatsApp or by email.` })
        return
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMsg({ ok: true, text: `Backup saved as “${file.name}” (${counts(b)}). Keep it somewhere safe.` })
  }

  async function pick(f: File) {
    setMsg(null)
    const b = parseBackup(await f.text())
    if (!b) setMsg({ ok: false, text: 'This file is not a COC Ewe Hymnal backup.' })
    else setFound(b)
  }

  function restore() {
    if (!found) return
    const r = mergeBackup(found, withSettings)
    setFound(null)
    setMsg({
      ok: true,
      text: `Restored: ${r.services} new service${r.services === 1 ? '' : 's'}, ${r.notes} new note${r.notes === 1 ? '' : 's'}, ${r.favorites} new favourite${r.favorites === 1 ? '' : 's'}. Nothing on this phone was removed.`,
    })
  }

  return (
    <section className="card backup">
      <h2>Back up or move to a new phone</h2>
      <p className="muted small">
        Your services, sermon notes, favourites and settings live only on this phone. Save a backup file, then open it on your new phone
        with “Restore from a backup”.
      </p>
      <div className="row">
        <button className="btn btn-primary" onClick={backUp}>
          Back up my data
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Restore from a backup
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Choose a backup file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f) }} />
      </div>
      {msg && (
        <p className={`alert ${msg.ok ? 'alert-info' : 'alert-error'} small`} role="status" style={{ marginTop: '1rem' }}>
          {msg.text}
        </p>
      )}
      {found && (
        <ConfirmDialog title="Restore this backup?" confirmLabel="Restore" onCancel={() => setFound(null)} onConfirm={restore}>
          <p>
            Backup from {new Date(found.exportedAt).toLocaleString()}: {counts(found)}.
          </p>
          <p>It will be added to what is already on this phone. Nothing is deleted.</p>
          <label className="check">
            <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} /> Also restore settings
            (text size, theme, language)
          </label>
        </ConfirmDialog>
      )}
    </section>
  )
}
