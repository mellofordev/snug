import type { PromptInput, PromptOutput } from "@acme/contracts";

import { AgentManager } from "./agents/agent-manager";

const manager = new AgentManager();

export async function detectAgents(): ReturnType<AgentManager["detectAgents"]> {
  return manager.detectAgents();
}

export function runPrompt(
  input: PromptInput,
  onUpdate: (output: PromptOutput) => void
): PromptOutput {
  return manager.runPrompt(input, onUpdate);
}

export function stopPrompt(id: string): void {
  manager.stopPrompt(id);
}
