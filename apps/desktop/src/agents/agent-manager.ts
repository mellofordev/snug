import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import type { Agent, AgentId, PromptInput, PromptOutput } from "@acme/contracts";

import { claudeCodeBackend } from "./claude-code";
import { codexBackend } from "./codex";
import { buildAgentEnv } from "./env";
import { locateExecutable } from "./discover";
import { resolveSpawnCommand } from "./resolve-spawn";
import type { AgentBackend } from "./types";

const execFileAsync = promisify(execFile);

const AGENT_ORDER: AgentId[] = ["claude-code", "codex"];

const backendsById: Record<AgentId, AgentBackend> = {
  "claude-code": claudeCodeBackend,
  codex: codexBackend
};

interface RunningEntry {
  child: ChildProcess;
  cancelled: boolean;
  output: PromptOutput;
  onUpdate: (output: PromptOutput) => void;
}

const STOP_GRACE_MS = 2000;

export class AgentManager {
  private readonly resolvedPaths = new Map<AgentId, string>();
  private readonly runningProcesses = new Map<string, RunningEntry>();

  async detectAgents(): Promise<Agent[]> {
    const results: Agent[] = [];
    const env = buildAgentEnv();

    for (const agentId of AGENT_ORDER) {
      const backend = backendsById[agentId];
      const command = backend.command;
      let available = false;
      let agentPath: string | null = null;

      try {
        agentPath = locateExecutable(command, env);
        if (!agentPath) {
          const { stdout } = await execFileAsync("which", [command], { env });
          agentPath = stdout.trim();
        }
        const versionProbe = resolveSpawnCommand(agentPath, ["--version"], env);
        await execFileAsync(versionProbe.file, versionProbe.args, { env });
        available = true;
        this.resolvedPaths.set(agentId, agentPath);
      } catch {
        available = false;
      }

      results.push({
        id: agentId,
        name: backend.displayName,
        available,
        path: agentPath
      });
    }

    return results;
  }

  runPrompt(input: PromptInput, onUpdate: (output: PromptOutput) => void): PromptOutput {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const backend = backendsById[input.agentId];

    const output: PromptOutput = {
      id,
      agentId: input.agentId,
      prompt: input.prompt,
      status: "running",
      output: "",
      messages: [{ role: "user", content: input.prompt, timestamp: startedAt }],
      sessionId: input.sessionId ?? null,
      exitCode: null,
      startedAt
    };

    onUpdate({ ...output });

    const env = buildAgentEnv();
    const binary = this.resolvedPaths.get(input.agentId) ?? backend.command;
    const plan = backend.buildSpawnPlan(input);
    const { file: spawnFile, args: spawnArgs } = resolveSpawnCommand(binary, plan.args, env);

    console.log(`[agent] spawning: ${spawnFile} ${spawnArgs.join(" ")}`);
    console.log(`[agent] cwd: ${input.workingDirectory}`);

    const child = spawn(spawnFile, spawnArgs, {
      cwd: input.workingDirectory,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const entry: RunningEntry = { child, cancelled: false, output, onUpdate };
    this.runningProcesses.set(id, entry);

    if (plan.writePromptToStdin) {
      if (child.stdin) {
        child.stdin.write(input.prompt);
        child.stdin.end();
      }
    } else {
      child.stdin?.end();
    }

    const parser = backend.createParser();
    let stdoutBuffer = "";

    const flushParserToOutput = (): void => {
      if (parser.sessionId) {
        output.sessionId = parser.sessionId;
      }
      output.messages = [
        { role: "user", content: input.prompt, timestamp: startedAt },
        ...parser.messages
      ];
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output.output += text;
      stdoutBuffer += text;

      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        parser.processLine(line);
      }

      flushParserToOutput();
      onUpdate({ ...output });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      console.error(`[agent:stderr] ${text}`);
      output.output += text;
      onUpdate({ ...output });
    });

    child.on("close", (code, signal) => {
      this.runningProcesses.delete(id);
      console.log(`[agent] process closed — code=${code} signal=${signal} session=${parser.sessionId}`);
      console.log(`[agent] parsed messages: ${parser.messages.length}`);

      if (stdoutBuffer.trim()) {
        parser.processLine(stdoutBuffer);
      }

      flushParserToOutput();

      output.exitCode = code ?? (signal ? 1 : 0);
      // User-initiated cancel is reported as `failed` for now (no dedicated
      // state in the schema), but we short-circuit the completed path so a
      // racing zero exit can't mask the cancellation in the UI.
      output.status = entry.cancelled || code !== 0 ? "failed" : "completed";
      onUpdate({ ...output });
    });

    child.on("error", (err) => {
      this.runningProcesses.delete(id);
      console.error(`[agent] spawn error:`, err);
      output.output += `\nError: ${err.message}`;
      output.exitCode = 1;
      output.status = "failed";
      onUpdate({ ...output });
    });

    return output;
  }

  stopPrompt(runId: string): void {
    const entry = this.runningProcesses.get(runId);
    if (!entry) return;
    if (entry.cancelled) return;

    entry.cancelled = true;

    // Give the user immediate UI feedback instead of waiting for the child's
    // `close` event — a stuck or unresponsive agent would otherwise leave the
    // run row spinning on "running" until SIGKILL takes effect.
    entry.output.status = "failed";
    entry.output.output += "\n[stopped by user]";
    entry.onUpdate({ ...entry.output });

    try {
      entry.child.kill("SIGTERM");
    } catch (err) {
      console.error(`[agent] SIGTERM failed:`, err);
    }

    // Escalate to SIGKILL if the child ignores SIGTERM within the grace window.
    const killTimer = setTimeout(() => {
      if (this.runningProcesses.has(runId)) {
        try {
          entry.child.kill("SIGKILL");
        } catch (err) {
          console.error(`[agent] SIGKILL failed:`, err);
        }
      }
    }, STOP_GRACE_MS);
    killTimer.unref();
  }
}
