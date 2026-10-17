import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Thread } from '../../server/office.ts'
import { activityTag, layoutCampus, lookFor, spotFor } from './campus.ts'

const th = (room: string, desk?: number, ended = false) => ({ id: room + desk, room, desk, ended }) as Thread

test('layoutCampus puts Rooms alphabetically in a near-square grid', () => {
  const L = layoutCampus(['e', 'b', 'a', 'd', 'c'], [])
  assert.deepEqual(L.map((r) => r.name), ['a', 'b', 'c', 'd', 'e'])
  // 5 Rooms → 3 per row: a b c / d e
  assert.deepEqual(L.map((r) => [r.ox, r.oz]), [[0, 0], [7, 0], [14, 0], [0, 5.5], [7, 5.5]])
})

test('a Room starts with 3 desks, grows a row of 3 when full, and shrinks back', () => {
  const desks = (threads: Thread[]) => layoutCampus(['a'], threads)[0].seats.length
  assert.equal(desks([]), 3)
  assert.equal(desks([th('a', 0), th('a', 1), th('a', 2)]), 3)
  assert.equal(desks([th('a', 0), th('a', 3)]), 6)
  assert.equal(desks([th('a', 0), th('a', 3, true)]), 3) // the far desk freed
  assert.equal(desks([th('b', 7)]), 3) // other Rooms' desks don't count
})

test('a deeper Room pushes the grid row below it down', () => {
  const L = layoutCampus(['a', 'b', 'c'], [th('a', 3)]) // 2 per row; a has 2 rows of desks
  assert.equal(L[0].d, 5)
  assert.equal(L[2].oz, 7.5)
})

test('activityTag names the latest tool call in one word', () => {
  assert.equal(activityTag('Read src/a.ts'), 'reading')
  assert.equal(activityTag('Grep "export"'), 'reading')
  assert.equal(activityTag('Edit C:\\x\\a.ts'), 'editing')
  assert.equal(activityTag('Write notes.md'), 'editing')
  assert.equal(activityTag('Bash npm test'), 'running shell')
  assert.equal(activityTag('Bash gh pr create --fill'), 'opening PR')
  assert.equal(activityTag('TodoWrite'), 'planning')
  assert.equal(activityTag('Agent Explore the code'), 'planning')
  assert.equal(activityTag('mcp__x__thing'), undefined)
  assert.equal(activityTag(undefined), undefined)
})
test('spotFor seats a Thread at its desk and lines Queued ones up inside the door', () => {
  const t = (id: string, state: Thread['state'], desk?: number, queuedAt = 0) => ({ id, room: 'a', state, desk, queuedAt, ended: false }) as Thread
  const threads = [t('w', 'working', 1), t('q2', 'queued', undefined, 2), t('q1', 'queued', 0, 1)]
  const [L] = layoutCampus(['z', 'a'], threads) // a is first: origin 0,0
  const s = spotFor(threads[0], L, threads)
  assert.deepEqual([s.x, s.z, s.rot, s.seated].map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)), [2.4, 1.02, 0, true])
  const q1 = spotFor(threads[2], L, threads), q2 = spotFor(threads[1], L, threads)
  assert.equal(q1.seated, false) // Queued wait at the door even when they hold a desk
  assert.equal(q1.z, q2.z)
  assert.ok(q1.x < q2.x) // the oldest stands nearest the door
})

test('lookFor picks the same preset for the same Thread', () => {
  assert.equal(lookFor('abc', 7), lookFor('abc', 7))
  assert.ok(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => lookFor(id, 7))).size > 1)
})