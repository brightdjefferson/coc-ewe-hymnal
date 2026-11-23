import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAdmin } from './AdminLayout'
import {
  deleteHymn,
  fetchHymn,
  fetchHymnList,
  friendlyError,
  RIGHTS_LABELS,
  saveHymn,
  setHymnStatus,
  type HymnRecord,
  type HymnStatus,
  type RightsStatus,
} from './api'
import { blocksToText, normalizeText, parseHymnText } from '../lib/hymnText'
import EweKeys from '../components/EweKeys'
import HymnText from '../components/HymnText'
import ConfirmDialog from './ConfirmDialog'
import HistoryPanel from './HistoryPanel'

interface Form {
  collection_id: string
  number: string
  title_ee: string
  title_en: string
  search_keywords: string
  source: string
  rights_status: RightsStatus
  category_ids: string[]
  ee_text: string
  en_text: string
}

type Action = 'save' | 'publish' | 'unpublish'

const AUTOSAVE_PREFIX = 'coc-hymnal:admin-draft:'

function formFromRecord(r: HymnRecord): Form {
  return {
    collection_id: r.collection_id,
    number: String(r.number),
    title_ee: r.title_ee,
    title_en: r.title_en,
    search_keywords: r.search_keywords,
    source: r.source,
    rights_status: r.rights_status,
    category_ids: [...r.category_ids].sort(),
    ee_text: blocksToText(r.ee),
    en_text: blocksToText(r.en),
  }
}

function sameForm(a: Form | null, b: Form | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function readAutosave(key: string): { form: Form; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function HymnEditorPage() {
  const { id } = useParams()
  const isNew = !id
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { collections, categories } = useAdmin()

  const [record, setRecord] = useState<HymnRecord | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [baseline, setBaseline] = useState<Form | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Action | null>(null) // waiting for "rights unknown" confirmation
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [found, setFound] = useState<{ form: Form; savedAt: string } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [usedNumbers, setUsedNumbers] = useState<Map<string, number[]>>(new Map())

  const autosaveKey = AUTOSAVE_PREFIX + (id ?? 'new')
  const allowLeave = useRef(false) // set just before we navigate away ourselves
  const titleEeRef = useRef<HTMLInputElement>(null)
  const titleEnRef = useRef<HTMLInputElement>(null)
  const keywordsRef = useRef<HTMLInputElement>(null)
  const eeRef = useRef<HTMLTextAreaElement>(null)
  const enRef = useRef<HTMLTextAreaElement>(null)

  // ---- Load -------------------------------------------------------------
  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const list = await fetchHymnList()
      const map = new Map<string, number[]>()
      list.forEach((h) => {
        if (h.id === id) return
        map.set(h.collection_id, [...(map.get(h.collection_id) ?? []), h.number])
      })
      setUsedNumbers(map)

      let f: Form
      if (id) {
        const r = await fetchHymn(id)
        if (!r) {
          setLoadError('This hymn was not found. It may have been deleted.')
          return
        }
        setRecord(r)
        f = formFromRecord(r)
      } else {
        const wanted = params.get('collection')
        const coll = collections.find((c) => c.slug === wanted || c.id === wanted) ?? collections[0]
        const nums = map.get(coll?.id ?? '') ?? []
        f = {
          collection_id: coll?.id ?? '',
          number: String((nums.length ? Math.max(...nums) : 0) + 1),
          title_ee: '',
          title_en: '',
          search_keywords: '',
          source: '',
          rights_status: 'unknown',
          category_ids: [],
          ee_text: '',
          en_text: '',
        }
      }
      setForm(f)
      setBaseline(f)
      const saved = readAutosave(autosaveKey)
      if (saved && !sameForm(saved.form, f)) setFound(saved)
    } catch (e) {
      setLoadError(friendlyError(e))
    }
  }, [id, params, collections, autosaveKey])

  useEffect(() => {
    allowLeave.current = false
    setRecord(null)
    setForm(null)
    setFound(null)
    setShowHistory(false)
    load()
  }, [load])

  const dirty = form !== null && !sameForm(form, baseline)

  // ---- Autosave to this device ---------------------------------------------
  useEffect(() => {
    if (!form || !dirty) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(autosaveKey, JSON.stringify({ form, savedAt: new Date().toISOString() }))
      } catch {
        /* storage full or blocked: ignore */
      }
    }, 600)
    return () => clearTimeout(t)
  }, [form, dirty, autosaveKey])

  // ---- Warn before leaving with unsaved changes -----------------------------
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowLeave.current && dirty && currentLocation.pathname !== nextLocation.pathname)

  // ---- Derived ----------------------------------------------------------------
  const eeBlocks = useMemo(() => parseHymnText(form?.ee_text ?? ''), [form?.ee_text])
  const enBlocks = useMemo(() => parseHymnText(form?.en_text ?? ''), [form?.en_text])
  const collection = collections.find((c) => c.id === form?.collection_id)
  const isEnglishCollection = collection?.slug === 'english-hymns'
  const numberTaken =
    form && /^\d+$/.test(form.number) && (usedNumbers.get(form.collection_id) ?? []).includes(Number(form.number))

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  // ---- Save / publish ---------------------------------------------------------
  function validate(f: Form, action: Action): string | null {
    if (!f.collection_id) return 'Please choose a collection.'
    if (!/^\d+$/.test(f.number.trim()) || Number(f.number) < 1) return 'Please enter a hymn number (1 or higher).'
    if (numberTaken) return `Hymn number ${f.number} already exists in ${collection?.name_en ?? 'this collection'}. Choose another number.`
    if (!f.title_ee.trim() && !f.title_en.trim()) return 'Please enter an Ewe title or an English title.'
    if (action === 'publish' && eeBlocks.length === 0 && enBlocks.length === 0)
      return 'Add the words of the hymn before publishing.'
    return null
  }

  function request(action: Action) {
    if (!form) return
    setError(null)
    setNotice(null)
    const problem = action === 'unpublish' && !dirty ? null : validate(form, action)
    if (problem) {
      setError(problem)
      return
    }
    if (action !== 'unpublish' && form.rights_status === 'unknown') {
      setPending(action)
      return
    }
    run(action)
  }

  async function run(action: Action) {
    if (!form) return
    setPending(null)
    setBusy(true)
    setError(null)
    try {
      let hymnId = id
      if (dirty || isNew) {
        hymnId = await saveHymn({
          id,
          collection_id: form.collection_id,
          number: Number(form.number),
          title_ee: normalizeText(form.title_ee),
          title_en: normalizeText(form.title_en),
          search_keywords: normalizeText(form.search_keywords),
          source: form.source,
          rights_status: form.rights_status,
          category_ids: form.category_ids,
          ee: eeBlocks,
          en: enBlocks,
        })
      }
      if (action === 'publish') await setHymnStatus(hymnId!, 'published')
      if (action === 'unpublish') await setHymnStatus(hymnId!, 'draft')

      localStorage.removeItem(autosaveKey)
      const fresh = await fetchHymn(hymnId!)
      if (fresh) {
        const f = formFromRecord(fresh)
        setRecord(fresh)
        setForm(f)
        setBaseline(f)
      }
      const message =
        action === 'publish'
          ? 'Published. Readers will see it the next time their app is online.'
          : action === 'unpublish'
            ? 'Unpublished. Readers will no longer see this hymn.'
            : fresh?.status === 'published'
              ? 'Saved. Readers will see the changes the next time their app is online.'
              : 'Saved as a draft. Readers can’t see it until you publish it.'
      setNotice(message)
      if (isNew) {
        allowLeave.current = true
        navigate(`/admin/hymns/${hymnId}`, { replace: true, state: { notice: message } })
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    if (!id) return
    setConfirmDelete(false)
    setBusy(true)
    try {
      await deleteHymn(id)
      localStorage.removeItem(autosaveKey)
      allowLeave.current = true
      navigate('/admin', { replace: true })
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  // ---- Render -----------------------------------------------------------------
  if (loadError)
    return (
      <main className="admin-main">
        <p className="alert alert-error">{loadError}</p>
        <Link to="/admin" className="btn">
          ← Back to hymns
        </Link>
      </main>
    )
  if (!form) return <p className="admin-loading">Loading…</p>

  const status: HymnStatus = record?.status ?? 'draft'

  return (
    <main className="admin-main editor">
      <div className="page-head">
        <Link to="/admin" className="btn btn-quiet">
          ← Hymns
        </Link>
        <h1>{isNew ? 'Add a hymn' : `Edit hymn ${record?.number ?? ''}`}</h1>
        {!isNew && <span className={`badge ${status}`}>{status === 'published' ? 'Published' : 'Draft'}</span>}
        {dirty && <span className="unsaved">Unsaved changes</span>}
      </div>

      {found && (
        <div className="alert alert-info">
          <p>
            Unsaved changes from {new Date(found.savedAt).toLocaleString()} were found on this device.
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => { setForm(found.form); setFound(null) }}>
              Restore them
            </button>
            <button className="btn" onClick={() => { localStorage.removeItem(autosaveKey); setFound(null) }}>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ---------- Basics ---------- */}
      <section className="card form-grid">
        <label className="field">
          <span>Collection</span>
          <select value={form.collection_id} onChange={(e) => set('collection_id', e.target.value)}>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_en}
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>Number</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.number}
            onChange={(e) => set('number', e.target.value.replace(/\D/g, ''))}
            aria-invalid={numberTaken || undefined}
          />
          {numberTaken && <small className="field-error">Number {form.number} is already used in this collection.</small>}
        </label>

        <div className="field full">
          <label htmlFor="title_ee">
            Ewe title {isEnglishCollection && <small className="muted">(optional for English hymns)</small>}
          </label>
          <input id="title_ee" ref={titleEeRef} lang="ee" className="ewe" value={form.title_ee} onChange={(e) => set('title_ee', e.target.value)} />
          <EweKeys compact target={titleEeRef} value={form.title_ee} onChange={(v) => set('title_ee', v)} />
        </div>

        <div className="field full">
          <label htmlFor="title_en">
            English title <small className="muted">(optional — leave blank if there isn’t one)</small>
          </label>
          <input id="title_en" ref={titleEnRef} value={form.title_en} onChange={(e) => set('title_en', e.target.value)} />
        </div>

        <fieldset className="field full">
          <legend>Categories</legend>
          <div className="chips">
            {categories.map((c) => {
              const on = form.category_ids.includes(c.id)
              return (
                <label key={c.id} className={`chip${on ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      set('category_ids', on ? form.category_ids.filter((x) => x !== c.id) : [...form.category_ids, c.id].sort())
                    }
                  />
                  {c.name_en}
                  {c.name_ee && <span lang="ee"> · {c.name_ee}</span>}
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      {/* ---------- Words ---------- */}
      <p className="howto">
        <strong>How to paste a hymn:</strong> leave a <strong>blank line</strong> between verses. Start a chorus with a line
        that says <code>Chorus:</code> (<code>Refrain:</code> and <code>Pre-chorus:</code> also work). Verse numbers like
        “1.” are removed automatically.
      </p>
      <div className="lyrics-grid">
        <section className="card lyrics">
          <label htmlFor="ee_text">
            <h2>Ewe words</h2>
          </label>
          <textarea
            id="ee_text"
            ref={eeRef}
            lang="ee"
            className="ewe"
            rows={14}
            value={form.ee_text}
            onChange={(e) => set('ee_text', e.target.value)}
            placeholder={'Paste or type the Ewe words here.\n\nBlank line = new verse.\nChorus: = start of a chorus.'}
          />
          <EweKeys target={eeRef} value={form.ee_text} onChange={(v) => set('ee_text', v)} />
          <h3 className="preview-title">Preview</h3>
          <HymnText
            blocks={eeBlocks}
            lang="ee"
            emptyMessage={isEnglishCollection ? 'No Ewe text (English hymn).' : 'No Ewe text yet — readers will see a note saying so.'}
          />
        </section>

        <section className="card lyrics">
          <label htmlFor="en_text">
            <h2>English words</h2>
          </label>
          <textarea
            id="en_text"
            ref={enRef}
            lang="en"
            rows={14}
            value={form.en_text}
            onChange={(e) => set('en_text', e.target.value)}
            placeholder={'Paste or type the English words here (optional).'}
          />
          <EweKeys target={enRef} value={form.en_text} onChange={(v) => set('en_text', v)} />
          <h3 className="preview-title">Preview</h3>
          <HymnText blocks={enBlocks} lang="en" emptyMessage="No English text yet — readers will see a note saying so." />
        </section>
      </div>

      {/* ---------- Rights and search ---------- */}
      <section className="card form-grid">
        <h2 className="full">Source and rights</h2>
        <label className="field">
          <span>Rights status</span>
          <select value={form.rights_status} onChange={(e) => set('rights_status', e.target.value as RightsStatus)}>
            {(Object.keys(RIGHTS_LABELS) as RightsStatus[]).map((k) => (
              <option key={k} value={k}>
                {RIGHTS_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Source</span>
          <input
            value={form.source}
            onChange={(e) => set('source', e.target.value)}
            placeholder="e.g. old Ewe hymnbook (1920s), or written by Mawuko Dzamesi"
          />
        </label>
        {form.rights_status === 'unknown' && (
          <p className="alert alert-warn full">
            ⚠ The rights for this hymn are <strong>unknown</strong>. Before publishing, check that it is public domain, written
            by your team, or that you have permission, and write down where it came from.
          </p>
        )}
        <div className="field full">
          <label htmlFor="kw">
            Other names people use for this hymn <small className="muted">(optional, helps search; separate with commas)</small>
          </label>
          <input id="kw" ref={keywordsRef} lang="ee" className="ewe" value={form.search_keywords} onChange={(e) => set('search_keywords', e.target.value)} />
          <EweKeys compact target={keywordsRef} value={form.search_keywords} onChange={(v) => set('search_keywords', v)} />
        </div>
      </section>

      {!isNew && (
        <section className="card more">
          <button className="btn" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            {showHistory ? 'Hide history' : 'Show change history'}
          </button>
          <button className="btn btn-danger-quiet" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete hymn
          </button>
          {showHistory && id && (
            <HistoryPanel
              hymnId={id}
              refreshKey={record?.updated_at ?? ''}
              disabled={dirty}
              onRestored={async () => {
                localStorage.removeItem(autosaveKey)
                await load()
                setNotice('Restored. The hymn now has the words and details from that version.')
              }}
            />
          )}
        </section>
      )}

      {/* ---------- Sticky action bar ---------- */}
      <div className="action-bar">
        <div className="action-msg" aria-live="polite">
          {error && <span className="msg-error">{error}</span>}
          {!error && notice && <span className="msg-ok">{notice}</span>}
        </div>
        <div className="action-buttons">
          {status === 'published' && !isNew ? (
            <>
              <button className="btn" onClick={() => request('unpublish')} disabled={busy}>
                Unpublish
              </button>
              <button className="btn btn-primary" onClick={() => request('save')} disabled={busy || !dirty}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => request('save')} disabled={busy || (!dirty && !isNew)}>
                {busy ? 'Saving…' : 'Save draft'}
              </button>
              <button className="btn btn-primary" onClick={() => request('publish')} disabled={busy}>
                {dirty || isNew ? 'Save & publish' : 'Publish'}
              </button>
            </>
          )}
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          title="Rights are marked “Unknown”"
          confirmLabel={pending === 'publish' ? 'Publish anyway' : 'Save anyway'}
          cancelLabel="Go back"
          onConfirm={() => run(pending)}
          onCancel={() => setPending(null)}
        >
          <p>
            We don’t yet know whether this hymn is public domain, written by your team, or used with permission.
            {pending === 'publish' ? ' Publishing it will show it to every reader.' : ''}
          </p>
          <p>You can set the rights status in “Source and rights” before saving.</p>
        </ConfirmDialog>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete hymn ${record?.number}?`}
          confirmLabel="Delete"
          danger
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        >
          It will disappear from the app for everyone. You can bring it back later from “Deleted hymns” at the bottom of
          the hymn list.
        </ConfirmDialog>
      )}

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Leave without saving?"
          confirmLabel="Leave"
          cancelLabel="Stay"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        >
          Your changes are not saved to the database yet. A copy is kept on this device, and you’ll be offered it next time
          you open this hymn.
        </ConfirmDialog>
      )}
    </main>
  )
}
