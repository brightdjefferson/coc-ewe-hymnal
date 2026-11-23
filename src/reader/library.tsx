import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { buildIndex, type SearchIndex } from '../lib/search'
import type { VerseKind } from '../lib/hymnText'
import type { Category, Collection, Hymn, Library } from '../lib/types'

// Loads every published hymn once. (Phase 3 will also keep a copy on the
// device so the app opens with no internet.)

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

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; library: Library }

interface Ctx {
  state: State
  reload: () => void
}

const LibraryContext = createContext<Ctx | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const load = useCallback(() => {
    setState((s) => (s.kind === 'ready' ? s : { kind: 'loading' }))
    fetchLibrary()
      .then((library) => setState({ kind: 'ready', library }))
      .catch((e: Error) =>
        setState({
          kind: 'error',
          message:
            e.message === 'not-configured'
              ? 'The hymn database is not set up yet.'
              : /fetch|network|load failed/i.test(e.message)
                ? 'Could not connect. Please check your internet connection and try again.'
                : e.message,
        }),
      )
  }, [])
  useEffect(() => load(), [load])
  return <LibraryContext.Provider value={{ state, reload: load }}>{children}</LibraryContext.Provider>
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
