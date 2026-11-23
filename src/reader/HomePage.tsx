import { Link } from 'react-router'
import { displayName, useLibrary } from './library'
import { useFavorites, useRecent, useSettings } from './prefs'
import { HymnRow, SearchBox } from './components'
import { firstLine, hymnOfTheDay } from '../lib/hymnOfDay'
import Logo from '../components/Logo'

export default function HomePage() {
  const { library, hymnsIn, hymnById, hymnPath, collectionById } = useLibrary()
  const [settings] = useSettings()
  const recent = useRecent()
  const fav = useFavorites()
  const recentHymns = recent.ids.map(hymnById).filter((h) => !!h).slice(0, 4)
  const total = library.hymns.length
  const today = hymnOfTheDay(library.hymns)
  const todayLine = today ? firstLine(today, settings.lang) : null
  const todayTitle = today ? (settings.lang === 'en' ? today.title_en || today.title_ee : today.title_ee || today.title_en) : null

  return (
    <main className="page-pad home">
      <header className="home-head">
        <div>
          <p className="home-kicker">COC Ewe Hymnal</p>
          <h1>Hymns</h1>
        </div>
        <Logo size={48} />
      </header>

      <SearchBox />

      {today && (
        <Link to={hymnPath(today)} className="hotd">
          <span className="hotd-badge">Hymn of the Day</span>
          <span className="hotd-title">
            <span className="hotd-num">{today.number}</span>
            <span lang={todayTitle === today.title_ee ? 'ee' : 'en'}>{todayTitle}</span>
          </span>
          {todayLine && (
            <span className="hotd-line" lang={todayLine.lang}>
              {todayLine.text}…
            </span>
          )}
          <span className="hotd-col">{collectionById(today.collection_id)?.name_en}</span>
        </Link>
      )}

      {total === 0 && (
        <div className="card empty">
          <p>Hymns are being added. Please check back soon.</p>
        </div>
      )}

      <section aria-labelledby="col-h">
        <h2 id="col-h" className="section-h">
          Collections
        </h2>
        <ul className="collection-grid">
          {library.collections.map((c) => {
            const n = hymnsIn(c.id).length
            return (
              <li key={c.id}>
                <Link to={`/c/${c.slug}`} className="collection-card">
                  <span className="c-count">{n === 1 ? '1 song' : `${n} songs`}</span>
                  <span className="c-name" lang={c.name_ee ? 'ee' : 'en'}>
                    {displayName(c)}
                  </span>
                  {c.name_ee && c.name_en && <span className="c-sub">{c.name_en}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="quick-links">
        <Link to="/categories" className="quick-link">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <rect x="4" y="4" width="7" height="7" rx="2" />
            <rect x="13" y="4" width="7" height="7" rx="2" />
            <rect x="4" y="13" width="7" height="7" rx="2" />
            <rect x="13" y="13" width="7" height="7" rx="2" />
          </svg>
          Categories
        </Link>
        <Link to="/favorites" className="quick-link">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M12 20s-7-4.4-8.7-8.6C2 8.3 4 5 7.2 5c1.9 0 3.2 1 4.8 2.8C13.6 6 14.9 5 16.8 5 20 5 22 8.3 20.7 11.4 19 15.6 12 20 12 20z" />
          </svg>
          Favourites{fav.ids.length ? ` (${fav.ids.length})` : ''}
        </Link>
      </div>

      {recentHymns.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="section-h">
            Recently opened
          </h2>
          <ul className="hymn-rows">
            {recentHymns.map((h) => (
              <HymnRow key={h.id} hymn={h} showCollection />
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
