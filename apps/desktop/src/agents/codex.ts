import type { PromptInput } from "@acme/contracts";
import {
  type AgentBridgeEvent,
  createEmptyBridgeFoldState,
  foldAgentBridgeEvent,
  type AgentBridgeFoldState
} from "@acme/contracts";

import type { AgentBackend, AgentStreamParser } from "./types";

/** Map `codex exec --json` JSONL into UBP (item.*, legacy shapes, plain text). */
export function mapCodexExecJsonToBridgeEvents(event: Record<string, unknown>): AgentBridgeEvent[] {
  const at = new Date().toISOString();
  const type = event.type as string | undefined;

  if (type === "thread.started") {
    const threadId = event.thread_id as string | undefined;
    if (threadId) {
      return [{ kind: "session", agentId: "codex", sessionId: threadId, at }];
    }
    return [];
  }

  if (type === "item.started" || type === "item.completed") {
    const item = event.item as Record<string, unknown> | undefined;
    if (!item) return [];

    const itemType = item.type as string | undefined;
    const id = String(item.id ?? "");

    if (itemType === "command_execution") {
      const command = String(item.command ?? "");
      const output = String(item.aggregated_output ?? "");
      const exitRaw = item.exit_code;
      const exitCode =
        exitRaw === null || exitRaw === undefined ? null : Number(exitRaw);

      if (type === "item.started") {
        return [
          {
            kind: "shell_command",
            phase: "started",
            correlationId: id,
            command,
            output,
            exitCode,
            at
          }
        ];
      }
      return [
        {
          kind: "shell_command",
          phase: "completed",
          correlationId: id,
          command,
          output,
          exitCode,
          at
        }
      ];
    }

    if (itemType === "agent_message" && type === "item.completed") {
      const text = String(item.text ?? "").trim();
      if (text) return [{ kind: "assistant_text", text, at }];
    }

    return [];
  }

  // Legacy / alternate Codex shapes (non-item JSON)
  if (type === "message") {
    const role = event.role as string | undefined;
    const content = String(event.content ?? "").trim();
    if (role === "assistant" && content) {
      return [{ kind: "assistant_text", text: content, at }];
    }
    return [];
  }

  if (type === "function_call" || type === "tool_use") {
    const name = (event.name as string) ?? (event.function as string) ?? "Tool";
    const args = event.arguments ?? event.input ?? "";
    const input = typeof args === "string" ? args : JSON.stringify(args, null, 2);
    // Prefer the real call id so tool_done can correlate back to its tool_call.
    const cid = String(
      event.call_id ?? event.id ?? `codex_${type}_${Date.now().toString(36)}`
    );
    return [{ kind: "tool_call", correlationId: cid, name, input, at }];
  }

  if (type === "function_call_output" || type === "tool_result") {
    const raw = event.output ?? event.content;
    const output = raw == null ? "" : String(raw).trim();
    if (!output) return [];
    const cid = String(
      event.call_id ?? event.id ?? `codex_orphan_${Date.now().toString(36)}`
    );
    return [
      {
        kind: "tool_done",
        correlationId: cid,
        name: "Result",
        output,
        at
      }
    ];
  }

  const fallback =
    String((event.content as string) ?? (event.text as string) ?? "").trim() ||
    (typeof event.message === "string" ? event.message.trim() : "");
  if (fallback) {
    return [{ kind: "assistant_text", text: fallback, at }];
  }

  return [];
}

class CodexHeadlessStreamParser implements AgentStreamParser {
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
      // Non-JSON lines from `codex exec --json` are banner/progress noise.
      // Surfacing them as assistant messages pollutes the chat, so drop them.
      return;
    }

    for (const bridge of mapCodexExecJsonToBridgeEvents(event)) {
      foldAgentBridgeEvent(this.fold, bridge);
    }
  }
}

function buildArgs(prompt: string, sessionId?: string): string[] {
  const newSessionFlags = ["--full-auto", "--json", "--color", "never", "--skip-git-repo-check"];
  if (sessionId) {
    // `codex exec resume` accepts a narrower flag set than `codex exec` (no `--color` here).
    return ["exec", "resume", "--full-auto", "--json", "--skip-git-repo-check", sessionId, prompt];
  }
  return ["exec", ...newSessionFlags, prompt];
}

export const codexBackend: AgentBackend = {
  id: "codex",
  displayName: "Codex",
  command: "codex",
  buildSpawnPlan(input: PromptInput) {
    return {
      args: buildArgs(input.prompt, input.sessionId),
      writePromptToStdin: false
    };
  },
  createParser() {
    return new CodexHeadlessStreamParser();
  }
};
