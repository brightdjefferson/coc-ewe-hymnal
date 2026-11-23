import { useEffect, useState } from 'react'
import { checkConnection, keyKind, type ConnectionResult } from './lib/supabase'
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

const KEY_LABEL: Record<string, string> = {
  publishable: 'publishable key ✓',
  anon: 'anon public key ✓',
  secret: 'SECRET key ✗',
  service_role: 'service_role (secret) key ✗',
  unknown: 'not recognised',
  missing: 'missing',
}

export default function App() {
  const [result, setResult] = useState<ConnectionResult | null>(null)

  useEffect(() => {
    checkConnection().then(setResult)
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
        {!result && <p className="status status-checking" role="status">Checking…</p>}
        {result?.state === 'connected' && (
          <p className="status status-connected" role="status">Connected to Supabase ✓</p>
        )}
        {result?.state === 'not-configured' && (
          <p className="status status-not-configured" role="status">
            Not set up yet. Missing setting: {result.missing.join(', ')}
          </p>
        )}
        {result?.state === 'problem' && (
          <p className="status status-unreachable" role="status">{result.reason}</p>
        )}
        {result && result.state !== 'not-configured' && (
          <dl className="diag">
            <dt>Address used</dt>
            <dd>{('host' in result && result.host) || '—'}</dd>
            <dt>Key type</dt>
            <dd>{KEY_LABEL[keyKind()]}</dd>
          </dl>
        )}
      </section>
    </main>
  )
}
