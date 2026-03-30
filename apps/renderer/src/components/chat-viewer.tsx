import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import type { ChatMessage, PromptOutput } from "@acme/contracts";

import { WritePromptIllustration } from "@/components/illustration/write-prompt";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatViewerProps {
  currentRun: PromptOutput | null;
  chatMessages: ChatMessage[];
  isRunning: boolean;
}

export function ChatViewer({ currentRun, chatMessages, isRunning }: ChatViewerProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Combine accumulated chat with in-progress messages from current run
  const inProgressMessages = isRunning && currentRun
    ? currentRun.messages.slice(1)  // skip user message (already in chatMessages)
    : [];
  const messages = [...chatMessages, ...inProgressMessages];
  const hasMessages = messages.length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  const hasStatus = isRunning || (currentRun && currentRun.status !== "running");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {hasStatus && (
        <div className="absolute right-4 top-3 z-10 flex items-center gap-2">
          {isRunning && (
            <Badge variant="secondary" className="gap-1.5 text-[10px] shadow-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
              Running
            </Badge>
          )}
          {!isRunning && currentRun && (
            <Badge
              variant={currentRun.status === "completed" ? "secondary" : "destructive"}
              className="text-[10px] shadow-sm"
            >
              {currentRun.status === "completed" ? "Completed" : "Failed"}
              {currentRun.exitCode !== null ? ` · exit ${currentRun.exitCode}` : ""}
            </Badge>
          )}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {hasMessages ? (
          <div className="flex flex-col gap-3 px-6 py-5">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
            {isRunning && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 px-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
                  <span className="text-xs text-muted-foreground">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center px-6 py-10">
            <div className="flex max-w-sm flex-col items-center text-center">
              <div className="-mb-6 opacity-35">
                <WritePromptIllustration className="size-[250px]" />
              </div>
              <p className="text-sm font-normal text-muted-foreground/60">
                Prompt your video idea
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  switch (message.role) {
    case "user":
      return <UserMessage content={message.content} />;
    case "thinking":
      return <ThinkingMessage content={message.content} />;
    case "tool":
      return (
        <ToolMessage
          toolName={message.toolName ?? undefined}
          toolInput={message.toolInput ?? undefined}
          result={message.content}
        />
      );
    case "assistant":
      return <AssistantMessage content={message.content} />;
  }
}

// ── User message ────────────────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {content}
      </div>
    </div>
  );
}

// ── Assistant message ───────────────────────────────────────────────────

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] text-sm leading-relaxed text-foreground/90">
        <Streamdown>{content}</Streamdown>
      </div>
    </div>
  );
}

// ── Thinking message ────────────────────────────────────────────────────

function ThinkingMessage({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.length > 150 ? content.slice(0, 150) + "…" : content;

  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="max-w-[85%] cursor-pointer rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="mb-1 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-amber-400" />
          <span className="text-[11px] font-medium text-muted-foreground">Thinking</span>
          <span className="text-[10px] text-muted-foreground/50">
            {expanded ? "collapse" : "expand"}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground/70">
          {expanded ? content : preview}
        </p>
      </button>
    </div>
  );
}

// ── Tool call / result message ──────────────────────────────────────────

function ToolMessage({
  toolName,
  toolInput,
  result
}: {
  toolName: string | undefined;
  toolInput: string | undefined;
  result: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayName = toolName ?? "Tool";
  const hasInput = toolInput && toolInput.trim();
  const hasResult = result && result.trim();
  const isToolCall = hasInput && !hasResult;
  const isToolResult = hasResult;

  // For tool results, show a truncated preview
  const resultPreview = result && result.length > 200
    ? result.slice(0, 200) + "…"
    : result;

  return (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="max-w-[85%] cursor-pointer rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${isToolResult ? "bg-emerald-400" : "bg-blue-400"}`} />
          <span className="text-[11px] font-medium text-muted-foreground">
            {displayName}
          </span>
          {isToolCall && (
            <span className="text-[10px] text-muted-foreground/50">called</span>
          )}
          {isToolResult && (
            <span className="text-[10px] text-muted-foreground/50">result</span>
          )}
        </div>

        {expanded ? (
          <div className="mt-1.5 space-y-2">
            {hasInput && (
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground/70">
                {toolInput}
              </pre>
            )}
            {hasResult && (
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground/70">
                {result}
              </pre>
            )}
          </div>
        ) : (
          hasResult && (
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/50">
              {resultPreview}
            </p>
          )
        )}
      </button>
    </div>
  );
}
