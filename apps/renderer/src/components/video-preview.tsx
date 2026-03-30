import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { RenderHistoryItem, RenderProgress } from "@acme/contracts";
import {
  ArrowDown01Icon,
  ArrowLeft02Icon,
  History,
  Video01Icon
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  /** Refresh render output list when the past-renders menu opens. */
  onRenderHistoryMenuOpen?: () => void;
  /** Open an exported video in the OS default app (e.g. QuickTime). */
  onOpenOutputVideo: (filePath: string) => void;
  onRender: (compositionId?: string) => void;
  onBack: () => void;
}

export function VideoPreview({
  playerUrl,
  compositions,
  selectedComposition,
  renderProgress,
  renderHistory,
  onSelectComposition,
  onCompositionMenuOpen,
  onRenderHistoryMenuOpen,
  onOpenOutputVideo,
  onRender,
  onBack
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
    if (!id || !win) return;
    win.postMessage({ type: "selectComposition", id }, "*");
  };

  // Send composition selection to iframe (use effective id if parent state is stale)
  useEffect(() => {
    postSelectCompositionToIframe();
  }, [effectiveCompositionId]);

  useEffect(() => {
    const previousStatus = previousRenderStatusRef.current;
    const nextStatus = renderProgress?.status ?? null;

    if (previousStatus === "rendering" && nextStatus === "completed") {
      toast.success("Render completed", {
        description: "View it from render history.",
        icon: <HugeiconsIcon icon={History} size={14} />,
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
      <header className="relative flex h-[38px] shrink-0 items-center px-5" style={dragRegion}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-6 gap-1 px-2 text-sm"
            style={noDrag}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={13} />
            Output
          </Button>

          <div className="h-4 w-px shrink-0 bg-border/70" style={noDrag} />
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
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={11}
                  className="shrink-0 opacity-50"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[11rem]">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Composition</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {compositions.length > 0 ? (
                    <DropdownMenuRadioGroup
                      value={effectiveCompositionId}
                      onValueChange={(id) => {
                        if (id) onSelectComposition(id);
                      }}
                    >
                      {compositions.map((c) => (
                        <DropdownMenuRadioItem key={c.id} value={c.id}>
                          {c.id}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  ) : (
                    <DropdownMenuItem disabled>No compositions found</DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-1.5" style={noDrag}>
          <DropdownMenu
            open={historyMenuOpen}
            onOpenChange={(open) => {
              setHistoryMenuOpen(open);
              if (open) onRenderHistoryMenuOpen?.();
            }}
          >
            <DropdownMenuTrigger
              disabled={renderHistory.length === 0}
              aria-label="Past renders"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "size-7 shrink-0 [&_svg]:size-3.5"
              )}
              style={noDrag}
            >
              <HugeiconsIcon icon={History} size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52 max-h-64 overflow-y-auto">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Past renders</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {renderHistory.map((item) => (
                  <DropdownMenuItem
                    key={item.path}
                    onClick={() => onOpenOutputVideo(item.path)}
                  >
                    <span className="truncate font-mono text-xs">{item.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            disabled={!effectiveCompositionId || isRendering}
            onClick={() => onRender(effectiveCompositionId)}
            className="h-7 shrink-0 gap-1 px-3 text-sm"
            style={noDrag}
          >
            <HugeiconsIcon icon={Video01Icon} size={13} />
            Render
          </Button>
        </div>
      </header>

      {/* Player — inset from chrome and composer */}
      <div className="flex min-h-0 flex-1 flex-col bg-background px-4 pb-4 pt-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[calc(var(--radius)+6px)] bg-black shadow-sm ring-1 ring-border/40">
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
