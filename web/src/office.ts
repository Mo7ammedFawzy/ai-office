import { useCallback, useEffect, useState } from 'react'
import type { Ask, Entry, State, Thread } from '../../server/office.ts'

export type { Ask, Entry, State, Thread }
export type Room = { name: string; hidden: boolean }
type OfficeState = {
  connected: boolean
  rooms: Room[]
  threads: Thread[]
  maxRunning: number
  entries: Record<string, Entry[]> // transcripts of Threads opened in the drawer
}

export const RUNNING: State[] = ['starting', 'working', 'needs-you']

// Live Office state from /ws; reconnects every second while the server is down.
export function useOffice() {
  const [state, setState] = useState<OfficeState>({ connected: false, rooms: [], threads: [], maxRunning: 6, entries: {} })

  useEffect(() => {
    let ws: WebSocket
    let timer: ReturnType<typeof setTimeout>
    let closed = false
    const open = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        setState((s) => {
          switch (msg.type) {
            case 'snapshot':
              return { connected: true, rooms: msg.rooms, threads: msg.threads, maxRunning: msg.maxRunning, entries: {} }
            case 'rooms':
              return { ...s, rooms: msg.rooms }
            case 'thread': {
              const known = s.threads.some((t) => t.id === msg.thread.id)
              return { ...s, threads: known ? s.threads.map((t) => (t.id === msg.thread.id ? msg.thread : t)) : [...s.threads, msg.thread] }
            }
            case 'removed':
              return { ...s, threads: s.threads.filter((t) => t.id !== msg.id) }
            case 'entry':
              return s.entries[msg.id] ? { ...s, entries: { ...s.entries, [msg.id]: [...s.entries[msg.id], msg.entry] } } : s
          }
          return s
        })
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

  const loadEntries = useCallback(async (id: string) => {
    const res = await fetch(`/api/threads/${id}/entries`)
    if (res.ok) {
      const list: Entry[] = await res.json()
      setState((s) => ({ ...s, entries: { ...s.entries, [id]: list } }))
    }
  }, [])

  return { ...state, loadEntries }
}

export async function post(path: string, body?: object) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  })
  if (!res.ok) alert(await res.text())
  return res
}
