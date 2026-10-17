# AI Office — MVP spec

A local, single-user web app at `localhost` where each **Project** in `C:\Projects\personal` is a **Room**, each Claude Code **Thread** is a **Character** at a desk, and a side panel starts, watches, steers, approves and stops Threads and shows their diffs. Vocabulary: [GLOSSARY.md](../GLOSSARY.md). The route that led here: [Map: AI Office](https://github.com/Mo7ammedFawzy/ai-office/issues/1). Each section links the ticket that holds the full decision; this file only states what to build.

Decisions marked _(agent-decided)_ were made by Claude after the user delegated the remaining calls on 2026-10-17.

## Stack and layout

- One npm package at the repo root. `server/` is Node + TypeScript run with `tsx`; `web/` is React + Vite, React Three Fiber + drei for the scene, Tailwind + shadcn-style components for panels.
- One port, `http://127.0.0.1:4310`. `npm run dev` runs the server with Vite as middleware (HMR included); `npm start` builds `web/` and the server serves `web/dist`. API and `/ws` refuse requests whose `Origin` is another site.
- Transport _(agent-decided)_: REST for commands (`POST /api/...`), one WebSocket `/ws` for live state. On connect the server sends a full snapshot; afterwards it sends `thread` (whole Thread record, minus transcript), `entry` (one transcript entry appended to a Thread) and `rooms` messages.
- Office data _(agent-decided)_: `%USERPROFILE%\.ai-office\office.json` (Thread records, hidden Rooms, config) and `%USERPROFILE%\.ai-office\threads\<id>.jsonl` (each Thread's transcript entries, appended). Written on every change. No database.
- Config in `office.json`: `maxRunning` (default 6), `apiKey` (optional, see [ADR 0001](adr/0001-subscription-login-for-personal-use.md)), `projectsRoot` (default `C:\Projects\personal`).
- Chrome needs `ignore-gpu-blocklist` for hardware WebGL on the target GPU; the README says so ([GPU smoke test](https://github.com/Mo7ammedFawzy/ai-office/issues/2)).

## Rooms

- Rooms are the git repos directly under `projectsRoot` (folders with a `.git`), alphabetical. `.worktrees` is ignored. Discovery runs at startup and on a Refresh button.
- Each Room can be hidden; hidden Rooms drop off the floor and come back from a "hidden · show" chip.

## Agent runner

From [Choose the agent driver](https://github.com/Mo7ammedFawzy/ai-office/issues/4) and [the research](https://github.com/Mo7ammedFawzy/ai-office/blob/research/agent-driver/research/agent-driver.md).

- `server/agent-runner.ts` is the only module that imports `@anthropic-ai/claude-agent-sdk`. It runs one streaming-input `query()` per running Thread and turns SDK messages into Office events: status changed, text, tool in use, Needs-you raised/cleared, Subagent started/progress/finished, turn finished (tokens, cost).
- `query()` options: `cwd` = worktree, `projectConfigRoot` = main checkout, `sessionId` = Thread id on first start and `resume` after, `model`, `canUseTool`, `agentProgressSummaries: true`, `env` = `process.env` without `ANTHROPIC_API_KEY` (unless `apiKey` is configured), plus `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1`.
- Auth: the user's own Claude login by default; optional API key ([ADR 0001](adr/0001-subscription-login-for-personal-use.md)). The Office never reads credentials.

## Permissions

- `canUseTool` decides: an edit tool (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`) whose target path is inside the Thread's worktree is allowed. Everything else that reaches the callback (shell commands, paths outside the worktree, `AskUserQuestion`) raises **Needs-you** and waits for the user.
- A request from a Subagent carries `agentID`; the Office attributes it to that Subagent.

## Threads

From [Thread lifecycle and worktrees](https://github.com/Mo7ammedFawzy/ai-office/issues/7).

- **Start**: prompt, Project, Base branch (default: `origin/HEAD`, else `main`/`master`), model (`sonnet` default, `opus`, `haiku`) _(agent-decided: fixed for the Thread's life)_. The Office makes one UUID: Thread id, SDK `sessionId`, and branch suffix.
- **Worktree**: `git worktree add -b office/<slug>-<id4> C:\Projects\personal\.worktrees\<project>\<slug>-<id4> <base>`, created on first Starting.
- **States**: Queued, Starting, Working, Needs-you, Idle, Done, Stopped, Failed. Only Starting / Working / Needs-you hold one of the `maxRunning` slots; Queued Threads wait at their Room's door, oldest first.
- **Idle** closes the `query()`; the next message resumes the session (or queues).
- **Controls**: reply/steer (composer), Interrupt (Working → Idle), Stop (→ Stopped), Mark done (Idle → Done), Retry / End (Failed), Discard (ended → deletes worktree and branch after confirm).
- **Ending** keeps the branch; removes the worktree only when it has nothing uncommitted.
- **Restart** _(agent-decided)_: on boot, Threads that were Starting / Working / Needs-you become Idle with a system entry "Office restarted during this turn — reply to continue"; their pending request is dropped (the process that asked is gone). Queued stay Queued and are started as slots free.
- **Ended Threads** _(agent-decided)_ leave the floor. The left column has a collapsed "Ended" list (newest first) that opens the drawer read-only, with Discard.

## Panels

From [Side panel and Needs-you prototype](https://github.com/Mo7ammedFawzy/ai-office/issues/8) (variant B, branch `prototype/side-panel`).

- **Left column**: new-Thread box (prompt, Project, Base branch, model, "from Ticket" picker; shows "starts now" or "will queue"), **Needs-you inbox** (one card per waiting Thread across all Rooms, oldest first, answerable in place: Allow/Deny or option buttons), **Activity** feed (latest transcript entries from every Thread, newest first, click to open), **Ended** list.
- **Centre**: the scene, Room tabs with amber Needs-you counts, state counts.
- **Right drawer** (pushes the scene left): header (Room · branch ← Base branch · model · +/− · PR link · tokens and estimated cost _(agent-decided)_), actions, pending request, Subagents section, live transcript, collapsible Changes (per-file diff of `base...branch` including uncommitted work), composer (steers while Working, replies while Idle, counts as Deny with a note while Needs-you).
- **Needs-you outside the scene**: tab title `(N) AI Office`; a browser notification when the tab is hidden and a new Needs-you arrives _(agent-decided; no phone/OS push beyond the browser)_.

## Scene

From [Office floor layout prototype](https://github.com/Mo7ammedFawzy/ai-office/issues/10) (variant A, branch `prototype/floor-layout`), [Art-kit comparison prototype](https://github.com/Mo7ammedFawzy/ai-office/issues/6), [Stations or plain desks](https://github.com/Mo7ammedFawzy/ai-office/issues/11).

- **Art**: Kenney Mini Characters + Kenney Furniture Kit (CC0). A Character's look is picked from the presets by hashing the Thread id (appearance stored as data).
- **Campus**: every visible Room on one floor in a near-square alphabetical grid. A Room is 3 desks wide, starts with 3 desks, adds a row of 3 when full, shrinks back when desks free. A new Thread takes the lowest free desk.
- **Characters** walk in through the door to their desk and walk out when the Thread ends; Queued ones wait inside the door. Typing animation while Working is procedural.
- **Bubbles**: Needs-you is a speech bubble with the request and inline Allow/Deny; Failed shows a red tag; Idle "…your turn" shows only on hover; Working shows a debounced one-word activity tag from the latest tool call (reading, editing, running shell, planning, opening PR).
- **Labels** at each Room's front-left corner: `name · N open threads`, amber "N need you", hide ✕. Clicking a label or floor focuses the Room.
- **Camera**: orthographic isometric; drag pans, right-drag rotates, wheel zooms; focusing flies to the Room; Fit frames the floor; Top (T) toggles a straight-down view.
- **GPU budget**: WebGL only, `frameloop="demand"` with animation capped at ~30 fps, pixel ratio 1, antialias on, no shadows or post-processing.

## Subagents

From [Subagent presentation prototype](https://github.com/Mo7ammedFawzy/ai-office/issues/12) (variant A, branch `prototype/subagents`).

- `task_started` (`task_type: local_agent`, not `ambient`) adds a smaller Character that pops in beside its parent's desk; up to 3 show, then a "+N subagents" tag. Nested ones (`spawn_depth` ≥ 2) are smaller and stand behind.
- Bubble: `<subagent_type> · <task_progress.summary>`, truncated (~180 px). On `task_notification`: ✓ + summary (green) or ✕ failed (red) for ~4 s, then it shrinks away.
- A Subagent's Needs-you bubble sits over the Subagent; the inbox card says "asked by its <type> Subagent".

## Tickets

From [From .scratch ticket to desk](https://github.com/Mo7ammedFawzy/ai-office/issues/9).

- The picker lists `.scratch/<feature>/issues/*.md` in the chosen Project's main checkout with `Status: ready-for-agent` ("show all" reveals others), grouped by feature.
- The prompt points at the file; if the main-checkout file differs from the Base branch tip, its contents are pasted instead. The Thread takes the Ticket's title.
- The Office appends start and final-state lines under `## Comments` in the main-checkout copy; it never changes `Status:`. Starting a Ticket that already has a live Thread warns but is allowed.

## Out of scope

Stations pipeline, GitHub Issues as a Ticket source, avatar customizer, Codex/other agents, agent teams, hosted/remote access, dev-server/test/git buttons. See the map.
