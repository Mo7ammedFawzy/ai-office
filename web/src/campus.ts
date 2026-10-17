// Pure Campus logic: where Rooms, desks and Characters go. No three.js here so tsx tests can import it.
import type { Thread } from '../../server/office.ts'

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
