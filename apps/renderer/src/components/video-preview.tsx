import { useEffect, useRef } from "react";

import type { RenderHistoryItem, RenderProgress } from "@acme/contracts";
import {
  ArrowDown01Icon,
  ArrowLeft02Icon,
  History,
  Video01Icon
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
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

  const handleIframeLoad = () => {
    postSelectCompositionToIframe();
  };

  const selected = compositions.find((c) => c.id === effectiveCompositionId);
  const duration = selected
    ? `${(selected.meta.durationInFrames / selected.meta.fps).toFixed(1)}s`
    : "";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Header bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} />
          Output
        </Button>

        <div className="mx-2 h-4 w-px bg-border" />

        <DropdownMenu
          onOpenChange={(open) => {
            if (open) onCompositionMenuOpen?.();
          }}
        >
          <DropdownMenuTrigger
            className={cn(
              "inline-flex h-7 min-w-[11rem] max-w-44 shrink-0 items-center justify-between gap-2 rounded-4xl border border-input bg-input/30 px-3 text-xs outline-none transition-colors",
              "hover:bg-input/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "data-[popup-open]:bg-input/50"
            )}
          >
            <span className="truncate text-left">
              {effectiveCompositionId || "Open menu to load…"}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={12}
              className="shrink-0 opacity-50"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[11rem]">
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

        {selected && (
          <span className="text-[10px] text-muted-foreground">
            {selected.meta.width}x{selected.meta.height} · {selected.meta.fps}fps · {duration}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isRendering && (
            <div className="flex items-center gap-2">
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
          )}

          {renderProgress?.status === "completed" && (
            <Badge variant="secondary" className="text-[10px]">
              Rendered
            </Badge>
          )}

          {renderProgress?.status === "failed" && (
            <Badge variant="destructive" className="text-[10px]">
              Failed
            </Badge>
          )}

          <DropdownMenu
            onOpenChange={(open) => {
              if (open) onRenderHistoryMenuOpen?.();
            }}
          >
            <DropdownMenuTrigger
              disabled={renderHistory.length === 0}
              aria-label="Past renders"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "shrink-0"
              )}
            >
              <HugeiconsIcon icon={History} size={14} />
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
            className="gap-1.5"
          >
            <HugeiconsIcon icon={Video01Icon} size={14} />
            Render
          </Button>
        </div>
      </div>

      {/* Player iframe */}
      <div className="min-h-0 flex-1 bg-black">
        <iframe
          ref={iframeRef}
          src={playerUrl}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}
