import { supabase } from '../lib/supabase'
import type { Block, VerseKind } from '../lib/hymnText'

export type RightsStatus = 'public_domain' | 'permission_granted' | 'original_work' | 'unknown'
export type HymnStatus = 'draft' | 'published'

export const RIGHTS_LABELS: Record<RightsStatus, string> = {
  public_domain: 'Public domain',
  permission_granted: 'Permission granted',
  original_work: 'Original work (written by our team)',
  unknown: 'Unknown',
}

export interface Collection {
  id: string
  slug: string
  name_ee: string | null
  name_en: string | null
  sort_order: number
}
export type Category = Collection

export interface HymnListItem {
  id: string
  collection_id: string
  number: number
  title_ee: string | null
  title_en: string | null
  search_keywords: string | null
  status: HymnStatus
  rights_status: RightsStatus
  updated_at: string
  has_ee: boolean
  has_en: boolean
}

export interface HymnData {
  id?: string
  collection_id: string
  number: number | null
  title_ee: string
  title_en: string
  search_keywords: string
  source: string
  rights_status: RightsStatus
  category_ids: string[]
  ee: Block[]
  en: Block[]
}

export interface HymnRecord extends HymnData {
  id: string
  status: HymnStatus
  updated_at: string
}

export interface HistoryEntry {
  id: number
  hymn_id: string
  action: 'create' | 'edit' | 'publish' | 'unpublish' | 'delete' | 'restore'
  snapshot: {
    number: number
    title_ee: string | null
    title_en: string | null
    status: HymnStatus
    verses: { lang: 'ee' | 'en'; kind: VerseKind; body: string }[]
  }
  changed_by_email: string | null
  changed_at: string
}

function db() {
  if (!supabase) throw new Error('The database is not set up. Check the Supabase settings in Vercel.')
  return supabase
}

/** Turns database errors into sentences an admin can act on. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'No internet connection, or the database could not be reached. Your changes are kept on this device. Please try again.'
  }
  if (/JWT expired|invalid JWT|not authenticated/i.test(msg)) {
    return 'You have been signed out. Please sign in again. Your changes are kept on this device.'
  }
  return msg
}

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await db().from('collections').select('*').order('sort_order')
  throwIf(error)
  return data ?? []
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await db().from('categories').select('*').order('sort_order')
  throwIf(error)
  return data ?? []
}

export async function fetchHymnList(): Promise<HymnListItem[]> {
  const { data, error } = await db()
    .from('hymns')
    .select('id, collection_id, number, title_ee, title_en, search_keywords, status, rights_status, updated_at, verses(lang)')
    .order('number')
  throwIf(error)
  return (data ?? []).map(({ verses, ...h }) => {
    const langs = new Set((verses as { lang: string }[]).map((v) => v.lang))
    return { ...h, has_ee: langs.has('ee'), has_en: langs.has('en') } as HymnListItem
  })
}

export async function fetchHymn(id: string): Promise<HymnRecord | null> {
  const { data, error } = await db()
    .from('hymns')
    .select('*, verses(lang, position, kind, body), hymn_categories(category_id)')
    .eq('id', id)
    .maybeSingle()
  throwIf(error)
  if (!data) return null
  const verses = [...(data.verses as { lang: string; position: number; kind: VerseKind; body: string }[])].sort(
    (a, b) => a.position - b.position,
  )
  return {
    id: data.id,
    collection_id: data.collection_id,
    number: data.number,
    title_ee: data.title_ee ?? '',
    title_en: data.title_en ?? '',
    search_keywords: data.search_keywords ?? '',
    source: data.source ?? '',
    rights_status: data.rights_status,
    status: data.status,
    updated_at: data.updated_at,
    category_ids: (data.hymn_categories as { category_id: string }[]).map((c) => c.category_id),
    ee: verses.filter((v) => v.lang === 'ee').map(({ kind, body }) => ({ kind, body })),
    en: verses.filter((v) => v.lang === 'en').map(({ kind, body }) => ({ kind, body })),
  }
}

export async function saveHymn(h: HymnData): Promise<string> {
  const payload = {
    id: h.id ?? null,
    collection_id: h.collection_id,
    number: h.number,
    title_ee: h.title_ee,
    title_en: h.title_en,
    search_keywords: h.search_keywords,
    source: h.source,
    rights_status: h.rights_status,
    category_ids: h.category_ids,
    verses: [
      ...h.ee.map((b) => ({ lang: 'ee', ...b })),
      ...h.en.map((b) => ({ lang: 'en', ...b })),
    ],
  }
  const { data, error } = await db().rpc('save_hymn', { p: payload })
  throwIf(error)
  return data as string
}

export async function setHymnStatus(id: string, status: HymnStatus): Promise<void> {
  const { error } = await db().rpc('set_hymn_status', { p_id: id, p_status: status })
  throwIf(error)
}

export async function deleteHymn(id: string): Promise<void> {
  const { error } = await db().rpc('delete_hymn', { p_id: id })
  throwIf(error)
}

export async function fetchHistory(hymnId: string): Promise<HistoryEntry[]> {
  const { data, error } = await db()
    .from('hymn_history')
    .select('*')
    .eq('hymn_id', hymnId)
    .order('changed_at', { ascending: false })
    .limit(100)
  throwIf(error)
  return (data ?? []) as HistoryEntry[]
}

/** Hymns that were deleted and have not been brought back. */
export async function fetchDeleted(existingIds: Set<string>): Promise<HistoryEntry[]> {
  const { data, error } = await db()
    .from('hymn_history')
    .select('*')
    .eq('action', 'delete')
    .order('changed_at', { ascending: false })
    .limit(200)
  throwIf(error)
  const seen = new Set<string>()
  return ((data ?? []) as HistoryEntry[]).filter((e) => {
    if (existingIds.has(e.hymn_id) || seen.has(e.hymn_id)) return false
    seen.add(e.hymn_id)
    return true
  })
}

export async function restoreHymn(historyId: number): Promise<string> {
  const { data, error } = await db().rpc('restore_hymn', { p_history_id: historyId })
  throwIf(error)
  return data as string
}

// ---- Collections & categories ------------------------------------------------

export type ListTable = 'collections' | 'categories'

export interface ListItemInput {
  name_ee: string | null
  name_en: string | null
}

function slugify(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[ɖƉ]/g, 'd').replace(/[ɛƐ]/g, 'e').replace(/[ɔƆ]/g, 'o').replace(/[ŋŊ]/g, 'n')
      .replace(/[ƒƑ]/g, 'f').replace(/[ʋƲ]/g, 'v').replace(/[ɣƔ]/g, 'g')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  )
}

export async function addListItem(table: ListTable, item: ListItemInput, existing: Collection[]): Promise<void> {
  const base = slugify(item.name_en || item.name_ee || '')
  let slug = base
  for (let i = 2; existing.some((x) => x.slug === slug); i++) slug = `${base}-${i}`
  const sort_order = Math.max(0, ...existing.map((x) => x.sort_order)) + 1
  const { error } = await db().from(table).insert({ slug, sort_order, ...item })
  throwIf(error)
}

export async function updateListItem(table: ListTable, id: string, item: ListItemInput): Promise<void> {
  const { error } = await db().from(table).update(item).eq('id', id)
  throwIf(error)
}

export async function swapOrder(table: ListTable, a: Collection, b: Collection): Promise<void> {
  // Give each the other's position (if equal, nudge so the order still changes).
  const ao = a.sort_order, bo = b.sort_order === a.sort_order ? a.sort_order + 1 : b.sort_order
  const r1 = await db().from(table).update({ sort_order: bo }).eq('id', a.id)
  throwIf(r1.error)
  const r2 = await db().from(table).update({ sort_order: ao }).eq('id', b.id)
  throwIf(r2.error)
}

export async function deleteListItem(table: ListTable, id: string): Promise<void> {
  const { error } = await db().from(table).delete().eq('id', id)
  if (error && /foreign key|violates/i.test(error.message))
    throw new Error('This collection still has hymns in it. Move or delete those hymns first.')
  throwIf(error)
}

/** How many hymns (drafts included) use each category. */
export async function categoryUsage(): Promise<Map<string, number>> {
  const { data, error } = await db().from('hymn_categories').select('category_id')
  throwIf(error)
  const m = new Map<string, number>()
  for (const r of data ?? []) m.set(r.category_id, (m.get(r.category_id) ?? 0) + 1)
  return m
}

export async function setCategoryHymns(categoryId: string, hymnIds: string[], add: boolean): Promise<number> {
  const { data, error } = await db().rpc('set_category_hymns', { p_category_id: categoryId, p_hymn_ids: hymnIds, p_add: add })
  if (error && /set_category_hymns/i.test(error.message) && /not find|does not exist/i.test(error.message))
    throw new Error('The bulk-category feature needs the second database setup file (0002). Please run it in Supabase first.')
  throwIf(error)
  return data as number
}

/** Which hymns are in a category (drafts included). */
export async function hymnsInCategory(categoryId: string): Promise<Set<string>> {
  const { data, error } = await db().from('hymn_categories').select('hymn_id').eq('category_id', categoryId)
  throwIf(error)
  return new Set((data ?? []).map((r) => r.hymn_id as string))
}
