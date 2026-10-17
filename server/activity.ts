// Pure: the web imports this too, so no Node modules here.
import type { Entry, Thread } from './office.ts'

export type Activity = { id: string; entry: Entry } // id: the Thread the entry belongs to

export const ACTIVITY_MAX = 50

const newestFirst = (a: Activity, b: Activity) => b.entry.at - a.entry.at

// ponytail: reads every transcript on each connect; keep a tail index if transcripts get big.
export function latestActivity(threads: Thread[], read: (id: string) => Entry[], max = ACTIVITY_MAX): Activity[] {
  return threads.flatMap((t) => read(t.id).slice(-max).map((entry) => ({ id: t.id, entry }))).sort(newestFirst).slice(0, max)
}

export const addActivity = (feed: Activity[], item: Activity, max = ACTIVITY_MAX) => [item, ...feed].slice(0, max)

export const endedNewestFirst = (threads: Thread[]) =>
  threads.filter((t) => t.ended).sort((a, b) => (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt))
