import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { decide } from './agent-runner.ts'

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
