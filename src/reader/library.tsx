import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { askToKeepStorage, loadSavedLibrary, saveLibrary } from './offlineStore'
import { supabase } from '../lib/supabase'
import { buildIndex, type SearchIndex } from '../lib/search'
import type { VerseKind } from '../lib/hymnText'
import type { Category, Collection, Hymn, Library } from '../lib/types'

// Loads every published hymn. A copy is kept on the phone, so the app opens
// instantly from it (even with no internet) and then quietly checks the
// database's update counter; if anything changed, it downloads a new copy.

const PAGE = 1000

async function fetchLibrary(): Promise<Library> {
  if (!supabase) throw new Error('not-configured')
  const db = supabase
  const [cols, cats, ver] = await Promise.all([
    db.from('collections').select('*').order('sort_order'),
    db.from('categories').select('*').order('sort_order'),
    db.from('content_version').select('version').eq('id', 1).maybeSingle(),
  ])
  for (const r of [cols, cats, ver]) if (r.error) throw new Error(r.error.message)

  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('hymns')
      .select('id, collection_id, number, title_ee, title_en, search_keywords, updated_at, verses(lang, position, kind, body), hymn_categories(category_id)')
      .eq('status', 'published') // even when an admin is signed in on this device
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const hymns: Hymn[] = rows.map((r) => {
    const verses = [...(r.verses as { lang: string; position: number; kind: VerseKind; body: string }[])].sort(
      (a, b) => a.position - b.position,
    )
    return {
      id: r.id as string,
      collection_id: r.collection_id as string,
      number: r.number as number,
      title_ee: r.title_ee as string | null,
      title_en: r.title_en as string | null,
      search_keywords: r.search_keywords as string | null,
      updated_at: r.updated_at as string,
      category_ids: (r.hymn_categories as { category_id: string }[]).map((c) => c.category_id),
      ee: verses.filter((v) => v.lang === 'ee').map(({ kind, body }) => ({ kind, body })),
      en: verses.filter((v) => v.lang === 'en').map(({ kind, body }) => ({ kind, body })),
    }
  })
  hymns.sort((a, b) => a.number - b.number)

  return {
    collections: (cols.data ?? []) as Collection[],
    categories: (cats.data ?? []) as Category[],
    hymns,
    version: (ver.data?.version as number) ?? 0,
    fetchedAt: new Date().toISOString(),
  }
}

async function fetchVersion(): Promise<number> {
  if (!supabase) throw new Error('not-configured')
  const { data, error } = await supabase
    .from('content_version')
    .select('version')
    .eq('id', 1)
    .abortSignal(AbortSignal.timeout(10000))
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.version as number) ?? 0
}

function friendly(e: Error) {
  return e.message === 'not-configured'
    ? 'The hymn database is not set up yet.'
    : /fetch|network|load failed|offline|abort|timeout/i.test(e.message) || !navigator.onLine
      ? 'No internet connection.'
      : e.message
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; library: Library }

export type UpdateResult = 'updated' | 'current' | 'offline' | 'error'

interface Ctx {
  state: State
  reload: () => void
  /** Checks the database for changes and downloads them. */
  checkForUpdates: (opts?: { quiet?: boolean }) => Promise<UpdateResult>
  checking: boolean
  lastChecked: string | null
  /** A short message to show once, e.g. "Hymns updated". */
  notice: string | null
  clearNotice: () => void
}

const LibraryContext = createContext<Ctx | null>(null)

const RECHECK_MS = 5 * 60 * 1000 // when the app comes back to the screen

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const current = useRef<Library | null>(null)
  const busy = useRef<Promise<UpdateResult> | null>(null)
  const lastCheckAt = useRef(0)

  const use = useCallback((lib: Library) => {
    current.current = lib
    setState({ kind: 'ready', library: lib })
  }, [])

  const checkForUpdates = useCallback(
    (opts: { quiet?: boolean } = {}): Promise<UpdateResult> => {
      if (busy.current) return busy.current
      const run = async (): Promise<UpdateResult> => {
        if (!navigator.onLine && current.current) return 'offline'
        setChecking(true)
        lastCheckAt.current = Date.now()
        try {
          const have = current.current
          if (have) {
            const v = await fetchVersion()
            setLastChecked(new Date().toISOString())
            if (v === have.version) return 'current'
          }
          const fresh = await fetchLibrary()
          await saveLibrary(fresh)
          askToKeepStorage()
          setLastChecked(fresh.fetchedAt)
          const hadCopy = !!have
          use(fresh)
          if (hadCopy && !opts.quiet) setNotice('Hymns updated')
          return 'updated'
        } catch (e) {
          const msg = friendly(e as Error)
          if (!current.current) setState({ kind: 'error', message: msg === 'No internet connection.' ? 'No internet connection. Connect once to download the hymns; after that the app works offline.' : msg })
          return msg === 'No internet connection.' ? 'offline' : 'error'
        } finally {
          setChecking(false)
        }
      }
      // Always release the "checking" lock, however the check ends.
      const p = run().finally(() => {
        busy.current = null
      })
      busy.current = p
      return p
    },
    [use],
  )

  // Start: open from the phone's copy, then check for changes.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const saved = await loadSavedLibrary()
      if (!alive) return
      if (saved) {
        use(saved)
        setLastChecked(saved.fetchedAt)
      }
      if (!saved || navigator.onLine) checkForUpdates({ quiet: false })
    })()
    return () => {
      alive = false
    }
  }, [use, checkForUpdates])

  // Check again when the phone reconnects, or the app comes back on screen.
  useEffect(() => {
    const onOnline = () => checkForUpdates()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastCheckAt.current > RECHECK_MS)
        checkForUpdates()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [checkForUpdates])

  const reload = useCallback(() => {
    setState({ kind: 'loading' })
    checkForUpdates()
  }, [checkForUpdates])

  return (
    <LibraryContext.Provider
      value={{ state, reload, checkForUpdates, checking, lastChecked, notice, clearNotice: () => setNotice(null) }}
    >
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibraryState() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('LibraryProvider missing')
  return ctx
}

export interface LibraryHelpers {
  library: Library
  index: SearchIndex
  collectionBySlug: (slug: string) => Collection | undefined
  collectionById: (id: string) => Collection | undefined
  categoryBySlug: (slug: string) => Category | undefined
  hymnById: (id: string) => Hymn | undefined
  hymnsIn: (collectionId: string) => Hymn[]
  hymnPath: (h: Hymn) => string
}

/** Only call inside screens rendered once the library is ready. */
export function useLibrary(): LibraryHelpers {
  const { state } = useLibraryState()
  if (state.kind !== 'ready') throw new Error('Library not ready')
  const library = state.library
  return useMemo(() => {
    const byId = new Map(library.hymns.map((h) => [h.id, h]))
    const colById = new Map(library.collections.map((c) => [c.id, c]))
    const inCol = new Map<string, Hymn[]>()
    for (const h of library.hymns) inCol.set(h.collection_id, [...(inCol.get(h.collection_id) ?? []), h])
    return {
      library,
      index: buildIndex(library.hymns, library.collections),
      collectionBySlug: (slug) => library.collections.find((c) => c.slug === slug),
      collectionById: (id) => colById.get(id),
      categoryBySlug: (slug) => library.categories.find((c) => c.slug === slug),
      hymnById: (id) => byId.get(id),
      hymnsIn: (id) => inCol.get(id) ?? [],
      hymnPath: (h) => `/c/${colById.get(h.collection_id)?.slug ?? '_'}/${h.number}`,
    }
  }, [library])
}

/** "Ewe name · English name", or whichever exists. */
export function displayName(x: { name_ee: string | null; name_en: string | null }) {
  return x.name_ee || x.name_en || ''
}
