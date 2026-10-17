import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diff } from './changes.ts'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' })

test('diff covers base...branch plus uncommitted and untracked work, with totals', () => {
  const checkout = mkdtempSync(join(tmpdir(), 'office-changes-'))
  try {
    git(checkout, 'init', '-q', '-b', 'main')
    git(checkout, 'config', 'user.email', 't@t')
    git(checkout, 'config', 'user.name', 't')
    writeFileSync(join(checkout, 'a.txt'), 'one\n--two\nthree\n')
    writeFileSync(join(checkout, 'b.txt'), 'keep\n')
    git(checkout, 'add', '.')
    git(checkout, 'commit', '-qm', 'base')
    git(checkout, 'checkout', '-qb', 'office/x')
    writeFileSync(join(checkout, 'a.txt'), 'one\n++two\nthree\nfour\n') // committed: -1 +2, lines that look like ---/+++ headers
    git(checkout, 'commit', '-qam', 'work')
    git(checkout, 'checkout', '-q', 'main')
    writeFileSync(join(checkout, 'b.txt'), 'main moved on\n') // only on base: not part of the Thread's changes
    git(checkout, 'commit', '-qam', 'main')
    git(checkout, 'checkout', '-q', 'office/x')
    writeFileSync(join(checkout, 'b.txt'), 'keep\nmore\n') // uncommitted: +1
    writeFileSync(join(checkout, 'new file.txt'), 'x\ny\n') // untracked: +2

    const d = diff(checkout, 'main')
    assert.deepEqual(
      d.files.map((f) => [f.path, f.added, f.removed]),
      [['a.txt', 2, 1], ['b.txt', 1, 0], ['new file.txt', 2, 0]],
    )
    assert.deepEqual([d.added, d.removed], [5, 1])
    assert.match(d.files[0].patch, /^@@/)
    assert.match(d.files[0].patch, /\n---two\n\+\+\+two\n/)

    // Worktree gone (ended Thread): the branch alone, from the main checkout.
    git(checkout, 'stash', '-qu')
    git(checkout, 'checkout', '-q', 'main')
    assert.deepEqual(diff(checkout, 'main', 'office/x').files.map((f) => [f.path, f.added, f.removed]), [['a.txt', 2, 1]])
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})
