import { useEffect, useRef, useState } from 'react'
import { post, RUNNING, useOffice, type Entry, type Room, type State, type Thread } from './office.ts'

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

  return (
    <div className="flex h-screen text-sm">
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-auto border-r border-slate-800 p-3">
        <h1 className="font-semibold">AI Office</h1>
        <NewThread rooms={visible} canStart={threads.filter((t) => RUNNING.includes(t.state)).length < office.maxRunning} onStarted={setSelected} />
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-500">Needs you</h2>
          <p className="text-slate-600">Nothing waiting.</p>
        </section>
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-wide text-slate-500">Activity</h2>
        </section>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <nav className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-3 py-2">
          {visible.map((r) => (
            <span key={r.name} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1">
              {r.name}
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
        {/* The Campus scene replaces this grid. */}
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 overflow-auto p-4">
          {visible.map((r) => (
            <div key={r.name} className="rounded border border-slate-800 p-3">
              <div className="mb-2 font-medium">{r.name}</div>
              {threads
                .filter((t) => t.room === r.name && !t.ended)
                .map((t) => (
                  <button key={t.id} onClick={() => setSelected(t.id)} className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-slate-800 ${t.id === selected ? 'bg-slate-800' : ''}`}>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <StateChip state={t.state} />
                  </button>
                ))}
            </div>
          ))}
        </div>
      </main>

      {thread && <Drawer key={thread.id} thread={thread} entries={office.entries[thread.id]} load={office.loadEntries} connected={connected} onClose={() => setSelected(undefined)} />}
    </div>
  )
}

function NewThread({ rooms, canStart, onStarted }: { rooms: Room[]; canStart: boolean; onStarted: (id: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [room, setRoom] = useState('')
  const [base, setBase] = useState('')
  const [model, setModel] = useState('sonnet')
  const target = room || rooms[0]?.name

  async function start() {
    const res = await post('threads', { room: target, prompt, base, model })
    if (res.ok) {
      setPrompt('')
      onStarted((await res.json()).id)
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded border border-slate-800 p-2">
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="What should Claude do?" className="resize-y rounded bg-slate-900 p-2 outline-none focus:ring-1 focus:ring-sky-600" />
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
      <button disabled={!prompt.trim() || !target} onClick={start} className="rounded bg-sky-700 py-1 font-medium hover:bg-sky-600 disabled:opacity-40">
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

  const act = (action: string) => post(`threads/${t.id}/${action}`)
  const running = RUNNING.includes(t.state)
  const actions: [string, string][] = t.ended
    ? [['discard', 'Discard']]
    : t.state === 'failed'
      ? [['retry', 'Retry'], ['end', 'End']]
      : [...(running ? [['interrupt', 'Interrupt']] : []), ...(t.state === 'idle' ? [['done', 'Mark done']] : []), ['stop', 'Stop']] as [string, string][]
  const canSend = !t.ended && ['queued', 'starting', 'working', 'idle'].includes(t.state)

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
      <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
        {entries?.map((e, i) => (
          <div key={i} className={`whitespace-pre-wrap break-words ${ENTRY_STYLE[e.kind]}`}>
            {e.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      {canSend && (
        <div className="flex gap-2 border-t border-slate-800 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), text.trim() && send())}
            rows={2}
            placeholder={running ? 'Steer…' : t.state === 'queued' ? 'Add to the first message…' : 'Reply…'}
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
