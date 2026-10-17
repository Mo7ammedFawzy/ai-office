import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { State, Thread } from './office.ts'
import { applySub, freeDesk, recover, slugify, stopSubs, toLaunch, usageTracker } from './threads.ts'

const th = (id: string, state: State, queuedAt = 0) => ({ id, state, queuedAt }) as Thread

test('toLaunch fills free slots with the oldest queued Threads', () => {
  const threads = [th('a', 'working'), th('b', 'queued', 3), th('c', 'idle'), th('d', 'queued', 1), th('e', 'needs-you'), th('f', 'queued', 2)]
  assert.deepEqual(toLaunch(threads, 4).map((t) => t.id), ['d', 'f']) // idle holds no slot
  assert.deepEqual(toLaunch(threads, 2), [])
  assert.deepEqual(toLaunch(threads, 1), []) // over the cap never goes negative
})

test('recover turns running Threads idle and leaves the rest', () => {
  const threads = [th('a', 'starting'), th('b', 'working'), th('c', 'needs-you'), th('d', 'queued'), th('e', 'done')]
  assert.deepEqual(recover(threads).map((t) => t.id), ['a', 'b', 'c'])
  assert.deepEqual(threads.map((t) => t.state), ['idle', 'idle', 'idle', 'queued', 'done'])
})

test('a Thread tracks its Subagents from start through progress to finish', () => {
  let subs = applySub([], { kind: 'sub-start', id: 'a', type: 'Explore', description: 'look', depth: 1 }, 100)
  subs = applySub(subs, { kind: 'sub-start', id: 'b', type: 'agent', description: 'deeper', depth: 2, parent: 'a' }, 150)
  subs = applySub(subs, { kind: 'sub-progress', id: 'a', summary: 'Reading routes', tools: 3 }, 200)
  subs = applySub(subs, { kind: 'sub-progress', id: 'a', tools: 4 }, 250) // no summary: keep the last one
  assert.deepEqual(subs[0], { id: 'a', type: 'Explore', description: 'look', depth: 1, parent: undefined, status: 'running', summary: 'Reading routes', tools: 4, startedAt: 100 })
  subs = applySub(subs, { kind: 'sub-end', id: 'a', status: 'completed', summary: 'Found it', tools: 6 }, 300)
  assert.deepEqual([subs[0].status, subs[0].summary, subs[0].tools, subs[0].endedAt], ['completed', 'Found it', 6, 300])
  assert.equal(applySub(subs, { kind: 'sub-progress', id: 'zzz', tools: 1 }, 400), subs) // unknown id: unchanged
  const stopped = stopSubs(subs, 500)
  assert.deepEqual(stopped.map((s) => [s.status, s.endedAt]), [['completed', 300], ['stopped', 500]]) // only running ones stop
})

test('usage adds up across runs whether or not a resumed session carries its earlier totals', () => {
  const u = (costUsd: number, tokens: number) => ({ costUsd, tokens })
  const fresh = usageTracker(u(0, 0))
  assert.deepEqual(fresh(u(0.1, 100)), u(0.1, 100))
  assert.deepEqual(fresh(u(0.3, 300)), u(0.3, 300)) // each result is the run's running total, not a delta

  const carried = usageTracker(u(0.3, 300)) // resume: the first result already includes the 0.3
  assert.deepEqual(carried(u(0.5, 500)), u(0.5, 500))

  const reset = usageTracker(u(0.3, 300)) // resume that starts counting from zero again
  assert.deepEqual(reset(u(0.1, 100)), u(0.4, 400))
  assert.deepEqual(reset(u(0.5, 500)), u(0.8, 800)) // decided once per run: growing past the start is not a carry

  const crashed = usageTracker(u(0.3, 300))
  assert.equal(crashed(u(0, 0)), undefined) // crash results carry zeroed usage
  assert.deepEqual(crashed(u(0.4, 400)), u(0.4, 400))
})

test('slugify makes short branch-safe slugs', () => {
  assert.equal(slugify('Fix the Login page!! (urgent)'), 'fix-the-login-page-urgent')
  assert.equal(slugify('a'.repeat(40)), 'a'.repeat(30))
  assert.equal(slugify('إصلاح'), 'thread')
})

test('freeDesk is the lowest desk not held by a live Thread in that Room', () => {
  const d = (id: string, room: string, desk?: number, ended = false) => ({ id, room, desk, ended }) as Thread
  assert.equal(freeDesk([], 'a'), 0)
  const threads = [d('1', 'a', 0), d('2', 'a', 2), d('3', 'b', 1), d('4', 'a', 1, true), d('5', 'a')]
  assert.equal(freeDesk(threads, 'a'), 1) // an ended Thread's desk is free again
  assert.equal(freeDesk(threads, 'b'), 0)
  assert.equal(freeDesk([...threads, d('6', 'a', 1)], 'a'), 3)
})
