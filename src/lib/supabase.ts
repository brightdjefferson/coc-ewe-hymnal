import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// These two values come from settings (".env.local" on a computer, or the
// hosting service's Environment Variables page). They are never typed into
// the code itself.
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

// Tolerate a trailing slash or a path pasted by mistake: keep only https://host
function cleanUrl(u: string | undefined): string | undefined {
  if (!u) return undefined
  try {
    return new URL(u).origin
  } catch {
    return u.replace(/\/+$/, '')
  }
}
const url = cleanUrl(rawUrl)

export const isSupabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!)
  : null

export type KeyKind = 'publishable' | 'anon' | 'secret' | 'service_role' | 'unknown' | 'missing'

/** Works out what kind of key was pasted, without revealing it. */
export function keyKind(k = key): KeyKind {
  if (!k) return 'missing'
  if (k.startsWith('sb_publishable_')) return 'publishable'
  if (k.startsWith('sb_secret_')) return 'secret'
  const parts = k.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (payload.role === 'anon') return 'anon'
      if (payload.role === 'service_role') return 'service_role'
    } catch {
      /* fall through */
    }
  }
  return 'unknown'
}

export type ConnectionResult =
  | { state: 'not-configured'; missing: string[] }
  | { state: 'connected'; host: string }
  | { state: 'problem'; host?: string; reason: string }

/** Checks that the app can reach the Supabase project, and explains any problem in plain words. */
export async function checkConnection(): Promise<ConnectionResult> {
  const missing = [
    !rawUrl && 'VITE_SUPABASE_URL',
    !key && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean) as string[]
  if (missing.length) return { state: 'not-configured', missing }

  const kind = keyKind()
  if (kind === 'secret' || kind === 'service_role') {
    return {
      state: 'problem',
      reason:
        'DANGER: the key in VITE_SUPABASE_PUBLISHABLE_KEY is a SECRET key. Replace it with the publishable (or anon) key, then reset the secret key in Supabase.',
    }
  }

  let host = ''
  try {
    host = new URL(url!).host
  } catch {
    return { state: 'problem', reason: 'VITE_SUPABASE_URL is not a web address. It should look like https://abcdefgh.supabase.co' }
  }
  if (host.endsWith('supabase.com')) {
    return {
      state: 'problem',
      host,
      reason:
        'VITE_SUPABASE_URL is the Supabase dashboard address. Use the Project URL instead (it ends in .supabase.co).',
    }
  }
  if (!host.endsWith('.supabase.co')) {
    return { state: 'problem', host, reason: 'VITE_SUPABASE_URL should end in .supabase.co' }
  }
  if (kind === 'unknown') {
    return {
      state: 'problem',
      host,
      reason:
        'VITE_SUPABASE_PUBLISHABLE_KEY does not look like a Supabase key. Copy the key starting with sb_publishable_ (or the "anon public" key).',
    }
  }

  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } })
    if (res.ok) return { state: 'connected', host }
    if (res.status === 401 || res.status === 403) {
      return { state: 'problem', host, reason: `Supabase rejected the key (code ${res.status}). Re-copy the publishable key.` }
    }
    return { state: 'problem', host, reason: `Supabase answered with code ${res.status}.` }
  } catch {
    return {
      state: 'problem',
      host,
      reason: 'No answer from that address. Check the Project URL for typos, and check the project is not paused in Supabase.',
    }
  }
}
