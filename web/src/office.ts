import { useEffect, useState } from 'react'

export type Room = { name: string; hidden: boolean }
export type OfficeState = { connected: boolean; rooms: Room[] }

// Live Office state from /ws; reconnects every second while the server is down.
export function useOffice(): OfficeState {
  const [state, setState] = useState<OfficeState>({ connected: false, rooms: [] })
  useEffect(() => {
    let ws: WebSocket
    let timer: ReturnType<typeof setTimeout>
    let closed = false
    const open = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'snapshot' || msg.type === 'rooms') setState({ connected: true, rooms: msg.rooms })
      }
      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }))
        if (!closed) timer = setTimeout(open, 1000)
      }
    }
    open()
    return () => {
      closed = true
      clearTimeout(timer)
      ws.close()
    }
  }, [])
  return state
}

export const post = (path: string) => fetch(`/api/${path}`, { method: 'POST' })
