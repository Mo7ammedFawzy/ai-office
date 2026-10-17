// The only module that talks to the Claude Agent SDK. Everything else sees Office events.
import { isAbsolute, relative, resolve } from 'node:path'
import { query, type PermissionResult, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Ask, Question } from './office.ts'

export type RunnerEvent =
  | { kind: 'session' } // the SDK created (or resumed) the session
  | { kind: 'state'; state: 'working' | 'idle' }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; detail: string }
  | { kind: 'result'; costUsd: number; tokens: number; error?: string }
  | { kind: 'ask'; ask: Ask } // canUseTool is waiting for answer()
  | { kind: 'unask'; id: string } // the SDK gave up on an ask (interrupt)
  | { kind: 'exit'; error?: string } // the query ended without close()
  | SubEvent

export type SubEvent =
  | { kind: 'sub-start'; id: string; type: string; description: string; depth: number; parent?: string }
  | { kind: 'sub-progress'; id: string; summary?: string; tools: number }
  | { kind: 'sub-end'; id: string; status: 'completed' | 'failed' | 'stopped'; summary: string; tools?: number }

// Subagents only: local_agent tasks that aren't ambient. `known` holds the live ones (later task_* lack task_type).
export function taskEvent(m: SDKMessage, known: Set<string>): SubEvent | undefined {
  if (m.type !== 'system') return
  if (m.subtype === 'task_started') {
    if (m.task_type !== 'local_agent' || m.ambient) return
    known.add(m.task_id)
    return { kind: 'sub-start', id: m.task_id, type: m.subagent_type || 'agent', description: m.description, depth: m.spawn_depth ?? 1, parent: m.parent_task_id }
  }
  if (!('task_id' in m) || !known.has(m.task_id)) return
  if (m.subtype === 'task_progress') return { kind: 'sub-progress', id: m.task_id, summary: m.summary, tools: m.usage.tool_uses }
  if (m.subtype === 'task_notification') {
    known.delete(m.task_id)
    return { kind: 'sub-end', id: m.task_id, status: m.status, summary: m.summary, tools: m.usage?.tool_uses }
  }
}

export type Answer = { allow: true; answers?: Record<string, string> } | { allow: false; message: string }
export type Run = { send(text: string): void; answer(id: string, a: Answer): boolean; interrupt(): Promise<unknown>; close(): void }

const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

// Edits inside the worktree go through; anything else that asks waits for the user.
export function decide(tool: string, input: Record<string, unknown>, worktree: string): 'allow' | 'ask' {
  const target = input.file_path ?? input.notebook_path
  if (!EDIT_TOOLS.includes(tool) || typeof target !== 'string') return 'ask'
  const fold = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const rel = relative(fold(resolve(worktree)), fold(resolve(worktree, target)))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)) ? 'allow' : 'ask'
}

export type RunOptions = { id: string; resume: boolean; cwd: string; projectRoot: string; model: string; apiKey?: string }

export function run(o: RunOptions, onEvent: (e: RunnerEvent) => void): Run {
  const input = inbox<SDKUserMessage>()
  let closed = false
  const emit = (e: RunnerEvent) => !closed && onEvent(e)
  const waiting = new Map<string, (r: PermissionResult) => void>()

  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' }
  delete env.ANTHROPIC_API_KEY // a stray key silently wins over the user's own login
  if (o.apiKey) env.ANTHROPIC_API_KEY = o.apiKey

  const q = query({
    prompt: input,
    options: {
      cwd: o.cwd,
      projectConfigRoot: o.projectRoot,
      model: o.model,
      ...(o.resume ? { resume: o.id } : { sessionId: o.id }),
      env,
      agentProgressSummaries: true,
      canUseTool: async (tool, input, { signal, title, toolUseID, agentID }) => {
        if (decide(tool, input, o.cwd) === 'allow') return { behavior: 'allow', updatedInput: input }
        const questions = tool === 'AskUserQuestion' ? (input.questions as Question[]) : undefined
        const detail = toolDetail(input)
        const ask: Ask = { id: toolUseID, tool, title: title ?? `${tool} ${detail}`.trim(), detail, questions, agentID, at: Date.now() }
        const r = await new Promise<PermissionResult>((done) => {
          waiting.set(toolUseID, (r) => (waiting.delete(toolUseID), done(r)))
          signal.addEventListener('abort', () => {
            if (!waiting.has(toolUseID)) return
            waiting.get(toolUseID)!({ behavior: 'deny', message: 'Interrupted.' })
            emit({ kind: 'unask', id: toolUseID })
          })
          emit({ kind: 'ask', ask })
        })
        return r.behavior === 'allow' ? { ...r, updatedInput: { ...input, ...r.updatedInput } } : r
      },
    },
  })

  ;(async () => {
    try {
      for await (const m of q) handle(m)
      emit({ kind: 'exit' })
    } catch (e: any) {
      emit({ kind: 'exit', error: e?.message ?? String(e) })
    }
  })()

  const tasks = new Set<string>()
  function handle(m: SDKMessage) {
    const sub = taskEvent(m, tasks)
    if (sub) emit(sub)
    else if (m.type === 'system' && m.subtype === 'init') emit({ kind: 'session' })
    else if (m.type === 'system' && m.subtype === 'session_state_changed') {
      if (m.state === 'running') emit({ kind: 'state', state: 'working' })
      if (m.state === 'idle') emit({ kind: 'state', state: 'idle' })
    } else if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const b of m.message.content) {
        if (b.type === 'text') emit({ kind: 'text', text: b.text })
        if (b.type === 'tool_use') emit({ kind: 'tool', name: b.name, detail: toolDetail(b.input) })
      }
    } else if (m.type === 'result') {
      const tokens = Object.values(m.modelUsage ?? {}).reduce((n, u) => n + u.inputTokens + u.outputTokens, 0)
      const error = m.subtype !== 'success' ? m.errors.join('; ') || m.subtype : m.is_error ? m.result : undefined
      emit({ kind: 'result', costUsd: m.total_cost_usd, tokens, error })
    }
  }

  return {
    send: (text) => input.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null }),
    answer(id, a) {
      const done = waiting.get(id)
      done?.(a.allow ? { behavior: 'allow', updatedInput: a.answers ? { answers: a.answers } : {} } : { behavior: 'deny', message: a.message })
      return !!done
    },
    interrupt: () => q.interrupt(),
    close() {
      closed = true
      for (const done of waiting.values()) done({ behavior: 'deny', message: 'Stopped.' })
      input.end()
      q.close()
    },
  }
}

function toolDetail(input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  const d = i.command ?? i.file_path ?? i.pattern ?? i.url ?? i.description ?? ''
  return String(d).slice(0, 200)
}

// A push-based async iterable: the SDK's streaming input.
function inbox<T>() {
  const items: T[] = []
  let wake: (() => void) | undefined
  let done = false
  return {
    push(item: T) {
      items.push(item)
      wake?.()
    },
    end() {
      done = true
      wake?.()
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (items.length) yield items.shift()!
        if (done) return
        await new Promise<void>((r) => (wake = r))
        wake = undefined
      }
    },
  }
}
