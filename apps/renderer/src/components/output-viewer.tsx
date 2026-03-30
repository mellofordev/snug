import { useEffect, useRef } from "react";

import type { PromptOutput } from "@acme/contracts";

import { WritePromptIllustration } from "@/components/illustration/write-prompt";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OutputViewerProps {
  currentRun: PromptOutput | null;
  isRunning: boolean;
}

export function OutputViewer({ currentRun, isRunning }: OutputViewerProps) {
  const outputEndRef = useRef<HTMLDivElement>(null);
  const hasOutput = Boolean(currentRun?.output);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentRun?.output]);

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
        {hasOutput ? (
          <pre className="whitespace-pre-wrap px-6 py-5 font-mono text-[12px] leading-relaxed text-foreground/80">
            {currentRun?.output}
            <div ref={outputEndRef} />
          </pre>
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
