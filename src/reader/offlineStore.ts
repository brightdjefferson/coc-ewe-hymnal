// Keeps a copy of every published hymn on the phone (IndexedDB), so the
// app opens instantly and works with no internet.

import { openDB, type IDBPDatabase } from 'idb'
import type { Library } from '../lib/types'

const DB_NAME = 'coc-ewe-hymnal'
const STORE = 'library'
const KEY = 'current'

let dbPromise: Promise<IDBPDatabase> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

export async function loadSavedLibrary(): Promise<Library | null> {
  try {
    const lib = (await (await db()).get(STORE, KEY)) as Library | undefined
    return lib && Array.isArray(lib.hymns) ? lib : null
  } catch {
    return null // private browsing or storage blocked: work online only
  }
}

export async function saveLibrary(lib: Library): Promise<void> {
  try {
    await (await db()).put(STORE, lib, KEY)
  } catch {
    /* storage full or blocked: the app still works while open */
  }
}

/** Ask the phone not to clear the saved hymns when space runs low. */
export async function askToKeepStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* not supported */
  }
}
