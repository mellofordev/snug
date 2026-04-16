import { useCallback, useEffect, useRef, useState } from "react";

import type {
  Agent,
  AgentId,
  ChatMessage,
  NativeApi,
  PromptOutput,
  RenderHistoryItem,
  RenderProgress,
  UpdateStatus
} from "@acme/contracts";

const RECENT_PROJECTS_KEY = "snug:recent-projects";
const SELECTED_AGENT_KEY = "snug:selected-agent";
const LAST_PROJECT_KEY = "snug:last-project";
const AGENT_SESSIONS_KEY = "snug:agent-sessions-v1";

/** Per-project agent chat + session IDs (persisted). */
type ProjectAgentState = {
  sessionIds: Partial<Record<AgentId, string>>;
  messages: ChatMessage[];
};

function normalizeProjectAgentState(raw: unknown): ProjectAgentState {
  if (!raw || typeof raw !== "object") {
    return { sessionIds: {}, messages: [] };
  }
  const o = raw as Record<string, unknown>;
  const messages = Array.isArray(o.messages) ? (o.messages as ChatMessage[]) : [];
  if (o.sessionIds && typeof o.sessionIds === "object" && o.sessionIds !== null) {
    return { sessionIds: o.sessionIds as Partial<Record<AgentId, string>>, messages };
  }
  const legacy = o.sessionId;
  const sid = typeof legacy === "string" ? legacy : null;
  return {
    sessionIds: sid ? { "claude-code": sid } : {},
    messages
  };
}

function loadAgentSessionsMap(): Map<string, ProjectAgentState> {
  try {
    const raw = readLocalString(AGENT_SESSIONS_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return new Map(
      Object.entries(obj).map(([path, v]) => [path, normalizeProjectAgentState(v)])
    );
  } catch {
    return new Map();
  }
}

function persistAgentSessionsMap(map: Map<string, ProjectAgentState>): void {
  try {
    writeLocalString(AGENT_SESSIONS_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    /* ignore */
  }
}

/** Safe localStorage read — returns null on SSR or quota errors. */
function readLocalString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe localStorage write — silently ignores quota/privacy errors. */
function writeLocalString(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

interface CompositionItem {
  id: string;
  meta: {
    fps: number;
    durationInFrames: number;
    width: number;
    height: number;
  };
}

const MAX_COMPOSER_IMAGES = 12;

async function blobToBase64Payload(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result;
      if (typeof r !== "string") {
        reject(new Error("Unexpected read result"));
        return;
      }
      const i = r.indexOf(",");
      resolve(i >= 0 ? r.slice(i + 1) : "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

const DEFAULT_COMPOSITION_META: CompositionItem["meta"] = {
  fps: 30,
  durationInFrames: 150,
  width: 1920,
  height: 1080
};

export interface AppState {
  api: NativeApi | undefined;

  agents: Agent[];
  selectedAgent: AgentId | "";
  setSelectedAgent: (id: AgentId | "") => void;
  detectAgents: () => Promise<void>;

  prompt: string;
  setPrompt: (value: string) => void;
  /** Staged reference images (shown as thumbnails); included in the next agent run. */
  composerImages: { id: string; previewUrl: string }[];
  addComposerImages: (files: File[]) => void;
  removeComposerImage: (id: string) => void;

  workingDirectory: string;
  recentProjects: string[];
  setAndPersistDirectory: (dir: string) => Promise<void>;
  renameProject: (dir: string, nextName: string) => Promise<void>;
  deleteProject: (dir: string) => Promise<void>;
  revealProject: (dir: string) => Promise<void>;

  baseDirectory: string | null;
  sidebarNewProjectOpen: boolean;
  setSidebarNewProjectOpen: (open: boolean) => void;
  newProjectName: string;
  setNewProjectName: (name: string) => void;
  creatingProject: boolean;
  createStage: "scaffold" | "install" | "player" | null;
  onNewProject: () => void;
  onCreateProject: () => Promise<void>;
  onChangeBaseDirectory: () => Promise<void>;

  currentRun: PromptOutput | null;
  chatMessages: ChatMessage[];
  isRunning: boolean;
  error: string | null;
  onSubmit: () => Promise<void>;
  onStop: () => Promise<void>;
  onNewSession: () => void;

  updateStatus: UpdateStatus | null;
  dismissUpdate: () => void;

  // Video preview state
  view: "output" | "preview";
  playerUrl: string;
  playerRunning: boolean;
  playerStarting: boolean;
  compositions: CompositionItem[];
  selectedComposition: string;
  renderProgress: RenderProgress | null;
  renderHistory: RenderHistoryItem[];
  switchToOutput: () => void;
  switchToPreview: () => void;
  onPreview: () => Promise<void>;
  selectComposition: (id: string) => void;
  refreshCompositions: () => Promise<void>;
  deleteComposition: (compositionId: string) => Promise<void>;
  /** Relative paths from project root (for @-mentions). */
  fetchProjectFiles: () => Promise<string[]>;
  refreshRenderHistory: () => Promise<void>;
  openOutputVideo: (filePath: string) => Promise<void>;
  triggerRender: (compositionId?: string) => Promise<void>;
  startPlayer: () => Promise<void>;
}

export function useAppState(api: NativeApi | undefined): AppState {
  const [agents, setAgents] = useState<Agent[]>([]);
  // Preferred model survives relaunch — hydrate from localStorage synchronously
  // so the Composer never flashes an unintended default before detectAgents runs.
  const [selectedAgent, setSelectedAgentState] = useState<AgentId | "">(() => {
    const raw = readLocalString(SELECTED_AGENT_KEY);
    return raw === "claude-code" || raw === "codex" ? raw : "";
  });
  const setSelectedAgent = useCallback((id: AgentId | "") => {
    setSelectedAgentState(id);
    writeLocalString(SELECTED_AGENT_KEY, id || null);
  }, []);
  const [prompt, setPrompt] = useState("");
  const [composerImages, setComposerImages] = useState<
    { id: string; blob: Blob; previewUrl: string }[]
  >([]);

  const addComposerImages = useCallback((files: File[]) => {
    const incoming = Array.from(files).filter(
      (f) => f.type.startsWith("image/") && f.size > 0
    );
    if (!incoming.length) return;
    setComposerImages((prev) => {
      const room = MAX_COMPOSER_IMAGES - prev.length;
      const take = incoming.slice(0, Math.max(0, room));
      const added = take.map((file) => ({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        blob: file as Blob,
        previewUrl: URL.createObjectURL(file)
      }));
      return [...prev, ...added];
    });
  }, []);

  const removeComposerImage = useCallback((id: string) => {
    setComposerImages((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }, []);
  // Mirror the last-opened project in localStorage so the correct workspace is
  // available on the very first render, before the async IPC probe resolves.
  // Settings.json remains the source of truth written by the main process.
  const [workingDirectory, setWorkingDirectoryState] = useState(
    () => readLocalString(LAST_PROJECT_KEY) ?? ""
  );
  const setWorkingDirectory = useCallback((dir: string) => {
    setWorkingDirectoryState(dir);
    writeLocalString(LAST_PROJECT_KEY, dir || null);
  }, []);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [currentRun, setCurrentRun] = useState<PromptOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Session tracking per project: path → { sessionIds per agent, messages } (mirrored to localStorage)
  const sessionsRef = useRef<Map<string, ProjectAgentState>>(loadAgentSessionsMap());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const wd = readLocalString(LAST_PROJECT_KEY) ?? "";
    if (!wd) return [];
    return sessionsRef.current.get(wd)?.messages ?? [];
  });

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  const [baseDirectory, setBaseDirectory] = useState<string | null>(null);
  const [sidebarNewProjectOpen, setSidebarNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createStage, setCreateStage] = useState<"scaffold" | "install" | "player" | null>(null);

  // Video preview state
  const [view, setView] = useState<"output" | "preview">("output");
  const [playerUrl, setPlayerUrl] = useState("");
  const [playerRunning, setPlayerRunning] = useState(false);
  const [playerStarting, setPlayerStarting] = useState(false);
  const [compositions, setCompositions] = useState<CompositionItem[]>([]);
  const [selectedComposition, setSelectedComposition] = useState("");
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryItem[]>([]);

  const persistRecentProjects = useCallback((next: string[]) => {
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
    setRecentProjects(next);
  }, []);

  const detectAgents = useCallback(async () => {
    if (!api) return;
    try {
      const detected = await api.agents.detect();
      setAgents(detected);
      // Preserve the user's persisted choice if it's still available. Only fall
      // back to the first available agent when there is no prior selection or
      // the previously chosen backend has vanished (e.g. uninstalled).
      setSelectedAgentState((current) => {
        if (current && detected.some((a) => a.id === current && a.available)) {
          return current;
        }
        const first = detected.find((a) => a.available);
        return first ? first.id : "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to detect agents.");
    }
  }, [api]);

  // Load recent projects from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
      if (raw) setRecentProjects(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist project list when working directory changes. Order stays fixed: selecting a project
  // does not move it; only newly opened or created projects are appended (cap 12, drop oldest).
  useEffect(() => {
    if (!workingDirectory) return;
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
      const prev: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      const next = prev.includes(workingDirectory)
        ? prev
        : [...prev, workingDirectory].slice(-12);
      persistRecentProjects(next);
    } catch {
      /* ignore */
    }
  }, [persistRecentProjects, workingDirectory]);

  // Load persisted settings on mount. Settings.json owned by the main process is
  // authoritative — if it disagrees with the localStorage mirror (e.g. a project
  // was deleted in another window), we prefer the backend value.
  useEffect(() => {
    if (!api) return;
    void Promise.all([
      api.settings.getBaseDirectory(),
      api.settings.getLastOpenedDirectory()
    ]).then(([base, last]) => {
      setBaseDirectory(base);
      if (last) {
        setWorkingDirectory(last);
        const restored = sessionsRef.current.get(last);
        setChatMessages(restored?.messages ?? []);
      }
    });
  }, [api, setWorkingDirectory]);

  // Detect agents on mount
  useEffect(() => {
    void detectAgents();
  }, [detectAgents]);

  // Subscribe to prompt output stream
  useEffect(() => {
    if (!api) return;
    return api.prompt.onOutput((output) => {
      setCurrentRun(output);

      // Track server session id per agent while the run is in progress (in-memory only;
      // full persistence happens when the run finishes).
      if (output.sessionId && workingDirectory) {
        const prev = sessionsRef.current.get(workingDirectory);
        sessionsRef.current.set(workingDirectory, {
          sessionIds: { ...prev?.sessionIds, [output.agentId]: output.sessionId },
          messages: prev?.messages ?? []
        });
      }

      // When run completes, merge new messages into accumulated chat
      if (output.status === "completed" || output.status === "failed") {
        // output.messages includes the user message + all new messages from this run
        // Skip the first user message (we already added it in onSubmit)
        const newMessages = output.messages.slice(1);
        setChatMessages((prev) => {
          const merged = [...prev, ...newMessages];
          if (workingDirectory) {
            const prevState = sessionsRef.current.get(workingDirectory);
            const sessionIds = { ...prevState?.sessionIds };
            if (output.sessionId) {
              sessionIds[output.agentId] = output.sessionId;
            }
            sessionsRef.current.set(workingDirectory, {
              sessionIds,
              messages: merged
            });
            persistAgentSessionsMap(sessionsRef.current);
          }
          return merged;
        });
      }
    });
  }, [api, workingDirectory]);

  // Subscribe to render progress
  useEffect(() => {
    if (!api) return;
    return api.project.onRenderProgress((progress) => {
      setRenderProgress(progress);
      // Refresh output history when render completes
      if (progress.status === "completed" && workingDirectory) {
        void api.project.listOutputs(workingDirectory).then(setRenderHistory);
      }
    });
  }, [api, workingDirectory]);

  // Subscribe to update status
  useEffect(() => {
    if (!api) return;
    return api.app.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });
  }, [api]);

  // Merge composition metadata from the Remotion player (fps, duration, etc.)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source !== "snug-player") return;

      if (data.type === "compositions" && Array.isArray(data.items)) {
        const items = data.items as CompositionItem[];
        setCompositions((prev) => {
          const metaMap = new Map(items.map((i) => [i.id, i.meta]));
          if (prev.length === 0) return items;
          return prev.map((p) => ({
            ...p,
            meta: metaMap.get(p.id) ?? p.meta
          }));
        });
        setSelectedComposition((sel) => {
          if (sel && items.some((i) => i.id === sel)) return sel;
          const first = items[0];
          if (first) return first.id;
          return sel;
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Tear down the previous project's Vite preview when the workspace changes, a new project is
  // opened, or the renderer unmounts — avoids orphan dev servers consuming RAM.
  useEffect(() => {
    return () => {
      if (!api || !workingDirectory) return;
      void api.project.stopPlayer(workingDirectory);
    };
  }, [api, workingDirectory]);

  // Reset player state when working directory changes
  useEffect(() => {
    setPlayerRunning(false);
    setPlayerUrl("");
    setCompositions([]);
    setSelectedComposition("");
    setView("output");
  }, [workingDirectory]);

  useEffect(() => {
    setComposerImages((prev) => {
      prev.forEach((x) => URL.revokeObjectURL(x.previewUrl));
      return [];
    });
  }, [workingDirectory]);

  const composerImagesRef = useRef(composerImages);
  composerImagesRef.current = composerImages;
  useEffect(() => {
    return () => {
      composerImagesRef.current.forEach((x) =>
        URL.revokeObjectURL(x.previewUrl)
      );
    };
  }, []);

  // Auto-switch to preview when agent completes and player is already running
  useEffect(() => {
    if (currentRun?.status === "completed" && currentRun.exitCode === 0 && playerRunning) {
      setView("preview");
    }
  }, [currentRun?.status, currentRun?.exitCode, playerRunning]);

  // Load render history when working directory changes
  useEffect(() => {
    if (!api || !workingDirectory) return;
    void api.project.listOutputs(workingDirectory).then(setRenderHistory);
  }, [api, workingDirectory]);

  const setAndPersistDirectory = useCallback(
    async (dir: string) => {
      // Save current project's chat + session ids before switching
      if (workingDirectory) {
        const prev = sessionsRef.current.get(workingDirectory);
        const sessionIds = { ...prev?.sessionIds };
        if (currentRun?.sessionId) {
          sessionIds[currentRun.agentId] = currentRun.sessionId;
        }
        sessionsRef.current.set(workingDirectory, { sessionIds, messages: chatMessages });
        persistAgentSessionsMap(sessionsRef.current);
      }

      // Switch to new project
      setWorkingDirectory(dir);
      setCurrentRun(null);
      await api?.settings.setLastOpenedDirectory(dir);

      // Restore chat state for the new project
      const restored = sessionsRef.current.get(dir);
      setChatMessages(restored?.messages ?? []);
    },
    [api, workingDirectory, currentRun, chatMessages]
  );

  const renameProject = useCallback(async (dir: string, nextName: string) => {
    if (!api) return;
    const safeName = nextName.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
    if (!safeName) return;

    const slashIndex = Math.max(dir.lastIndexOf("/"), dir.lastIndexOf("\\"));
    const nextPath = slashIndex >= 0 ? `${dir.slice(0, slashIndex + 1)}${safeName}` : safeName;
    if (nextPath === dir) return;

    setError(null);
    try {
      const renamedPath = await api.fs.renamePath(dir, nextPath);
      const nextProjects = recentProjects.map((projectPath) =>
        projectPath === dir ? renamedPath : projectPath
      );
      persistRecentProjects(nextProjects);

      const sessionData = sessionsRef.current.get(dir);
      if (sessionData) {
        sessionsRef.current.delete(dir);
        sessionsRef.current.set(renamedPath, sessionData);
        persistAgentSessionsMap(sessionsRef.current);
      }

      if (workingDirectory === dir) {
        setWorkingDirectory(renamedPath);
        await api.settings.setLastOpenedDirectory(renamedPath);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename project.");
    }
  }, [api, persistRecentProjects, recentProjects, workingDirectory]);

  const deleteProject = useCallback(async (dir: string) => {
    if (!api) return;
    setError(null);
    try {
      if (workingDirectory === dir) {
        try {
          await api.project.stopPlayer(dir);
        } catch {
          /* ignore */
        }
      }

      await api.fs.removePath(dir);

      sessionsRef.current.delete(dir);
      persistAgentSessionsMap(sessionsRef.current);

      const nextProjects = recentProjects.filter((projectPath) => projectPath !== dir);
      persistRecentProjects(nextProjects);

      if (workingDirectory === dir) {
        setWorkingDirectory("");
        setCurrentRun(null);
        setPlayerRunning(false);
        setPlayerUrl("");
        setCompositions([]);
        setSelectedComposition("");
        setRenderProgress(null);
        setRenderHistory([]);
        setView("output");
        await api.settings.setLastOpenedDirectory("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project.");
    }
  }, [api, persistRecentProjects, recentProjects, workingDirectory]);

  const revealProject = useCallback(async (dir: string) => {
    if (!api) return;
    setError(null);
    try {
      await api.shell.revealPath(dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reveal project.");
    }
  }, [api]);

  const onNewProject = useCallback(() => {
    setSidebarNewProjectOpen(true);
    setNewProjectName("");
  }, []);

  const onCreateProject = useCallback(async () => {
    if (!api || !baseDirectory || !newProjectName.trim()) return;
    const safeName = newProjectName.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
    const fullPath = `${baseDirectory}/${safeName}`;

    setCreatingProject(true);
    setCreateStage("scaffold");
    setError(null);
    try {
      const created = await api.fs.createDirectory(fullPath);

      // Run scaffold: copies template files + bun install
      setCreateStage("install");
      const result = await api.project.init(created);
      if (!result.success) {
        setError(`Project setup failed: ${result.error}`);
        setCreatingProject(false);
        setCreateStage(null);
        return;
      }

      // Setting the directory triggers the auto-start effect for the player
      await setAndPersistDirectory(created);
      setSidebarNewProjectOpen(false);
      setNewProjectName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project.");
    } finally {
      setCreatingProject(false);
      setCreateStage(null);
    }
  }, [api, baseDirectory, newProjectName, setAndPersistDirectory]);

  const onChangeBaseDirectory = useCallback(async () => {
    if (!api) return;
    const dir = await api.dialog.selectDirectory();
    if (!dir) return;
    await api.settings.setBaseDirectory(dir);
    setBaseDirectory(dir);
  }, [api]);

  const refreshCompositions = useCallback(async () => {
    if (!api || !workingDirectory) return;
    try {
      const files = await api.project.listCompositions(workingDirectory);
      setCompositions((prev) => {
        const metaById = new Map(prev.map((c) => [c.id, c.meta]));
        return files.map((f) => ({
          id: f.name,
          meta: metaById.get(f.name) ?? DEFAULT_COMPOSITION_META
        }));
      });
      setSelectedComposition((sel) => {
        if (sel && files.some((f) => f.name === sel)) return sel;
        return files[0]?.name ?? "";
      });
    } catch {
      /* non-fatal */
    }
  }, [api, workingDirectory]);

  const deleteComposition = useCallback(
    async (compositionId: string) => {
      if (!api || !workingDirectory) {
        throw new Error("No project open.");
      }
      setError(null);
      try {
        await api.project.deleteComposition(workingDirectory, compositionId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete composition.");
        throw e;
      }
      await refreshCompositions();
    },
    [api, refreshCompositions, workingDirectory]
  );

  const refreshRenderHistory = useCallback(async () => {
    if (!api || !workingDirectory) return;
    try {
      const items = await api.project.listOutputs(workingDirectory);
      setRenderHistory(items);
    } catch {
      /* non-fatal */
    }
  }, [api, workingDirectory]);

  const openOutputVideo = useCallback(async (filePath: string) => {
    if (!api) return;
    setError(null);
    try {
      await api.shell.openPath(filePath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open video.");
    }
  }, [api]);

  const fetchProjectFiles = useCallback(async () => {
    if (!api || !workingDirectory) return [];
    try {
      return await api.project.listFiles(workingDirectory);
    } catch {
      return [];
    }
  }, [api, workingDirectory]);

  // Refresh composition file list from disk whenever preview is shown
  useEffect(() => {
    if (view !== "preview" || !api || !workingDirectory) return;
    void refreshCompositions();
  }, [view, api, workingDirectory, refreshCompositions]);

  const startPlayer = useCallback(async () => {
    if (!api || !workingDirectory) return;
    setError(null);
    setPlayerStarting(true);
    try {
      const { url } = await api.project.startPlayer(workingDirectory);
      setPlayerUrl(url);
      setPlayerRunning(true);
      void refreshCompositions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start player.");
    } finally {
      setPlayerStarting(false);
    }
  }, [api, workingDirectory, refreshCompositions]);

  const onPreview = useCallback(async () => {
    if (!api || !workingDirectory) return;
    if (playerRunning) {
      setView("preview");
      void refreshCompositions();
      return;
    }
    setPlayerStarting(true);
    setError(null);
    try {
      const { url } = await api.project.startPlayer(workingDirectory);
      setPlayerUrl(url);
      setPlayerRunning(true);
      setView("preview");
      void refreshCompositions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start preview.");
    } finally {
      setPlayerStarting(false);
    }
  }, [api, workingDirectory, playerRunning, refreshCompositions]);

  const isRunning = currentRun?.status === "running";

  const runAgentPrompt = useCallback(
    async (trimmedPrompt: string) => {
      if (!api || !selectedAgent || !trimmedPrompt || !workingDirectory) return;
      setError(null);
      setView("output");

      const state = sessionsRef.current.get(workingDirectory);
      const sessionId = state?.sessionIds[selectedAgent as AgentId];

      let systemPrompt: string | undefined;
      if (!sessionId && selectedAgent === "claude-code") {
        try {
          const sp = await api.project.readSystemPrompt(workingDirectory);
          if (sp) systemPrompt = sp;
        } catch {
          /* no system prompt */
        }
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: trimmedPrompt,
        timestamp: new Date().toISOString()
      };
      setChatMessages((prev) => [...prev, userMessage]);
      setCurrentRun(null);
      setPrompt("");

      try {
        const output = await api.prompt.run({
          agentId: selectedAgent as AgentId,
          prompt: trimmedPrompt,
          workingDirectory,
          systemPrompt,
          sessionId
        });
        setCurrentRun(output);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to run prompt.");
      }
    },
    [api, selectedAgent, workingDirectory]
  );

  const onSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!api || !selectedAgent || !workingDirectory) return;
    if (isRunning) return;
    if (!trimmed && composerImages.length === 0) return;

    setError(null);

    const paths: string[] = [];
    try {
      for (const img of composerImages) {
        const dataBase64 = await blobToBase64Payload(img.blob);
        const { relativePath } = await api.project.writeClipboardAsset({
          workingDirectory,
          dataBase64,
          mimeType: img.blob.type || "image/png"
        });
        paths.push(relativePath);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save images.");
      return;
    }

    const pathsBlock = paths.join("\n");
    let fullPrompt: string;
    if (trimmed && paths.length) fullPrompt = `${trimmed}\n\n${pathsBlock}`;
    else if (trimmed) fullPrompt = trimmed;
    else fullPrompt = pathsBlock;

    const toRevoke = [...composerImages];
    toRevoke.forEach((x) => URL.revokeObjectURL(x.previewUrl));
    setComposerImages([]);

    await runAgentPrompt(fullPrompt);
  }, [
    api,
    composerImages,
    isRunning,
    prompt,
    runAgentPrompt,
    selectedAgent,
    workingDirectory
  ]);

  const onStop = useCallback(async () => {
    if (!api || !currentRun) return;
    await api.prompt.stop(currentRun.id);
  }, [api, currentRun]);

  const onNewSession = useCallback(() => {
    if (workingDirectory) {
      sessionsRef.current.delete(workingDirectory);
      persistAgentSessionsMap(sessionsRef.current);
    }
    setChatMessages([]);
    setCurrentRun(null);
  }, [workingDirectory]);

  const dismissUpdate = useCallback(() => {
    setUpdateStatus(null);
  }, []);

  const triggerRender = useCallback(
    async (compositionId?: string) => {
      const id = compositionId ?? selectedComposition;
      if (!api || !workingDirectory || !id) return;
      setRenderProgress({ status: "rendering", progress: 0 });
      try {
        await api.project.render(workingDirectory, id);
      } catch (e) {
        setRenderProgress({
          status: "failed",
          progress: 0,
          error: e instanceof Error ? e.message : "Render failed"
        });
      }
    },
    [api, workingDirectory, selectedComposition]
  );

  return {
    api,
    agents,
    selectedAgent,
    setSelectedAgent,
    detectAgents,
    prompt,
    setPrompt,
    composerImages: composerImages.map(({ id, previewUrl }) => ({
      id,
      previewUrl
    })),
    addComposerImages,
    removeComposerImage,
    workingDirectory,
    recentProjects,
    setAndPersistDirectory,
    renameProject,
    deleteProject,
    revealProject,
    baseDirectory,
    sidebarNewProjectOpen,
    setSidebarNewProjectOpen,
    newProjectName,
    setNewProjectName,
    creatingProject,
    createStage,
    onNewProject,
    onCreateProject,
    onChangeBaseDirectory,
    currentRun,
    chatMessages,
    isRunning,
    error,
    onSubmit,
    onNewSession,
    onStop,
    updateStatus,
    dismissUpdate,
    // Video preview
    view,
    playerUrl,
    playerRunning,
    playerStarting,
    compositions,
    selectedComposition,
    renderProgress,
    renderHistory,
    switchToOutput: () => setView("output"),
    switchToPreview: () => setView("preview"),
    onPreview,
    selectComposition: setSelectedComposition,
    refreshCompositions,
    deleteComposition,
    fetchProjectFiles,
    refreshRenderHistory,
    openOutputVideo,
    triggerRender,
    startPlayer
  };
}
