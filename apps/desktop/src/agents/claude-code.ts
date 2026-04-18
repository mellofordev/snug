import type { PromptInput } from "@acme/contracts";
import {
  type AgentBridgeEvent,
  createEmptyBridgeFoldState,
  foldAgentBridgeEvent,
  type AgentBridgeFoldState
} from "@acme/contracts";

import type { AgentBackend, AgentStreamParser } from "./types";

export function mapClaudeStreamJsonToBridgeEvents(
  event: Record<string, unknown>
): AgentBridgeEvent[] {
  const at = new Date().toISOString();
  const type = event.type as string | undefined;
  if (!type) return [];

  switch (type) {
    case "system": {
      const sessionId = event.session_id as string | undefined;
      if (!sessionId) return [];
      return [{ kind: "session", agentId: "claude-code", sessionId, at }];
    }

    case "assistant": {
      const out: AgentBridgeEvent[] = [];
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!content) return [];

      for (const block of content) {
        const blockType = block.type as string;
        if (blockType === "thinking") {
          const t = (block.thinking as string) ?? "";
          if (t.trim()) out.push({ kind: "thinking_text", text: t, at });
        } else if (blockType === "text") {
          const t = (block.text as string) ?? "";
          if (t.trim()) out.push({ kind: "assistant_text", text: t, at });
        } else if (blockType === "tool_use") {
          const name = (block.name as string) ?? "Tool";
          const input = block.input ? JSON.stringify(block.input, null, 2) : "";
          const id =
            (block.id as string | undefined) ??
            `claude_tool_${out.length}_${Date.now().toString(36)}`;
          out.push({ kind: "tool_call", correlationId: id, name, input, at });
        }
      }
      return out;
    }

    case "user": {
      const out: AgentBridgeEvent[] = [];
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!content) return [];

      for (const block of content) {
        if ((block.type as string) === "tool_result") {
          // `tool_result.content` per the Anthropic API can be a plain string OR
          // an array of content blocks (text/image). Coerce both shapes into a
          // single string so the fold's `output.trim()` never crashes on arrays.
          const raw = block.content;
          let output = "";
          if (typeof raw === "string") {
            output = raw;
          } else if (Array.isArray(raw)) {
            output = raw
              .map((b) => {
                if (b && typeof b === "object") {
                  const rec = b as Record<string, unknown>;
                  if (rec.type === "text") {
                    return typeof rec.text === "string" ? rec.text : "";
                  }
                }
                return "";
              })
              .join("");
          }
          const toolUseId = (block.tool_use_id as string) ?? "";
          if (output.trim() && toolUseId) {
            out.push({
              kind: "tool_done",
              correlationId: toolUseId,
              name: "Result",
              output,
              at
            });
          }
        }
      }
      return out;
    }

    case "result":
      // The `assistant` content blocks already contain the final answer; emitting
      // here would duplicate it (the fold's dedup window covers only the recent
      // history, so a tool call interleaved between the assistant block and the
      // terminal `result` would slip through).
      return [];

    default:
      return [];
  }
}

class ClaudeHeadlessStreamParser implements AgentStreamParser {
  private readonly fold: AgentBridgeFoldState = createEmptyBridgeFoldState();

  get messages() {
    return this.fold.messages;
  }

  get sessionId() {
    return this.fold.sessionId;
  }

  processLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    for (const bridge of mapClaudeStreamJsonToBridgeEvents(event)) {
      foldAgentBridgeEvent(this.fold, bridge);
    }
  }
}

function buildArgs(systemPrompt?: string, sessionId?: string): string[] {
  const args = ["-p", "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose"];
  if (sessionId) {
    args.push("--resume", sessionId);
  }
  if (systemPrompt) {
    args.push("--system-prompt", systemPrompt);
  }
  return args;
}

export const claudeCodeBackend: AgentBackend = {
  id: "claude-code",
  displayName: "Claude Code",
  command: "claude",
  buildSpawnPlan(input: PromptInput) {
    return {
      args: buildArgs(input.systemPrompt, input.sessionId),
      writePromptToStdin: true
    };
  },
  createParser() {
    return new ClaudeHeadlessStreamParser();
  }
};
