import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// An in-page "are you sure?" box (works the same on phones and computers).
export default function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => { e.preventDefault(); onCancel() }} aria-labelledby="dlg-title">
      <h2 id="dlg-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
