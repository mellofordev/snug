import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import type { Agent, AgentId, ChatMessage, PromptInput, PromptOutput } from "@acme/contracts";

const execFileAsync = promisify(execFile);

// Expand PATH to include common install locations for CLI tools
function buildEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/opt/homebrew/bin",
    `${process.env.HOME}/.npm-global/bin`,
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.nvm/versions/node/current/bin`
  ].join(":");

  return {
    ...process.env,
    PATH: `${extraPaths}:${process.env.PATH ?? ""}`,
    FORCE_COLOR: "0",
    NO_COLOR: "1"
  };
}

const AGENT_COMMANDS: Record<AgentId, { command: string }> = {
  "claude-code": { command: "claude" }
};

// Cache resolved binary paths from detection
const resolvedPaths = new Map<AgentId, string>();

export async function detectAgents(): Promise<Agent[]> {
  const results: Agent[] = [];
  const env = buildEnv();

  for (const [id] of Object.entries(AGENT_COMMANDS)) {
    const agentId = id as AgentId;
    const command = AGENT_COMMANDS[agentId].command;
    let available = false;
    let agentPath: string | null = null;

    try {
      const { stdout } = await execFileAsync("which", [command], { env });
      agentPath = stdout.trim();
      await execFileAsync(agentPath, ["--version"], { env });
      available = true;
      resolvedPaths.set(agentId, agentPath);
    } catch {
      available = false;
    }

    const names: Record<AgentId, string> = {
      "claude-code": "Claude Code"
    };

    results.push({ id: agentId, name: names[agentId], available, path: agentPath });
  }

  return results;
}

const runningProcesses = new Map<string, ChildProcess>();

// ── Stream JSON parser ──────────────────────────────────────────────────

/**
 * Parse Claude CLI `--output-format stream-json` events into ChatMessage array.
 *
 * Each line is a complete JSON object. The CLI emits these event types:
 *   - { type: "system", subtype: "init", ... }
 *   - { type: "assistant", message: { content: [{ type: "text"|"tool_use"|"thinking", ... }] } }
 *   - { type: "user", message: { content: [{ type: "tool_result", ... }] } }
 *   - { type: "result", subtype: "success", result: "..." }
 *
 * Each "assistant" event contains already-complete content blocks (not deltas).
 */
class StreamParser {
  messages: ChatMessage[] = [];
  sessionId: string | null = null;

  processLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = event.type as string | undefined;
    if (!type) return;

    const now = new Date().toISOString();

    switch (type) {
      case "system": {
        const sessionId = event.session_id as string | undefined;
        if (sessionId) {
          this.sessionId = sessionId;
        }
        break;
      }

      case "assistant": {
        const message = event.message as Record<string, unknown> | undefined;
        if (!message) break;

        const content = message.content as Array<Record<string, unknown>> | undefined;
        if (!content) break;

        for (const block of content) {
          const blockType = block.type as string;

          if (blockType === "thinking") {
            const thinking = (block.thinking as string) ?? "";
            if (thinking.trim()) {
              this.messages.push({ role: "thinking", content: thinking, timestamp: now });
            }
          } else if (blockType === "text") {
            const text = (block.text as string) ?? "";
            if (text.trim()) {
              this.messages.push({ role: "assistant", content: text, timestamp: now });
            }
          } else if (blockType === "tool_use") {
            const toolName = (block.name as string) ?? "Tool";
            const toolInput = block.input ? JSON.stringify(block.input, null, 2) : "";
            this.messages.push({
              role: "tool",
              content: "",
              toolName,
              toolInput,
              timestamp: now
            });
          }
        }
        break;
      }

      case "user": {
        // Tool results from the CLI — show as tool response
        const message = event.message as Record<string, unknown> | undefined;
        if (!message) break;

        const content = message.content as Array<Record<string, unknown>> | undefined;
        if (!content) break;

        for (const block of content) {
          const blockType = block.type as string;
          if (blockType === "tool_result") {
            const resultContent = (block.content as string) ?? "";
            const toolUseId = (block.tool_use_id as string) ?? "";
            // Find the matching tool call to get the name
            const matchingTool = [...this.messages].reverse().find(
              (m) => m.role === "tool" && !m.content
            );
            if (resultContent.trim()) {
              this.messages.push({
                role: "tool",
                content: resultContent,
                toolName: matchingTool?.toolName ?? "Result",
                timestamp: now
              });
            }
          }
        }
        break;
      }

      case "result": {
        const result = (event.result as string) ?? "";
        if (result.trim()) {
          // Check if this result text is already in the last assistant message
          const lastAssistant = [...this.messages].reverse().find((m) => m.role === "assistant");
          if (!lastAssistant || lastAssistant.content !== result) {
            this.messages.push({ role: "assistant", content: result, timestamp: now });
          }
        }
        break;
      }
    }
  }
}

// ── Prompt execution ────────────────────────────────────────────────────

export function runPrompt(
  input: PromptInput,
  onUpdate: (output: PromptOutput) => void
): PromptOutput {
  const id = randomUUID();
  const startedAt = new Date().toISOString();

  const output: PromptOutput = {
    id,
    agentId: input.agentId,
    prompt: input.prompt,
    status: "running",
    output: "",
    messages: [
      { role: "user", content: input.prompt, timestamp: startedAt }
    ],
    sessionId: input.sessionId ?? null,
    exitCode: null,
    startedAt
  };

  onUpdate({ ...output });

  // Use cached full path if available, otherwise fall back to command name
  const binary = resolvedPaths.get(input.agentId) ?? AGENT_COMMANDS[input.agentId].command;
  const args = buildArgs(input.agentId, input.systemPrompt, input.sessionId);

  console.log(`[agent] spawning: ${binary} ${args.join(" ")}`);
  console.log(`[agent] cwd: ${input.workingDirectory}`);

  const child = spawn(binary, args, {
    cwd: input.workingDirectory,
    env: buildEnv(),
    stdio: ["pipe", "pipe", "pipe"]
  });

  runningProcesses.set(id, child);

  // Feed prompt via stdin then close it
  if (child.stdin) {
    child.stdin.write(input.prompt);
    child.stdin.end();
  }

  const parser = new StreamParser();
  let stdoutBuffer = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output.output += text;
    stdoutBuffer += text;

    // Process complete lines
    const lines = stdoutBuffer.split("\n");
    // Keep the last incomplete line in the buffer
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      parser.processLine(line);
    }

    // Update session ID if captured
    if (parser.sessionId) {
      output.sessionId = parser.sessionId;
    }

    // Always keep user message first
    output.messages = [
      { role: "user", content: input.prompt, timestamp: startedAt },
      ...parser.messages
    ];

    onUpdate({ ...output });
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    console.error(`[agent:stderr] ${text}`);
    output.output += text;
    onUpdate({ ...output });
  });

  child.on("close", (code, signal) => {
    runningProcesses.delete(id);
    console.log(`[agent] process closed — code=${code} signal=${signal} session=${parser.sessionId}`);
    console.log(`[agent] parsed messages: ${parser.messages.length}`);

    // Process any remaining buffer
    if (stdoutBuffer.trim()) {
      parser.processLine(stdoutBuffer);
    }

    if (parser.sessionId) {
      output.sessionId = parser.sessionId;
    }

    output.messages = [
      { role: "user", content: input.prompt, timestamp: startedAt },
      ...parser.messages
    ];

    output.exitCode = code ?? (signal ? 1 : 0);
    output.status = code === 0 ? "completed" : "failed";
    onUpdate({ ...output });
  });

  child.on("error", (err) => {
    runningProcesses.delete(id);
    console.error(`[agent] spawn error:`, err);
    output.output += `\nError: ${err.message}`;
    output.exitCode = 1;
    output.status = "failed";
    onUpdate({ ...output });
  });

  return output;
}

function buildArgs(agentId: AgentId, systemPrompt?: string, sessionId?: string): string[] {
  switch (agentId) {
    case "claude-code": {
      const args = ["-p", "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose"];
      if (sessionId) {
        args.push("--resume", sessionId);
      }
      if (systemPrompt) {
        args.push("--system-prompt", systemPrompt);
      }
      return args;
    }
  }
}

export function stopPrompt(id: string): void {
  const child = runningProcesses.get(id);
  if (child) {
    child.kill("SIGTERM");
    runningProcesses.delete(id);
  }
}
