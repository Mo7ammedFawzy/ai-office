import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTickets, parseTicket } from './tickets.ts'

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
