import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAdmin } from './AdminLayout'
import { fetchHymnList, friendlyError, saveHymn, setHymnStatus, RIGHTS_LABELS } from './api'
import {
  checkHymns,
  csvTemplate,
  csvToRaw,
  htmlToLines,
  jsonTemplate,
  jsonToRaw,
  parseCsv,
  parseWordLines,
  type CheckedHymn,
  type RawHymn,
} from '../lib/importHymns'
import HymnText from '../components/HymnText'
import ConfirmDialog from './ConfirmDialog'

type Stage =
  | { kind: 'choose' }
  | { kind: 'reading'; name: string }
  | { kind: 'preview'; name: string; items: CheckedHymn[] }
  | { kind: 'importing'; name: string; done: number; total: number }
  | { kind: 'done'; name: string; saved: { id: string; item: CheckedHymn }[]; failed: { item: CheckedHymn; error: string }[] }

async function readFile(file: File): Promise<{ hymns: RawHymn[]; problem?: string }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth/mammoth.browser')
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { ignoreEmptyParagraphs: false })
    const hymns = parseWordLines(htmlToLines(value))
    return hymns.length
      ? { hymns }
      : { hymns, problem: 'No hymns were found. Each hymn must start with a line like “Hymn 12”. See the Word template.' }
  }
  if (name.endsWith('.doc')) return { hymns: [], problem: 'This is an old-style Word file (.doc). In Word, choose File → Save As → Word Document (.docx), then upload that.' }
  const text = await file.text()
  if (name.endsWith('.json')) return jsonToRaw(text)
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    if (name.endsWith('.txt') && /^\s*hymn\s*\d/im.test(text)) return { hymns: parseWordLines(text.split(/\r?\n/)) }
    return csvToRaw(parseCsv(text))
  }
  if (/\.xlsx?$/.test(name)) return { hymns: [], problem: 'Excel files can’t be read directly. In Excel, choose File → Save As → CSV UTF-8 (.csv), then upload that.' }
  return { hymns: [], problem: 'Please choose a Word (.docx), CSV (.csv) or JSON (.json) file.' }
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function UploadPage() {
  const { collections, categories } = useAdmin()
  const [stage, setStage] = useState<Stage>({ kind: 'choose' })
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handle(file: File) {
    setProblem(null)
    setPublishMsg(null)
    setStage({ kind: 'reading', name: file.name })
    try {
      const [{ hymns, problem }, existing] = await Promise.all([readFile(file), fetchHymnList()])
      if (problem || hymns.length === 0) {
        setProblem(problem ?? 'No hymns were found in this file.')
        setStage({ kind: 'choose' })
        return
      }
      setStage({ kind: 'preview', name: file.name, items: checkHymns(hymns, collections, categories, existing) })
    } catch (e) {
      setProblem(`This file could not be read: ${friendlyError(e)}`)
      setStage({ kind: 'choose' })
    }
  }

  async function importAll(items: CheckedHymn[], name: string) {
    const good = items.filter((i) => i.ok)
    const saved: { id: string; item: CheckedHymn }[] = []
    const failed: { item: CheckedHymn; error: string }[] = []
    setStage({ kind: 'importing', name, done: 0, total: good.length })
    let next = 0
    const worker = async () => {
      while (next < good.length) {
        const item = good[next++]
        try {
          const id = await saveHymn({
            collection_id: item.collection_id,
            number: item.number,
            title_ee: item.title_ee,
            title_en: item.title_en,
            search_keywords: item.search_keywords,
            source: item.source,
            rights_status: item.rights_status,
            category_ids: item.category_ids,
            ee: item.ee,
            en: item.en,
          })
          saved.push({ id, item })
        } catch (e) {
          failed.push({ item, error: friendlyError(e) })
        }
        setStage({ kind: 'importing', name, done: saved.length + failed.length, total: good.length })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    const order = (x: { item: CheckedHymn }) => good.indexOf(x.item)
    saved.sort((a, b) => order(a) - order(b))
    setStage({ kind: 'done', name, saved, failed })
  }

  async function publishAll(saved: { id: string }[]) {
    setConfirmPublish(false)
    let ok = 0
    const errs: string[] = []
    for (const s of saved) {
      try {
        await setHymnStatus(s.id, 'published')
        ok++
      } catch (e) {
        errs.push(friendlyError(e))
      }
      setPublishMsg(`Publishing… ${ok}/${saved.length}`)
    }
    setPublishMsg(errs.length ? `${ok} published. ${errs.length} could not be published: ${errs[0]}` : `All ${ok} hymns are published. Readers will see them the next time their app is online.`)
  }

  const counts = useMemo(() => {
    if (stage.kind !== 'preview') return null
    const ok = stage.items.filter((i) => i.ok).length
    return { ok, bad: stage.items.length - ok, warn: stage.items.filter((i) => i.ok && i.warnings.length).length }
  }, [stage])

  return (
    <main className="admin-main upload">
      <div className="page-head">
        <h1>Upload many hymns</h1>
      </div>

      {(stage.kind === 'choose' || stage.kind === 'reading') && (
        <>
          <section className="card">
            <h2>1. Get a template</h2>
            <p>Type the hymns using one of these templates, then upload the file below.</p>
            <div className="row">
              <a className="btn" href="/templates/COC-Ewe-Hymnal-typing-template.docx" download>
                Word template (.docx)
              </a>
              <button className="btn" onClick={() => download('coc-ewe-hymnal-template.csv', csvTemplate(), 'text/csv;charset=utf-8')}>
                Spreadsheet template (.csv)
              </button>
              <button className="btn" onClick={() => download('coc-ewe-hymnal-template.json', jsonTemplate(), 'application/json')}>
                JSON template
              </button>
            </div>
          </section>

          <section className="card">
            <h2>2. Upload your file</h2>
            <div
              className={`dropzone${drag ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                const f = e.dataTransfer.files[0]
                if (f) handle(f)
              }}
            >
              {stage.kind === 'reading' ? (
                <p role="status">Reading “{stage.name}”…</p>
              ) : (
                <>
                  <p>Drag the file here, or</p>
                  <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
                    Choose a file
                  </button>
                  <p className="muted small">Word (.docx), CSV (.csv) or JSON (.json). Nothing is saved until you confirm.</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".docx,.csv,.json,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,application/json"
                hidden
                aria-label="Choose a file to upload"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) handle(f)
                }}
              />
            </div>
            {problem && (
              <p className="alert alert-error" role="alert" style={{ marginTop: '1rem' }}>
                {problem}
              </p>
            )}
          </section>
        </>
      )}

      {stage.kind === 'preview' && counts && (
        <>
          <section className="card summary">
            <h2>3. Check before saving</h2>
            <p>
              Found <strong>{stage.items.length}</strong> hymn{stage.items.length === 1 ? '' : 's'} in “{stage.name}”.
            </p>
            <ul className="summary-list">
              <li className="ok">✓ {counts.ok} ready to save{counts.warn ? ` (${counts.warn} with notes to check)` : ''}</li>
              {counts.bad > 0 && <li className="bad">✗ {counts.bad} with problems — these will be skipped</li>}
            </ul>
            {counts.bad > 0 && (
              <div className="alert alert-error">
                <p>
                  <strong>Problems to fix</strong> (fix them in your file and upload it again, or add those hymns by hand later):
                </p>
                <ul>
                  {stage.items.filter((i) => !i.ok).flatMap((i) => i.errors.map((e, k) => <li key={i.where + k}>{e}</li>))}
                </ul>
              </div>
            )}
            <p className="muted small">Hymns are saved as <strong>drafts</strong>. Readers won’t see them until they are published.</p>
            <div className="row">
              <button className="btn" onClick={() => setStage({ kind: 'choose' })}>
                Choose a different file
              </button>
              <button className="btn btn-primary" disabled={counts.ok === 0} onClick={() => importAll(stage.items, stage.name)}>
                Save {counts.ok} hymn{counts.ok === 1 ? '' : 's'} as drafts
              </button>
            </div>
          </section>

          <ul className="import-rows">
            {stage.items.map((it) => {
              const key = it.where
              return (
                <li key={key} className={it.ok ? (it.warnings.length ? 'warn' : 'ok') : 'bad'}>
                  <button className="import-row" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
                    <span className="mark" aria-label={it.ok ? 'ready' : 'has problems'}>
                      {it.ok ? '✓' : '✗'}
                    </span>
                    <span className="num">{it.number ?? '?'}</span>
                    <span className="titles">
                      <span className="t-ee" lang="ee">
                        {it.title_ee || <em className="muted">No Ewe title</em>}
                      </span>
                      {it.title_en && <span className="t-en">{it.title_en}</span>}
                      <span className="meta">
                        {it.collection_name} · {it.ee.length} Ewe / {it.en.length} English blocks · {RIGHTS_LABELS[it.rights_status]}
                      </span>
                      {it.errors.map((e) => (
                        <span key={e} className="row-error">
                          {e}
                        </span>
                      ))}
                      {it.ok && it.warnings.length > 0 && <span className="row-warn">{it.warnings.join(' ')}</span>}
                    </span>
                    <span className="chev" aria-hidden="true">
                      {open === key ? '▴' : '▾'}
                    </span>
                  </button>
                  {open === key && (
                    <div className="lyrics-grid import-preview">
                      <HymnText blocks={it.ee} lang="ee" emptyMessage="No Ewe words." />
                      <HymnText blocks={it.en} lang="en" emptyMessage="No English words." />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {stage.kind === 'importing' && (
        <section className="card" role="status">
          <h2>Saving…</h2>
          <progress max={stage.total} value={stage.done} style={{ width: '100%' }} />
          <p>
            {stage.done} of {stage.total} saved. Please keep this page open.
          </p>
        </section>
      )}

      {stage.kind === 'done' && (
        <section className="card">
          <h2>Done</h2>
          <p>
            <strong>{stage.saved.length}</strong> hymn{stage.saved.length === 1 ? ' was' : 's were'} saved as drafts from “{stage.name}”.
          </p>
          {stage.failed.length > 0 && (
            <div className="alert alert-error">
              <p>{stage.failed.length} could not be saved:</p>
              <ul>
                {stage.failed.map((f) => (
                  <li key={f.item.where}>
                    {f.item.where}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {publishMsg && <p className="alert alert-info">{publishMsg}</p>}
          <div className="row">
            <Link to="/admin" className="btn">
              Go to the hymn list
            </Link>
            {stage.saved.length > 0 && !publishMsg && (
              <button className="btn btn-primary" onClick={() => setConfirmPublish(true)}>
                Publish all {stage.saved.length} now
              </button>
            )}
            <button className="btn btn-quiet" onClick={() => { setStage({ kind: 'choose' }); setPublishMsg(null) }}>
              Upload another file
            </button>
          </div>
          {confirmPublish && (
            <ConfirmDialog
              title={`Publish all ${stage.saved.length} hymns?`}
              confirmLabel="Publish all"
              onCancel={() => setConfirmPublish(false)}
              onConfirm={() => publishAll(stage.saved)}
            >
              <p>Every reader will see them. You can still edit or unpublish any hymn later.</p>
              {stage.saved.some((s) => s.item.rights_status === 'unknown') && (
                <p>
                  <strong>
                    {stage.saved.filter((s) => s.item.rights_status === 'unknown').length} of them have rights marked
                    “Unknown”.
                  </strong>{' '}
                  Check where they came from before publishing.
                </p>
              )}
            </ConfirmDialog>
          )}
        </section>
      )}
    </main>
  )
}
