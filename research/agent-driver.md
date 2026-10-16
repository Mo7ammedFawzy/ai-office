# Research: How to drive Claude Code from the Office

Ticket: [02-agent-driver-research](https://github.com/Mo7ammedFawzy/ai-office/issues/3) · Researched 2026-10-16 against code.claude.com docs (Agent SDK TS v0.3.29x / Claude Code v2.1.29x era).

Two options compared:

- **SDK**: `@anthropic-ai/claude-agent-sdk` (TypeScript) `query()` in the Node backend.
- **CLI**: spawn `claude -p --input-format stream-json --output-format stream-json --verbose` per Thread and parse NDJSON.

The most important fact first: **the SDK is a wrapper around the same CLI binary.** The SDK "runs the Claude Code binary" and bundles a native build of it as an npm optional dependency, and its version tracks the CLI version (SDK v0.3.191 bundles Claude Code v2.1.191) ([overview](https://code.claude.com/docs/en/agent-sdk/overview), [TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)). So auth, sessions, worktrees, and Windows behavior are the same either way. The two options differ in **the control channel**: the SDK gives typed callbacks and control methods, while the raw CLI gives NDJSON plus flags.

## Comparison

| Concern | Agent SDK (TS) | Headless CLI (`-p`, stream-json) |
| :- | :- | :- |
| Auth (technical) | Same credential chain as the CLI. A subscription `/login` works unless you use bare mode | Same. Non-bare `-p` uses the subscription login. `--bare` needs an API key |
| Auth (policy) | Docs tell SDK developers to use API keys. Pro/Max limits "assume ordinary, individual usage of Claude Code and the Agent SDK" | Same policy. Signing in to "the unmodified Claude Code binary with their own Claude subscription" is explicitly allowed |
| Needs-you (permissions) | `canUseTool(toolName, input, {signal, suggestions, toolUseID, agentID, blockedPath, decisionReason, requestId})` → allow/deny. It can wait indefinitely. `AskUserQuestion` uses the same callback | Documented route: `--permission-prompt-tool <mcp tool>`, meaning we would host an MCP server. The stdin control protocol the SDK uses is not documented as a public interface |
| Live status | Typed `SDKMessage` union: assistant/user/result/stream_event/tool_progress/task_*/session_state_changed | The same JSON objects as NDJSON lines (no types). `--include-partial-messages` adds token deltas |
| Steering | `streamInput()` / AsyncIterable prompt queues follow-ups. `interrupt()`, `setPermissionMode()`, `setModel()`, `stopTask()`, `close()` | Write `{"type":"user",...}` lines to stdin to queue messages. Stop: SIGINT ends the turn, SIGTERM kills it (exit 143). Windows has no clean SIGINT for child processes, so this is fragile |
| Resume | `resume: id`, `continue`, `forkSession`, `sessionId`, `listSessions()`, `getSessionMessages()` | `--resume <id or .jsonl path>`, `--continue`, `--session-id`, `--fork-session` |
| Subagents | `task_started` / `task_progress` / `task_updated` / `task_notification`, plus `parent_tool_use_id` and `agent_id` on messages. Optional `agentProgressSummaries` | Same events in the stream. `--forward-subagent-text` adds subagent text |
| Worktree / cwd | `cwd` option. `projectConfigRoot` reads config from the main checkout | Spawn with `cwd`, or `-w <name>` (creates under `.claude/worktrees/`) |
| Effort for us | Low: one npm dependency, typed, documented | Higher: our own NDJSON parser and process control, plus an MCP server for permissions |

## Findings per question

### 1. Auth and billing

**What the code does.** Both paths run the same binary and pick a credential in this documented order ([authentication](https://code.claude.com/docs/en/authentication#authentication-precedence)):

1. Cloud provider env (Bedrock, Vertex, Foundry)
2. `ANTHROPIC_AUTH_TOKEN`
3. `ANTHROPIC_API_KEY` ("In non-interactive mode (`-p`), the key is always used when present")
4. `apiKeyHelper`
5. `CLAUDE_CODE_OAUTH_TOKEN` (one-year token from `claude setup-token`; "requires a Pro, Max, Team, or Enterprise plan")
6. Anthropic profiles
7. Subscription OAuth from `/login`

The docs say `ANTHROPIC_API_KEY` and the other env credentials "apply to the CLI and the surfaces that wrap it, including … the Agent SDK". The same page lists "Terminal, VS Code extension, and Agent SDK logins" as checking claude.ai account logins. So a claude.ai subscription login works through the SDK too.

On Windows, the subscription login is stored at `%USERPROFILE%\.claude\.credentials.json` ([authentication](https://code.claude.com/docs/en/authentication#credential-management)).

**Bare mode is the exception.** `--bare` "never reads OAuth credentials or the system keychain" and does not read `CLAUDE_CODE_OAUTH_TOKEN`, so it requires an API key ([headless](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)). The docs also say bare "will become the default for `-p` in a future release". That is a risk to track if the Office relies on subscription auth.

**Policy, quoted:**

- Agent SDK overview and quickstart: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods … instead." ([overview](https://code.claude.com/docs/en/agent-sdk/overview), [quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart))
- Legal and compliance, "Authentication and credential use" ([legal](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)):
  - "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."
  - "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication … Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens."
  - The section does not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription".
  - "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice."
- Usage policy: "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK." ([legal](https://code.claude.com/docs/en/legal-and-compliance#acceptable-use))

**Reading for the Office.** The Office is a local, single-user tool. The user would run their own unmodified Claude Code with their own login, for themselves. It does not offer login to others, does not route other people's requests, and does not handle credentials (the binary reads its own `.credentials.json`). That matches the "ordinary, individual usage" and "end user signing in to the unmodified binary" wording more closely than the "third-party developer product" wording. But the SDK pages tell SDK builders to use API keys, and the docs never address this exact case (personal tool, own subscription). Treat it as a grey zone, not a clear permission. **Choosing the CLI instead of the SDK does not change the policy position**, because both run the same binary.

Practical cautions:

- Do not leak `ANTHROPIC_API_KEY` into the child environment by accident. It silently wins over the subscription in `-p`.
- The TS SDK's `env` option *replaces* `process.env`, so spread it in.
- `total_cost_usd` is "a local estimate", not a bill ([TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)).

### 2. Permission requests (Needs-you)

**SDK.** `canUseTool` fires when nothing earlier in the permission flow has approved a call: no allow rule, and the mode doesn't auto-approve it. It returns one of:

- `{behavior:"allow", updatedInput?, updatedPermissions?}`
- `{behavior:"deny", message}`

"The callback can stay pending indefinitely". Permission prompts don't time out ([user-input](https://code.claude.com/docs/en/agent-sdk/user-input), [TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)).

The options passed to the callback include:

- `signal`, an AbortSignal for cancellation
- `suggestions`, ready-made "always allow" rules
- `toolUseID`
- `agentID`, set when a subagent asks
- `blockedPath` and `decisionReason`

`AskUserQuestion` (Claude's multiple-choice questions) arrives through the same callback. Answers go back as `updatedInput.answers`. It is "not currently available in subagents".

Caveat: the callback never fires for auto-approved tools. Logic that must see every call belongs in a `PreToolUse` hook.

**Mapping the map's default policy:**

- Use a `default` permission mode plus an allow rule for edits inside the worktree, or `acceptEdits`.
- `acceptEdits` auto-approves writes and common filesystem commands such as `mkdir`, `mv`, and `cp`.
- Every other shell command reaches `canUseTool`, which becomes Needs-you.
- Modes are `default | acceptEdits | bypassPermissions | plan | dontAsk | auto`. `setPermissionMode()` changes the mode mid-run.

**State signal.** With `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1`, the stream emits `system/session_state_changed` with `state: "idle" | "running" | "requires_action"`. `requires_action` means the session is "blocked on an answer to a request it sent your host, such as a permission prompt". That maps directly to Needs-you ([TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)).

**Raw CLI.**

- The documented route is `--permission-prompt-tool <mcp tool>`: an MCP tool we would host that answers each prompt ([CLI reference](https://code.claude.com/docs/en/cli-reference)).
- `--permission-prompts host|none` controls whether anyone is asked at all.
- Without a host, `-p` denies prompts. With stream-json, denials show up as `permission_denied` system messages and in the result's `permission_denials` ([headless](https://code.claude.com/docs/en/headless#turn-off-permission-prompts-in-unattended-runs)).
- The JSON control messages the SDK exchanges over stdin (`control_response` with `requestId`) appear only as SDK internals. I found no public page documenting them for direct use.

### 3. Streaming (live status)

Message types we would use ([TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)):

- **`system/init`**: first event. Carries session_id, model, tools, MCP servers, and a `capabilities` list for feature detection.
- **`assistant`**: wraps an API message with `content[]` text, `tool_use`, and thinking blocks. The current tool is the latest `tool_use` block name and input.
- **`user`**: carries tool results.
- **`stream_event`**: raw token deltas, only with `includePartialMessages` / `--include-partial-messages`. Main session only.
- **`tool_progress`**: `tool_name` and `elapsed_time_seconds`. A heartbeat arrives every 30 s while a main-thread tool runs.
- **`result`**: `subtype` is success or one of the `error_*` values. Also carries:
  - `total_cost_usd` (estimate)
  - `usage` (main loop only)
  - `modelUsage` (all models, cumulative; recommended for accounting)
  - `num_turns`, `duration_ms`, `permission_denials`
- **`system/api_retry`**: `attempt`, `error` category (`rate_limit`, `billing_error`, …) ([headless](https://code.claude.com/docs/en/headless#handle-api-retries)).
- **`system/session_state_changed`**: see question 2.

The CLI emits the same objects as NDJSON when run with `--output-format stream-json --verbose` ([headless](https://code.claude.com/docs/en/headless#stream-responses)).

### 4. Steering and stopping

- **SDK**: streaming input mode (an AsyncIterable `prompt`, or `q.streamInput()`) is "the preferred way". It supports queued messages that "process sequentially, with ability to interrupt".
  - `interrupt()`, `setPermissionMode()`, and `setModel()` are "only available in streaming input mode".
  - `stopTask(taskId)` stops a background task, such as a subagent.
  - `close()` "terminate[s] the underlying process".
  - Sources: [streaming-vs-single-mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode), [TS reference](https://code.claude.com/docs/en/agent-sdk/typescript).
- **CLI**: with `--input-format stream-json`, the CLI reads further user messages from stdin. `--replay-user-messages` echoes them back as an acknowledgement.
  - Stopping uses signals. "send SIGINT, or call the Agent SDK's `interrupt()`" to end a turn cleanly.
  - SIGTERM leaves the turn unfinished, exits with 143, and kills running Bash process trees ([headless](https://code.claude.com/docs/en/headless#stop-a-run-with-sigterm)).
  - Inference (not from the docs): Node on Windows cannot deliver a real SIGINT to a child process, so a clean interrupt in raw CLI mode is a Windows weak spot. The SDK avoids this because `interrupt()` is a control message, not a signal.

### 5. Resume and session storage

- **Session ID**: `session_id` is on `system/init` and on every result. You can also preset one with `sessionId` / `--session-id <uuid>`, so the Office can pick a Thread's id up front.
- **Storage**: transcripts live at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, where every non-alphanumeric character in the absolute cwd becomes `-`. Names longer than 200 characters are truncated and hashed.
- **Resume after a restart**: `resume: id` / `--resume id` works after a backend restart from any directory on the same machine. Since v2.1.223 it looks across projects. `--resume` also accepts the `.jsonl` path.
- **Session APIs**: `listSessions()`, `getSessionMessages()`, `getSessionInfo()`, `renameSession()`, `tagSession()`.
- **`persistSession: false`** turns persistence off.
- Sources: [sessions](https://code.claude.com/docs/en/agent-sdk/sessions), [headless](https://code.claude.com/docs/en/headless#continue-conversations).
- **Long Needs-you waits**: if the backend may die while one is open, the docs suggest a `PreToolUse` hook that returns `defer`, "so the process can exit and resume later from the persisted session" ([user-input](https://code.claude.com/docs/en/agent-sdk/user-input)).
- **Interrupted turns**: a turn killed by the process dying is left as is on resume, unless `CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1` is set ([headless](https://code.claude.com/docs/en/headless#stop-a-run-with-sigterm)).
- **Background tasks after a restart**: `background_tasks_changed` sends nothing at startup. "Reset to an empty set whenever the session's CLI process starts or restarts" ([TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)).

### 6. Subagents

Start, progress, and finish can all be told apart ([subagents](https://code.claude.com/docs/en/agent-sdk/subagents), [TS reference](https://code.claude.com/docs/en/agent-sdk/typescript), [headless](https://code.claude.com/docs/en/headless#follow-subagent-messages)):

- **Spawn**: an `assistant` `tool_use` block with `name: "Agent"`. It appears as `"Task"` in the init tools list and in older versions, so match both. `input.subagent_type` gives the kind.
- **Start**: `system/task_started` carries:
  - `task_id`, `run_id`, `tool_use_id`, `description`
  - `task_type: "local_agent"` for subagents (`local_bash` covers background shells and Monitor watches)
  - `is_backgrounded`
  - `spawn_depth` (1 means spawned by the main thread)
  - `parent_task_id` (nesting)
  - `ambient` (exclude these from activity displays)
- **Progress**: `system/task_progress` carries `usage {total_tokens, tool_uses, duration_ms}`, `last_tool_name`, and `subagent_type`. It also carries `summary`, a one-line progress summary when `agentProgressSummaries: true`. That summary is a natural Character bubble.
- **State changes**: `system/task_updated` sends a patch with `status` = `pending | running | completed | failed | killed`.
- **Finish**: `system/task_notification` carries `status: completed | failed | stopped`, `summary`, and `usage`.
- **Live set**: `system/background_tasks_changed` always carries the full live set. The docs recommend replacing your cached set with it rather than pairing start and finish events.
- **Per-message attribution**: subagent `assistant` and `user` messages carry `parent_tool_use_id` (the Agent `tool_use` id) and, in TS, `agent_id`, which equals the `task_id`. Main-thread messages have `null`.
  - By default only the subagent's tool_use and tool_result blocks are forwarded.
  - `--forward-subagent-text` / `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` adds its text too. The SDK docs call this `forwardSubagentText`.
- **Default mode**: subagents now run in the background by default. Caps are available via env: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3) and `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20), plus `maxBudgetUsd`.
- **Subagent permissions**: subagent permission requests reach `canUseTool` with `agentID` set, so Needs-you can be attributed to the Subagent Character.

Agent teams exist (`--teammate-mode`, [agent-teams](https://code.claude.com/docs/en/agent-teams)). Tasks that teammates launch have no `parent_task_id`. I did not research teams further, because the map lists Subagents (not teams) as MVP.

### 7. Working directory and worktrees

- **Options for cwd**: set `cwd` (SDK) or the spawn cwd (CLI) to a worktree the Office creates with `git worktree add`. Or let Claude Code create one with `--worktree <name>` / `-w`.
- **Where `-w` creates it**: `<repo>/.claude/worktrees/<name>`, on a branch `worktree-<name>`, based on the default remote branch unless `worktree.baseRef: "head"` is set.
- **Cleanup**: `-p` runs get no exit cleanup and leave a git worktree lock in place.
- **Copying gitignored files**: `.worktreeinclude` copies files like `.env`.
- Source for the above: [worktrees](https://code.claude.com/docs/en/worktrees).
- **What a worktree shares with the main checkout**: the `.git` dir, project-scope plugins, and untracked `.claude/skills|agents|commands`.
  - "Don't ask again" Bash approvals normally save to the main checkout's `settings.local.json`. "On Windows … the rule stays with that worktree."
- **Main-checkout config**: SDK `projectConfigRoot` ("Absolute path of the trusted checkout that `cwd` is a worktree of", v2.1.275+) reads settings, `.mcp.json`, and `.claude/` from the main checkout ([TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)).
- **Isolation**: inside a Claude-created worktree, Claude Code blocks edits, commands, and git redirects that target the main checkout ([worktrees](https://code.claude.com/docs/en/worktrees#how-claude-code-enforces-isolation)). The docs say this enforcement applies when the session was started with `--worktree`, entered via `EnterWorktree`, or resumed. They do not say whether a plain `cwd` set to a `git worktree add` checkout gets the same enforcement.
- **Session files**: each worktree path is a different cwd, so each Thread's transcripts land in their own `projects/<encoded-worktree-path>` folder.

### 8. Windows quirks

- **Support**: Windows 10 1809+ is supported natively ([setup](https://code.claude.com/docs/en/setup)).
- **Shell tool**:
  - With Git for Windows installed, the Bash tool uses Git Bash. If it isn't found, set `CLAUDE_CODE_GIT_BASH_PATH`.
  - Without Git for Windows, shell commands go through the PowerShell tool.
  - If neither works, startup fails with `startup_failure_reason: shell_tool_missing` ([TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)).
- **Sandboxing** is not supported on native Windows, only in WSL 2 ([setup](https://code.claude.com/docs/en/setup#set-up-on-windows)). The permission prompts are the only guard, which makes Needs-you more important.
- **Credentials** live at `%USERPROFILE%\.claude\.credentials.json` ([authentication](https://code.claude.com/docs/en/authentication#credential-management)).
- **SDK binary**: the SDK ships the native `win32-x64` binary through optional dependencies. `npm ci --omit=optional` breaks it. The fix is `pathToClaudeCodeExecutable` ([quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)).
- **Worktree removal** no longer follows NTFS junctions or symlinks out of the worktree (fixed in v2.1.205) ([worktrees](https://code.claude.com/docs/en/worktrees#clean-up-worktrees)).
- **stdin**: before v2.1.211, an unreadable stdin on Windows crashed `-p` runs ([headless](https://code.claude.com/docs/en/headless)).
- **No real SIGINT for child processes** (see question 4). This favors the SDK's `interrupt()`.
- **Cross-session messaging** has a separate native-Windows requirement (`verifiedPeerPid` is absent on Windows). It is not relevant to the MVP.

## Recommendation (not a decision)

**Use the Agent SDK (TypeScript) behind the agent-runner seam.** Run one long-lived streaming-input `query()` per Thread, with:

- `cwd` set to the Thread's worktree
- `canUseTool`, which raises Needs-you
- `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1`
- `agentProgressSummaries: true` for Subagent bubbles
- `sessionId` chosen by the Office, so it can resume after a restart

Why:

- It is the same binary as the CLI, so we give up nothing.
- It provides the three things the raw CLI makes hard: a documented, typed permission callback (no MCP server needed), `interrupt()` that works on Windows, and typed messages.

Fallback: if the SDK becomes a problem, spawn the CLI with stream-json and `--permission-prompt-tool`. The seam keeps that switch contained.

**Auth (needs a user decision).** Technically, both options run on the user's own Max/Pro login as long as we avoid `--bare` and keep `ANTHROPIC_API_KEY` out of the child environment.

On policy, the docs allow ordinary individual use of the unmodified binary with your own subscription. They also tell Agent SDK builders to use API keys, and they don't address a personal, local, single-user tool. Two options:

- Accept that grey zone for personal use, never distribute the Office, and never handle credentials ourselves.
- Use an API key from the Claude Console to be clearly within policy (billed per token).

Whichever option is picked should be recorded as an ADR.

## Sources

- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/agent-sdk/quickstart
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/user-input
- https://code.claude.com/docs/en/agent-sdk/sessions
- https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/setup
