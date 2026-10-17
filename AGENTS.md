# AGENTS.md

AI Office: local single-user web app driving Claude Code Threads. What to build: `docs/spec.md`. Vocabulary: `GLOSSARY.md`. Decisions: `docs/adr/`. Work items: GitHub issues labelled `ready-for-agent`.

- `server/`: Node + TypeScript run directly with `tsx` (no build step). `server/index.ts` is the HTTP + WebSocket entry; Office data goes through `server/office.ts`.
- `web/`: React + Vite + Tailwind. Live state comes from `/ws` via `web/src/office.ts`; commands are `POST /api/...`.
- Only `server/agent-runner.ts` may import `@anthropic-ai/claude-agent-sdk`.
- Tests: `node:test` files next to the code (`server/*.test.ts`), run with `npm test`. Also run `npm run typecheck`.
- Never point a dev run at real Office data while testing: set `AI_OFFICE_HOME` to a temp folder.
- Never read or print `.env*` files or `~/.claude/.credentials.json`.
