import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { LibraryProvider, useLibraryState } from './library'
import { useApplySettings } from './prefs'
import { usePwa } from './usePwa'
import './reader.css'

const NAV = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', end: true },
  { to: '/search', label: 'Search', icon: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4l4.7 4.7 1.4-1.4-4.7-4.7A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z' },
  { to: '/services', label: 'Services', icon: 'M4 5h12v2H4zm0 5h12v2H4zm0 5h8v2H4zm14-2 5 3.5-5 3.5z' },
  { to: '/favorites', label: 'Favourites', icon: 'M12 21s-7.5-4.6-9.3-9.1C1.4 8.6 3.6 5 7 5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.6 4.3 6.9C19.5 16.4 12 21 12 21z' },
  { to: '/more', label: 'More', icon: 'M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z' },
]

const MORE_PATHS = ['/more', '/settings', '/categories', '/notes']

export default function ReaderLayout() {
  useApplySettings()
  const { pathname } = useLocation()
  const playing = /^\/services\/[^/]+\/play/.test(pathname)
  return (
    <LibraryProvider>
      <div className={`reader${playing ? ' playing' : ''}`}>
        <div className="reader-content">
          <Gate />
        </div>
        <Messages />
        {!playing && (
        <nav className="bottom-nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => (isActive || (n.to === '/more' && MORE_PATHS.some((m) => pathname.startsWith(m))) ? 'on' : '')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
                <path d={n.icon} fill="currentColor" />
              </svg>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        )}
      </div>
    </LibraryProvider>
  )
}

function Gate() {
  const { state, reload } = useLibraryState()
  if (state.kind === 'loading')
    return (
      <div className="state-msg" role="status">
        <img src="/favicon.svg" alt="" width="64" height="64" />
        <p>Loading hymns…</p>
      </div>
    )
  if (state.kind === 'error')
    return (
      <div className="state-msg" role="alert">
        <img src="/favicon.svg" alt="" width="64" height="64" />
        <p>{state.message}</p>
        <button className="btn btn-primary" onClick={reload}>
          Try again
        </button>
      </div>
    )
  return <Outlet />
}

function Messages() {
  const { notice, clearNotice } = useLibraryState()
  const p = usePwa()
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clearNotice, 4000)
    return () => clearTimeout(t)
  }, [notice, clearNotice])
  return (
    <div className="toasts" aria-live="polite">
      {p.needRefresh && (
        <div className="toast">
          <span>A new version of the app is ready.</span>
          <button className="btn btn-primary" onClick={() => p.update()}>
            Update
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status" onClick={clearNotice}>
          <span>✓ {notice}</span>
        </div>
      )}
    </div>
  )
}
