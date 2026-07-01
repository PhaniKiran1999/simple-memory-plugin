// hook-triggered-memory-plugin.ts
//
// Approach: HOOK-TRIGGERED + PLUGIN JUDGMENT
// The plugin runs on every turn regardless of what the model chooses to do.
// - Before the LLM call: an auto-recall hook searches memory and injects
//   relevant results into context. The LLM never calls a tool for this.
// - After the LLM call: an auto-capture hook reads the finished turn and
//   decides, on its own, what's worth storing.
//
// This still keeps optional explicit tools (memory_search / memory_get) for
// cases where the agent wants to look something up mid-reasoning, but the
// core recall/capture behavior does NOT depend on the model calling them.
//
// NOTE: hook names (onBeforeModelCall / onAfterTurn) and the
// prependSystemContext mechanism are illustrative of the pattern
// third-party memory plugins use (e.g. auto-recall via system-context
// injection, auto-capture via post-turn transcript scanning). Confirm the
// exact hook lifecycle names against openclaw/plugin-sdk's current API
// before wiring this up — treat this as a structural template, not a
// verified-against-source implementation.

import {
  definePluginEntry,
  type AnyAgentTool,
} from "openclaw/plugin-sdk/core";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// 1. Storage backend (same interface as the explicit-trigger version)
// ---------------------------------------------------------------------------

interface MemoryItem {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface MemoryBackend {
  search(query: string, limit: number): Promise<MemoryItem[]>;
  get(id: string): Promise<MemoryItem | null>;
  save(content: string, metadata: Record<string, unknown>): Promise<MemoryItem>;
}

class StubBackend implements MemoryBackend {
  private items: MemoryItem[] = [];

  async search(query: string, limit: number) {
    const q = query.toLowerCase();
    return this.items
      .filter((i) => i.content.toLowerCase().includes(q))
      .slice(0, limit);
  }

  async get(id: string) {
    return this.items.find((i) => i.id === id) ?? null;
  }

  async save(content: string, metadata: Record<string, unknown>) {
    const item: MemoryItem = {
      id: crypto.randomUUID(),
      content,
      metadata,
      createdAt: new Date().toISOString(),
    };
    this.items.push(item);
    return item;
  }
}

// ---------------------------------------------------------------------------
// 2. Judgment logic for capture — same idea as shouldStore() before, but now
//    it runs against a whole turn's transcript instead of one offered string.
// ---------------------------------------------------------------------------

interface TurnRecord {
  userMessage: string;
  assistantMessage: string;
}

interface ExtractedFact {
  content: string;
  metadata: Record<string, unknown>;
}

type MemorySearchArgs = {
  query: string;
  limit?: number;
};

type MemoryGetArgs = {
  id: string;
};

type AgentTurnPrepareEvent = {
  prompt: string;
};

type AgentTurnPrepareResult = {
  prependContext?: string;
  appendContext?: string;
};

type AgentEndEvent = {
  messages: unknown[];
};

type TypedHookApi = {
  on(
    hookName: "agent_turn_prepare",
    handler: (event: AgentTurnPrepareEvent, ctx: unknown) => Promise<AgentTurnPrepareResult | void> | AgentTurnPrepareResult | void,
    opts?: { priority?: number },
  ): void;
  on(
    hookName: "agent_end",
    handler: (event: AgentEndEvent, ctx: unknown) => Promise<void> | void,
    opts?: { priority?: number },
  ): void;
};

const MemorySearchParams = Type.Object({
  query: Type.String(),
  limit: Type.Optional(Type.Number()),
});

const MemoryGetParams = Type.Object({
  id: Type.String(),
});

function textResult(text: string, details: unknown) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function stringifyToolDetails(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractLastMessageText(messages: unknown[], role: "user" | "assistant"): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message &&
      typeof message === "object" &&
      "role" in message &&
      message.role === role &&
      "content" in message
    ) {
      const text = extractTextContent(message.content);
      if (text.trim()) return text.trim();
    }
  }

  return "";
}

// Your extraction/judgment logic: decide what (if anything) from this turn
// is worth persisting. Could be rule-based, could call a small classifier,
// could run a structured-extraction prompt against your own model — this
// plugin owns that decision, not the agent.
async function extractWorthyFacts(turn: TurnRecord): Promise<ExtractedFact[]> {
  const facts: ExtractedFact[] = [];
  const signalWords = ["prefer", "always", "never", "my name is", "i live"];

  const combined = `${turn.userMessage}`.toLowerCase();
  const hit = signalWords.find((w) => combined.includes(w));

  if (hit) {
    facts.push({
      content: turn.userMessage.trim(),
      metadata: { source: "auto-capture", triggeredBy: hit },
    });
  }

  return facts;
}

// ---------------------------------------------------------------------------
// 3. Plugin registration
// ---------------------------------------------------------------------------

export default definePluginEntry({
  id: "simple-memory",
  name: "Simple Memory",
  description: "Memory plugin that recalls before and captures after every turn, independent of tool calls",
  kind: "memory",

  register(api) {
    const typedHooks = api as typeof api & TypedHookApi;
    const backend: MemoryBackend = new StubBackend();

    // Optional explicit tools — still useful for on-demand lookups mid-reply,
    // but NOT what drives the core recall/capture behavior below.
    const memorySearchTool: AnyAgentTool = {
      name: "memory_search",
      label: "Memory Search",
      description: "Manually search stored memories relevant to a query",
      parameters: MemorySearchParams,
      execute: async (_toolCallId, rawArgs) => {
        const args = rawArgs as MemorySearchArgs;
        const results = await backend.search(args.query, args.limit ?? 5);
        api.logger.info(`memory_search query=${JSON.stringify(args.query)} results=${results.length}`);
        return textResult(stringifyToolDetails({ results }), { results });
      },
    };

    const memoryGetTool: AnyAgentTool = {
      name: "memory_get",
      label: "Memory Get",
      description: "Fetch a specific memory item by id",
      parameters: MemoryGetParams,
      execute: async (_toolCallId, rawArgs) => {
        const args = rawArgs as MemoryGetArgs;
        const item = await backend.get(args.id);
        api.logger.info(`memory_get id=${JSON.stringify(args.id)} found=${item !== null}`);
        return textResult(stringifyToolDetails({ item }), { item });
      },
    };

    api.registerTool(memorySearchTool);
    api.registerTool(memoryGetTool);

    // --- AUTO-RECALL --------------------------------------------------
    // Fires before the LLM sees the user's message. No tool call involved —
    // results get injected straight into context.
    typedHooks.on("agent_turn_prepare", async (event): Promise<AgentTurnPrepareResult | void> => {
      const userMessage = event.prompt;
      const relevant = await backend.search(userMessage, 5);
      api.logger.info(`agent_turn_prepare recall query=${JSON.stringify(userMessage)} results=${relevant.length}`);

      if (relevant.length === 0) return;

      const contextBlock = relevant
        .map((item) => `- ${item.content}`)
        .join("\n");

      return {
        prependContext: `Relevant memories:\n${contextBlock}`,
      };
    });

    // --- AUTO-CAPTURE ---------------------------------------------------
    // Fires after the LLM has replied. Reads the finished turn and decides,
    // via the plugin's own logic, what (if anything) to store.
    typedHooks.on("agent_end", async (event) => {
      const turn: TurnRecord = {
        userMessage: extractLastMessageText(event.messages, "user"),
        assistantMessage: extractLastMessageText(event.messages, "assistant"),
      };

      const facts = await extractWorthyFacts(turn);
      for (const fact of facts) {
        await backend.save(fact.content, fact.metadata);
      }
      api.logger.info(`agent_end capture facts=${facts.length}`);
    });
  },
});
