import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'no-database' }
  | { kind: 'signed-out' }
  | { kind: 'not-admin'; email: string }
  | { kind: 'admin'; email: string; session: Session }
  | { kind: 'error'; message: string }

export function useAdminAuth() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })

  const evaluate = useCallback(async (session: Session | null) => {
    if (!supabase) return setState({ kind: 'no-database' })
    if (!session) return setState({ kind: 'signed-out' })
    const email = session.user.email ?? ''
    const { data, error } = await supabase.rpc('is_admin')
    if (error) return setState({ kind: 'error', message: error.message })
    setState(data ? { kind: 'admin', email, session } : { kind: 'not-admin', email })
  }, [])

  useEffect(() => {
    if (!supabase) {
      setState({ kind: 'no-database' })
      return
    }
    supabase.auth.getSession().then(({ data }) => evaluate(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Run outside the auth callback, as Supabase recommends.
        setTimeout(() => evaluate(session), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [evaluate])

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'The database is not set up.'
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (!error) return null
    if (/invalid login credentials/i.test(error.message)) return 'That email and password do not match. Please check and try again.'
    if (/email not confirmed/i.test(error.message)) return 'This email has not been confirmed yet. Ask the owner to confirm it in Supabase.'
    if (/fetch/i.test(error.message)) return 'No internet connection. Please try again when you are online.'
    return error.message
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  return { state, signIn, signOut }
}
