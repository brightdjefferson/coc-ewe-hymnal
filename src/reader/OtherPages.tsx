import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { search } from '../lib/search'
import { displayName, useLibrary, useLibraryState, type UpdateResult } from './library'
import { usePwa } from './usePwa'
import { BackupCard } from './MorePage'
import { isInstalled, isIOS } from '../pwa'
import { DEFAULT_SETTINGS, useFavorites, useRecent, useSettings, useStored, type Settings } from './prefs'
import { DEFAULT_REMINDER, REMINDER_KEY, ReminderError, reminderSupport, removeReminder, saveReminder, type Reminder } from './reminders'
import { HymnRow, SearchBox } from './components'
import { CategoryChips } from './CategoryChips'
import type { Lang } from '../lib/types'

// ---- Search ---------------------------------------------------------------------

export function SearchPage() {
  const { index } = useLibrary()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const cat = params.get('cat')
  const [showAll, setShowAll] = useState(false)

  const results = useMemo(() => (q.trim() ? search(index, q, { limit: 200, categoryId: cat }) : []), [index, q, cat])
  const shown = showAll ? results : results.slice(0, 30)

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
    setShowAll(false)
  }

  return (
    <main className="page-pad">
      <h1 className="page-h">Search</h1>
      <SearchBox autoFocus={!q} initial={q} onQuery={(v) => set('q', v.trim() ? v : null)} />
      <p className="muted small hint">
        Type a number, or part of a title or a line, in Ewe or English. You don’t need special letters: “e” finds ɛ, “o”
        finds ɔ, “d” finds ɖ.
      </p>
      <CategoryChips selected={cat} onChange={(id) => set('cat', id)} />
      {q.trim() && (
        <p className="result-count" role="status">
          {results.length === 0 ? `No hymns found for “${q.trim()}”.` : results.length === 1 ? '1 hymn found' : `${results.length} hymns found`}
        </p>
      )}
      <ul className="hymn-rows">
        {shown.map((r) => (
          <HymnRow key={r.hymn.id} hymn={r.hymn} result={r} showCollection />
        ))}
      </ul>
      {results.length > shown.length && (
        <button className="btn btn-wide" onClick={() => setShowAll(true)}>
          Show all {results.length}
        </button>
      )}
    </main>
  )
}

// ---- Categories ------------------------------------------------------------------

export function CategoriesPage() {
  const { library } = useLibrary()
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    library.hymns.forEach((h) => h.category_ids.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1)))
    return m
  }, [library])
  return (
    <main className="page-pad">
      <h1 className="page-h">Categories</h1>
      <ul className="cat-list">
        {library.categories.map((c) => {
          const n = counts.get(c.id) ?? 0
          return (
            <li key={c.id}>
              <Link to={`/categories/${c.slug}`} className="cat-row">
                <span>
                  <span className="c-name" lang={c.name_ee ? 'ee' : 'en'}>
                    {displayName(c)}
                  </span>
                  {c.name_ee && c.name_en && <span className="c-sub">{c.name_en}</span>}
                </span>
                <span className="c-count">{n}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}

export function CategoryPage() {
  const { slug } = useParams()
  const { categoryBySlug, library } = useLibrary()
  const cat = categoryBySlug(slug ?? '')
  if (!cat)
    return (
      <main className="page-pad">
        <p>That category was not found.</p>
        <Link to="/categories">All categories</Link>
      </main>
    )
  return (
    <main className="page-pad">
      <div className="page-title">
        <Link to="/categories" className="back" aria-label="Back to categories">
          ‹
        </Link>
        <div>
          <h1 lang={cat.name_ee ? 'ee' : 'en'}>{displayName(cat)}</h1>
          {cat.name_ee && cat.name_en && <p className="sub">{cat.name_en}</p>}
        </div>
      </div>
      {library.collections.map((col) => {
        const hymns = library.hymns.filter((h) => h.collection_id === col.id && h.category_ids.includes(cat.id))
        if (!hymns.length) return null
        return (
          <section key={col.id}>
            <h2 className="section-h">{displayName(col)}</h2>
            <ul className="hymn-rows">
              {hymns.map((h) => (
                <HymnRow key={h.id} hymn={h} />
              ))}
            </ul>
          </section>
        )
      })}
      {!library.hymns.some((h) => h.category_ids.includes(cat.id)) && <p className="muted">No hymns in this category yet.</p>}
    </main>
  )
}

// ---- Favourites & recent -----------------------------------------------------------

export function FavoritesPage() {
  const { hymnById } = useLibrary()
  const fav = useFavorites()
  const recent = useRecent()
  const favHymns = fav.ids.map(hymnById).filter((h) => !!h)
  const recentHymns = recent.ids.map(hymnById).filter((h) => !!h)
  return (
    <main className="page-pad">
      <h1 className="page-h">Favourites</h1>
      {favHymns.length === 0 ? (
        <p className="muted">Tap ♡ on any hymn to keep it here. Favourites are saved on this phone only.</p>
      ) : (
        <ul className="hymn-rows">
          {favHymns.map((h) => (
            <HymnRow key={h.id} hymn={h} showCollection />
          ))}
        </ul>
      )}
      {recentHymns.length > 0 && (
        <>
          <div className="section-row">
            <h2 className="section-h">Recently viewed</h2>
            <button className="btn btn-quiet" onClick={recent.clear}>
              Clear
            </button>
          </div>
          <ul className="hymn-rows">
            {recentHymns.map((h) => (
              <HymnRow key={h.id} hymn={h} showCollection />
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

// ---- Settings -----------------------------------------------------------------------

const SIZES = [0.85, 1, 1.15, 1.3, 1.5, 1.75]

export function SettingsPage() {
  const [s, set] = useSettings()
  const sizeIndex = SIZES.reduce((best, v, i) => (Math.abs(v - s.textScale) < Math.abs(SIZES[best] - s.textScale) ? i : best), 0)
  return (
    <main className="page-pad settings">
      <h1 className="page-h">Settings</h1>

      <section className="card">
        <h2>Text size</h2>
        <div className="size-row">
          <button className="btn size-btn" onClick={() => set({ textScale: SIZES[Math.max(0, sizeIndex - 1)] })}
            disabled={sizeIndex === 0}>
            <span aria-hidden="true">A−</span>
            <span className="sr-only">Smaller text</span>
          </button>
          <input type="range" min={0} max={SIZES.length - 1} step={1} value={sizeIndex}
            onChange={(e) => set({ textScale: SIZES[Number(e.target.value)] })} aria-label="Text size" />
          <button className="btn size-btn big" onClick={() => set({ textScale: SIZES[Math.min(SIZES.length - 1, sizeIndex + 1)] })}
            disabled={sizeIndex === SIZES.length - 1}>
            <span aria-hidden="true">A+</span>
            <span className="sr-only">Larger text</span>
          </button>
        </div>
        <p className="size-sample" lang="ee">
          ɖ ɛ ɔ ŋ ƒ ʋ ɣ — Ɖ Ɛ Ɔ Ŋ Ƒ Ʋ Ɣ
        </p>
      </section>

      <section className="card">
        <h2>Appearance</h2>
        <Choice<Settings['theme']>
          value={s.theme}
          onChange={(theme) => set({ theme })}
          options={[
            ['system', 'Same as phone'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ]}
          label="Theme"
        />
      </section>

      <section className="card">
        <h2>Language when opening a hymn</h2>
        <Choice<Lang>
          value={s.lang}
          onChange={(lang) => set({ lang })}
          options={[
            ['ee', 'Ewe'],
            ['en', 'English'],
            ['both', 'Both'],
          ]}
          label="Default language"
        />
      </section>

      <ReminderCard lang={s.lang} />
      <UpdatesCard />
      <InstallCard />
      <BackupCard />

      <button className="btn btn-quiet" onClick={() => set(DEFAULT_SETTINGS)}>
        Reset settings
      </button>

      <section className="card about">
        <h2>About</h2>
        <p>
          A free hymnal in Ewe and English for Churches of Christ. No ads, no accounts, no tracking. Your favourites,
          recent hymns, services, notes and settings stay on this phone and are never sent anywhere. If you turn on the
          daily reminder, only what is needed to deliver it is kept: a notification address from your browser, the time,
          your time zone and language. Turning it off removes them. <Link to="/privacy">Read more about privacy</Link>
        </p>
      </section>
    </main>
  )
}

function Choice<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {text}
        </button>
      ))}
    </div>
  )
}

function ReminderCard({ lang }: { lang: Lang }) {
  const [r, setR] = useStored<Reminder>(REMINDER_KEY, DEFAULT_REMINDER)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const support = reminderSupport()
  const savedLang = useRef(lang)

  async function apply(next: Reminder) {
    setBusy(true)
    setMsg(null)
    try {
      if (next.on) {
        await saveReminder(next.time, lang)
        setMsg({ text: `Reminder set for ${next.time} every day.` })
      } else {
        await removeReminder()
        setMsg({ text: 'Reminder turned off.' })
      }
      setR(next)
    } catch (e) {
      setMsg({ text: e instanceof ReminderError ? e.message : 'Something went wrong. Please try again.', bad: true })
      if (!next.on) setR(next) // turning off always counts on this phone
    } finally {
      setBusy(false)
    }
  }

  // The reminder follows the reading language chosen above.
  useEffect(() => {
    if (savedLang.current === lang) return
    savedLang.current = lang
    if (r.on && support === 'ok') saveReminder(r.time, lang).catch(() => {})
  }, [lang, r.on, r.time, support])

  return (
    <section className="card">
      <h2>Daily reminder</h2>
      <p className="muted small">A notification each day with the Hymn of the Day. Tap it to open the hymn.</p>
      {support === 'ios-install' ? (
        <p className="small">
          On iPhone, reminders work once the hymnal is on your home screen (see “Put the hymnal on your home screen”
          below). Then open it from the home screen and come back here.
        </p>
      ) : support === 'unsupported' ? (
        <p className="small">This browser can’t show reminders. Try Chrome on Android, or Safari on iPhone.</p>
      ) : (
        <>
          <label className="switch-row">
            <input type="checkbox" role="switch" checked={r.on} disabled={busy}
              onChange={(e) => apply({ ...r, on: e.target.checked })} />
            <span>Remind me every day</span>
          </label>
          <label className="field-row">
            <span>Time</span>
            <input type="time" value={r.time} disabled={busy}
              onChange={(e) => e.target.value && (r.on ? apply({ on: true, time: e.target.value }) : setR({ ...r, time: e.target.value }))} />
          </label>
          {support === 'blocked' && (
            <p className="small">
              Notifications are blocked for the hymnal. To allow them, open your phone’s settings for this app or browser,
              choose <strong>Notifications</strong> and turn them on, then come back here.
            </p>
          )}
          <p className="muted small">It may arrive up to 15 minutes after the time you choose.</p>
        </>
      )}
      {busy && <p className="small" role="status">Saving…</p>}
      {msg && !busy && (
        <p className={"small" + (msg.bad ? " field-error" : "")} role="status">
          {msg.text}
        </p>
      )}
    </section>
  )
}

const UPDATE_TEXT: Record<UpdateResult, string> = {
  updated: 'Hymns updated.',
  current: 'You have the latest hymns.',
  offline: 'No internet connection. You can still read every hymn; try again when you are online.',
  error: 'Could not check right now. Please try again later.',
}

function UpdatesCard() {
  const { library } = useLibrary()
  const { checkForUpdates, checking, lastChecked } = useLibraryState()
  const [result, setResult] = useState<UpdateResult | null>(null)
  const when = lastChecked ?? library.fetchedAt
  return (
    <section className="card">
      <h2>Hymn updates</h2>
      <p className="muted small">
        {library.hymns.length} hymns saved on this phone, ready to read without internet.
        <br />
        Last checked: {new Date(when).toLocaleString()}
      </p>
      <button className="btn" disabled={checking} onClick={async () => setResult(await checkForUpdates({ quiet: true }))}>
        {checking ? 'Checking…' : 'Check for updates'}
      </button>
      {result && !checking && (
        <p className="small" role="status" style={{ marginTop: '0.75rem' }}>
          {UPDATE_TEXT[result]}
        </p>
      )}
    </section>
  )
}

function InstallCard() {
  const p = usePwa()
  if (isInstalled())
    return (
      <section className="card">
        <h2>App</h2>
        <p className="muted small">The hymnal is installed on this device. ✓</p>
      </section>
    )
  return (
    <section className="card">
      <h2>Put the hymnal on your home screen</h2>
      {p.installPrompt ? (
        <>
          <p className="muted small">It opens like an app and works without internet.</p>
          <button className="btn btn-primary" onClick={() => p.installPrompt?.prompt()}>
            Install app
          </button>
        </>
      ) : isIOS() ? (
        <ol className="steps small">
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>
            Tap the <strong>Share</strong> button (the square with an arrow pointing up).
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
        </ol>
      ) : (
        <p className="muted small">
          Open your browser’s menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
        </p>
      )}
    </section>
  )
}
