# Simple Memory Setup, Testing, And Debugging

This plugin is currently an in-memory OpenClaw memory plugin. It registers:

- typed hooks: `agent_turn_prepare`, `agent_end`
- tools: `memory_search`, `memory_get`

The current backend is `StubBackend`, so memories live only inside the running
plugin process. Gateway-backed runs share memory until the gateway restarts.
`--local` runs start a fresh embedded process per invocation, so they are useful
for hook smoke tests but not for persistence checks.

## Build

From the repository root:

```bash
cd /home/phani/2026/experimental/openclaw-plugins/simple-memory
npm install
npm run build
```

`npm test` currently exits with "No test files found" unless source tests are
added under `src/**/*.test.ts`.

## Install Or Link The Plugin

Use the OpenClaw binary installed in this package:

```bash
cd /home/phani/2026/experimental/openclaw-plugins
./simple-memory/node_modules/.bin/openclaw plugins install --link ./simple-memory
```

If the plugin was already linked, rebuild after source changes:

```bash
cd /home/phani/2026/experimental/openclaw-plugins/simple-memory
npm run build
```

## Configure OpenClaw

Enable the plugin and select it for the memory slot:

```bash
cd /home/phani/2026/experimental/openclaw-plugins
./simple-memory/node_modules/.bin/openclaw config set plugins.entries.simple-memory.enabled true --strict-json
./simple-memory/node_modules/.bin/openclaw config set plugins.slots.memory '"simple-memory"' --strict-json
```

Allow typed hooks to read conversation content. This is required for `agent_end`
capture in non-bundled plugins:

```bash
./simple-memory/node_modules/.bin/openclaw config set plugins.entries.simple-memory.hooks.allowConversationAccess true --strict-json
```

Validate config:

```bash
./simple-memory/node_modules/.bin/openclaw config validate
```

Restart the gateway after changing plugin code or hook policy:

```bash
./simple-memory/node_modules/.bin/openclaw gateway restart
```

## Verify Registration

Inspect the plugin runtime:

```bash
./simple-memory/node_modules/.bin/openclaw plugins inspect simple-memory --runtime
```

Expected output includes:

```text
Status: loaded

Typed hooks:
agent_end
agent_turn_prepare

Tools:
memory_search
memory_get

Policy:
allowConversationAccess: true
```

List hooks:

```bash
./simple-memory/node_modules/.bin/openclaw hooks list
```

Prefer `plugins inspect simple-memory --runtime` for final truth about typed hook
registration.

## Verify Calls Reach Memory

Tail logs in another terminal:

```bash
./simple-memory/node_modules/.bin/openclaw logs --follow --plain
```

Run a gateway-backed capture turn:

```bash
./simple-memory/node_modules/.bin/openclaw agent \
  --session-key agent:default:memory-gateway-verify \
  --message "My name is Phani and I prefer concise verification replies." \
  --timeout 30
```

Expected log evidence:

```text
agent_turn_prepare recall query="My name is Phani and I prefer concise verification replies." results=0
agent_end capture facts=1
```

Run a gateway-backed recall turn:

```bash
./simple-memory/node_modules/.bin/openclaw agent \
  --session-key agent:default:memory-gateway-verify \
  --message "My name is Phani" \
  --timeout 30
```

Expected log evidence:

```text
agent_turn_prepare recall query="My name is Phani" results=1
```

The model provider may still fail with rate-limit or stream errors. That does
not necessarily mean memory failed. Recall runs before the model request, and
capture runs during agent end handling. Trust the plugin log lines above.

## Local Versus Gateway Runs

This command uses an embedded process:

```bash
./simple-memory/node_modules/.bin/openclaw agent --local \
  --session-key agent:default:memory-local-verify \
  --message "My name is Phani" \
  --timeout 30
```

`--local` can prove the hooks fire, but it cannot prove in-memory persistence
between separate CLI invocations because each invocation creates a fresh plugin
process. Use gateway-backed `openclaw agent` without `--local` for persistence
verification.

## Useful Debug Commands

Inspect runtime state:

```bash
./simple-memory/node_modules/.bin/openclaw plugins inspect simple-memory --runtime --json
```

Check gateway status:

```bash
./simple-memory/node_modules/.bin/openclaw gateway status
```

Read recent logs:

```bash
./simple-memory/node_modules/.bin/openclaw logs --plain --limit 200 --max-bytes 400000
```

Search the log file directly:

```bash
rg "agent_turn_prepare recall|agent_end capture|memory_search query|memory_get id" /tmp/openclaw/openclaw-*.log
```

## Common Problems

### `hook registration missing name`

This happens when using `api.registerHook(...)` as a custom hook without a hook
registration name. For agent lifecycle hooks, use the typed hook surface:

```ts
api.on("agent_turn_prepare", handler);
api.on("agent_end", handler);
```

The current code uses a narrow local `TypedHookApi` type because the installed
SDK runtime exposes `api.on`, while the imported TypeScript facade may not.

### Hook Shows As Custom Hook But Does Not Fire

`api.registerHook(...)` registers a custom hook-pack style hook. The agent
runner calls typed hooks from `registry.typedHooks`, so `agent_turn_prepare` and
`agent_end` must be registered through `api.on(...)`.

### `agent_end` Blocked For Non-Bundled Plugin

Set:

```bash
./simple-memory/node_modules/.bin/openclaw config set plugins.entries.simple-memory.hooks.allowConversationAccess true --strict-json
./simple-memory/node_modules/.bin/openclaw gateway restart
```

Then confirm:

```bash
./simple-memory/node_modules/.bin/openclaw plugins inspect simple-memory --runtime
```

### Tool Contract Diagnostics

If inspect says the plugin must declare tool contracts, make sure
`openclaw.plugin.json` includes:

```json
{
  "contracts": {
    "tools": [
      "memory_search",
      "memory_get"
    ]
  }
}
```

### Recall Always Returns `0`

Check which mode you are using:

- `--local`: memory resets between CLI invocations.
- gateway-backed agent: memory persists until gateway restart.

Also note the search is currently simple substring matching:

```ts
i.content.toLowerCase().includes(query.toLowerCase())
```

So `"My name is Phani"` can match a stored fact containing that exact substring,
while `"what is my name?"` probably will not.

### Memory Disappears After Restart

Expected for the current `StubBackend`. Replace it with a JSON-backed backend if
memory should survive gateway restarts.
