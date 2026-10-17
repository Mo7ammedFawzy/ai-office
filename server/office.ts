import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const dataDir = process.env.AI_OFFICE_HOME ?? join(homedir(), '.ai-office')
const file = join(dataDir, 'office.json')

export type Office = { maxRunning: number; projectsRoot: string; apiKey?: string; hidden: string[] }

const defaults: Office = { maxRunning: 6, projectsRoot: 'C:\\Projects\\personal', hidden: [] }

export function load(): Office {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e: any) {
    if (e.code === 'ENOENT') return { ...defaults }
    throw e
  }
}

// write-then-rename so a crash mid-write never leaves a half file
export function save(office: Office) {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(office, null, 2))
  renameSync(file + '.tmp', file)
}
