import type { Agent, AgentId } from "@acme/contracts";
import {
  ArrowDown01Icon,
  PlayIcon,
  Rocket01FreeIcons,
  StopIcon
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

interface ComposerProps {
  prompt: string;
  workingDirectory: string;
  agents: Agent[];
  selectedAgent: AgentId | "";
  isRunning: boolean;
  playerRunning: boolean;
  playerStarting: boolean;
  onSetPrompt: (value: string) => void;
  onSelectAgent: (id: AgentId) => void;
  onSubmit: () => void;
  onStop: () => void;
  onPreview: () => Promise<void>;
}

const CLAUDE_LOGO_URL = "https://cdn.snug.video/assets/claude-logo.svg";

function AgentIcon({ agentId, agentName }: { agentId: AgentId | ""; agentName?: string | undefined }) {
  if (agentId !== "claude-code") return null;

  return (
    <img
      src={CLAUDE_LOGO_URL}
      alt=""
      aria-hidden="true"
      className="size-3.5 shrink-0 object-contain"
    />
  );
}

export function Composer({
  prompt,
  workingDirectory,
  agents,
  selectedAgent,
  isRunning,
  playerRunning,
  playerStarting,
  onSetPrompt,
  onSelectAgent,
  onSubmit,
  onStop,
  onPreview
}: ComposerProps) {
  const availableAgents = agents.filter((a) => a.available);
  const unavailableAgents = agents.filter((a) => !a.available);
  const canSubmit = !!selectedAgent && !!prompt.trim() && !!workingDirectory;
  const selectedAgentName = agents.find((a) => a.id === selectedAgent)?.name;
  const showPreview = !!workingDirectory && !isRunning;

  return (
    <div className="shrink-0 px-5 pt-3 pb-3">
      <div className="rounded-[calc(var(--radius)+8px)] bg-muted/50 ring-1 ring-border/60">
        <Textarea
          value={prompt}
          onChange={(e) => onSetPrompt(e.target.value)}
          placeholder="Describe the video or composition you want…"
          className="max-h-28 min-h-[52px] resize-none border-0 bg-transparent px-4 pt-3.5 pb-2 text-sm shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
          maxLength={10000}
          disabled={isRunning}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) onSubmit();
          }}
        />
        <div className="flex items-center gap-1 px-3 pb-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isRunning}
              className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <AgentIcon agentId={selectedAgent} agentName={selectedAgentName} />
              {selectedAgentName ?? "Agent"}
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Select agent</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableAgents.map((a) => (
                  <DropdownMenuItem
                    key={a.id}
                    onClick={() => onSelectAgent(a.id)}
                  >
                    <AgentIcon agentId={a.id} agentName={a.name} />
                    {a.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {unavailableAgents.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {unavailableAgents.map((a) => (
                    <DropdownMenuItem
                      key={a.id}
                      disabled
                    >
                      <AgentIcon agentId={a.id} agentName={a.name} />
                      {a.name} (not found)
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {showPreview && (
            <div className="flex min-w-0 items-center gap-2 pl-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                disabled={playerStarting}
                title={
                  playerRunning && !playerStarting
                    ? "Player running — open preview"
                    : undefined
                }
                onClick={() => void onPreview()}
              >
                {playerRunning && !playerStarting ? (
                  <span
                    className="player-ready-dot size-2.5 shrink-0 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                ) : (
                  <HugeiconsIcon icon={PlayIcon} size={14} />
                )}
                {playerStarting ? "Starting…" : "Preview"}
              </Button>
              {playerStarting && (
                <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
                  Starting Remotion player…
                </span>
              )}
            </div>
          )}

          <div className="ml-auto">
            {isRunning ? (
              <Button
                variant="destructive"
                size="icon-sm"
                className="size-8 rounded-full"
                onClick={onStop}
                title="Stop"
              >
                <HugeiconsIcon icon={StopIcon} size={14} />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!canSubmit}
                onClick={onSubmit}
                title="Run agent (⌘ Enter)"
              >
                <HugeiconsIcon icon={Rocket01FreeIcons} size={14} />
                Generate video
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* <div className="flex items-center justify-between px-2 pt-1.5">
        <span className="text-[10px] text-muted-foreground/40">⌘ Enter to run</span>
      </div> */}
    </div>
  );
}
