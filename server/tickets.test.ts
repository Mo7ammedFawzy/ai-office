import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTickets, parseTicket, ticketPrompt } from './tickets.ts'

const write = (root: string, path: string, text: string) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}

const ticket = (status: string, blocked: string) => `# 04: Validate API input

**What to build:** something.

**Blocked by:** ${blocked}

**Status:** ${status}

- [ ] a box
`

test('parseTicket reads title, Status and Blocked-by', () => {
  assert.deepEqual(parseTicket(ticket('ready-for-agent', '01 (Stop leaking secrets)')), {
    title: '04: Validate API input', status: 'ready-for-agent', blockedBy: '01 (Stop leaking secrets)',
  })
  assert.deepEqual(parseTicket(ticket('needs-triage', 'None (can start immediately).')), { title: '04: Validate API input', status: 'needs-triage', blockedBy: undefined })
  assert.deepEqual(parseTicket('Status: done\n'), { title: undefined, status: 'done', blockedBy: undefined }) // plain fields, no heading
})

test('listTickets lists .scratch/<feature>/issues/*.md sorted by feature then file', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tickets-'))
  write(repo, '.scratch/zeta/issues/01-a.md', ticket('ready-for-agent', 'None'))
  write(repo, '.scratch/alpha/issues/02-b.md', '# 02: B\n\nStatus: done\n')
  write(repo, '.scratch/alpha/issues/01-c.md', 'no heading')
  write(repo, '.scratch/alpha/spec.md', '# not a ticket')
  write(repo, '.scratch/alpha/issues/notes.txt', 'not a ticket')
  write(repo, '.scratch/loose.md', '# not a ticket')
  assert.deepEqual(listTickets(repo), [
    { path: '.scratch/alpha/issues/01-c.md', feature: 'alpha', title: '01-c', status: undefined, blockedBy: undefined },
    { path: '.scratch/alpha/issues/02-b.md', feature: 'alpha', title: '02: B', status: 'done', blockedBy: undefined },
    { path: '.scratch/zeta/issues/01-a.md', feature: 'zeta', title: '04: Validate API input', status: 'ready-for-agent', blockedBy: undefined },
  ])
  assert.deepEqual(listTickets(join(repo, 'nope')), []) // no .scratch at all
})

test('ticketPrompt points at the file unless the main checkout differs from the Base tip', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tickets-git-'))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args], { cwd: repo, stdio: 'ignore' })
  const path = '.scratch/f/issues/01-x.md'
  git('init', '-q', '-b', 'main')
  write(repo, path, '# 01: X\n\nStatus: ready-for-agent\n')
  git('add', '.')
  git('commit', '-q', '-m', 'ticket')
  const pointer = 'Work on the Ticket at `.scratch/f/issues/01-x.md`. Read it and the `spec.md` beside it, and follow AGENTS.md.'

  assert.equal(ticketPrompt(repo, path, 'main', ''), pointer)
  assert.equal(ticketPrompt(repo, path, 'main', ' Keep it small. '), `${pointer}\n\nKeep it small.`)
  write(repo, path, '# 01: X\r\n\r\nStatus: ready-for-agent\r\n') // only line endings differ (autocrlf checkouts)
  assert.equal(ticketPrompt(repo, path, 'main', ''), pointer)

  write(repo, path, '# 01: X\n\nStatus: ready-for-agent\nEdited, not committed.\n')
  const pasted = ticketPrompt(repo, path, 'main', 'Extra.')
  assert.match(pasted, /^Work on this Ticket \(`\.scratch\/f\/issues\/01-x\.md`/)
  assert.ok(pasted.includes('Edited, not committed.'))
  assert.ok(pasted.endsWith('\n\nExtra.'))

  write(repo, '.scratch/f/issues/02-new.md', '# 02: New\n') // not on the Base branch at all
  assert.ok(ticketPrompt(repo, '.scratch/f/issues/02-new.md', 'main', '').includes('# 02: New'))
})
