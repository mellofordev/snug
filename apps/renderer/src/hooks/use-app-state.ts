import { useCallback, useEffect, useState } from "react";

import type {
  Agent,
  AgentId,
  NativeApi,
  PromptOutput,
  RenderHistoryItem,
  RenderProgress
} from "@acme/contracts";

const RECENT_PROJECTS_KEY = "snug:recent-projects";

interface CompositionItem {
  id: string;
  meta: {
    fps: number;
    durationInFrames: number;
    width: number;
    height: number;
  };
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
  isRunning: boolean;
  error: string | null;
  onSubmit: () => Promise<void>;
  onStop: () => Promise<void>;

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
  refreshRenderHistory: () => Promise<void>;
  openOutputVideo: (filePath: string) => Promise<void>;
  triggerRender: (compositionId?: string) => Promise<void>;
  startPlayer: () => Promise<void>;
}

export function useAppState(api: NativeApi | undefined): AppState {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentId | "">("");
  const [prompt, setPrompt] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [currentRun, setCurrentRun] = useState<PromptOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const first = detected.find((a) => a.available);
      if (first) setSelectedAgent(first.id);
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

  // Load persisted settings on mount
  useEffect(() => {
    if (!api) return;
    void Promise.all([
      api.settings.getBaseDirectory(),
      api.settings.getLastOpenedDirectory()
    ]).then(([base, last]) => {
      setBaseDirectory(base);
      if (last) setWorkingDirectory(last);
    });
  }, [api]);

  // Detect agents on mount
  useEffect(() => {
    void detectAgents();
  }, [detectAgents]);

  // Subscribe to prompt output stream
  useEffect(() => {
    if (!api) return;
    return api.prompt.onOutput((output) => setCurrentRun(output));
  }, [api]);

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
      setWorkingDirectory(dir);
      await api?.settings.setLastOpenedDirectory(dir);
    },
    [api]
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

  const onSubmit = useCallback(async () => {
    if (!api || !selectedAgent || !prompt.trim() || !workingDirectory) return;
    setError(null);
    setCurrentRun(null);
    setView("output");

    // Read system prompt from project
    let systemPrompt: string | undefined;
    try {
      const sp = await api.project.readSystemPrompt(workingDirectory);
      if (sp) systemPrompt = sp;
    } catch {
      // No system prompt is fine
    }

    try {
      const output = await api.prompt.run({
        agentId: selectedAgent as AgentId,
        prompt: prompt.trim(),
        workingDirectory,
        systemPrompt
      });
      setCurrentRun(output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run prompt.");
    }
  }, [api, selectedAgent, prompt, workingDirectory]);

  const onStop = useCallback(async () => {
    if (!api || !currentRun) return;
    await api.prompt.stop(currentRun.id);
  }, [api, currentRun]);

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

  const isRunning = currentRun?.status === "running";

  return {
    api,
    agents,
    selectedAgent,
    setSelectedAgent,
    detectAgents,
    prompt,
    setPrompt,
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
    isRunning,
    error,
    onSubmit,
    onStop,
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
    refreshRenderHistory,
    openOutputVideo,
    triggerRender,
    startPlayer
  };
}
