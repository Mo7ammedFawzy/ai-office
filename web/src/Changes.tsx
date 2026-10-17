import { useEffect, useState } from 'react'
import type { Diff } from '../../server/changes.ts'

export type Changes = Diff & { pr?: string }

// Refetched (debounced) whenever `key` changes: the Thread's state or transcript moved on.
export function useChanges(id: string, key: unknown) {
  const [changes, setChanges] = useState<Changes>()
  useEffect(() => setChanges(undefined), [id])
  useEffect(() => {
    let live = true
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/threads/${id}/diff`)
      if (live && res.ok) setChanges(await res.json())
    }, 1000)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [id, key])
  return changes
}

// For the drawer header: +/− and the PR link.
export function ChangesSummary({ changes }: { changes?: Changes }) {
  if (!changes) return null
  return (
    <>
      {' · '}
      <span className="text-emerald-400">+{changes.added}</span> <span className="text-red-400">−{changes.removed}</span>
      {changes.pr && (
        <>
          {' · '}
          <a href={changes.pr} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
            PR
          </a>
        </>
      )}
    </>
  )
}

const LINE = (l: string) => (l[0] === '+' ? 'text-emerald-400' : l[0] === '-' ? 'text-red-400' : l.startsWith('@@') ? 'text-sky-400' : 'text-slate-400')

export function ChangesPanel({ changes }: { changes?: Changes }) {
  return (
    <details className="border-t border-slate-800">
      <summary className="cursor-pointer select-none p-3 text-sm text-slate-300">
        Changes{changes && ` · ${changes.files.length} file${changes.files.length === 1 ? '' : 's'}`}
      </summary>
      <div className="flex max-h-[40vh] flex-col gap-1 overflow-auto px-3 pb-3">
        {!changes?.files.length && <div className="text-xs text-slate-500">{changes ? 'No changes yet.' : 'Loading…'}</div>}
        {changes?.files.map((f) => (
          <details key={f.path}>
            <summary className="cursor-pointer truncate font-mono text-xs">
              {f.path} <span className="text-emerald-400">+{f.added}</span> <span className="text-red-400">−{f.removed}</span>
            </summary>
            <pre className="overflow-x-auto bg-slate-900 p-2 text-xs">
              {f.patch ? f.patch.split('\n').map((l, i) => <div key={i} className={LINE(l)}>{l || ' '}</div>) : <div className="text-slate-500">Binary or empty file</div>}
            </pre>
          </details>
        ))}
      </div>
    </details>
  )
}
