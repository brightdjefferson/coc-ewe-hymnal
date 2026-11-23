import { useEffect, useState, type FormEvent } from 'react'
import { Link, Outlet, useOutletContext } from 'react-router'
import { useAdminAuth } from './useAdminAuth'
import { fetchCategories, fetchCollections, friendlyError, type Category, type Collection } from './api'
import './admin.css'

export interface AdminContext {
  email: string
  collections: Collection[]
  categories: Category[]
}

export function useAdmin() {
  return useOutletContext<AdminContext>()
}

export default function AdminLayout() {
  const { state, signIn, signOut } = useAdminAuth()
  const [lists, setLists] = useState<{ collections: Collection[]; categories: Category[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (state.kind !== 'admin') return
    Promise.all([fetchCollections(), fetchCategories()])
      .then(([collections, categories]) => setLists({ collections, categories }))
      .catch((e) => setLoadError(friendlyError(e)))
  }, [state.kind])

  if (state.kind === 'loading') return <Centered>Loading…</Centered>
  if (state.kind === 'no-database')
    return <Centered>The database is not set up yet. Check the Supabase settings in Vercel.</Centered>
  if (state.kind === 'error') return <Centered>Something went wrong: {state.message}</Centered>
  if (state.kind === 'signed-out') return <LoginForm onSignIn={signIn} />
  if (state.kind === 'not-admin')
    return (
      <Centered>
        <h1>Not an admin</h1>
        <p>
          You are signed in as <strong>{state.email}</strong>, but this email is not on the admins list. Ask the owner
          to add it.
        </p>
        <button className="btn" onClick={signOut}>
          Sign out
        </button>
      </Centered>
    )

  return (
    <div className="admin">
      <header className="admin-bar">
        <Link to="/admin" className="admin-brand">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span>Hymnal admin</span>
        </Link>
        <span className="admin-who" title={state.email}>
          {state.email}
        </span>
        <button className="btn btn-quiet" onClick={signOut}>
          Sign out
        </button>
      </header>
      {loadError && <p className="alert alert-error">{loadError}</p>}
      {lists ? (
        <Outlet context={{ email: state.email, ...lists } satisfies AdminContext} />
      ) : (
        !loadError && <p className="admin-loading">Loading…</p>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="admin-center">
      <div className="card">{children}</div>
    </main>
  )
}

function LoginForm({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<string | null> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await onSignIn(email, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <main className="admin-center">
      <form className="card login" onSubmit={submit}>
        <img src="/favicon.svg" alt="" width="56" height="56" />
        <h1>COC Ewe Hymnal</h1>
        <p className="muted">Admin sign-in</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-wide" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small">Only invited admins can sign in. Church members don't need an account.</p>
      </form>
    </main>
  )
}
