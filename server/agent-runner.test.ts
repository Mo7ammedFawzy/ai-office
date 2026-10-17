import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { decide, taskEvent } from './agent-runner.ts'

const wt = join(process.cwd(), '.worktrees', 'demo', 'fix-1234')

test('decide allows edits inside the worktree and asks for the rest', () => {
  assert.equal(decide('Edit', { file_path: join(wt, 'src', 'a.ts') }, wt), 'allow')
  assert.equal(decide('Write', { file_path: 'src/new.ts' }, wt), 'allow') // relative to the worktree
  assert.equal(decide('NotebookEdit', { notebook_path: join(wt, 'n.ipynb') }, wt), 'allow')
  assert.equal(decide('Edit', { file_path: join(wt, '..', 'other', 'a.ts') }, wt), 'ask')
  assert.equal(decide('Edit', { file_path: wt + '-evil/a.ts' }, wt), 'ask') // sibling with the same prefix
  assert.equal(decide('Edit', { file_path: join(process.cwd(), 'a.ts') }, wt), 'ask') // the main checkout
  assert.equal(decide('Bash', { command: 'ls' }, wt), 'ask')
  assert.equal(decide('AskUserQuestion', { questions: [] }, wt), 'ask')
  assert.equal(decide('Edit', {}, wt), 'ask')
})

test('decide copes with Windows separators and drive-letter case', { skip: process.platform !== 'win32' }, () => {
  assert.equal(decide('Edit', { file_path: wt.replaceAll('\\', '/') + '/src/a.ts' }, wt), 'allow')
  assert.equal(decide('Edit', { file_path: wt.toUpperCase() + '\\A.TS' }, wt), 'allow')
  assert.equal(decide('Edit', { file_path: 'D:\\elsewhere\\a.ts' }, wt), 'ask')
})

test('taskEvent maps local_agent task_* messages to Subagent events and ignores the rest', () => {
  const known = new Set<string>()
  const m = (subtype: string, more: object) => ({ type: 'system', subtype, ...more }) as any
  assert.deepEqual(taskEvent(m('task_started', { task_id: 'a', task_type: 'local_agent', subagent_type: 'Explore', description: 'look around', spawn_depth: 1 }), known), {
    kind: 'sub-start', id: 'a', type: 'Explore', description: 'look around', depth: 1, parent: undefined,
  })
  assert.deepEqual(taskEvent(m('task_started', { task_id: 'b', task_type: 'local_agent', description: 'deeper', spawn_depth: 2, parent_task_id: 'a' }), known), {
    kind: 'sub-start', id: 'b', type: 'agent', description: 'deeper', depth: 2, parent: 'a',
  })
  assert.equal(taskEvent(m('task_started', { task_id: 'sh', task_type: 'local_bash', description: 'npm test' }), known), undefined)
  assert.equal(taskEvent(m('task_started', { task_id: 'w', task_type: 'local_agent', description: 'watch', ambient: true }), known), undefined)
  assert.deepEqual(taskEvent(m('task_progress', { task_id: 'a', description: 'look around', summary: 'Reading the routes', usage: { tool_uses: 4 } }), known), {
    kind: 'sub-progress', id: 'a', summary: 'Reading the routes', tools: 4,
  })
  assert.equal(taskEvent(m('task_progress', { task_id: 'sh', description: 'npm test', usage: { tool_uses: 0 } }), known), undefined) // not a Subagent
  assert.deepEqual(taskEvent(m('task_notification', { task_id: 'a', status: 'completed', summary: 'Found it', usage: { tool_uses: 6 } }), known), {
    kind: 'sub-end', id: 'a', status: 'completed', summary: 'Found it', tools: 6,
  })
  assert.equal(taskEvent(m('task_notification', { task_id: 'a', status: 'completed', summary: 'again' }), known), undefined) // already ended
  assert.equal(taskEvent(m('task_notification', { task_id: 'sh', status: 'completed', summary: '' }), known), undefined)
  assert.equal(taskEvent(m('init', {}), known), undefined)
})
