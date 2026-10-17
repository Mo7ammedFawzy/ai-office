import { useState } from 'react'
import { post, useOffice } from './office.ts'

const roomPath = (name: string, action: string) => `rooms/${encodeURIComponent(name)}/${action}`

export function App() {
  const { connected, rooms } = useOffice()
  const [showHidden, setShowHidden] = useState(false)
  const visible = rooms.filter((r) => !r.hidden)
  const hidden = rooms.filter((r) => r.hidden)

  return (
    <div className="flex h-screen text-sm">
      <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-slate-800 p-3">
        <h1 className="font-semibold">AI Office</h1>
        <section className="rounded border border-slate-800 p-2 text-slate-500">New Thread</section>
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
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3 overflow-auto p-4">
          {visible.map((r) => (
            <div key={r.name} className="rounded border border-slate-800 p-4">
              {r.name}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
