// Pure Campus logic: where Rooms, desks and Characters go. No three.js here so tsx tests can import it.
import type { Ask, Subagent, Thread } from '../../server/office.ts'

export const COLS = 3 // a Room is 3 desks wide
const GAP_X = 7
const GAP_Z = 2.5

export type RoomLayout = {
  name: string
  ox: number // floor origin: back-left corner (door wall is x = ox, back wall is z = oz)
  oz: number
  w: number
  d: number
  seats: [number, number][] // desk centres, Room-local
}

// Every Room on one floor, alphabetical, in a near-square grid; a deeper Room pushes the next grid row down.
export function layoutCampus(rooms: string[], threads: Thread[]): RoomLayout[] {
  const names = [...rooms].sort((a, b) => a.localeCompare(b))
  const per = Math.ceil(Math.sqrt(names.length))
  const out: RoomLayout[] = []
  let oz = 0
  for (let i = 0; i < names.length; i += per) {
    const row = names.slice(i, i + per).map((name, j) => {
      const need = Math.max(COLS, ...threads.filter((t) => t.room === name && !t.ended && t.desk !== undefined).map((t) => t.desk! + 1))
      const rows = Math.ceil(need / COLS)
      const seats: [number, number][] = []
      for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) seats.push([1 + 1.4 * c, 1.4 + 2 * r])
      return { name, ox: j * GAP_X, oz, w: Math.ceil(1.4 * COLS + 0.8), d: 2 * rows + 1, seats }
    })
    out.push(...row)
    oz += Math.max(...row.map((r) => r.d)) + GAP_Z
  }
  return out
}

export type Spot = { x: number; z: number; rot: number; seated: boolean }

// The door is in the left wall, halfway down; `inside` is the first step in, `outside` where walkers appear and vanish.
export function doorOf(L: RoomLayout) {
  const z = L.oz + Math.floor(L.d / 2) + 0.5
  return { inside: { x: L.ox + 0.5, z }, outside: { x: L.ox - 0.8, z } }
}

// Where a Thread's Character belongs now: in its chair, or (Queued) in line inside the door, oldest first.
export function spotFor(t: Thread, L: RoomLayout, threads: Thread[]): Spot {
  const seat = t.desk !== undefined && t.state !== 'queued' ? L.seats[t.desk] : undefined
  if (seat) return { x: L.ox + seat[0], z: L.oz + seat[1] - 0.38, rot: 0, seated: true }
  const line = threads.filter((q) => q.room === t.room && q.state === 'queued' && !q.ended).sort((a, b) => a.queuedAt - b.queuedAt)
  const { inside } = doorOf(L)
  return { x: inside.x + 0.05 + 0.4 * Math.max(0, line.indexOf(t)), z: inside.z, rot: Math.PI / 2, seated: false }
}

// A Character's look: one of `n` presets, picked by hashing the Thread id.
export const lookFor = (id: string, n: number) => Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % n

const TAGS:[RegExp, string][] = [
  [/^(Bash|PowerShell) .*\bgh pr create\b/, 'opening PR'],
  [/^(Bash|PowerShell)\b/, 'running shell'],
  [/^(Edit|Write|MultiEdit|NotebookEdit)\b/, 'editing'],
  [/^(Read|Grep|Glob|LS|WebFetch|WebSearch)\b/, 'reading'],
  [/^(TodoWrite|ExitPlanMode|EnterPlanMode|Task|Agent)\b/, 'planning'],
]

// Working's activity tag from the latest tool call ("<name> <detail>").
export const activityTag = (tool?: string) => (tool ? TAGS.find(([re]) => re.test(tool))?.[1] : undefined)

// The Subagent that raised an ask (the SDK's agentID is its task_id), or undefined for the Thread's own.
export const askerOf = (t: Thread, ask: Ask) => (ask.agentID ? t.subagents?.find((s) => s.id === ask.agentID) : undefined)

export const FINISH_MS = 4000 // a finished Subagent shows ✓/✕ this long
export const SHRINK_MS = 400
const MAX_SHOWN = 3

export type HuddleSpot = { sub: Subagent; dx: number; dz: number; size: number; shrink: boolean }

// Subagents beside the parent's desk: offsets from the parent's spot, up to 3, then "+N". Nested ones stand
// behind their spawner. A finished one lingers FINISH_MS (a stopped one doesn't), then shrinks for SHRINK_MS.
export function huddle(subs: Subagent[], now: number): { shown: HuddleSpot[]; more: number } {
  const linger = (s: Subagent) => (s.status === 'stopped' ? 0 : FINISH_MS)
  const floor = subs.filter((s) => s.endedAt === undefined || now - s.endedAt < linger(s) + SHRINK_MS)
  const ids = new Set(floor.map((s) => s.id))
  const shown: HuddleSpot[] = []
  let row = 0
  for (const s of floor) {
    if (shown.length === MAX_SHOWN) break
    const size = s.depth > 1 ? 0.32 : 0.42
    const shrink = s.endedAt !== undefined && now - s.endedAt >= linger(s)
    if (s.parent && ids.has(s.parent)) {
      const p = shown.find((h) => h.sub.id === s.parent)
      if (!p) continue // its spawner has no room: it counts in +N
      const k = shown.filter((h) => h.sub.parent === s.parent).length
      shown.push({ sub: s, dx: p.dx + 0.12 * k, dz: p.dz - 0.35, size, shrink })
    } else shown.push({ sub: s, dx: 0.55 + 0.32 * row++, dz: 0.1, size, shrink })
  }
  return { shown, more: floor.length - shown.length }
}
