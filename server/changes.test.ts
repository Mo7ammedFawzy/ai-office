import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diff } from './changes.ts'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' })

test('diff covers base...branch plus uncommitted and untracked work, with totals', () => {
  const repo = mkdtempSync(join(tmpdir(), 'office-changes-'))
  try {
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.email', 't@t')
    git(repo, 'config', 'user.name', 't')
    writeFileSync(join(repo, 'a.txt'), 'one\n--two\nthree\n')
    writeFileSync(join(repo, 'b.txt'), 'keep\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'base')
    git(repo, 'checkout', '-qb', 'office/x')
    writeFileSync(join(repo, 'a.txt'), 'one\n++two\nthree\nfour\n') // committed: -1 +2, lines that look like ---/+++ headers
    git(repo, 'commit', '-qam', 'work')
    git(repo, 'checkout', '-q', 'main')
    writeFileSync(join(repo, 'b.txt'), 'main moved on\n') // only on base: not part of the Thread's changes
    git(repo, 'commit', '-qam', 'main')
    git(repo, 'checkout', '-q', 'office/x')
    writeFileSync(join(repo, 'b.txt'), 'keep\nmore\n') // uncommitted: +1
    writeFileSync(join(repo, 'new file.txt'), 'x\ny\n') // untracked: +2

    const d = diff(repo, 'main')
    assert.deepEqual(
      d.files.map((f) => [f.path, f.added, f.removed]),
      [['a.txt', 2, 1], ['b.txt', 1, 0], ['new file.txt', 2, 0]],
    )
    assert.deepEqual([d.added, d.removed], [5, 1])
    assert.match(d.files[0].patch, /^@@/)
    assert.match(d.files[0].patch, /\n---two\n\+\+\+two\n/)

    // Worktree gone (ended Thread): the branch alone, from the main checkout.
    git(repo, 'stash', '-qu')
    git(repo, 'checkout', '-q', 'main')
    assert.deepEqual(diff(repo, 'main', 'office/x').files.map((f) => [f.path, f.added, f.removed]), [['a.txt', 2, 1]])
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
