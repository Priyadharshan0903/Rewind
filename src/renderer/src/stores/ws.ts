import { create } from 'zustand'
import { newId } from '@shared/id'
import type { WsEvent, WsMessage } from '@shared/types'
import { effectiveRequest, useApp } from './app'

export type WsConnStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface WsConn {
  connectionId: string
  state: WsConnStatus
  messages: WsMessage[]
  error?: string
}

interface WsState {
  /** Keyed by requestId — one live connection per open WS request. */
  connections: Record<string, WsConn>
  connect: (requestId: string) => Promise<void>
  sendMessage: (requestId: string, text: string) => void
  disconnect: (requestId: string) => void
  handleEvent: (event: WsEvent) => void
}

/** connectionId -> requestId, so incoming push events can find their slice. */
const connectionOwner = new Map<string, string>()

export const useWs = create<WsState>((set, get) => ({
  connections: {},

  connect: async (requestId) => {
    const app = useApp.getState()
    const selection = app.selection
    if (!selection || selection.requestId !== requestId) return
    const request = effectiveRequest(app, selection.collectionId, requestId)
    if (!request) return
    const connectionId = newId()
    connectionOwner.set(connectionId, requestId)
    set((s) => ({
      connections: {
        ...s.connections,
        [requestId]: { connectionId, state: 'connecting', messages: [] }
      }
    }))
    try {
      await window.rewind.wsConnect({
        connectionId,
        collectionId: selection.collectionId,
        request
      })
    } catch (err) {
      set((s) => ({
        connections: {
          ...s.connections,
          [requestId]: {
            ...s.connections[requestId],
            state: 'error',
            error: err instanceof Error ? err.message : String(err)
          }
        }
      }))
    }
  },

  sendMessage: (requestId, text) => {
    const conn = get().connections[requestId]
    if (!conn || conn.state !== 'open' || !text) return
    const message: WsMessage = { id: newId(), ts: Date.now(), direction: 'sent', data: text }
    set((s) => ({
      connections: {
        ...s.connections,
        [requestId]: { ...conn, messages: [...conn.messages, message] }
      }
    }))
    void window.rewind.wsSend(conn.connectionId, text)
  },

  disconnect: (requestId) => {
    const conn = get().connections[requestId]
    if (!conn) return
    void window.rewind.wsClose(conn.connectionId)
  },

  handleEvent: (event) => {
    const requestId = connectionOwner.get(event.connectionId)
    if (!requestId) return
    const conn = get().connections[requestId]
    if (!conn || conn.connectionId !== event.connectionId) return
    if (event.type === 'open') {
      set((s) => ({
        connections: { ...s.connections, [requestId]: { ...conn, state: 'open' } }
      }))
    } else if (event.type === 'message') {
      set((s) => ({
        connections: {
          ...s.connections,
          [requestId]: { ...conn, messages: [...conn.messages, event.message] }
        }
      }))
    } else if (event.type === 'error') {
      set((s) => ({
        connections: {
          ...s.connections,
          [requestId]: { ...conn, state: 'error', error: event.error }
        }
      }))
    } else if (event.type === 'close') {
      connectionOwner.delete(event.connectionId)
      set((s) => ({
        connections: { ...s.connections, [requestId]: { ...conn, state: 'closed' } }
      }))
    }
  }
}))
