import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { run, type Run, type RunnerEvent } from './agent-runner.ts'
import { diff, prUrl } from './changes.ts'
import { appendEntry, readEntries, removeEntries, save, type Entry, type Office, type State, type Thread } from './office.ts'
import { appendComment, listTickets, ticketPrompt } from './tickets.ts'

export const RUNNING: State[] = ['starting', 'working', 'needs-you']
export const MODELS = ['sonnet', 'opus', 'haiku']

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30).replace(/^-+|-+$/g, '') || 'thread'

// Oldest queued Threads first, as many as there are free slots.
export function toLaunch(threads: Thread[], maxRunning: number): Thread[] {
  const free = maxRunning - threads.filter((t) => RUNNING.includes(t.state)).length
  return threads.filter((t) => t.state === 'queued').sort((a, b) => a.queuedAt - b.queuedAt).slice(0, Math.max(0, free))
}

// After a restart no process is left, so whatever was running waits for the user.
export function recover(threads: Thread[]): Thread[] {
  const hit = threads.filter((t) => RUNNING.includes(t.state))
  for (const t of hit) Object.assign(t, { state: 'idle', asks: [] })
  return hit
}

type Usage = { costUsd: number; tokens: number }

// One per run: turns the SDK's per-query() running totals into the Thread's totals. A resumed session's first
// result either already includes `start` (its transcript saved them) or counts from zero again; we tell by size.
// ponytail: a reset run whose first turn alone costs more than everything before it is read as a carry (undercounts).
export function usageTracker(start: Usage) {
  let offset: Usage | undefined
  return (latest: Usage): Usage | undefined => {
    if (!latest.tokens) return // crash/startup-error results carry zeroed usage
    offset ??= latest.costUsd >= start.costUsd ? { costUsd: 0, tokens: 0 } : start
    return { costUsd: offset.costUsd + latest.costUsd, tokens: offset.tokens + latest.tokens }
  }
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const tryGit = (cwd: string, ...args: string[]) => {
  try {
    return git(cwd, ...args)
  } catch {
    return undefined
  }
}
const errorText = (e: any) => String(e?.stderr || e?.message || e).trim()

function defaultBase(repo: string) {
  return (
    tryGit(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD') ??
    ['main', 'master'].find((b) => tryGit(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`)) ??
    'HEAD'
  )
}

export function createThreads(office: Office, rooms: () => string[], emit: (msg: object) => void) {
  const runs = new Map<string, Run>()
  const interrupted = new Set<string>() // Threads whose next result is the interrupt's
  const roomPath = (t: Thread) => join(office.projectsRoot, t.room)

  function get(id: string) {
    const t = office.threads.find((t) => t.id === id)
    if (!t) throw new HttpError(404, 'No such Thread')
    return t
  }

  function update(t: Thread, patch: Partial<Thread>) {
    Object.assign(t, patch)
    save(office)
    emit({ type: 'thread', thread: t })
  }

  function log(t: Thread, kind: Entry['kind'], text: string) {
    const entry = { at: Date.now(), kind, text }
    appendEntry(t.id, entry)
    emit({ type: 'entry', id: t.id, entry })
  }

  // Callers update() right after, which publishes the cleared asks.
  function closeRun(t: Thread) {
    runs.get(t.id)?.close()
    runs.delete(t.id)
    t.asks = []
  }

  function settle(t: Thread, askId: string) {
    const asks = t.asks.filter((a) => a.id !== askId)
    update(t, { asks, state: asks.length === 0 && t.state === 'needs-you' ? 'working' : t.state })
  }

  function schedule() {
    for (const t of toLaunch(office.threads, office.maxRunning)) launch(t)
  }

  function launch(t: Thread) {
    update(t, { state: 'starting' })
    try {
      if (!existsSync(t.worktree)) {
        const hasBranch = tryGit(roomPath(t), 'rev-parse', '--verify', '--quiet', `refs/heads/${t.branch}`)
        if (hasBranch) git(roomPath(t), 'worktree', 'add', t.worktree, t.branch)
        else git(roomPath(t), 'worktree', 'add', '-b', t.branch, t.worktree, t.base)
      }
    } catch (e) {
      log(t, 'error', `Could not create the worktree: ${errorText(e)}`)
      return fail(t)
    }
    const track = usageTracker({ costUsd: t.costUsd ?? 0, tokens: t.tokens ?? 0 })
    const r = run(
      { id: t.id, resume: t.hasSession, cwd: t.worktree, projectRoot: roomPath(t), model: t.model, apiKey: office.apiKey },
      (e) => onEvent(t, e, track),
    )
    runs.set(t.id, r)
    for (const m of t.inbox) r.send(m)
    update(t, { inbox: [] })
  }

  function onEvent(t: Thread, e: RunnerEvent, track: ReturnType<typeof usageTracker>) {
    if (e.kind === 'session' && !t.hasSession) update(t, { hasSession: true })
    else if (e.kind === 'state' && e.state === 'working' && t.state === 'starting') update(t, { state: 'working' })
    else if (e.kind === 'state' && e.state === 'idle' && t.state === 'working') {
      // Idle frees the slot; the next message resumes the session.
      closeRun(t)
      update(t, { state: 'idle' })
      schedule()
    } else if (e.kind === 'text') log(t, 'text', e.text)
    else if (e.kind === 'tool') log(t, 'tool', `${e.name} ${e.detail}`.trim())
    else if (e.kind === 'ask') {
      log(t, 'system', `Needs you: ${e.ask.title}`)
      update(t, { asks: [...t.asks, e.ask], state: 'needs-you' })
    } else if (e.kind === 'unask') settle(t, e.id)
    else if (e.kind === 'result') {
      if (interrupted.delete(t.id)) log(t, 'system', 'Interrupted.') // its error is only a diagnostic
      else if (e.error) log(t, 'error', e.error)
      const usage = track(e)
      if (usage) update(t, usage)
    } else if (e.kind === 'exit') {
      runs.delete(t.id)
      log(t, 'error', e.error ?? 'Claude Code stopped unexpectedly.')
      fail(t)
    }
  }

  function fail(t: Thread) {
    closeRun(t)
    update(t, { state: 'failed' })
    schedule()
  }

  // Write-back goes to the main checkout's copy only, so a Thread's branch never carries tracker edits.
  function comment(t: Thread, text: string) {
    if (!t.ticket) return
    try {
      appendComment(join(roomPath(t), t.ticket), `Thread "${t.title}" ${text}`)
    } catch (e) {
      log(t, 'system', `Could not write to the Ticket: ${errorText(e)}`)
    }
  }

  // Ending keeps the branch; the worktree goes only when nothing would be lost.
  function end(t: Thread, state: State) {
    closeRun(t)
    update(t, { state, ended: true, endedAt: Date.now() })
    comment(t, `${state[0].toUpperCase()}${state.slice(1)}: branch kept`)
    if (existsSync(t.worktree)) {
      const dirty = tryGit(t.worktree, 'status', '--porcelain')
      if (dirty !== '') log(t, 'system', 'Worktree kept: it has uncommitted changes.')
      else if (removeWorktree(t)) log(t, 'system', `Worktree removed; branch ${t.branch} kept.`)
      else log(t, 'system', 'Worktree kept: git could not remove it.')
    }
    schedule()
  }

  function removeWorktree(t: Thread, force = false) {
    const ok = tryGit(roomPath(t), 'worktree', 'remove', ...(force ? ['--force'] : []), t.worktree) !== undefined
    // Windows: the exiting Claude process can still hold the folder for a moment, leaving it empty behind git.
    if (ok) rmSync(t.worktree, { recursive: true, force: true, maxRetries: 10 })
    return ok
  }

  function queue(t: Thread, text: string) {
    update(t, { state: 'queued', inbox: [...t.inbox, text], queuedAt: t.state === 'queued' ? t.queuedAt : Date.now() })
    schedule()
  }

  // Boot: nothing survived the restart.
  for (const t of recover(office.threads)) log(t, 'system', 'Office restarted during this turn. Reply to continue.')
  save(office)
  schedule()

  return {
    start(body: { room?: string; prompt?: string; base?: string; model?: string; ticket?: string }) {
      const model = body.model || 'sonnet'
      if (!body.room || !rooms().includes(body.room)) throw new HttpError(400, 'Unknown Project')
      if (!MODELS.includes(model)) throw new HttpError(400, 'Unknown model')
      const repo = join(office.projectsRoot, body.room)
      const base = body.base?.trim() || defaultBase(repo)
      // Only listed Tickets: the path names a file we read and write.
      const ticket = body.ticket ? listTickets(repo).find((x) => x.path === body.ticket) : undefined
      if (body.ticket && !ticket) throw new HttpError(400, 'No such Ticket')
      const prompt = ticket ? ticketPrompt(repo, ticket.path, base, body.prompt ?? '') : body.prompt?.trim()
      if (!prompt) throw new HttpError(400, 'Prompt is empty')
      const id = randomUUID()
      const title = (ticket?.title ?? prompt.split('\n')[0]).slice(0, 60)
      const slug = `${slugify(title)}-${id.slice(0, 4)}`
      const now = Date.now()
      const t: Thread = {
        id, room: body.room, title, model, base,
        branch: `office/${slug}`,
        worktree: join(office.projectsRoot, '.worktrees', body.room, slug),
        state: 'queued', ended: false, hasSession: false, inbox: [], asks: [],
        createdAt: now, queuedAt: now, ticket: ticket?.path,
      }
      office.threads.push(t)
      comment(t, `started on ${t.branch} from ${base} (${new Date().toLocaleDateString('en-CA')})`)
      log(t, 'user', prompt)
      queue(t, prompt)
      return { id }
    },

    send(id: string, text?: string) {
      const t = get(id)
      text = text?.trim()
      if (!text) throw new HttpError(400, 'Message is empty')
      if (t.ended || !['queued', 'starting', 'working', 'needs-you', 'idle'].includes(t.state)) throw new HttpError(409, `Thread is ${t.state}`)
      const r = runs.get(id)
      if (t.asks.length > 0) return this.answer(id, { ask: t.asks[0].id, allow: false, message: text }) // the composer is Deny with a note
      log(t, 'user', text)
      if (r) r.send(text) // steering: the SDK runs it after the current step
      else queue(t, text)
    },

    answer(id: string, body: { ask?: string; allow?: boolean; message?: string; answers?: Record<string, string> }) {
      const t = get(id)
      const ask = t.asks.find((a) => a.id === body.ask)
      if (!ask) throw new HttpError(409, 'That request is no longer waiting')
      const message = body.message?.trim() || 'The user denied this.'
      runs.get(id)?.answer(ask.id, body.allow ? { allow: true, answers: body.answers } : { allow: false, message })
      if (body.answers) log(t, 'user', Object.values(body.answers).join('\n'))
      else log(t, 'system', body.allow ? `Allowed: ${ask.title}` : `Denied: ${ask.title}${body.message ? ` — ${message}` : ''}`)
      settle(t, ask.id)
    },

    act(id: string, action: string) {
      const t = get(id)
      const bad = () => new HttpError(409, `Cannot ${action} a ${t.ended ? 'ended' : t.state} Thread`)
      if (action === 'interrupt') {
        if (!runs.has(id)) throw bad()
        interrupted.add(id)
        runs.get(id)!.interrupt().catch(() => interrupted.delete(id))
      } else if (action === 'stop') {
        if (t.ended || t.state === 'failed') throw bad()
        end(t, 'stopped')
      } else if (action === 'done') {
        if (t.state !== 'idle' || t.ended) throw bad()
        end(t, 'done')
      } else if (action === 'retry') {
        if (t.state !== 'failed' || t.ended) throw bad()
        const first = readEntries(id).find((e) => e.kind === 'user')?.text ?? t.title
        queue(t, t.hasSession ? 'Continue where you left off.' : first)
      } else if (action === 'end') {
        if (t.state !== 'failed' || t.ended) throw bad()
        end(t, 'failed')
      } else if (action === 'discard') {
        if (!t.ended) throw bad()
        if (existsSync(t.worktree)) removeWorktree(t, true)
        tryGit(roomPath(t), 'branch', '-D', t.branch)
        office.threads = office.threads.filter((x) => x !== t)
        removeEntries(id)
        save(office)
        emit({ type: 'removed', id })
      } else throw new HttpError(404, 'Unknown action')
    },

    entries: (id: string) => readEntries(get(id).id),

    async changes(id: string) {
      const t = get(id)
      const pr = prUrl(roomPath(t), t.branch)
      try {
        const d = existsSync(t.worktree) ? diff(t.worktree, t.base) : diff(roomPath(t), t.base, t.branch)
        return { ...d, pr: await pr }
      } catch (e) {
        throw new HttpError(409, `No changes to show: ${errorText(e)}`) // e.g. queued, nothing created yet
      }
    },
  }
}
