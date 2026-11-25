import { useState, type RefObject } from 'react'
import './EweKeys.css'

// A row of buttons that type Ewe letters and tone marks at the cursor.
// Tone-mark buttons add the mark to the letter just before the cursor.

const LETTERS = ['ɖ', 'ɛ', 'ɔ', 'ŋ', 'ƒ', 'ʋ', 'ɣ']
const CAPITALS = ['Ɖ', 'Ɛ', 'Ɔ', 'Ŋ', 'Ƒ', 'Ʋ', 'Ɣ']
const TONES = [
  { mark: '́', label: 'high tone (´)' },
  { mark: '̀', label: 'low tone (`)' },
  { mark: '̃', label: 'nasal (~)' },
  { mark: '̂', label: 'falling tone (ˆ)' },
  { mark: '̌', label: 'rising tone (ˇ)' },
]

type Field = HTMLInputElement | HTMLTextAreaElement

interface Props {
  target: RefObject<Field | null>
  value: string
  onChange: (next: string) => void
  compact?: boolean
}

export default function EweKeys({ target, value, onChange, compact }: Props) {
  const [caps, setCaps] = useState(false)

  function insert(text: string) {
    const el = target.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + text + value.slice(end)
    onChange(next)
    const pos = start + text.length
    requestAnimationFrame(() => {
      if (!el) return
      // Don't pull the cursor back if the person has already moved to another box.
      const now = document.activeElement as HTMLElement | null
      if (now && now !== document.body && now !== el && !now.closest('.ewe-keys')) return
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  // Keep the cursor (and the phone keyboard) in the text box.
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault()

  return (
    <div className={`ewe-keys${compact ? ' compact' : ''}`} role="toolbar" aria-label="Ewe letters and tone marks">
      {(caps ? CAPITALS : LETTERS).map((c) => (
        <button key={c} type="button" className="ewe-key" onPointerDown={keep} onMouseDown={keep}
          onClick={() => insert(c)} aria-label={`Type ${c}`}>
          {c}
        </button>
      ))}
      <button type="button" className={`ewe-key shift${caps ? ' on' : ''}`} onPointerDown={keep} onMouseDown={keep}
        onClick={() => setCaps((v) => !v)} aria-pressed={caps} aria-label="Capital letters">
        {caps ? 'ɛ' : 'Ɛ'}
      </button>
      <span className="ewe-sep" aria-hidden="true" />
      {TONES.map((t) => (
        <button key={t.mark} type="button" className="ewe-key tone" onPointerDown={keep} onMouseDown={keep}
          onClick={() => insert(t.mark)} aria-label={`Add ${t.label} to the letter before the cursor`} title={t.label}>
          {'◌' + t.mark}
        </button>
      ))}
    </div>
  )
}
