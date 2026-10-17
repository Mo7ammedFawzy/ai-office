import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const dataDir = process.env.AI_OFFICE_HOME ?? join(homedir(), '.ai-office')
const file = join(dataDir, 'office.json')
const threadsDir = join(dataDir, 'threads')

export type State = 'queued' | 'starting' | 'working' | 'needs-you' | 'idle' | 'done' | 'stopped' | 'failed'

export type Thread = {
  id: string // also the SDK session id and the branch suffix
  room: string
  title: string
  model: string
  base: string
  branch: string
  worktree: string
  state: State
  ended: boolean
  hasSession: boolean // the SDK has written a session we can resume
  inbox: string[] // messages waiting for the next launch
  createdAt: number
  queuedAt: number
  costUsd?: number
  tokens?: number
}

export type Entry = { at: number; kind: 'user' | 'text' | 'tool' | 'system' | 'error'; text: string }

export type Office = { maxRunning: number; projectsRoot: string; apiKey?: string; hidden: string[]; threads: Thread[] }

const defaults: Office = { maxRunning: 6, projectsRoot: 'C:\\Projects\\personal', hidden: [], threads: [] }

export function load(): Office {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e: any) {
    if (e.code === 'ENOENT') return structuredClone(defaults)
    throw e
  }
}

// write-then-rename so a crash mid-write never leaves a half file
export function save(office: Office) {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(office, null, 2))
  renameSync(file + '.tmp', file)
}

// Callers pass ids of known Threads only; ids name files.
const entriesFile = (id: string) => join(threadsDir, `${id}.jsonl`)

export function appendEntry(id: string, entry: Entry) {
  mkdirSync(threadsDir, { recursive: true })
  appendFileSync(entriesFile(id), JSON.stringify(entry) + '\n')
}

export function readEntries(id: string): Entry[] {
  if (!existsSync(entriesFile(id))) return []
  return readFileSync(entriesFile(id), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

export const removeEntries = (id: string) => rmSync(entriesFile(id), { force: true })
