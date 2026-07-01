# OpenClaw Custom Memory Plugin Tutorial

## Objective

Build a **custom OpenClaw Memory Plugin** from scratch for **OpenClaw 2026.6.11**, understanding every component instead of copying `memory-core`.

The goal is to implement our own memory backend (initially JSON-based, later extensible to SQLite/Postgres/Qdrant/etc.).

---

# Environment

OpenClaw Version

```
OpenClaw 2026.6.11 (e085fa1)
```

Installed globally via npm.

---

# What we learned

We reverse engineered the built-in `memory-core` plugin.

### Plugin Manifest

`openclaw.plugin.json`

```json
{
  "id": "memory-core",
  "kind": "memory",
  "activation": {
    "onStartup": false
  }
}
```

Important discovery:

```
kind = "memory"
```

is what makes OpenClaw treat it as the exclusive Memory Plugin.

---

### Plugin Entry

Built-in plugin uses

```ts
definePluginEntry({
    id,
    name,
    description,
    kind: "memory",

    register(api) {

        api.registerMemoryCapability(...)

        api.registerTool(...)

        api.registerCommand(...)

        api.registerCli(...)
    }
})
```

We decided **not** to copy `memory-core`, but instead build our own implementation against the public SDK.

---

### Memory Runtime

We found

```ts
const memoryRuntime = {
    async getMemorySearchManager(...)
    resolveMemoryBackendConfig(...)
    async closeAllMemorySearchManagers(...)
    async closeMemorySearchManager(...)
}
```

This runtime is only a proxy.

Actual implementation lives elsewhere.

We intentionally stopped reverse engineering there.

---

# Plugin Created

Project:

```
openclaw-plugin-simple-memory/

package.json
tsconfig.json
openclaw.plugin.json

src/
    index.ts

dist/
    index.js
```

---

## openclaw.plugin.json

```json
{
  "id": "simple-memory",
  "kind": "memory",
  "activation": {
    "onStartup": false
  }
}
```

---

## package.json

Important parts:

```json
{
  "type": "module",

  "scripts": {
    "build": "tsc -p tsconfig.json"
  },

  "peerDependencies": {
    "openclaw": ">=2026.5.17"
  },

  "devDependencies": {
    "openclaw": "^2026.6.11"
  },

  "openclaw": {
    "extensions": [
      "./dist/index.js"
    ]
  }
}
```

---

## tsconfig.json

Final working version

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": false,
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

We disabled declaration generation because TS2742 occurred due to inferred internal SDK types.

---

## SDK Import

Correct import is

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
```

NOT

```ts
openclaw/plugin-sdk
```

---

## Current src/index.ts

A minimal plugin that successfully loads:

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
    id: "simple-memory",

    name: "Simple Memory",

    description: "Add Simple Memory tools to OpenClaw.",

    register(api) {
        api.logger.info("Simple Memory Plugin Loaded");
    }
});
```

---

# Build

```
npm run build
```

Works successfully.

---

# Installation

Installed using

```
openclaw plugins install --link .
```

Output:

```
Exclusive slot "memory" switched from "memory-core" to "simple-memory"
Linked plugin path...
```

---

# Runtime Verification

After restarting OpenClaw

Plugin successfully loads.

Startup log:

```
Simple Memory Plugin Loaded
```

Plugin list shows:

```
Simple Memory
ID: simple-memory
enabled
```

Therefore we have confirmed:

* Plugin discovery works
* Plugin manifest works
* Plugin SDK import works
* definePluginEntry works
* register(api) executes
* Plugin replaces memory-core successfully

---

# Important Discovery

`openclaw plugins build`

and

`openclaw plugins validate`

are ONLY for **Simple Tool Plugins**.

They are **NOT** applicable to SDK Memory Plugins.

Therefore we no longer use those commands.

---

# Current Status

Infrastructure is complete.

We are ready to implement the first real memory functionality.

---

# Continue From Step 16

Next task:

Discover the public SDK definition of

```ts
api.registerMemoryCapability(...)
```

Need to inspect the SDK type definitions rather than reverse engineer `memory-core`.

Run:

```bash
grep -R "registerMemoryCapability" ~/.nvm/versions/node/v24.18.0/lib/node_modules/openclaw/dist
```

Find the `.d.ts` definition and understand:

* signature of `registerMemoryCapability`
* required capability interface
* runtime interface

Then begin implementing:

```
SimpleMemoryPlugin
        ↓
registerMemoryCapability(...)
        ↓
SimpleMemoryRuntime
        ↓
JsonMemoryStore
        ↓
memory.json
```

with the roadmap:

1. Empty memory capability
2. JSON storage
3. save()
4. search()
5. get()
6. update()
7. delete()
8. Optional embeddings later

---
