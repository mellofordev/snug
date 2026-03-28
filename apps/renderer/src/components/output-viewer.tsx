import { useEffect, useRef } from "react";

import type { PromptOutput } from "@acme/contracts";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OutputViewerProps {
  currentRun: PromptOutput | null;
  isRunning: boolean;
}

export function OutputViewer({ currentRun, isRunning }: OutputViewerProps) {
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentRun?.output]);

  const hasStatus = isRunning || (currentRun && currentRun.status !== "running");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {hasStatus && (
        <div className="absolute right-4 top-3 z-10">
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
        <pre className="whitespace-pre-wrap px-6 py-5 font-mono text-[12px] leading-relaxed text-foreground/80">
          {currentRun?.output || (
            <span className="text-muted-foreground/60">
              Select an agent, pick a Remotion project folder, and describe the video
              you want. Agent output streams here in real-time.
            </span>
          )}
          <div ref={outputEndRef} />
        </pre>
      </ScrollArea>
    </div>
  );
}
