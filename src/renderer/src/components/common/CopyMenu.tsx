import { useState } from 'react'
import { Clipboard, ChevronDown } from 'lucide-react'
import type { RunRequest } from '@shared/types'
import { buildCurl, buildNode, buildPython } from '@shared/codegen'
import { useUi } from '@/stores/ui'

const FORMATS: { key: string; label: string; build: (req: RunRequest) => string }[] = [
  { key: 'curl', label: 'cURL', build: buildCurl },
  { key: 'node', label: 'Node.js (fetch)', build: buildNode },
  { key: 'python', label: 'Python (requests)', build: buildPython }
]


/** "Copy as ▾" dropdown — cURL / Node.js / Python snippets for a resolved request. */
export function CopyMenu({
  req,
  disabled,
  compact
}: {
  req: RunRequest | null
  disabled?: boolean
  /** Icon-only trigger (⧉), for tight spots like the URL row. */
  compact?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const toast = useUi((s) => s.toast)

  const copy = async (build: (r: RunRequest) => string, label: string): Promise<void> => {
    if (!req) return
    await navigator.clipboard.writeText(build(req))
    setOpen(false)
    toast(`Copied as ${label}`)
  }

  return (
    <div className="copy-menu-wrap">
      <button
        className={`text-btn copy-trigger${compact ? ' copy-icon-btn' : ''}`}
        title="Copy as code — cURL, Node.js, Python"
        disabled={disabled || !req}
        onClick={() => setOpen((v) => !v)}
      >
        <Clipboard size={15} strokeWidth={2} />
        {!compact && (
          <>
            Copy as <ChevronDown size={13} strokeWidth={2} className="copy-caret" />
          </>
        )}
      </button>
      {open && (
        <>
          <div className="click-away" onMouseDown={() => setOpen(false)} />
          <div className="menu copy-menu">
            {FORMATS.map((f) => (
              <button key={f.key} className="menu-item" onClick={() => void copy(f.build, f.label)}>
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
