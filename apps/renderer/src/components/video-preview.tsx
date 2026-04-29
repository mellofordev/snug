import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { RenderHistoryItem, RenderProgress } from "@acme/contracts";
import { ChevronDown, ChevronLeft, Trash2, History, Check, Video, Square } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface CompositionItem {
  id: string;
  meta: {
    fps: number;
    durationInFrames: number;
    width: number;
    height: number;
  };
}

interface VideoPreviewProps {
  playerUrl: string;
  compositions: CompositionItem[];
  selectedComposition: string;
  renderProgress: RenderProgress | null;
  renderHistory: RenderHistoryItem[];
  onSelectComposition: (id: string) => void;
  /** Called when the composition dropdown opens — refresh list from disk (IPC). */
  onCompositionMenuOpen?: () => void;
  /** Delete a composition's `.tsx` file from `compositions/` (confirmed in UI). */
  onDeleteComposition?: (compositionId: string) => void | Promise<void>;
  /** Refresh render output list when the past-renders menu opens. */
  onRenderHistoryMenuOpen?: () => void;
  /** Open an exported video in the OS default app (e.g. QuickTime). */
  onOpenOutputVideo: (filePath: string) => void;
  onRender: (compositionId?: string) => void;
  onBack: () => void;
  /** Stop the dev player process (also exits preview view). */
  onStopPlayer: () => void;
}

export function VideoPreview({
  playerUrl,
  compositions,
  selectedComposition,
  renderProgress,
  renderHistory,
  onSelectComposition,
  onCompositionMenuOpen,
  onDeleteComposition,
  onRenderHistoryMenuOpen,
  onOpenOutputVideo,
  onRender,
  onBack,
  onStopPlayer
}: VideoPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const effectiveCompositionIdRef = useRef(selectedComposition);
  const previousRenderStatusRef = useRef<RenderProgress["status"] | null>(renderProgress?.status ?? null);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const isRendering = renderProgress?.status === "rendering";

  const effectiveCompositionId = compositions.some((c) => c.id === selectedComposition)
    ? selectedComposition
    : compositions[0]?.id ?? "";

  effectiveCompositionIdRef.current = effectiveCompositionId;

  const postSelectCompositionToIframe = () => {
    const id = effectiveCompositionIdRef.current;
    const win = iframeRef.current?.contentWindow;
    if (!id || !win) {
      console.log("[snug/preview] postSelectComposition skipped", { id, hasWin: !!win });
      return;
    }
    console.log("[snug/preview] -> selectComposition", id);
    win.postMessage({ type: "selectComposition", id }, "*");
  };

  // Send composition selection to iframe (use effective id if parent state is stale)
  useEffect(() => {
    postSelectCompositionToIframe();
  }, [effectiveCompositionId]);

  // The iframe's `load` event fires before React mounts inside it, so our very
  // first `postMessage` can race the player's `window.message` listener. Listen
  // for the player's own `ready` / `compositions` handshake and (re-)post the
  // current selection as soon as it's guaranteed to be received.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "snug-player") return;
      if (data.type === "ready" || data.type === "compositions") {
        postSelectCompositionToIframe();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const previousStatus = previousRenderStatusRef.current;
    const nextStatus = renderProgress?.status ?? null;

    if (previousStatus === "rendering" && nextStatus === "completed") {
      toast.success("Render completed", {
        description: "View it from render history.",
        icon: <History size={14} />,
        action: {
          label: "View history",
          onClick: () => {
            onRenderHistoryMenuOpen?.();
            setHistoryMenuOpen(true);
          }
        }
      });
    }

    previousRenderStatusRef.current = nextStatus;
  }, [onRenderHistoryMenuOpen, renderProgress?.status]);

  const handleIframeLoad = () => {
    postSelectCompositionToIframe();
  };

  const noDrag = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const dragRegion = { WebkitAppRegion: "drag" } as CSSProperties;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Replaces the project TopBar while preview is open */}
      <header
        className="relative flex h-[38px] shrink-0 items-center px-5 animate-in fade-in-0 duration-200 ease-out-strong"
        style={dragRegion}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-6 gap-1 px-2 text-sm"
            style={noDrag}
          >
            <ChevronLeft className="size-3.5" />
            Output
          </Button>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
          style={noDrag}
        >
          {isRendering ? (
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(renderProgress?.progress ?? 0) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {Math.round((renderProgress?.progress ?? 0) * 100)}%
              </span>
            </div>
          ) : (
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) onCompositionMenuOpen?.();
              }}
            >
              <DropdownMenuTrigger
                className={cn(
                  "pointer-events-auto inline-flex h-6 min-w-[9rem] max-w-36 shrink-0 items-center justify-between gap-1.5 rounded-[calc(var(--radius)+4px)] border border-input bg-input/30 px-2.5 text-sm outline-none transition-colors",
                  "hover:bg-input/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "data-[popup-open]:bg-input/50"
                )}
                style={noDrag}
              >
                <span className="truncate text-left">
                  {effectiveCompositionId || "Open menu to load…"}
                </span>
                <ChevronDown
                  size={11}
                  className="shrink-0 opacity-50"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[11rem]">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Composition</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {compositions.length > 0 ? (
                    <>
                      {compositions.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          className="flex items-center justify-between gap-1.5 pr-1"
                          onClick={() => onSelectComposition(c.id)}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            {effectiveCompositionId === c.id ? (
                              <Check
                                size={12}
                                strokeWidth={2}
                                className="shrink-0 text-foreground"
                              />
                            ) : (
                              <span className="inline-block w-3 shrink-0" aria-hidden />
                            )}
                            <span className="truncate">{c.id}</span>
                          </span>
                          {onDeleteComposition && (
                            <button
                              type="button"
                              title="Delete composition"
                              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (
                                  !confirm(
                                    `Delete composition "${c.id}"? The source file will be removed from this project. This cannot be undone.`
                                  )
                                ) {
                                  return;
                                }
                                try {
                                  await onDeleteComposition(c.id);
                                  toast.success("Composition deleted", {
                                    description: c.id
                                  });
                                } catch {
                                  /* error shown in app chrome */
                                }
                              }}
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : (
                    <DropdownMenuItem disabled>No compositions found</DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1.5" style={noDrag}>

        <Button
            variant="ghost"
            size="xs"
            onClick={onStopPlayer}
            disabled={isRendering}
            title="Stop the dev player and return to output"
            className="font-extralight text-xs"
            style={noDrag}
          >
            <Square className="size-3.5 text-red-300" />
            Stop preview
          </Button>
          <DropdownMenu
            open={historyMenuOpen}
            onOpenChange={(open) => {
              setHistoryMenuOpen(open);
              if (open) onRenderHistoryMenuOpen?.();
            }}
          >
            <DropdownMenuTrigger
              aria-label="Past renders"
              className={cn(
                buttonVariants({ variant: "ghost", size: "xs" }),
                "font-extralight text-xs"
              )}
              style={noDrag}
            >
              <History className="size-3.5" />
              History
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52 max-h-64 overflow-y-auto">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Past renders</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {renderHistory.length > 0 ? (
                  renderHistory.map((item) => (
                    <DropdownMenuItem
                      key={item.path}
                      onClick={() => onOpenOutputVideo(item.path)}
                    >
                      <span className="truncate font-mono text-xs">{item.name}</span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>
                    <span className="text-xs text-muted-foreground">No renders yet</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>


          <Button
            size="xs"
            className="font-extralight text-xs"
            disabled={!effectiveCompositionId || isRendering}
            onClick={() => onRender(effectiveCompositionId)}
            style={noDrag}
          >
            <Video className="size-3.5" />
            Render
          </Button>
        </div>
      </header>

      {/* Player — inset from chrome and composer */}
      <div className="flex min-h-0 flex-1 flex-col bg-background px-4 pb-4 pt-3">
        <div
          className="relative min-h-0 flex-1 origin-top overflow-hidden rounded-[calc(var(--radius)+6px)] bg-black shadow-sm ring-1 ring-border/40 animate-in fade-in-0 motion-safe:zoom-in-[0.97] duration-[320ms] ease-drawer"
        >
          <iframe
            ref={iframeRef}
            src={playerUrl}
            className="absolute inset-0 size-full border-0"
            sandbox="allow-scripts allow-same-origin"
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
}
