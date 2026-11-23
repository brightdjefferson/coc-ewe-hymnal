import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// These two values come from settings (".env.local" on a computer, or the
// hosting service's Environment Variables page). They are never typed into
// the code itself.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!)
  : null

/**
 * Checks that the app can reach the Supabase project.
 * Returns 'not-configured' | 'connected' | 'unreachable'.
 */
export async function checkConnection(): Promise<'not-configured' | 'connected' | 'unreachable'> {
  if (!url || !key) return 'not-configured'
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })
    return res.ok ? 'connected' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}
