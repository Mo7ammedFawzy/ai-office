---
status: accepted
---

# Threads run on the user's own Claude login, with an optional API key

The Office drives Threads through the TypeScript Agent SDK. By default, those Threads use the Claude Pro/Max login the local `claude` binary already has, instead of a Console API key. Anthropic's terms allow "ordinary, individual usage" of the Agent SDK and allow a user to sign in to the unmodified binary with their own subscription. The SDK docs, however, tell developers building products to use API keys. A personal, single-user, local tool isn't addressed by either, so this is a known grey zone that was accepted on purpose to avoid per-token billing.

## Consequences

- The Office is never distributed or offered to anyone else.
- The Office never reads, stores, or forwards credentials. The binary reads its own login.
- The Office strips any `ANTHROPIC_API_KEY` from a Thread's environment unless an API key is set in the Office's own config. In headless mode an environment key silently overrides the login.
- Switching to an API key (for example if Anthropic enforces the restriction, or `--bare` becomes the default for headless runs) is a config change only.
