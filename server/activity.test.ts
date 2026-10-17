import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Entry, Thread } from './office.ts'
import { addActivity, endedNewestFirst, latestActivity } from './activity.ts'

const e = (at: number, text = String(at)): Entry => ({ at, kind: 'text', text })

test('latestActivity merges every Thread transcript, newest first, capped', () => {
  const transcripts: Record<string, Entry[]> = { a: [e(1), e(4)], b: [e(2), e(3), e(5)] }
  const threads = [{ id: 'a' }, { id: 'b' }] as Thread[]
  const feed = latestActivity(threads, (id) => transcripts[id], 3)
  assert.deepEqual(feed.map((x) => [x.id, x.entry.at]), [['b', 5], ['a', 4], ['b', 3]])
})

test('addActivity puts a live entry on top and drops the oldest past the cap', () => {
  const feed = [{ id: 'a', entry: e(2) }, { id: 'b', entry: e(1) }]
  assert.deepEqual(addActivity(feed, { id: 'c', entry: e(3) }, 2).map((x) => x.id), ['c', 'a'])
})

test('endedNewestFirst lists only ended Threads, most recently ended first', () => {
  const threads = [
    { id: 'live', ended: false, createdAt: 9 },
    { id: 'old', ended: true, createdAt: 1, endedAt: 5 },
    { id: 'new', ended: true, createdAt: 2, endedAt: 8 },
    { id: 'legacy', ended: true, createdAt: 3 }, // ended before endedAt was recorded
  ] as Thread[]
  assert.deepEqual(endedNewestFirst(threads).map((t) => t.id), ['new', 'old', 'legacy'])
})
