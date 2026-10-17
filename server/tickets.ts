import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export type Ticket = { path: string; feature: string; title: string; status?: string; blockedBy?: string }

// A Ticket is a `.scratch/<feature>/issues/*.md` file. Fields may be bold (`**Status:** x`) or plain (`Status: x`).
const field = (text: string, name: string) => text.match(new RegExp(`^\\**${name}:\\**[ \\t]*(.+)$`, 'im'))?.[1].trim()

export function parseTicket(text: string) {
  const blockedBy = field(text, 'Blocked by')
  return {
    title: text.match(/^#\s+(.+)$/m)?.[1].trim(),
    status: field(text, 'Status'),
    blockedBy: blockedBy && !/^none\b/i.test(blockedBy) ? blockedBy : undefined,
  }
}

// The Base tip's copy of a file, or undefined when it has none.
function atBase(repo: string, base: string, path: string) {
  try {
    return execFileSync('git', ['show', `${base}:${path}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return undefined
  }
}

const lf = (s: string) => s.replace(/\r\n/g, '\n')

// Point at the file; paste it when the worktree (cut from Base) would not have this version.
export function ticketPrompt(repo: string, path: string, base: string, extra: string) {
  const text = readFileSync(join(repo, path), 'utf8')
  const head =
    lf(text) === lf(atBase(repo, base, path) ?? '')
      ? `Work on the Ticket at \`${path}\`. Read it and the \`spec.md\` beside it, and follow AGENTS.md.`
      : `Work on this Ticket (\`${path}\` in the main checkout; your worktree does not have this version). Read the \`spec.md\` beside it, and follow AGENTS.md.\n\n${lf(text).trim()}`
  return extra.trim() ? `${head}\n\n${extra.trim()}` : head
}

const dirs =(dir: string) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [])

// Reads the working files, uncommitted ones included. Sorted by feature, then file, so callers group by runs.
export function listTickets(repo: string): Ticket[] {
  const scratch = join(repo, '.scratch')
  return dirs(scratch).flatMap((feature) => {
    const issues = join(scratch, feature, 'issues')
    if (!existsSync(issues)) return []
    return readdirSync(issues)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => {
        const t = parseTicket(readFileSync(join(issues, f), 'utf8'))
        return { path: `.scratch/${feature}/issues/${f}`, feature, ...t, title: t.title ?? basename(f, '.md') }
      })
  })
}
