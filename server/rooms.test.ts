import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discover } from './rooms.ts'

test('discover lists git repos only, alphabetically', () => {
  const root = mkdtempSync(join(tmpdir(), 'rooms-'))
  for (const d of ['zeta/.git', 'Alpha/.git', 'plain', '.worktrees/x/.git']) mkdirSync(join(root, d), { recursive: true })
  mkdirSync(join(root, 'linked'))
  writeFileSync(join(root, 'linked', '.git'), 'gitdir: elsewhere') // a .git file (worktree/submodule) still counts
  writeFileSync(join(root, 'file.txt'), '')
  assert.deepEqual(discover(root), ['Alpha', 'linked', 'zeta'])
})
