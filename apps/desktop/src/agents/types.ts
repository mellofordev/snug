import type { AgentId, ChatMessage, PromptInput } from "@acme/contracts";

/** Accumulates provider-specific stream lines into shared `ChatMessage`s. */
export interface AgentStreamParser {
  messages: ChatMessage[];
  sessionId: string | null;
  processLine(line: string): void;
}

export interface AgentSpawnPlan {
  args: string[];
  /** Headless Claude Code: prompt on stdin. Codex headless: prompt usually in argv. */
  writePromptToStdin: boolean;
}

/** One installed CLI backend (Claude Code, Codex, …). */
export interface AgentBackend {
  readonly id: AgentId;
  readonly displayName: string;
  /** Binary name for `which` when no override is set */
  readonly command: string;
  buildSpawnPlan(input: PromptInput): AgentSpawnPlan;
  createParser(): AgentStreamParser;
}
