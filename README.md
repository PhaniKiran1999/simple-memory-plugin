# Simple Memory

Simple OpenClaw memory plugin. It stores memory records in a in-memory object and serves them through OpenClaw's memory search/read and hooks at runtime.

## Build

```bash
npm install
npm run plugin:validate
```

`openclaw plugins validate` currently validates simple tool-plugin metadata, so
this memory plugin's validation script runs the TypeScript build and unit tests.
