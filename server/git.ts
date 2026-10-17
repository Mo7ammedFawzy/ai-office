import { execFileSync } from 'node:child_process'

// git's stdout, untrimmed; throws on a non-zero exit (the error carries status, stdout and stderr).
export const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 })

export function tryGit(cwd: string, ...args: string[]) {
  try {
    return git(cwd, ...args)
  } catch {
    return undefined
  }
}
