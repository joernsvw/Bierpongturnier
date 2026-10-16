import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export function Modal({
  open,
  onClose,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`panel pop-in max-h-full overflow-auto p-8 shadow-2xl ${wide ? 'w-[1100px]' : 'w-[640px]'} max-w-full`}>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sicherheitsabfragen: const confirm = useConfirm(); if (await confirm({...})) ...
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => {})

  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setCurrent(o)
      }),
    [],
  )
  const close = (v: boolean) => {
    resolver.current(v)
    setCurrent(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={current !== null} onClose={() => close(false)}>
        {current && (
          <div>
            <h2 className="font-display text-5xl text-beer">{current.title}</h2>
            {current.message && <div className="mt-4 text-xl text-text/90">{current.message}</div>}
            <div className="mt-8 flex justify-end gap-3">
              <button className="btn text-lg" onClick={() => close(false)}>
                {current.cancelLabel ?? 'Abbrechen'}
              </button>
              <button
                autoFocus
                className={`btn text-lg ${current.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
              >
                {current.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)
