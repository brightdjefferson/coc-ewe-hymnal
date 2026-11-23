import { Link } from 'react-router'
import { displayName, useLibrary } from './library'
import { useFavorites, useRecent } from './prefs'
import { HymnRow, SearchBox } from './components'

export default function HomePage() {
  const { library, hymnsIn, hymnById } = useLibrary()
  const recent = useRecent()
  const fav = useFavorites()
  const recentHymns = recent.ids.map(hymnById).filter(Boolean).slice(0, 5)
  const total = library.hymns.length

  return (
    <main className="page-pad">
      <header className="home-head">
        <img src="/favicon.svg" alt="" width="48" height="48" />
        <h1>COC Ewe Hymnal</h1>
      </header>

      <SearchBox />

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
                  <span className="c-name" lang={c.name_ee ? 'ee' : 'en'}>
                    {displayName(c)}
                  </span>
                  {c.name_ee && c.name_en && <span className="c-sub">{c.name_en}</span>}
                  <span className="c-count">{n === 1 ? '1 song' : `${n} songs`}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="quick-links">
        <Link to="/categories" className="btn">
          Browse by category
        </Link>
        <Link to="/favorites" className="btn">
          ♥ Favourites{fav.ids.length ? ` (${fav.ids.length})` : ''}
        </Link>
      </div>

      {recentHymns.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="section-h">
            Recently viewed
          </h2>
          <ul className="hymn-rows">
            {recentHymns.map((h) => (
              <HymnRow key={h!.id} hymn={h!} showCollection />
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
