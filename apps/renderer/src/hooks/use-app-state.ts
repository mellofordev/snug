import { useCallback, useEffect, useState } from "react";

import type { Agent, AgentId, NativeApi, PromptOutput } from "@acme/contracts";

const RECENT_PROJECTS_KEY = "snug:recent-projects";

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
  onSelectDirectory: () => Promise<void>;

  baseDirectory: string | null;
  sidebarNewProjectOpen: boolean;
  setSidebarNewProjectOpen: (open: boolean) => void;
  newProjectName: string;
  setNewProjectName: (name: string) => void;
  creatingProject: boolean;
  onNewProject: () => Promise<void>;
  onCreateProject: () => Promise<void>;
  onChangeBaseDirectory: () => Promise<void>;

  currentRun: PromptOutput | null;
  isRunning: boolean;
  error: string | null;
  onSubmit: () => Promise<void>;
  onStop: () => Promise<void>;
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

  // Persist recent projects when working directory changes
  useEffect(() => {
    if (!workingDirectory) return;
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
      const prev: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      const next = [workingDirectory, ...prev.filter((p) => p !== workingDirectory)].slice(0, 12);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
      setRecentProjects(next);
    } catch {
      /* ignore */
    }
  }, [workingDirectory]);

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

  const setAndPersistDirectory = useCallback(
    async (dir: string) => {
      setWorkingDirectory(dir);
      await api?.settings.setLastOpenedDirectory(dir);
    },
    [api]
  );

  const onSelectDirectory = useCallback(async () => {
    if (!api) return;
    const dir = await api.dialog.selectDirectory();
    if (dir) await setAndPersistDirectory(dir);
  }, [api, setAndPersistDirectory]);

  const onNewProject = useCallback(async () => {
    if (!api) return;
    if (!baseDirectory) {
      const dir = await api.dialog.selectDirectory();
      if (!dir) return;
      await api.settings.setBaseDirectory(dir);
      setBaseDirectory(dir);
    }
    setSidebarNewProjectOpen(true);
    setNewProjectName("");
  }, [api, baseDirectory]);

  const onCreateProject = useCallback(async () => {
    if (!api || !baseDirectory || !newProjectName.trim()) return;
    const safeName = newProjectName.trim().replace(/[^a-zA-Z0-9_-]/g, "-");
    const fullPath = `${baseDirectory}/${safeName}`;

    setCreatingProject(true);
    setError(null);
    try {
      const created = await api.fs.createDirectory(fullPath);
      await setAndPersistDirectory(created);
      setSidebarNewProjectOpen(false);
      setNewProjectName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create directory.");
    } finally {
      setCreatingProject(false);
    }
  }, [api, baseDirectory, newProjectName, setAndPersistDirectory]);

  const onChangeBaseDirectory = useCallback(async () => {
    if (!api) return;
    const dir = await api.dialog.selectDirectory();
    if (!dir) return;
    await api.settings.setBaseDirectory(dir);
    setBaseDirectory(dir);
  }, [api]);

  const onSubmit = useCallback(async () => {
    if (!api || !selectedAgent || !prompt.trim() || !workingDirectory) return;
    setError(null);
    setCurrentRun(null);
    try {
      const output = await api.prompt.run({
        agentId: selectedAgent as AgentId,
        prompt: prompt.trim(),
        workingDirectory
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
    onSelectDirectory,
    baseDirectory,
    sidebarNewProjectOpen,
    setSidebarNewProjectOpen,
    newProjectName,
    setNewProjectName,
    creatingProject,
    onNewProject,
    onCreateProject,
    onChangeBaseDirectory,
    currentRun,
    isRunning,
    error,
    onSubmit,
    onStop
  };
}
