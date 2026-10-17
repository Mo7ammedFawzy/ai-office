// A Thread's Changes: what its branch adds on top of the Base branch, uncommitted work included.
import { execFile, execFileSync } from 'node:child_process'

export type FileDiff = { path: string; added: number; removed: number; patch: string }
export type Diff = { files: FileDiff[]; added: number; removed: number }

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 })

// `git diff --no-index` exits 1 when the files differ; that is its answer, not a failure.
function gitDiffNoIndex(cwd: string, path: string) {
  try {
    return git(cwd, 'diff', '--no-index', '--', '/dev/null', path)
  } catch (e: any) {
    if (e.status === 1) return String(e.stdout)
    throw e
  }
}

// branch given: committed work only (the worktree is gone). Otherwise cwd is the worktree and its files count too.
export function diff(cwd: string, base: string, branch?: string): Diff {
  const from = git(cwd, 'merge-base', base, branch ?? 'HEAD').trim()
  let text = git(cwd, 'diff', from, ...(branch ? [branch] : []))
  if (!branch)
    for (const path of git(cwd, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))
      text += gitDiffNoIndex(cwd, path)
  const files = text.split(/^(?=diff --git )/m).filter(Boolean).map(parse)
  return { files, added: files.reduce((n, f) => n + f.added, 0), removed: files.reduce((n, f) => n + f.removed, 0) }
}

function parse(chunk: string): FileDiff {
  const at = chunk.search(/^@@/m)
  const head = at < 0 ? chunk : chunk.slice(0, at)
  const patch = at < 0 ? '' : chunk.slice(at)
  // git ends a ---/+++ path holding a space with a tab
  const path = (head.match(/^\+\+\+ b\/(.*?)\t?$/m) ?? head.match(/^--- a\/(.*?)\t?$/m) ?? head.match(/ b\/(.*)$/m))![1]
  let added = 0
  let removed = 0
  for (const l of patch.split('\n')) {
    if (l[0] === '+') added++
    else if (l[0] === '-') removed++
  }
  return { path, added, removed, patch }
}

// The branch's PR, when `gh` is installed and knows one.
export function prUrl(cwd: string, branch: string): Promise<string | undefined> {
  return new Promise((done) =>
    execFile('gh', ['pr', 'view', branch, '--json', 'url', '-q', '.url'], { cwd, timeout: 10_000 }, (err, out) =>
      done(err ? undefined : out.trim() || undefined),
    ),
  )
}
