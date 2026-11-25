import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { displayName, useLibrary } from './library'
import { formatDate, nextSunday, useServices, type Service, type ServiceItem } from './personal'
import { useSettings } from './prefs'
import { search } from '../lib/search'
import ConfirmDialog from '../admin/ConfirmDialog'
import { Words } from './HymnPage'
import type { Hymn, Lang } from '../lib/types'
import '../components/HymnText.css'

const LANG_LABEL: Record<Lang, string> = { ee: 'Ewe', en: 'English', both: 'Both' }

function useResolve() {
  const { hymnById, collectionBySlug, hymnsIn, collectionById } = useLibrary()
  return useMemo(() => {
    const resolve = (it: ServiceItem): Hymn | undefined => {
      const h = hymnById(it.hymnId)
      if (h) return h
      const [slug, num] = it.ref.split('.')
      const col = collectionBySlug(slug)
      return col ? hymnsIn(col.id).find((x) => String(x.number) === num) : undefined
    }
    const refOf = (h: Hymn) => `${collectionById(h.collection_id)?.slug ?? '_'}.${h.number}`
    return { resolve, refOf }
  }, [hymnById, collectionBySlug, hymnsIn, collectionById])
}

const titleOf = (h: Hymn, lang: Lang) => (lang === 'en' ? h.title_en || h.title_ee : h.title_ee || h.title_en) ?? ''

// ---- List of services -------------------------------------------------------------

export function ServicesListPage() {
  const { services, current, create } = useServices()
  const navigate = useNavigate()
  return (
    <main className="page-pad">
      <div className="section-row">
        <h1 className="page-h">Services</h1>
        <button className="btn btn-primary" onClick={() => navigate(`/services/${create().id}`)}>
          + New service
        </button>
      </div>
      <p className="muted small">Plan the hymns for a service, then sing through them in order. Saved on this phone only.</p>
      {services.length === 0 ? (
        <div className="card empty">
          <p>No services yet.</p>
          <p className="muted small">Tap “New service”, or open any hymn and tap “Add to service”.</p>
        </div>
      ) : (
        <ul className="cat-list">
          {services.map((s) => (
            <li key={s.id}>
              <Link to={`/services/${s.id}`} className="cat-row service-row">
                <span>
                  <span className="c-name">{s.name}</span>
                  <span className="c-sub">
                    {formatDate(s.date)} · {s.items.length === 1 ? '1 hymn' : `${s.items.length} hymns`}
                  </span>
                </span>
                {current?.id === s.id && <span className="badge published">Current</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

// ---- One service ----------------------------------------------------------------------

export function ServicePage() {
  const { id = '' } = useParams()
  const svc = useServices()
  const service = svc.byId(id)
  const { resolve, refOf } = useResolve()
  const { index, hymnPath, collectionById } = useLibrary()
  const [settings] = useSettings()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    if (service && svc.current?.id !== service.id) svc.setCurrent(service.id)
  }, [service?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => (q.trim() ? search(index, q, { limit: 6 }) : []), [q, index])

  if (!service)
    return (
      <main className="page-pad">
        <p>This service was not found on this phone.</p>
        <Link to="/services" className="btn">
          All services
        </Link>
      </main>
    )

  const items = service.items
  const order = drag ? move(items.map((_, i) => i), drag.from, drag.to) : items.map((_, i) => i)
  const setItems = (next: ServiceItem[]) => svc.update(service.id, { items: next })
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    setItems(move(items, from, to))
  }

  function onPointerDown(e: React.PointerEvent, i: number) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ from: i, to: i })
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    const y = e.clientY
    let to = drag.to
    rowRefs.current.forEach((el, i) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      if (y > r.top && y < r.bottom) to = i
    })
    if (to !== drag.to) setDrag({ ...drag, to })
  }
  function onPointerUp() {
    if (drag) moveItem(drag.from, drag.to)
    setDrag(null)
  }

  async function share() {
    const hymns = items.map(resolve)
    const url = `${location.origin}/s?${new URLSearchParams({ n: service!.name, d: service!.date, h: items.map((i) => i.ref).join(',') })}`
    const text =
      `${service!.name} — ${formatDate(service!.date)}\n` +
      hymns.map((h, i) => (h ? `${i + 1}. ${collectionById(h.collection_id)?.name_en ?? ''} ${h.number} – ${titleOf(h, settings.lang)}` : `${i + 1}. (not available)`)).join('\n') +
      `\n\nOpen in the COC Ewe Hymnal: ${url}`
    try {
      if (navigator.share) {
        await navigator.share({ title: service!.name, text })
        return
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareMsg('Copied. Paste it into WhatsApp, a text message or an email.')
    } catch {
      setShareMsg(text)
    }
  }

  return (
    <main className="page-pad service-page">
      <div className="page-title">
        <Link to="/services" className="back" aria-label="Back to services">
          ‹
        </Link>
        <div className="service-head">
          <label className="sr-only" htmlFor="svc-name">
            Service name
          </label>
          <input id="svc-name" className="title-input" value={service.name} onChange={(e) => svc.update(service.id, { name: e.target.value })} />
          <label className="date-row">
            <span className="muted small">Date</span>
            <input type="date" value={service.date} onChange={(e) => svc.update(service.id, { date: e.target.value || nextSunday() })} />
          </label>
        </div>
      </div>

      <div className="service-actions">
        <button className="btn btn-primary btn-big" disabled={!items.length} onClick={() => navigate(`/services/${service.id}/play/0`)}>
          ▶ Start worship
        </button>
        <button className="btn" disabled={!items.length} onClick={share}>
          Share
        </button>
      </div>
      {shareMsg && (
        <p className="alert alert-info small" role="status" style={{ whiteSpace: 'pre-line' }}>
          {shareMsg}
        </p>
      )}

      {items.length === 0 ? (
        <p className="muted">No hymns yet. Add some below, or tap “Add to service” on any hymn.</p>
      ) : (
        <ol className="service-items" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
          {order.map((i, pos) => {
            const it = items[i]
            const h = resolve(it)
            return (
              <li key={`${it.ref}-${i}`} ref={(el) => { rowRefs.current[pos] = el }} className={drag && drag.from === i ? 'dragging' : ''}>
                <button className="drag-handle" aria-label={`Move hymn ${pos + 1}. Drag, or use the arrow keys`}
                  onPointerDown={(e) => onPointerDown(e, i)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); moveItem(i, i - 1) }
                    if (e.key === 'ArrowDown') { e.preventDefault(); moveItem(i, i + 1) }
                  }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
                </button>
                <span className="pos">{pos + 1}</span>
                {h ? (
                  <Link to={hymnPath(h)} className="item-title">
                    <span className="num-small">
                      {collectionById(h.collection_id)?.name_en} {h.number}
                    </span>
                    <span lang={settings.lang === 'en' ? 'en' : 'ee'}>{titleOf(h, settings.lang)}</span>
                  </Link>
                ) : (
                  <span className="item-title muted">This hymn is no longer in the hymnal ({it.ref.replace('.', ' ')})</span>
                )}
                <span className="updown">
                  <button aria-label="Move up" disabled={i === 0} onClick={() => moveItem(i, i - 1)}>↑</button>
                  <button aria-label="Move down" disabled={i === items.length - 1} onClick={() => moveItem(i, i + 1)}>↓</button>
                </span>
                <button className="remove" aria-label="Remove from service" onClick={() => setItems(items.filter((_, k) => k !== i))}>
                  ×
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <section className="card add-hymns">
        <h2>Add hymns</h2>
        <input type="search" placeholder="Number, title or words" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a hymn to add" />
        <ul className="add-results">
          {results.map((r) => (
            <li key={r.hymn.id}>
              <span>
                <strong>{r.hymn.number}</strong> <span lang="ee">{titleOf(r.hymn, settings.lang)}</span>
                <span className="muted small"> · {collectionById(r.hymn.collection_id)?.name_en}</span>
              </span>
              <button className="btn" onClick={() => { svc.addItem(service.id, { hymnId: r.hymn.id, ref: refOf(r.hymn) }); setQ('') }}>
                + Add
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button className="btn btn-danger-quiet" onClick={() => setConfirmDelete(true)}>
        Delete this service
      </button>
      {confirmDelete && (
        <ConfirmDialog title={`Delete “${service.name}”?`} confirmLabel="Delete" danger onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { svc.remove(service.id); navigate('/services', { replace: true }) }}>
          The list of hymns for this service will be removed from this phone. The hymns themselves stay in the hymnal.
        </ConfirmDialog>
      )}
    </main>
  )
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr]
  const [x] = a.splice(from, 1)
  a.splice(to, 0, x)
  return a
}

// ---- Worship mode ---------------------------------------------------------------------

export function PlayPage() {
  const { id = '', index = '0' } = useParams()
  const svc = useServices()
  const service = svc.byId(id)
  const { resolve } = useResolve()
  const { collectionById } = useLibrary()
  const [settings, setSettings] = useSettings()
  const navigate = useNavigate()
  const touch = useRef<{ x: number; y: number } | null>(null)
  const i = Math.max(0, Number(index) || 0)
  const total = service?.items.length ?? 0

  // Keep the screen on while singing.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const get = () => nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    get()
    const onVis = () => document.visibilityState === 'visible' && get()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [])

  const go = (n: number) => service && n >= 0 && n < total && navigate(`/services/${service.id}/play/${n}`, { replace: true })

  useEffect(() => {
    window.scrollTo(0, 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === 'ArrowLeft') go(i - 1)
      if (e.key === 'Escape' && service) navigate(`/services/${service.id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (!service || total === 0)
    return (
      <main className="page-pad">
        <p>This service has no hymns.</p>
        <Link to="/services" className="btn">All services</Link>
      </main>
    )

  const h = resolve(service.items[Math.min(i, total - 1)])
  const prev = i > 0 ? resolve(service.items[i - 1]) : undefined
  const next = i < total - 1 ? resolve(service.items[i + 1]) : undefined

  return (
    <main
      className="play"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current
        touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        if (Math.abs(dx) > 70 && Math.abs(dy) < 60) go(dx < 0 ? i + 1 : i - 1)
      }}
    >
      <header className="play-top">
        <Link to={`/services/${service.id}`} className="sq-btn" aria-label="Close worship mode">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </Link>
        <span className="play-pos" aria-live="polite">
          {i + 1} of {total}
        </span>
        <div className="pills compact" role="group" aria-label="Language">
          {(['ee', 'en', 'both'] as Lang[]).map((l) => (
            <button key={l} className={settings.lang === l ? 'on' : ''} aria-pressed={settings.lang === l} onClick={() => setSettings({ lang: l })}>
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </header>
      <div className="play-dots" aria-hidden="true">
        {service.items.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>

      {h ? (
        <article className="play-body">
          <p className="hymn-kicker">
            {displayName(collectionById(h.collection_id) ?? { name_ee: null, name_en: '' })} · No. {h.number}
          </p>
          <h1 className="hymn-title" lang={settings.lang === 'en' && h.title_en ? 'en' : 'ee'}>
            {titleOf(h, settings.lang)}
          </h1>
          <Words hymn={h} lang={settings.lang} onSwitch={(l) => setSettings({ lang: l })} />
        </article>
      ) : (
        <p className="missing">This hymn is no longer in the hymnal.</p>
      )}

      <nav className="play-nav" aria-label="Service order">
        <button className="play-step" disabled={!prev && i === 0} onClick={() => go(i - 1)} aria-label="Previous hymn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          <span>{prev ? `${prev.number} ${titleOf(prev, settings.lang)}` : i > 0 ? 'Previous' : 'Start'}</span>
        </button>
        <button className="play-step next" disabled={i >= total - 1} onClick={() => go(i + 1)} aria-label="Next hymn">
          <span>{next ? `${next.number} ${titleOf(next, settings.lang)}` : 'End of service'}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </nav>
    </main>
  )
}

// ---- A service shared by link -------------------------------------------------------------

export function SharedServicePage() {
  const [params] = useSearchParams()
  const { collectionBySlug, hymnsIn, collectionById } = useLibrary()
  const [settings] = useSettings()
  const svc = useServices()
  const navigate = useNavigate()
  const name = params.get('n') || 'Shared service'
  const date = params.get('d') || nextSunday()
  const refs = (params.get('h') || '').split(',').filter(Boolean)
  const items = refs.map((ref) => {
    const [slug, num] = ref.split('.')
    const col = collectionBySlug(slug)
    const h = col ? hymnsIn(col.id).find((x) => String(x.number) === num) : undefined
    return { ref, h }
  })
  const found = items.filter((x) => x.h)

  function save() {
    const s: Service = svc.create(name, date, items.filter((x) => x.h).map((x) => ({ hymnId: x.h!.id, ref: x.ref })))
    navigate(`/services/${s.id}`, { replace: true })
  }

  return (
    <main className="page-pad">
      <h1 className="page-h">{name}</h1>
      <p className="muted">{formatDate(date)} · shared order of service</p>
      <ol className="hymn-rows shared-list">
        {items.map(({ ref, h }, i) => (
          <li key={`${ref}-${i}`} className="hymn-row" style={{ gridTemplateColumns: '2rem 1fr' }}>
            <span className="num">{i + 1}</span>
            {h ? (
              <span className="titles">
                <span className="t-ee">{titleOf(h, settings.lang)}</span>
                <span className="t-en">
                  {collectionById(h.collection_id)?.name_en} {h.number}
                </span>
              </span>
            ) : (
              <span className="muted">{ref.replace('.', ' ')} is not in this hymnal yet</span>
            )}
          </li>
        ))}
      </ol>
      <button className="btn btn-primary btn-wide" disabled={!found.length} onClick={save}>
        Save to my services
      </button>
    </main>
  )
}
