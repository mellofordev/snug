import type { Agent, AgentId } from "@acme/contracts";
import {
  ArrowDown01Icon,
  PlayIcon,
  Rocket01FreeIcons,
  StopIcon
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

import {
  filterProjectFilesForMention,
  formatMentionDisplayPath,
  getAtMentionState,
  insertAtMentionReplacement,
  prepareMentionFileList
} from "@/components/composer-mention";
import { getTextareaCaretViewportRect } from "@/lib/textarea-caret-viewport";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ComposerProps {
  prompt: string;
  workingDirectory: string;
  agents: Agent[];
  selectedAgent: AgentId | "";
  isRunning: boolean;
  playerRunning: boolean;
  playerStarting: boolean;
  composerImages: { id: string; previewUrl: string }[];
  onSetPrompt: (value: string) => void;
  onSelectAgent: (id: AgentId) => void;
  onAddComposerImages: (files: File[]) => void;
  onRemoveComposerImage: (id: string) => void;
  onSubmit: () => void;
  /** Project files for @ path mentions (relative paths). */
  fetchProjectFiles?: () => Promise<string[]>;
  onStop: () => void;
  onPreview: () => Promise<void>;
}

const AGENT_META = {
  "claude-code": {
    icon: "https://cdn.snug.video/assets/claude-logo.svg"
  },
  codex: {
    icon: "https://cdn.snug.video/assets/codex-logo.svg"
  }
} as const;

export function Composer({
  prompt,
  workingDirectory,
  agents,
  selectedAgent,
  isRunning,
  playerRunning,
  playerStarting,
  composerImages,
  onSetPrompt,
  onSelectAgent,
  onAddComposerImages,
  onRemoveComposerImage,
  onSubmit,
  fetchProjectFiles,
  onStop,
  onPreview
}: ComposerProps) {
  const availableAgents = agents.filter((a) => a.available);
  const unavailableAgents = agents.filter((a) => !a.available);
  const canSubmit =
    !!selectedAgent &&
    !!workingDirectory &&
    (!!prompt.trim() || composerImages.length > 0);
  const canAttach = !!selectedAgent && !!workingDirectory && !isRunning;
  const selectedAgentName = agents.find((a) => a.id === selectedAgent)?.name;
  const selectedAgentMeta = selectedAgent ? AGENT_META[selectedAgent] : undefined;
  const showPreview = !!workingDirectory && !isRunning;

  const [dropHover, setDropHover] = useState(false);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const mentionIndexRef = useRef(0);
  const filesCacheRef = useRef<{ dir: string; files: string[] } | null>(null);

  const [cursorPos, setCursorPos] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [mentionFilesLoading, setMentionFilesLoading] = useState(false);
  const [mentionDropdownRect, setMentionDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
    transform: string;
  } | null>(null);

  const syncCursor = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    setCursorPos(el.selectionStart ?? 0);
  }, []);

  const mentionState = useMemo(
    () => getAtMentionState(prompt, cursorPos),
    [prompt, cursorPos]
  );

  const mentionMenuOpen =
    Boolean(
      mentionState &&
        fetchProjectFiles &&
        canAttach &&
        workingDirectory
    );

  mentionIndexRef.current = mentionIndex;

  const preparedMentionFiles = useMemo(
    () => prepareMentionFileList(projectFiles),
    [projectFiles]
  );

  const filteredMentionFiles = useMemo(() => {
    if (!mentionState) return [];
    return filterProjectFilesForMention(
      preparedMentionFiles,
      mentionState.query
    );
  }, [mentionState, preparedMentionFiles]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionState?.start, mentionState?.query, workingDirectory]);

  useEffect(() => {
    setMentionIndex((i) =>
      filteredMentionFiles.length
        ? Math.min(i, filteredMentionFiles.length - 1)
        : 0
    );
  }, [filteredMentionFiles.length]);

  useEffect(() => {
    filesCacheRef.current = null;
    setProjectFiles([]);
  }, [workingDirectory]);

  useEffect(() => {
    if (!mentionMenuOpen || !fetchProjectFiles) return;
    if (
      filesCacheRef.current?.dir === workingDirectory &&
      filesCacheRef.current.files.length > 0
    ) {
      setProjectFiles(filesCacheRef.current.files);
      return;
    }
    let cancelled = false;
    setMentionFilesLoading(true);
    void fetchProjectFiles()
      .then((files) => {
        if (cancelled) return;
        filesCacheRef.current = { dir: workingDirectory, files };
        setProjectFiles(files);
      })
      .finally(() => {
        if (!cancelled) setMentionFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionMenuOpen, fetchProjectFiles, workingDirectory]);

  useEffect(() => {
    if (!mentionMenuOpen) return;
    const row = mentionListRef.current?.querySelector(
      `[data-mention-idx="${mentionIndex}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [mentionIndex, mentionMenuOpen, filteredMentionFiles]);

  useLayoutEffect(() => {
    if (!mentionMenuOpen) {
      setMentionDropdownRect(null);
      return;
    }

    const updatePosition = () => {
      const ta = textareaRef.current;
      if (!ta) return;

      const cur = ta.selectionStart ?? cursorPos;
      const m = getAtMentionState(prompt, cur);
      if (!m) {
        setMentionDropdownRect(null);
        return;
      }

      const caret = getTextareaCaretViewportRect(ta, m.start);
      const gap = 4;
      const maxMenuH = 144; // matches max-h-36
      const minW = 280;
      const width = Math.max(minW, ta.clientWidth);
      const vw = typeof window !== "undefined" ? window.innerWidth : width;
      const vh = typeof window !== "undefined" ? window.innerHeight : 400;

      let left = caret.left;
      left = Math.min(Math.max(8, left), Math.max(8, vw - width - 8));

      // Sit just above the `@`: bottom of menu is a few px above the @ glyph.
      // If there is not enough room above the viewport, open below the line instead.
      let top = caret.top - gap;
      let transform = "translateY(-100%)";
      if (caret.top - gap - maxMenuH < 8) {
        top = caret.bottom + gap;
        transform = "none";
      }

      setMentionDropdownRect({ top, left, width, transform });
    };

    updatePosition();

    const opts = { capture: true } as const;
    window.addEventListener("scroll", updatePosition, opts);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, opts);
      window.removeEventListener("resize", updatePosition);
    };
  }, [
    mentionMenuOpen,
    prompt,
    cursorPos,
    filteredMentionFiles.length,
    mentionFilesLoading
  ]);

  const applyMention = useCallback(
    (relativePath: string) => {
      const ta = textareaRef.current;
      const cur = ta?.selectionStart ?? cursorPos;
      const m = getAtMentionState(prompt, cur);
      if (!m) return;
      const { value, cursor } = insertAtMentionReplacement(
        prompt,
        cur,
        m.start,
        relativePath
      );
      onSetPrompt(value);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(cursor, cursor);
          setCursorPos(cursor);
        }
      });
    },
    [cursorPos, onSetPrompt, prompt]
  );

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && e.metaKey) {
        onSubmit();
        return;
      }

      const el = e.currentTarget;
      const cur = el.selectionStart ?? 0;
      const m = getAtMentionState(prompt, cur);
      if (!m || !fetchProjectFiles || !mentionMenuOpen) return;

      const list = filterProjectFilesForMention(preparedMentionFiles, m.query);
      if (list.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, list.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.metaKey) {
        e.preventDefault();
        const pick =
          list[mentionIndexRef.current] ?? list[0];
        if (pick) applyMention(pick);
        return;
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const pick =
          list[mentionIndexRef.current] ?? list[0];
        if (pick) applyMention(pick);
      }
    },
    [
      applyMention,
      fetchProjectFiles,
      mentionMenuOpen,
      onSubmit,
      preparedMentionFiles,
      prompt
    ]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canAttach) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDropHover(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.type.startsWith("image/") && f.size > 0
      );
      if (files.length) onAddComposerImages(files);
    },
    [canAttach, onAddComposerImages]
  );

  return (
    <div className="shrink-0 px-5 pt-3 pb-3">
      <div
        className={cn(
          "rounded-[calc(var(--radius)+8px)] bg-muted/50 ring-1 ring-border/60 transition-shadow",
          dropHover && canAttach && "ring-2 ring-primary/35"
        )}
        onDragEnter={(e) => {
          if (!canAttach) return;
          e.preventDefault();
          dragDepth.current++;
          if ([...e.dataTransfer.types].includes("Files")) setDropHover(true);
        }}
        onDragLeave={(e) => {
          if (!canAttach) return;
          e.preventDefault();
          dragDepth.current--;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDropHover(false);
          }
        }}
        onDragOver={(e) => {
          if (!canAttach) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handleDrop}
      >
        {composerImages.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-border/50 px-3 pt-3 pb-2">
            {composerImages.map((img) => (
              <div
                key={img.id}
                className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-background"
              >
                <img
                  src={img.previewUrl}
                  alt=""
                  className="size-full object-cover"
                />
                {canAttach && (
                  <button
                    type="button"
                    className="absolute inset-0 flex items-start justify-end p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onRemoveComposerImage(img.id)}
                    title="Remove"
                  >
                    <span className="flex size-5 items-center justify-center rounded-full bg-background/90 text-xs leading-none text-foreground shadow-sm ring-1 ring-border">
                      ×
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="min-w-0">
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              onSetPrompt(e.target.value);
              syncCursor(e.target);
            }}
            onSelect={(e) => syncCursor(e.currentTarget)}
            onClick={(e) => syncCursor(e.currentTarget)}
            onKeyUp={(e) => syncCursor(e.currentTarget)}
            placeholder="Describe the video… Type @ for a project file. Paste or drop reference images."
            title="⌘↵ generate · @ to reference a project file"
            className="max-h-28 min-h-[52px] resize-none border-0 bg-transparent px-4 pt-3.5 pb-2 text-sm shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
            maxLength={10000}
            disabled={isRunning}
            onKeyDown={handleTextareaKeyDown}
            onPaste={(e) => {
            if (!canAttach) return;
            const cd = e.clipboardData;
            if (!cd) return;

            for (const item of Array.from(cd.items ?? [])) {
              if (item.kind === "file" && item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file && file.size > 0) {
                  e.preventDefault();
                  onAddComposerImages([file]);
                  return;
                }
              }
            }

            const files = cd.files;
            if (files?.length) {
              for (let i = 0; i < files.length; i++) {
                const file = files.item(i);
                if (file && file.type.startsWith("image/") && file.size > 0) {
                  e.preventDefault();
                  onAddComposerImages([file]);
                  return;
                }
              }
            }

          }}
          />
        </div>
        {mentionMenuOpen &&
          mentionState &&
          mentionDropdownRect &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className={cn(
                "pointer-events-auto fixed isolate z-1000 max-h-36 overflow-hidden",
                "rounded-[calc(var(--radius)+6px)] border border-border bg-popover text-popover-foreground",
                "shadow-2xl ring-1 ring-border/60"
              )}
              style={{
                top: mentionDropdownRect.top,
                left: mentionDropdownRect.left,
                width: mentionDropdownRect.width,
                maxWidth: "min(calc(100vw - 1rem), 36rem)",
                transform: mentionDropdownRect.transform
              }}
              role="presentation"
            >
              <ScrollArea className="max-h-36">
                <div
                  ref={mentionListRef}
                  className="py-1"
                  role="listbox"
                  aria-label="Project files"
                >
                  {mentionFilesLoading && projectFiles.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Loading files…
                    </div>
                  ) : filteredMentionFiles.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No matching files
                    </div>
                  ) : (
                    filteredMentionFiles.map((path, idx) => (
                      <button
                        key={path}
                        type="button"
                        data-mention-idx={idx}
                        role="option"
                        aria-selected={idx === mentionIndex}
                        className={cn(
                          "flex w-full px-3 py-1.5 text-left font-mono text-[11px] leading-snug",
                          idx === mentionIndex
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/70"
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyMention(path);
                        }}
                        onMouseEnter={() => setMentionIndex(idx)}
                        title={path}
                      >
                        {formatMentionDisplayPath(path)}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>,
            document.body
          )}
        <div className="flex items-center gap-1 px-3 pb-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isRunning}
              className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {selectedAgentMeta && (
                <img
                  src={selectedAgentMeta.icon}
                  alt=""
                  aria-hidden="true"
                  className="size-3.5 shrink-0 object-contain"
                />
              )}
              {selectedAgentName ?? "Agent"}
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} className="opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Select agent</DropdownMenuLabel>
                {availableAgents.map((a) => (
                  <DropdownMenuItem
                    key={a.id}
                    onClick={() => onSelectAgent(a.id)}
                  >
                    {AGENT_META[a.id] && (
                      <img
                        src={AGENT_META[a.id].icon}
                        alt=""
                        aria-hidden="true"
                        className="size-3.5 shrink-0 object-contain"
                      />
                    )}
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
                      {AGENT_META[a.id] && (
                        <img
                          src={AGENT_META[a.id].icon}
                          alt=""
                          aria-hidden="true"
                          className="size-3.5 shrink-0 object-contain"
                        />
                      )}
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
