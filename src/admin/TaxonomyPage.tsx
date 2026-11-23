import { useEffect, useMemo, useRef, useState } from 'react'
import { useAdmin } from './AdminLayout'
import {
  addListItem,
  categoryUsage,
  deleteListItem,
  fetchHymnList,
  friendlyError,
  hymnsInCategory,
  setCategoryHymns,
  swapOrder,
  updateListItem,
  type Collection,
  type HymnListItem,
  type ListTable,
} from './api'
import EweKeys from '../components/EweKeys'
import ConfirmDialog from './ConfirmDialog'
import { fold } from '../lib/fold'

export default function TaxonomyPage() {
  const { collections, categories, reloadLists } = useAdmin()
  const [hymns, setHymns] = useState<HymnListItem[]>([])
  const [usage, setUsage] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)

  async function refreshCounts() {
    try {
      const [list, u] = await Promise.all([fetchHymnList(), categoryUsage()])
      setHymns(list)
      setUsage(u)
    } catch (e) {
      setError(friendlyError(e))
    }
  }
  useEffect(() => {
    refreshCounts()
  }, [])

  const collectionCounts = useMemo(() => {
    const m = new Map<string, number>()
    hymns.forEach((h) => m.set(h.collection_id, (m.get(h.collection_id) ?? 0) + 1))
    return m
  }, [hymns])

  return (
    <main className="admin-main">
      <div className="page-head">
        <h1>Collections &amp; categories</h1>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      <p className="howto">
        Type the Ewe and English names. Readers see the Ewe name first, with the English name underneath. Use ↑ ↓ to change
        the order.
      </p>

      <ListEditor
        table="collections"
        title="Collections"
        items={collections}
        usage={collectionCounts}
        usageLabel={(n) => `${n} hymn${n === 1 ? '' : 's'}`}
        onChanged={async () => { await reloadLists(); await refreshCounts() }}
        onError={setError}
      />
      <ListEditor
        table="categories"
        title="Categories"
        items={categories}
        usage={usage}
        usageLabel={(n) => `Used by ${n} hymn${n === 1 ? '' : 's'}`}
        onChanged={async () => { await reloadLists(); await refreshCounts() }}
        onError={setError}
      />
      <BulkAssign hymns={hymns} onDone={refreshCounts} />
    </main>
  )
}

function ListEditor({ table, title, items, usage, usageLabel, onChanged, onError }: {
  table: ListTable
  title: string
  items: Collection[]
  usage: Map<string, number>
  usageLabel: (n: number) => string
  onChanged: () => Promise<void>
  onError: (m: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<Collection | null>(null)
  const [adding, setAdding] = useState({ name_ee: '', name_en: '' })
  const addEeRef = useRef<HTMLInputElement>(null)
  const isCol = table === 'collections'

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    onError(null)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      onError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="list-editor">
        {items.map((it, i) => (
          <ItemRow
            key={it.id + (it.name_ee ?? '') + (it.name_en ?? '')}
            item={it}
            busy={busy}
            usage={usageLabel(usage.get(it.id) ?? 0)}
            onSave={(v) => act(() => updateListItem(table, it.id, v))}
            onUp={i > 0 ? () => act(() => swapOrder(table, it, items[i - 1])) : undefined}
            onDown={i < items.length - 1 ? () => act(() => swapOrder(table, it, items[i + 1])) : undefined}
            onDelete={() => setToDelete(it)}
          />
        ))}
      </ul>

      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (!adding.name_ee.trim() && !adding.name_en.trim()) return onError('Type a name first.')
          act(async () => {
            await addListItem(table, { name_ee: adding.name_ee.trim() || null, name_en: adding.name_en.trim() || null }, items)
            setAdding({ name_ee: '', name_en: '' })
          })
        }}
      >
        <h3>Add a {isCol ? 'collection' : 'category'}</h3>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`add-ee-${table}`}>Ewe name</label>
            <input id={`add-ee-${table}`} ref={addEeRef} lang="ee" className="ewe" value={adding.name_ee}
              onChange={(e) => setAdding({ ...adding, name_ee: e.target.value })} />
            <EweKeys compact target={addEeRef} value={adding.name_ee} onChange={(v) => setAdding({ ...adding, name_ee: v })} />
          </div>
          <label className="field">
            <span>English name</span>
            <input value={adding.name_en} onChange={(e) => setAdding({ ...adding, name_en: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          + Add
        </button>
      </form>

      {toDelete && (
        <ConfirmDialog
          title={`Delete “${toDelete.name_en || toDelete.name_ee}”?`}
          confirmLabel="Delete"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const it = toDelete
            setToDelete(null)
            act(() => deleteListItem(table, it.id))
          }}
        >
          {isCol ? (
            (usage.get(toDelete.id) ?? 0) > 0 ? (
              <p>
                <strong>This collection has {usage.get(toDelete.id)} hymn(s).</strong> It can only be deleted once they are
                moved to another collection or deleted.
              </p>
            ) : (
              <p>This collection is empty, so nothing else will change.</p>
            )
          ) : (usage.get(toDelete.id) ?? 0) > 0 ? (
            <p>
              <strong>{usage.get(toDelete.id)} hymn(s) use this category.</strong> The hymns stay, but they will no longer be
              in this category. This can’t be undone.
            </p>
          ) : (
            <p>No hymns use this category.</p>
          )}
        </ConfirmDialog>
      )}
    </section>
  )
}

function ItemRow({ item, busy, usage, onSave, onUp, onDown, onDelete }: {
  item: Collection
  busy: boolean
  usage: string
  onSave: (v: { name_ee: string | null; name_en: string | null }) => void
  onUp?: () => void
  onDown?: () => void
  onDelete: () => void
}) {
  const [ee, setEe] = useState(item.name_ee ?? '')
  const [en, setEn] = useState(item.name_en ?? '')
  const [keys, setKeys] = useState(false)
  const eeRef = useRef<HTMLInputElement>(null)
  const dirty = ee !== (item.name_ee ?? '') || en !== (item.name_en ?? '')
  return (
    <li>
      <div className="field">
        <label htmlFor={`ee-${item.id}`}>Ewe name</label>
        <input id={`ee-${item.id}`} ref={eeRef} lang="ee" className="ewe" value={ee} onChange={(e) => setEe(e.target.value)}
          onFocus={() => setKeys(true)} placeholder="(not added yet)" />
        {keys && <EweKeys compact target={eeRef} value={ee} onChange={setEe} />}
      </div>
      <label className="field">
        <span>English name</span>
        <input value={en} onChange={(e) => setEn(e.target.value)} />
      </label>
      <div className="item-actions">
        {dirty && (
          <button className="btn btn-primary" disabled={busy || (!ee.trim() && !en.trim())}
            onClick={() => onSave({ name_ee: ee.trim() || null, name_en: en.trim() || null })}>
            Save
          </button>
        )}
        <button className="btn" onClick={onUp} disabled={busy || !onUp} aria-label="Move up">
          ↑
        </button>
        <button className="btn" onClick={onDown} disabled={busy || !onDown} aria-label="Move down">
          ↓
        </button>
        <button className="btn btn-danger-quiet" onClick={onDelete} disabled={busy} aria-label={`Delete ${en || ee}`}>
          Delete
        </button>
      </div>
      <span className="usage">{usage}</span>
    </li>
  )
}

function BulkAssign({ hymns, onDone }: { hymns: HymnListItem[]; onDone: () => Promise<void> }) {
  const { categories, collections } = useAdmin()
  const [catId, setCatId] = useState('')
  const [inCat, setInCat] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPicked(new Set())
    setMsg(null)
    if (catId) hymnsInCategory(catId).then(setInCat).catch((e) => setMsg({ ok: false, text: friendlyError(e) }))
  }, [catId])

  const colName = (id: string) => collections.find((c) => c.id === id)?.name_en ?? ''
  const shown = useMemo(() => {
    const f = fold(q)
    return hymns
      .filter((h) => !f || (/^\d+$/.test(f) ? String(h.number).startsWith(f) : fold(`${h.title_ee} ${h.title_en}`).includes(f)))
      .sort((a, b) => collections.findIndex((c) => c.id === a.collection_id) - collections.findIndex((c) => c.id === b.collection_id) || a.number - b.number)
  }, [hymns, q, collections])

  async function apply(add: boolean) {
    setBusy(true)
    setMsg(null)
    try {
      const n = await setCategoryHymns(catId, [...picked], add)
      const cat = categories.find((c) => c.id === catId)
      setMsg({ ok: true, text: `${n} hymn${n === 1 ? '' : 's'} ${add ? 'added to' : 'removed from'} “${cat?.name_en || cat?.name_ee}”.` })
      setPicked(new Set())
      setInCat(await hymnsInCategory(catId))
      await onDone()
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  return (
    <section className="card">
      <h2>Put several hymns into a category</h2>
      <label className="field">
        <span>1. Choose a category</span>
        <select value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value="">— choose —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_en || c.name_ee}
              {c.name_ee && c.name_en ? ` · ${c.name_ee}` : ''}
            </option>
          ))}
        </select>
      </label>
      {catId && (
        <>
          <span className="field">
            <span>2. Tick the hymns</span>
          </span>
          <input type="search" placeholder="Filter by number or title" value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Filter hymns" />
          <ul className="bulk-list">
            {shown.map((h) => (
              <li key={h.id}>
                <label>
                  <input type="checkbox" checked={picked.has(h.id)} onChange={() => toggle(h.id)} />
                  <strong>{h.number}</strong>
                  <span lang="ee">{h.title_ee || h.title_en}</span>
                  <span className="muted small">{colName(h.collection_id)}</span>
                  {inCat.has(h.id) && <span className="tag on in-cat">in category</span>}
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="muted" style={{ padding: '0.75rem' }}>No hymns match.</li>}
          </ul>
          <div className="row">
            <button className="btn btn-primary" disabled={busy || picked.size === 0} onClick={() => apply(true)}>
              Add {picked.size || ''} to category
            </button>
            <button className="btn" disabled={busy || picked.size === 0} onClick={() => apply(false)}>
              Remove {picked.size || ''} from category
            </button>
          </div>
        </>
      )}
      {msg && <p className={`alert ${msg.ok ? 'alert-info' : 'alert-error'}`} style={{ marginTop: '1rem' }}>{msg.text}</p>}
    </section>
  )
}
