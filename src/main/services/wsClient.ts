import WebSocket, { type RawData } from 'ws'
import type { WsEvent, WsMessage } from '@shared/types'
import { newId } from '@shared/id'

const connections = new Map<string, WebSocket>()

function rawDataToText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data).toString('utf8')
}

export function connect(
  connectionId: string,
  opts: { url: string; headers: [string, string][] },
  onEvent: (event: WsEvent) => void
): void {
  const headers: Record<string, string> = {}
  for (const [k, v] of opts.headers) headers[k] = v

  let socket: WebSocket
  try {
    socket = new WebSocket(opts.url, { headers })
  } catch (err) {
    onEvent({ type: 'error', connectionId, error: describeError(err) })
    return
  }
  connections.set(connectionId, socket)

  socket.on('open', () => onEvent({ type: 'open', connectionId }))

  socket.on('message', (data, isBinary) => {
    const message: WsMessage = {
      id: newId(),
      ts: Date.now(),
      direction: 'received',
      data: isBinary ? `[binary message, ${rawDataToText(data).length} bytes]` : rawDataToText(data)
    }
    onEvent({ type: 'message', connectionId, message })
  })

  socket.on('error', (err) => onEvent({ type: 'error', connectionId, error: describeError(err) }))

  socket.on('close', (code, reason) => {
    connections.delete(connectionId)
    onEvent({ type: 'close', connectionId, code, reason: reason.toString('utf8') })
  })
}

export function send(connectionId: string, data: string): void {
  const socket = connections.get(connectionId)
  if (socket?.readyState === WebSocket.OPEN) socket.send(data)
}

export function close(connectionId: string): void {
  connections.get(connectionId)?.close()
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
