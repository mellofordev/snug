import { z } from "zod";

import { agentIdSchema, type AgentId, type ChatMessage } from "./agent";

/**
 * Universal Bridge Protocol — normalized streaming events from any coding agent CLI.
 * Provider-specific JSONL is mapped here; the UI consumes folded `ChatMessage`s.
 */
export const agentBridgeEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("session"),
    agentId: agentIdSchema,
    sessionId: z.string(),
    at: z.string()
  }),
  z.object({
    kind: z.literal("assistant_text"),
    text: z.string(),
    at: z.string()
  }),
  z.object({
    kind: z.literal("thinking_text"),
    text: z.string(),
    at: z.string()
  }),
  z.object({
    kind: z.literal("tool_call"),
    correlationId: z.string(),
    name: z.string(),
    input: z.string(),
    at: z.string()
  }),
  z.object({
    kind: z.literal("tool_done"),
    correlationId: z.string(),
    name: z.string(),
    output: z.string(),
    at: z.string()
  }),
  z.object({
    kind: z.literal("shell_command"),
    phase: z.enum(["started", "completed"]),
    correlationId: z.string(),
    command: z.string(),
    output: z.string(),
    exitCode: z.number().nullable(),
    at: z.string()
  })
]);

export type AgentBridgeEvent = z.infer<typeof agentBridgeEventSchema>;

/** Mutable accumulator while folding bridge events into `ChatMessage`s. */
export type AgentBridgeFoldState = {
  messages: ChatMessage[];
  sessionId: string | null;
  openToolByCorrelation: Record<string, { name: string; messageIndex: number }>;
};

export function createEmptyBridgeFoldState(): AgentBridgeFoldState {
  return {
    messages: [],
    sessionId: null,
    openToolByCorrelation: {}
  };
}

/** How far back to look for a duplicate assistant message before pushing a new one. */
const ASSISTANT_DEDUP_WINDOW = 8;

export function foldAgentBridgeEvent(state: AgentBridgeFoldState, event: AgentBridgeEvent): void {
  switch (event.kind) {
    case "session":
      state.sessionId = event.sessionId;
      break;

    case "assistant_text": {
      const text = event.text.trim();
      if (!text) break;
      // Scan recent history for an identical assistant message. Claude Code emits
      // both streaming assistant content blocks and a terminal `result` event that
      // repeats the final answer — without the window scan the final reply gets
      // duplicated whenever a tool call was interleaved between them.
      const start = Math.max(0, state.messages.length - ASSISTANT_DEDUP_WINDOW);
      let duplicate = false;
      for (let i = state.messages.length - 1; i >= start; i--) {
        const m = state.messages[i];
        if (m && m.role === "assistant" && m.content === text) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) break;
      state.messages.push({
        role: "assistant",
        content: text,
        timestamp: event.at
      });
      break;
    }

    case "thinking_text": {
      const text = event.text.trim();
      if (!text) break;
      state.messages.push({ role: "thinking", content: text, timestamp: event.at });
      break;
    }

    case "tool_call": {
      const messageIndex =
        state.messages.push({
          role: "tool",
          content: "",
          toolName: event.name,
          toolInput: event.input,
          timestamp: event.at
        }) - 1;
      state.openToolByCorrelation[event.correlationId] = {
        name: event.name,
        messageIndex
      };
      break;
    }

    case "tool_done": {
      const fromCall = state.openToolByCorrelation[event.correlationId];
      if (fromCall) {
        delete state.openToolByCorrelation[event.correlationId];
      }
      const name = fromCall?.name ?? event.name;
      const output = event.output.trim();
      const prev = fromCall ? state.messages[fromCall.messageIndex] : undefined;
      if (fromCall && prev) {
        // Update the in-place "started" row rather than pushing a second entry.
        // We replace the message object (new reference) so renderers tracking
        // identity can detect the change while earlier snapshots stay intact.
        state.messages[fromCall.messageIndex] = {
          ...prev,
          content: output || "(no output)"
        };
      } else if (output) {
        state.messages.push({
          role: "tool",
          content: output,
          toolName: name,
          timestamp: event.at
        });
      }
      break;
    }

    case "shell_command": {
      const id = event.correlationId;
      if (event.phase === "started") {
        const messageIndex =
          state.messages.push({
            role: "tool",
            content: "",
            toolName: "Shell",
            toolInput: event.command,
            timestamp: event.at
          }) - 1;
        state.openToolByCorrelation[id] = { name: "Shell", messageIndex };
      } else {
        const open = state.openToolByCorrelation[id];
        if (open) delete state.openToolByCorrelation[id];
        const out = event.output.trim();
        const suffix =
          event.exitCode !== null && event.exitCode !== 0
            ? `\n(exit ${event.exitCode})`
            : "";
        const body = out ? `${out}${suffix}` : suffix ? suffix.trim() : "(no output)";
        const prevShell = open ? state.messages[open.messageIndex] : undefined;
        if (open && prevShell) {
          state.messages[open.messageIndex] = {
            ...prevShell,
            content: body
          };
        } else {
          state.messages.push({
            role: "tool",
            content: body,
            toolName: "Shell",
            toolInput: event.command,
            timestamp: event.at
          });
        }
      }
      break;
    }
  }
}
