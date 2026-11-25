// Services (orders of worship) and sermon notes. Kept on this phone only.

import { useCallback } from 'react'
import { read, useStored, write } from './prefs'

export interface ServiceItem {
  hymnId: string
  /** "collection-slug.number", so a shared link still works on another phone. */
  ref: string
}

export interface Service {
  id: string
  name: string
  date: string // YYYY-MM-DD
  items: ServiceItem[]
  createdAt: string
  updatedAt: string
}

export interface SermonNote {
  id: string
  date: string
  preacher: string
  title: string
  scriptures: string
  points: string
  reflections: string
  createdAt: string
  updatedAt: string
}

export function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}

const now = () => new Date().toISOString()

export function nextSunday(from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ---- Services ---------------------------------------------------------------------

export function useServices() {
  const [services, set] = useStored<Service[]>('services', [])
  const [currentId, setCurrent] = useStored<{ id: string | null }>('current-service', { id: null })

  const save = useCallback(
    (fn: (list: Service[]) => Service[]) => set(fn(read<Service[]>('services', []))),
    [set],
  )

  const create = useCallback(
    (name?: string, date?: string, items: ServiceItem[] = []): Service => {
      const d = date ?? nextSunday()
      const s: Service = {
        id: newId(),
        name: name?.trim() || `Sunday service`,
        date: d,
        items,
        createdAt: now(),
        updatedAt: now(),
      }
      save((list) => [s, ...list])
      setCurrent({ id: s.id })
      return s
    },
    [save, setCurrent],
  )

  const update = useCallback(
    (id: string, patch: Partial<Omit<Service, 'id'>>) =>
      save((list) => list.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: now() } : s))),
    [save],
  )

  const remove = useCallback(
    (id: string) => {
      save((list) => list.filter((s) => s.id !== id))
      if (read<{ id: string | null }>('current-service', { id: null }).id === id) setCurrent({ id: null })
    },
    [save, setCurrent],
  )

  const addItem = useCallback(
    (id: string, item: ServiceItem) =>
      save((list) => list.map((s) => (s.id === id ? { ...s, items: [...s.items, item], updatedAt: now() } : s))),
    [save],
  )

  const sorted = [...services].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
  const current = services.find((s) => s.id === currentId.id) ?? null

  return {
    services: sorted,
    current,
    byId: (id: string) => services.find((s) => s.id === id),
    setCurrent: (id: string) => setCurrent({ id }),
    create,
    update,
    remove,
    addItem,
  }
}

// ---- Sermon notes -----------------------------------------------------------------

export function useNotes() {
  const [notes, set] = useStored<SermonNote[]>('notes', [])
  const save = useCallback((fn: (list: SermonNote[]) => SermonNote[]) => set(fn(read<SermonNote[]>('notes', []))), [set])

  const create = useCallback((): SermonNote => {
    const n: SermonNote = {
      id: newId(),
      date: new Date().toISOString().slice(0, 10),
      preacher: '',
      title: '',
      scriptures: '',
      points: '',
      reflections: '',
      createdAt: now(),
      updatedAt: now(),
    }
    save((list) => [n, ...list])
    return n
  }, [save])

  const update = useCallback(
    (id: string, patch: Partial<Omit<SermonNote, 'id'>>) =>
      save((list) => list.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now() } : n))),
    [save],
  )

  const remove = useCallback((id: string) => save((list) => list.filter((n) => n.id !== id)), [save])

  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
  return { notes: sorted, byId: (id: string) => notes.find((n) => n.id === id), create, update, remove }
}

/** True when a note has nothing written in it yet. */
export function noteIsEmpty(n: SermonNote) {
  return !(n.preacher || n.title || n.scriptures || n.points || n.reflections).trim()
}

// ---- Backup -------------------------------------------------------------------------

export interface Backup {
  app: 'coc-ewe-hymnal'
  version: 1
  exportedAt: string
  settings?: unknown
  favorites: string[]
  recent: string[]
  services: Service[]
  notes: SermonNote[]
}

export function makeBackup(): Backup {
  return {
    app: 'coc-ewe-hymnal',
    version: 1,
    exportedAt: now(),
    settings: read('settings', {}),
    favorites: read<string[]>('favorites', []),
    recent: read<string[]>('recent', []),
    services: read<Service[]>('services', []),
    notes: read<SermonNote[]>('notes', []),
  }
}

export function parseBackup(text: string): Backup | null {
  try {
    const b = JSON.parse(text)
    if (b?.app !== 'coc-ewe-hymnal' || !Array.isArray(b.services) || !Array.isArray(b.notes)) return null
    return { favorites: [], recent: [], ...b }
  } catch {
    return null
  }
}

/** Adds a backup to what is already on this phone. Nothing is deleted. */
export function mergeBackup(b: Backup, withSettings: boolean) {
  const mergeById = <T extends { id: string; updatedAt: string }>(mine: T[], theirs: T[]) => {
    const map = new Map(mine.map((x) => [x.id, x]))
    let added = 0
    for (const t of theirs) {
      const m = map.get(t.id)
      if (!m) added++
      if (!m || t.updatedAt > m.updatedAt) map.set(t.id, t)
    }
    return { list: [...map.values()], added }
  }
  const s = mergeById(read<Service[]>('services', []), b.services)
  const n = mergeById(read<SermonNote[]>('notes', []), b.notes)
  const favs = read<string[]>('favorites', [])
  const newFavs = b.favorites.filter((f) => !favs.includes(f))
  write('services', s.list)
  write('notes', n.list)
  write('favorites', [...favs, ...newFavs])
  const rec = read<string[]>('recent', [])
  write('recent', [...rec, ...b.recent.filter((r) => !rec.includes(r))].slice(0, 30))
  if (withSettings && b.settings && typeof b.settings === 'object') write('settings', { ...read('settings', {}), ...(b.settings as object) })
  return { services: s.added, notes: n.added, favorites: newFavs.length }
}
