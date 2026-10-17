import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { State, Thread } from './office.ts'
import { recover, slugify, toLaunch } from './threads.ts'

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

test('slugify makes short branch-safe slugs', () => {
  assert.equal(slugify('Fix the Login page!! (urgent)'), 'fix-the-login-page-urgent')
  assert.equal(slugify('a'.repeat(40)), 'a'.repeat(30))
  assert.equal(slugify('إصلاح'), 'thread')
})
