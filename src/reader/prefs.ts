// Everything a reader chooses (settings, favourites, recently viewed) is
// kept on their own device only. Nothing is sent anywhere.

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { Lang } from '../lib/types'

const PREFIX = 'coc-hymnal:'

export interface Settings {
  textScale: number // 0.85 – 1.8
  theme: 'system' | 'light' | 'dark'
  lang: Lang
}

export const DEFAULT_SETTINGS: Settings = { textScale: 1, theme: 'system', lang: 'ee' }

const listeners = new Set<() => void>()
const cache = new Map<string, unknown>()

function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T
  let v = fallback
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) {
      const parsed = JSON.parse(raw)
      v = Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : { ...fallback, ...parsed }
    }
  } catch {
    /* blocked or corrupt storage: use the default */
  }
  cache.set(key, v)
  return v
}

function write<T>(key: string, value: T) {
  cache.set(key, value)
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: keep it for this visit only */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) {
      cache.delete(e.key.slice(PREFIX.length))
      l()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

function useStored<T>(key: string, fallback: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key, fallback), () => fallback)
  const set = useCallback((v: T) => write(key, v), [key])
  return [value, set]
}

// ---- Settings ------------------------------------------------------------------

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, set] = useStored<Settings>('settings', DEFAULT_SETTINGS)
  const update = useCallback((patch: Partial<Settings>) => set({ ...read('settings', DEFAULT_SETTINGS), ...patch }), [set])
  return [s, update]
}

/** Applies text size and theme to the whole page. */
export function useApplySettings() {
  const [s] = useSettings()
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--text-scale', String(s.textScale))
    if (s.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = s.theme
    const meta = document.querySelectorAll('meta[name="theme-color"]')
    meta.forEach((m) => {
      const media = m.getAttribute('media') ?? ''
      if (s.theme !== 'system') m.setAttribute('content', s.theme === 'dark' ? '#0b1222' : '#f3f5f8')
      else m.setAttribute('content', media.includes('dark') ? '#0b1222' : '#f3f5f8')
    })
  }, [s.textScale, s.theme])
}

// ---- Favourites & recently viewed ------------------------------------------------

export function useFavorites() {
  const [ids, set] = useStored<string[]>('favorites', [])
  const toggle = useCallback(
    (id: string) => {
      const cur = read<string[]>('favorites', [])
      set(cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur])
    },
    [set],
  )
  return { ids, has: (id: string) => ids.includes(id), toggle }
}

const RECENT_MAX = 30

export function useRecent() {
  const [ids, set] = useStored<string[]>('recent', [])
  const add = useCallback(
    (id: string) => {
      const cur = read<string[]>('recent', [])
      if (cur[0] === id) return
      set([id, ...cur.filter((x) => x !== id)].slice(0, RECENT_MAX))
    },
    [set],
  )
  const clear = useCallback(() => set([]), [set])
  return { ids, add, clear }
}
