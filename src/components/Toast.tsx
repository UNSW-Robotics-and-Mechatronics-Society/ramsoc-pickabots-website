'use client'
import { useState, useCallback, useRef } from 'react'

export function useToast() {
  const [toast, setToast] = useState({ visible: false, msg: '' })
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  const show = useCallback((msg: string) => {
    clearTimeout(timer.current!)
    setToast({ visible: true, msg })
    timer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }, [])

  return { toast, show }
}

export default function Toast({ toast }: { toast: { visible: boolean; msg: string } }) {
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%',
      transform: `translateX(-50%) translateY(${toast.visible ? 0 : 20}px)`,
      background: '#0d0d1f', border: '2px solid #FFD700',
      borderRadius: 999, padding: '8px 20px',
      fontSize: '0.75rem', fontWeight: 900, color: '#FFD700',
      zIndex: 300, opacity: toast.visible ? 1 : 0,
      transition: 'all 0.3s', whiteSpace: 'nowrap', pointerEvents: 'none',
    }}>
      {toast.msg}
    </div>
  )
}
