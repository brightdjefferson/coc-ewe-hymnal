import { useEffect, useState } from 'react'
import { checkConnection } from './lib/supabase'
import './App.css'

// Phase 0 check page: proves every Ewe letter and tone mark displays
// correctly, and that the app can reach the database. It will be replaced
// by the real Library screen in Phase 2.

const LOWER = ['ɖ', 'ɛ', 'ɔ', 'ŋ', 'ƒ', 'ʋ', 'ɣ']
const UPPER = ['Ɖ', 'Ɛ', 'Ɔ', 'Ŋ', 'Ƒ', 'Ʋ', 'Ɣ']

// Tone marks: acute (high), grave (low), tilde (nasal), circumflex, caron.
// Built from the base letter + a combining mark, the way most phones type them.
const MARKS = [
  { name: 'high ´', mark: '́' },
  { name: 'low `', mark: '̀' },
  { name: 'nasal ~', mark: '̃' },
  { name: 'falling ˆ', mark: '̂' },
  { name: 'rising ˇ', mark: '̌' },
]
const VOWELS = ['a', 'e', 'ɛ', 'i', 'o', 'ɔ', 'u']

// The Ewe alphabet as commonly taught.
const ALPHABET =
  'a b d ɖ dz e ɛ f ƒ g gb ɣ h x i k kp l m n ny ŋ o ɔ p r s t ts u v ʋ w y z'

type Status = 'checking' | 'not-configured' | 'connected' | 'unreachable'

const STATUS_TEXT: Record<Status, string> = {
  checking: 'Checking…',
  'not-configured': 'Not set up yet. This is expected until the Supabase keys are added.',
  connected: 'Connected to Supabase ✓',
  unreachable: 'Keys are set, but Supabase could not be reached. Check the URL and key.',
}

export default function App() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    checkConnection().then(setStatus)
  }, [])

  return (
    <main className="page">
      <header className="hero">
        <img src="/favicon.svg" alt="" width="56" height="56" />
        <div>
          <h1>COC Ewe Hymnal</h1>
          <p className="muted">Setup check — Phase 0</p>
        </div>
      </header>

      <section className="card">
        <h2>1. Ewe letters</h2>
        <p className="muted">Each box should show a clear letter — no empty squares or question marks.</p>
        <div className="grid" lang="ee">
          {[...LOWER, ...UPPER].map((c) => (
            <span key={c} className="glyph">{c}</span>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>2. Tone marks</h2>
        <p className="muted">The mark should sit neatly above each letter, including above ɛ and ɔ.</p>
        <table className="tones" lang="ee">
          <thead>
            <tr>
              <th scope="col">Tone</th>
              {VOWELS.map((v) => (
                <th key={v} scope="col">{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MARKS.map(({ name, mark }) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {VOWELS.map((v) => (
                  <td key={v}>{v + mark}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>3. In both fonts</h2>
        <p className="lyrics" lang="ee">{ALPHABET}</p>
        <p className="lyrics" lang="ee">{UPPER.join(' ')}</p>
        <p lang="ee">{ALPHABET}</p>
        <p lang="ee">
          <strong>{UPPER.join(' ')}</strong>
        </p>
      </section>

      <section className="card">
        <h2>4. Database</h2>
        <p className={`status status-${status}`} role="status">
          {STATUS_TEXT[status]}
        </p>
      </section>
    </main>
  )
}
