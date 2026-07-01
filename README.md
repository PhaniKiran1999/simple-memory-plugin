# Simple Memory

Simple JSON-backed OpenClaw memory plugin. It stores memory records in a JSON
file and serves them through OpenClaw's memory search/read runtime using lexical
search.

## Configure

```json
{
  "plugins": {
    "slots": {
      "memory": "simple-memory"
    },
    "entries": {
      "simple-memory": {
        "enabled": true,
        "config": {
          "dataFile": ".openclaw-simple-memory/default.json"
        }
      }
    }
  }
}
```

The JSON file can be either an array of records or an object with a `records`
array:

```json
{
  "records": [
    {
      "id": "project-notes",
      "text": "The staging deploy uses the blue environment.",
      "createdAt": "2026-07-01T00:00:00.000Z",
      "tags": ["deploy"]
    }
  ]
}
```

If `dataFile` is omitted, the plugin uses `OPENCLAW_SIMPLE_MEMORY_FILE` or falls
back to `.openclaw-simple-memory/<agent-id>.json`.

## Build

```bash
npm install
npm run plugin:validate
```

`openclaw plugins validate` currently validates simple tool-plugin metadata, so
this memory plugin's validation script runs the TypeScript build and unit tests.
