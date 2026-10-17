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

const dirs = (dir: string) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [])

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
