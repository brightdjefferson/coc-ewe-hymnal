import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { blockLabel, type Block } from '../lib/hymnText'
import HymnText from '../components/HymnText'
import type { Hymn, Lang } from '../lib/types'
import { displayName, useLibrary } from './library'
import { useFavorites, useRecent, useSettings } from './prefs'
import { JumpToNumber } from './components'
import '../components/HymnText.css'

const LANG_LABEL: Record<Lang, string> = { ee: 'Ewe', en: 'English', both: 'Both' }

export default function HymnPage() {
  const { slug, number } = useParams()
  const { collectionBySlug, hymnsIn, hymnPath, library } = useLibrary()
  const navigate = useNavigate()
  const [settings, setSettings] = useSettings()
  const fav = useFavorites()
  const recent = useRecent()
  const [jump, setJump] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const col = collectionBySlug(slug ?? '')
  const list = col ? hymnsIn(col.id) : []
  const i = list.findIndex((h) => String(h.number) === number)
  const hymn = list[i]
  const prev = i > 0 ? list[i - 1] : undefined
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : undefined

  useEffect(() => {
    if (hymn) recent.add(hymn.id)
    window.scrollTo(0, 0)
  }, [hymn?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Arrow keys on a keyboard go to the previous / next hymn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog')) return
      if (e.key === 'ArrowLeft' && prev) navigate(hymnPath(prev))
      if (e.key === 'ArrowRight' && next) navigate(hymnPath(next))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, navigate, hymnPath])

  if (!col || !hymn)
    return (
      <main className="page-pad">
        <div className="state-msg">
          <p>
            {col ? `Number ${number} is not in ${displayName(col)} yet.` : 'That hymn was not found.'}
          </p>
          <Link className="btn" to={col ? `/c/${col.slug}` : '/'}>
            Back
          </Link>
        </div>
      </main>
    )

  const lang = settings.lang
  const cats = library.categories.filter((c) => hymn.category_ids.includes(c.id))
  const isFav = fav.has(hymn.id)

  return (
    <main
      className="page-pad hymn-page"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current
        touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
          if (dx < 0 && next) navigate(hymnPath(next))
          if (dx > 0 && prev) navigate(hymnPath(prev))
        }
      }}
    >
      <div className="hymn-top">
        <Link to={`/c/${col.slug}`} className="back" aria-label={`Back to ${displayName(col)}`}>
          ‹
        </Link>
        <span className="hymn-col">{displayName(col)}</span>
        <button className={`icon-btn fav${isFav ? ' on' : ''}`} onClick={() => fav.toggle(hymn.id)} aria-pressed={isFav}
          aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}>
          {isFav ? '♥' : '♡'}
        </button>
      </div>

      <header className="hymn-head">
        <span className="hymn-number">{hymn.number}</span>
        <div>
          {hymn.title_ee && (
            <h1 lang="ee" className="hymn-title">
              {hymn.title_ee}
            </h1>
          )}
          {hymn.title_en &&
            (hymn.title_ee ? (
              <p className="hymn-subtitle" lang="en">
                {hymn.title_en}
              </p>
            ) : (
              <h1 className="hymn-title">{hymn.title_en}</h1>
            ))}
          {cats.length > 0 && (
            <p className="hymn-cats">
              {cats.map((c) => (
                <Link key={c.id} to={`/categories/${c.slug}`} className="tag">
                  {displayName(c)}
                </Link>
              ))}
            </p>
          )}
        </div>
      </header>

      <div className="segmented lang-switch" role="group" aria-label="Language">
        {(['ee', 'en', 'both'] as Lang[]).map((l) => (
          <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setSettings({ lang: l })}>
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      <Words hymn={hymn} lang={lang} onSwitch={(l) => setSettings({ lang: l })} />

      <nav className="hymn-nav" aria-label="Other hymns">
        {prev ? (
          <Link to={hymnPath(prev)} className="btn" rel="prev" aria-label={`Previous: number ${prev.number}`}>
            ‹ {prev.number}
          </Link>
        ) : (
          <span />
        )}
        <button className="btn" onClick={() => setJump(true)}>
          # Go to number
        </button>
        {next ? (
          <Link to={hymnPath(next)} className="btn" rel="next" aria-label={`Next: number ${next.number}`}>
            {next.number} ›
          </Link>
        ) : (
          <span />
        )}
      </nav>
      {jump && <JumpToNumber collectionId={col.id} onClose={() => setJump(false)} />}
    </main>
  )
}

function Missing({ which, onSwitch }: { which: 'ee' | 'en'; onSwitch?: () => void }) {
  return (
    <div className="missing" role="note">
      <p>{which === 'en' ? 'This hymn does not have an English translation yet.' : 'This hymn does not have Ewe words yet.'}</p>
      {onSwitch && (
        <button className="btn" onClick={onSwitch}>
          Show the {which === 'en' ? 'Ewe' : 'English'} words
        </button>
      )}
    </div>
  )
}

function Words({ hymn, lang, onSwitch }: { hymn: Hymn; lang: Lang; onSwitch: (l: Lang) => void }) {
  const { ee, en } = hymn
  if (ee.length === 0 && en.length === 0) return <div className="missing"><p>The words for this hymn have not been added yet.</p></div>

  if (lang === 'ee')
    return ee.length ? <HymnText blocks={ee} lang="ee" /> : <Missing which="ee" onSwitch={() => onSwitch('en')} />
  if (lang === 'en')
    return en.length ? <HymnText blocks={en} lang="en" /> : <Missing which="en" onSwitch={() => onSwitch('ee')} />

  // Both
  if (!en.length)
    return (
      <>
        <HymnText blocks={ee} lang="ee" />
        <Missing which="en" />
      </>
    )
  if (!ee.length)
    return (
      <>
        <Missing which="ee" />
        <HymnText blocks={en} lang="en" />
      </>
    )

  // Same shape in both languages: line verses up side by side (or one under
  // the other on a narrow phone).
  const sameShape = ee.length === en.length && ee.every((b, i) => b.kind === en[i].kind)
  if (sameShape) {
    const nums = ee.reduce<number[]>((acc, b) => [...acc, (acc[acc.length - 1] ?? 0) + (b.kind === 'verse' ? 1 : 0)], [])
    return (
      <div className="both paired">
        {ee.map((b, i) => {
          const n = nums[i]
          return (
            <div key={i} className={`pair ${b.kind}`}>
              <BlockView block={b} label={b.kind === 'verse' ? String(n) : blockLabel(b.kind)} lang="ee" />
              <BlockView block={en[i]} label={en[i].kind === 'verse' ? String(n) : blockLabel(en[i].kind)} lang="en" secondary />
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className="both columns">
      <section>
        <h2 className="lang-h">Ewe</h2>
        <HymnText blocks={ee} lang="ee" />
      </section>
      <section>
        <h2 className="lang-h">English</h2>
        <HymnText blocks={en} lang="en" />
      </section>
    </div>
  )
}

function BlockView({ block, label, lang, secondary }: { block: Block; label: string; lang: 'ee' | 'en'; secondary?: boolean }) {
  return (
    <div className={`hymn-text${secondary ? ' secondary' : ''}`} lang={lang}>
      <section className={`hymn-block ${block.kind}`}>
        <span className="hymn-label">{label}</span>
        <p className="hymn-lines">{block.body}</p>
      </section>
    </div>
  )
}
