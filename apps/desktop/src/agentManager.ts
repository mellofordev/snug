import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import type { Agent, AgentId, PromptInput, PromptOutput } from "@acme/contracts";

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
    exitCode: null,
    startedAt
  };

  onUpdate({ ...output });

  // Use cached full path if available, otherwise fall back to command name
  const binary = resolvedPaths.get(input.agentId) ?? AGENT_COMMANDS[input.agentId].command;
  const args = buildArgs(input.agentId, input.systemPrompt);

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

  child.stdout?.on("data", (chunk: Buffer) => {
    output.output += chunk.toString();
    onUpdate({ ...output });
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    output.output += chunk.toString();
    onUpdate({ ...output });
  });

  child.on("close", (code, signal) => {
    runningProcesses.delete(id);
    output.exitCode = code ?? (signal ? 1 : 0);
    output.status = code === 0 ? "completed" : "failed";
    onUpdate({ ...output });
  });

  child.on("error", (err) => {
    runningProcesses.delete(id);
    output.output += `\nError: ${err.message}`;
    output.exitCode = 1;
    output.status = "failed";
    onUpdate({ ...output });
  });

  return output;
}

function buildArgs(agentId: AgentId, systemPrompt?: string): string[] {
  switch (agentId) {
    case "claude-code": {
      const args = ["-p", "--dangerously-skip-permissions"];
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
