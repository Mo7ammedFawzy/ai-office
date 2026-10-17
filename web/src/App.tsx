import { useEffect, useRef, useState } from 'react'
import { Campus } from './Campus.tsx'
import { endedNewestFirst } from '../../server/activity.ts'
import { post, RUNNING, useOffice, type Ask, type Entry, type Room, type State, type Thread } from './office.ts'
import type { Ticket } from '../../server/tickets.ts'
import { ChangesPanel, ChangesSummary, useChanges } from './Changes.tsx'

const roomPath = (name: string, action: string) => `rooms/${encodeURIComponent(name)}/${action}`

const STATE_STYLE: Record<State, string> = {
  queued: 'bg-slate-700 text-slate-300',
  starting: 'bg-sky-900 text-sky-200',
  working: 'bg-sky-700 text-white',
  'needs-you': 'bg-amber-500 text-black',
  idle: 'bg-slate-600 text-slate-100',
  done: 'bg-emerald-800 text-emerald-100',
  stopped: 'bg-slate-800 text-slate-400',
  failed: 'bg-red-700 text-white',
}

const StateChip = ({ state }: { state: State }) => <span className={`rounded px-1.5 py-0.5 text-xs ${STATE_STYLE[state]}`}>{state}</span>

export function App() {
  const office = useOffice()
  const { connected, rooms, threads } = office
  const [showHidden, setShowHidden] = useState(false)
  const [selected, setSelected] = useState<string>()
  const visible = rooms.filter((r) => !r.hidden)
  const hidden = rooms.filter((r) => r.hidden)
  const thread = threads.find((t) => t.id === selected)
  const needy = threads.filter((t) => t.asks.length > 0).sort((a, b) => a.asks[0].at - b.asks[0].at)
  const waiting = needy.flatMap((t) => t.asks.map((a) => ({ t, a })))
  const seen = useRef<Set<string>>(undefined)
  const byId = new Map(threads.map((t) => [t.id, t]))
  const ended = endedNewestFirst(threads)

  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) AI Office` : 'AI Office'
  }, [waiting.length])

  // Notify only for asks that arrive while the tab is hidden, never for the snapshot's.
  useEffect(() => {
    if (!connected) return void (seen.current = undefined)
    if (seen.current && document.hidden && 'Notification' in window && Notification.permission === 'granted')
      for (const { t, a } of waiting)
        if (!seen.current.has(a.id))
          new Notification(`${t.room} needs you`, { body: a.title, tag: a.id }).onclick = () => (window.focus(), setSelected(t.id))
    seen.current = new Set(waiting.map(({ a }) => a.id))
  })

  return (
    <div className="flex h-screen text-sm">
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-auto border-r border-slate-800 p-3">
        <h1 className="font-semibold">AI Office</h1>
        <NewThread rooms={visible} threads={threads} canStart={threads.filter((t) => RUNNING.includes(t.state)).length < office.maxRunning} onStarted={setSelected} />
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-500">Needs you</h2>
          {needy.length === 0 && <p className="text-slate-600">Nothing waiting.</p>}
          <div className="flex flex-col gap-2">
            {needy.map((t) => (
              <div key={t.id} className="rounded border border-amber-500/40 bg-amber-500/5 p-2">
                <button onClick={() => setSelected(t.id)} className="mb-1 block w-full truncate text-left text-xs text-slate-400 hover:text-slate-200">
                  {t.room} · {t.title}
                </button>
                <AskCard key={t.asks[0].id} t={t} ask={t.asks[0]} />
                {t.asks.length > 1 && <div className="mt-1 text-xs text-slate-500">+{t.asks.length - 1} more</div>}
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-500">Activity</h2>
          {office.activity.length === 0 && <p className="text-slate-600">Nothing yet.</p>}
          <div className="flex flex-col">
            {office.activity.map(({ id, entry }, i) => (
              <button key={i} onClick={() => setSelected(id)} className="rounded px-1 py-0.5 text-left hover:bg-slate-800">
                <span className="block truncate text-xs text-slate-500">
                  {byId.get(id)?.room} · {byId.get(id)?.title} · {new Date(entry.at).toLocaleTimeString()}
                </span>
                <span className={`block truncate ${entry.kind === 'error' ? 'text-red-400' : 'text-slate-300'}`}>{entry.text}</span>
              </button>
            ))}
          </div>
        </section>
        <details>
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-slate-500">Ended ({ended.length})</summary>
          <div className="mt-1 flex flex-col">
            {ended.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)} className={`flex items-center gap-2 rounded px-1 py-1 text-left hover:bg-slate-800 ${t.id === selected ? 'bg-slate-800' : ''}`}>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-slate-500">{t.room} · </span>
                  {t.title}
                </span>
                <StateChip state={t.state} />
              </button>
            ))}
          </div>
        </details>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <nav className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-3 py-2">
          {visible.map((r) => (
            <span key={r.name} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1">
              {r.name}
              {needy.some((t) => t.room === r.name) && <span className="rounded bg-amber-500 px-1 text-xs text-black">{needy.filter((t) => t.room === r.name).length}</span>}
              <button title="Hide Room" className="text-slate-500 hover:text-slate-200" onClick={() => post(roomPath(r.name, 'hide'))}>
                ✕
              </button>
            </span>
          ))}
          {hidden.length > 0 && (
            <span className="relative">
              <button className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800" onClick={() => setShowHidden(!showHidden)}>
                {hidden.length} hidden · show
              </button>
              {showHidden && (
                <div className="absolute z-10 mt-1 flex flex-col rounded border border-slate-700 bg-slate-900 p-1">
                  {hidden.map((r) => (
                    <button key={r.name} className="rounded px-2 py-1 text-left hover:bg-slate-800" onClick={() => post(roomPath(r.name, 'show'))}>
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
          <button className="ml-auto rounded px-2 py-1 text-slate-400 hover:bg-slate-800" onClick={() => post('rooms/refresh')}>
            Refresh
          </button>
          {!connected && <span className="text-amber-400">reconnecting…</span>}
        </nav>
        <Campus rooms={visible.map((r) => r.name)} threads={threads} selected={selected} onSelect={setSelected} />
      </main>

      {thread && <Drawer key={thread.id} thread={thread} entries={office.entries[thread.id]} load={office.loadEntries} connected={connected} onClose={() => setSelected(undefined)} />}
    </div>
  )
}

function NewThread({ rooms, threads, canStart, onStarted }: { rooms: Room[]; threads: Thread[]; canStart: boolean; onStarted: (id: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [room, setRoom] = useState('')
  const [base, setBase] = useState('')
  const [model, setModel] = useState('sonnet')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticket, setTicket] = useState('')
  const [showAll, setShowAll] = useState(false)
  const target = room || rooms[0]?.name
  const picked = tickets.find((x) => x.path === ticket)
  const live = picked && threads.find((t) => t.room === target && t.ticket === picked.path && !t.ended)
  const offered = tickets.filter((x) => showAll || x.status === 'ready-for-agent' || x.path === ticket)
  const features = [...new Set(offered.map((x) => x.feature))]

  async function loadTickets() {
    if (!target) return
    const res = await fetch(`/api/${roomPath(target, 'tickets')}`)
    setTickets(res.ok ? await res.json() : [])
  }
  useEffect(() => {
    setTicket('')
    loadTickets()
  }, [target])

  async function start() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() // needs a click
    const res = await post('threads', { room: target, prompt, base, model, ticket: ticket || undefined })
    if (res.ok) {
      setPrompt('')
      setTicket('')
      loadTickets()
      onStarted((await res.json()).id)
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded border border-slate-800 p-2">
      {tickets.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <select value={ticket} onChange={(e) => setTicket(e.target.value)} className="min-w-0 flex-1 rounded bg-slate-900 p-1" aria-label="From Ticket">
              <option value="">From Ticket…</option>
              {features.map((f) => (
                <optgroup key={f} label={f}>
                  {offered.filter((x) => x.feature === f).map((x) => (
                    <option key={x.path} value={x.path}>
                      {x.title}
                      {x.status !== 'ready-for-agent' ? ` (${x.status ?? 'no status'})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              show all
            </label>
          </div>
          {picked?.blockedBy && <div className="text-xs text-slate-400">Blocked by: {picked.blockedBy}</div>}
          {live && <div className="text-xs text-amber-400">Already on a desk: {live.title}</div>}
        </div>
      )}
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={ticket ? 'Anything to add? (optional)' : 'What should Claude do?'} className="resize-y rounded bg-slate-900 p-2 outline-none focus:ring-1 focus:ring-sky-600" />
      <div className="grid grid-cols-2 gap-2">
        <select value={target} onChange={(e) => setRoom(e.target.value)} className="rounded bg-slate-900 p-1" aria-label="Project">
          {rooms.map((r) => (
            <option key={r.name}>{r.name}</option>
          ))}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded bg-slate-900 p-1" aria-label="Model">
          <option>sonnet</option>
          <option>opus</option>
          <option>haiku</option>
        </select>
      </div>
      <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="Base branch (default branch)" className="rounded bg-slate-900 p-1" />
      <button disabled={!(prompt.trim() || ticket) || !target} onClick={start} className="rounded bg-sky-700 py-1 font-medium hover:bg-sky-600 disabled:opacity-40">
        Start · {canStart ? 'starts now' : 'will queue'}
      </button>
    </section>
  )
}

const ENTRY_STYLE: Record<Entry['kind'], string> = {
  user: 'border-l-2 border-sky-600 pl-2 text-slate-100',
  text: 'text-slate-300',
  tool: 'font-mono text-xs text-slate-500',
  system: 'text-xs italic text-slate-500',
  error: 'text-red-400',
}

function Drawer({ thread: t, entries, load, connected, onClose }: { thread: Thread; entries?: Entry[]; load: (id: string) => void; connected: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (connected) load(t.id) // reload after a reconnect too: the snapshot drops transcripts
  }, [t.id, connected, load])
  useEffect(() => {
    end.current?.scrollIntoView() // returns a Promise in newer Chrome; never hand it to React
  }, [entries?.length])

  const changes = useChanges(t.id, `${t.state}:${entries?.length}`)
  const act = (action: string) => post(`threads/${t.id}/${action}`)
  const running = RUNNING.includes(t.state)
  const actions: [string, string][] = t.ended
    ? [['discard', 'Discard']]
    : t.state === 'failed'
      ? [['retry', 'Retry'], ['end', 'End']]
      : [...(running ? [['interrupt', 'Interrupt']] : []), ...(t.state === 'idle' ? [['done', 'Mark done']] : []), ['stop', 'Stop']] as [string, string][]
  const canSend = !t.ended && ['queued', 'starting', 'working', 'needs-you', 'idle'].includes(t.state)

  async function send() {
    if ((await post(`threads/${t.id}/send`, { text })).ok) setText('')
  }

  return (
    <aside className="flex w-[28rem] shrink-0 flex-col border-l border-slate-800">
      <header className="flex flex-col gap-1 border-b border-slate-800 p-3">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 font-medium">{t.title}</h2>
          <StateChip state={t.state} />
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200" title="Close">
            ✕
          </button>
        </div>
        <div className="truncate text-xs text-slate-500">
          {t.room} · {t.branch} ← {t.base} · {t.model}
          <ChangesSummary changes={changes} />
          {t.costUsd !== undefined && ` · ${(t.tokens ?? 0).toLocaleString()} tokens · ~$${t.costUsd.toFixed(2)}`}
        </div>
        <div className="flex gap-1">
          {actions.map(([a, label]) => (
            <button key={a} onClick={() => (a !== 'discard' || confirm('Delete the worktree and branch?')) && act(a)} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
              {label}
            </button>
          ))}
        </div>
      </header>
      {t.asks.length > 0 && (
        <div className="flex flex-col gap-3 border-b border-amber-500/40 bg-amber-500/5 p-3">
          {t.asks.map((a) => (
            <AskCard key={a.id} t={t} ask={a} />
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
        {entries?.map((e, i) => (
          <div key={i} className={`whitespace-pre-wrap break-words ${ENTRY_STYLE[e.kind]}`}>
            {e.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <ChangesPanel changes={changes} />
      {canSend && (
        <div className="flex gap-2 border-t border-slate-800 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), text.trim() && send())}
            rows={2}
            placeholder={t.asks.length > 0 ? 'Deny with a note…' : running ? 'Steer…' : t.state === 'queued' ? 'Add to the first message…' : 'Reply…'}
            className="flex-1 resize-none rounded bg-slate-900 p-2 outline-none focus:ring-1 focus:ring-sky-600"
          />
          <button disabled={!text.trim()} onClick={send} className="rounded bg-sky-700 px-3 hover:bg-sky-600 disabled:opacity-40">
            Send
          </button>
        </div>
      )}
    </aside>
  )
}

// One waiting request: Allow/Deny, or option buttons for AskUserQuestion.
function AskCard({ t, ask }: { t: Thread; ask: Ask }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const answer = (body: object) => post(`threads/${t.id}/answer`, { ask: ask.id, ...body })
  const btn = 'rounded px-2 py-1 text-left'

  if (!ask.questions)
    return (
      <div className="flex flex-col gap-1">
        <div className="break-words">{ask.title}</div>
        {ask.detail && !ask.title.includes(ask.detail) && <div className="break-words font-mono text-xs text-slate-400">{ask.detail}</div>}
        <div className="flex gap-1">
          <button onClick={() => answer({ allow: true })} className={`${btn} bg-emerald-700 hover:bg-emerald-600`}>Allow</button>
          <button onClick={() => answer({ allow: false })} className={`${btn} bg-slate-700 hover:bg-slate-600`}>Deny</button>
        </div>
      </div>
    )

  const qs = ask.questions
  const instant = qs.length === 1 && !qs[0].multiSelect // one click answers
  const submit = (p: Record<string, string[]>) => answer({ allow: true, answers: Object.fromEntries(qs.map((q) => [q.question, p[q.question].join(', ')])) })
  const pick = (q: (typeof qs)[number], label: string) => {
    const cur = picked[q.question] ?? []
    const next = { ...picked, [q.question]: q.multiSelect ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : [label] }
    if (instant) submit(next)
    else setPicked(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {qs.map((q) => (
        <div key={q.question} className="flex flex-col gap-1">
          <div>
            <span className="mr-1 rounded bg-slate-700 px-1 text-xs">{q.header}</span>
            {q.question}
          </div>
          {q.options.map((o) => (
            <button key={o.label} title={o.description} onClick={() => pick(q, o.label)} className={`${btn} ${picked[q.question]?.includes(o.label) ? 'bg-sky-700' : 'bg-slate-800 hover:bg-slate-700'}`}>
              {o.label}
              <span className="block text-xs text-slate-400">{o.description}</span>
            </button>
          ))}
        </div>
      ))}
      {!instant && (
        <button disabled={!qs.every((q) => picked[q.question]?.length)} onClick={() => submit(picked)} className={`${btn} bg-sky-700 hover:bg-sky-600 disabled:opacity-40`}>
          Answer
        </button>
      )}
    </div>
  )
}
