import type { Block } from './hymnText'

export interface Collection {
  id: string
  slug: string
  name_ee: string | null
  name_en: string | null
  sort_order: number
}

export interface Category {
  id: string
  slug: string
  name_ee: string | null
  name_en: string | null
  sort_order: number
}

/** A published hymn as the reader app uses it. */
export interface Hymn {
  id: string
  collection_id: string
  number: number
  title_ee: string | null
  title_en: string | null
  search_keywords: string | null
  updated_at: string
  category_ids: string[]
  ee: Block[]
  en: Block[]
}

export interface Library {
  collections: Collection[]
  categories: Category[]
  hymns: Hymn[]
  version: number
  fetchedAt: string
}

export type Lang = 'ee' | 'en' | 'both'
