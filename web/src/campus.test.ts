import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Ask, Subagent, Thread } from '../../server/office.ts'
import { activityTag, askerOf, huddle, layoutCampus, lookFor, spotFor } from './campus.ts'

const sub = (id: string, more: Partial<Subagent> = {}) => ({ id, type: 'Explore', description: '', depth: 1, status: 'running', tools: 0, startedAt: 0, ...more }) as Subagent

test('an ask carrying a Subagent agentID is attributed to that Subagent', () => {
  const t = { subagents: [sub('a'), sub('b', { type: 'Plan' })] } as Thread
  const ask = (agentID?: string) => ({ id: 'x', agentID }) as Ask
  assert.equal(askerOf(t, ask('b'))?.type, 'Plan')
  assert.equal(askerOf(t, ask()), undefined) // the Thread's own ask
  assert.equal(askerOf(t, ask('gone')), undefined)
})

test('huddle shows up to 3 Subagents beside the desk, then counts the rest', () => {
  const h = huddle(['a', 'b', 'c', 'd', 'e'].map((id) => sub(id)), 0)
  assert.deepEqual(h.shown.map((s) => s.sub.id), ['a', 'b', 'c'])
  assert.equal(h.more, 2)
  const xs = h.shown.map((s) => s.dx)
  assert.ok(xs[0] > 0 && xs[0] < xs[1] && xs[1] < xs[2]) // a row to the right of the desk
  assert.equal(new Set(h.shown.map((s) => s.dz)).size, 1)
})

test('a nested Subagent stands smaller, behind the one that spawned it', () => {
  const h = huddle([sub('a'), sub('b'), sub('n', { depth: 2, parent: 'b' })], 0)
  const [, b, n] = h.shown
  assert.equal(n.sub.id, 'n')
  assert.ok(Math.abs(n.dx - b.dx) < 0.2) // with its spawner
  assert.ok(n.dz < b.dz) // behind
  assert.ok(n.size < b.size)
  assert.deepEqual(huddle([sub('n', { depth: 2, parent: 'x' })], 0).shown.length, 1) // unknown parent: still shown
  const hidden = huddle([sub('a'), sub('b'), sub('c'), sub('n', { depth: 2, parent: 'a' })], 0)
  assert.equal(hidden.more, 1) // no room left: it counts in +N
})

test('a finished Subagent lingers with its result, then shrinks away; a stopped one shrinks at once', () => {
  const done = sub('a', { status: 'completed', endedAt: 1000 })
  const stopped = sub('s', { status: 'stopped', endedAt: 1000 })
  const at = (now: number) => huddle([done, stopped], now).shown.map((s) => `${s.sub.id}:${s.shrink}`)
  assert.deepEqual(at(1000), ['a:false', 's:true'])
  assert.deepEqual(at(4900), ['a:false'])
  assert.deepEqual(at(5100), ['a:true'])
  assert.deepEqual(at(6000), [])
  assert.equal(huddle([done], 6000).more, 0) // gone ones don't count
})

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