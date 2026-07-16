import { useUi } from '@/stores/ui'

export function Toasts(): React.JSX.Element {
  const toasts = useUi((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={t.kind === 'error' ? 'toast toast-error' : 'toast'}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
