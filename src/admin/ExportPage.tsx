import { useState } from 'react'
import { useAdmin } from './AdminLayout'
import { fetchAllHymns, friendlyError } from './api'
import { download } from './download'
import { exportFileName, toCsv, toJson, toRows, toWordLines } from '../lib/exportHymns'

type Format = 'docx' | 'csv' | 'json'
type Which = 'all' | 'published'

const FORMATS: { key: Format; label: string; help: string }[] = [
  { key: 'json', label: 'Full backup (.json)', help: 'Everything, in one file. Keep this one safe.' },
  { key: 'docx', label: 'Word (.docx)', help: 'Easy to read and print. Same layout as the typing template.' },
  { key: 'csv', label: 'Excel (.csv)', help: 'One hymn per row, for sorting and checking.' },
]

export default function ExportPage() {
  const { collections, categories } = useAdmin()
  const [which, setWhich] = useState<Which>('all')
  const [busy, setBusy] = useState<Format | null>(null)
  const [progress, setProgress] = useState(0)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  async function run(format: Format) {
    setBusy(format)
    setMsg(null)
    setProgress(0)
    try {
      const all = await fetchAllHymns(setProgress)
      const hymns = which === 'all' ? all : all.filter((h) => h.status === 'published')
      if (!hymns.length) {
        setMsg({ text: which === 'all' ? 'There are no hymns to export yet.' : 'No hymns are published yet.', bad: true })
        return
      }
      const rows = toRows(
        hymns.map((h) => ({ ...h, number: h.number ?? 0 })),
        collections,
        categories,
      )
      const kind = which === 'all' ? 'backup' : 'published hymns'
      if (format === 'json') download(exportFileName(kind, 'json'), toJson(rows), 'application/json')
      else if (format === 'csv') download(exportFileName(kind, 'csv'), toCsv(rows), 'text/csv;charset=utf-8')
      else {
        const { wordFile } = await import('./wordExport')
        download(exportFileName(kind, 'docx'), await wordFile(toWordLines(rows), `COC Ewe Hymnal — ${rows.length} hymns`))
      }
      setMsg({ text: `Done: ${rows.length} hymn${rows.length === 1 ? '' : 's'} saved to your Downloads folder.` })
    } catch (e) {
      setMsg({ text: friendlyError(e), bad: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="admin-main">
      <div className="page-head">
        <h1>Export &amp; backup</h1>
      </div>

      <section className="card">
        <h2>Which hymns?</h2>
        <div className="segmented" role="radiogroup" aria-label="Which hymns">
          {(['all', 'published'] as Which[]).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={which === w} className={which === w ? 'on' : ''}
              onClick={() => setWhich(w)}>
              {w === 'all' ? 'All hymns (drafts too)' : 'Published only'}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Download</h2>
        <ul className="export-list">
          {FORMATS.map((f) => (
            <li key={f.key}>
              <button className="btn" disabled={!!busy} onClick={() => run(f.key)}>
                {busy === f.key ? `Preparing… ${progress ? `(${progress})` : ''}` : f.label}
              </button>
              <span className="muted small">{f.help}</span>
            </li>
          ))}
        </ul>
        {msg && (
          <p className={msg.bad ? 'alert alert-error' : 'alert alert-info'} role="status">
            {msg.text}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Keeping a backup</h2>
        <ul className="small">
          <li>Download a <strong>full backup</strong> after each batch of changes, or at least once a month.</li>
          <li>Keep a copy somewhere other than this computer, such as a flash drive or your email.</li>
          <li>
            Any of these files can be loaded back with <strong>Upload many</strong>. Hymns that already exist with the
            same number are reported there and not saved twice.
          </li>
        </ul>
      </section>
    </main>
  )
}
