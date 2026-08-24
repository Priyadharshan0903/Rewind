import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import type { RequestNode } from '@shared/types'
import { useWs } from '@/stores/ws'
import { timeOfDay } from '@/lib/format'

const STATE_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  closed: 'Disconnected',
  error: 'Connection error'
}

export function WsMessagePane({ request }: { request: RequestNode }): React.JSX.Element {
  const conn = useWs((s) => s.connections[request.id])
  const sendMessage = useWs((s) => s.sendMessage)
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const canSend = conn?.state === 'open'

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [conn?.messages.length])

  const submit = (): void => {
    if (!canSend || !draft.trim()) return
    sendMessage(request.id, draft)
    setDraft('')
  }

  return (
    <div className="response-pane">
      <div className="resp-header">
        <span
          className={
            conn?.state === 'open'
              ? 'status-chip status-ok'
              : conn?.state === 'error'
                ? 'status-chip status-err'
                : 'status-chip status-idle'
          }
        >
          {STATE_LABEL[conn?.state ?? 'closed']}
        </span>
        {conn?.error && <span className="resp-meta">{conn.error}</span>}
      </div>
      <div className="resp-body ws-msg-body" ref={bodyRef}>
        {!conn?.messages.length && (
          <div className="resp-empty">
            {conn ? 'No messages yet.' : 'Connect to start exchanging messages.'}
          </div>
        )}
        {conn?.messages.map((m) => (
          <div key={m.id} className={`ws-msg ws-msg-${m.direction}`}>
            <span className="ws-msg-dir" title={m.direction}>
              {m.direction === 'sent' ? (
                <ArrowUp size={12} strokeWidth={2.4} />
              ) : (
                <ArrowDown size={12} strokeWidth={2.4} />
              )}
            </span>
            <span className="ws-msg-time code-font">{timeOfDay(m.ts)}</span>
            <span className="ws-msg-data code-font">{m.data}</span>
          </div>
        ))}
      </div>
      <div className="ws-compose">
        <input
          className="ws-compose-input code-font"
          placeholder={canSend ? 'Type a message and press Enter…' : 'Connect to send a message'}
          value={draft}
          disabled={!canSend}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button className="text-btn ws-compose-send" disabled={!canSend || !draft.trim()} onClick={submit}>
          Send
        </button>
      </div>
    </div>
  )
}
