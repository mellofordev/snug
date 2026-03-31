import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import { Composer } from "@/components/composer";
import { Onboarding } from "@/components/onboarding/index";
import { ChatViewer } from "@/components/chat-viewer";
import { SidePanel } from "@/components/side-panel";
import { TopBar } from "@/components/top-bar";
import { VideoPreview } from "@/components/video-preview";
import { useAppState } from "@/hooks/use-app-state";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApi } from "@/hooks/use-native-api";

export default function App() {
  const api = useNativeApi();
  const auth = useAuth(api);
  const state = useAppState(api);

  if (!api) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-8 text-foreground">
        <div className="rounded-2xl border border-border bg-card px-6 py-5 text-card-foreground shadow-sm">
          <h1 className="text-base font-semibold">Native bridge unavailable</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Launch this UI through Electron.</p>
        </div>
      </main>
    );
  }

  // Auth loading state
  if (auth.loading && !auth.user) {
    return (
      <main className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </main>
    );
  }

  // Onboarding gate: show if not logged in OR no projects yet
  if (!auth.user || state.recentProjects.length === 0) {
    return (
      <Onboarding
        user={auth.user}
        authLoading={auth.loading}
        authError={auth.error}
        onLogin={() => void auth.login()}
        baseDirectory={state.baseDirectory}
        projectName={state.newProjectName}
        creating={state.creatingProject}
        createStage={state.createStage}
        onSetName={state.setNewProjectName}
        onChangeBase={() => void state.onChangeBaseDirectory()}
        onCreate={() => void state.onCreateProject()}
      />
    );
  }

  return (
    <TooltipProvider>
      <>
        <main className="flex h-screen bg-background text-foreground">
          <SidePanel
            user={auth.user}
            recentProjects={state.recentProjects}
            workingDirectory={state.workingDirectory}
            currentRun={state.currentRun}
            isRunning={state.isRunning}
            baseDirectory={state.baseDirectory}
            sidebarNewProjectOpen={state.sidebarNewProjectOpen}
            newProjectName={state.newProjectName}
            creatingProject={state.creatingProject}
            createStage={state.createStage}
            onSelectProject={(path) => void state.setAndPersistDirectory(path)}
            onRenameProject={(path, nextName) => void state.renameProject(path, nextName)}
            onDeleteProject={(path) => void state.deleteProject(path)}
            onRevealProject={(path) => void state.revealProject(path)}
            onNewProject={state.onNewProject}
            onCreateProject={() => void state.onCreateProject()}
            onChangeBaseDirectory={() => void state.onChangeBaseDirectory()}
            onSetNewProjectName={state.setNewProjectName}
            onCloseSidebarNewProject={() => state.setSidebarNewProjectOpen(false)}
            onLogout={() => void auth.logout()}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!(state.view === "preview" && state.playerUrl) && (
              <TopBar workingDirectory={state.workingDirectory} />
            )}

            {state.error && (
              <div className="shrink-0 bg-destructive/5 px-5 py-2 text-sm text-destructive">
                {state.error}
              </div>
            )}

            {state.view === "preview" && state.playerUrl ? (
              <VideoPreview
                playerUrl={state.playerUrl}
                compositions={state.compositions}
                selectedComposition={state.selectedComposition}
                renderProgress={state.renderProgress}
                renderHistory={state.renderHistory}
                onSelectComposition={state.selectComposition}
                onCompositionMenuOpen={() => void state.refreshCompositions()}
                onRenderHistoryMenuOpen={() => void state.refreshRenderHistory()}
                onOpenOutputVideo={(p) => void state.openOutputVideo(p)}
                onRender={(id) => void state.triggerRender(id)}
                onBack={state.switchToOutput}
              />
            ) : (
              <ChatViewer currentRun={state.currentRun} chatMessages={state.chatMessages} isRunning={state.isRunning} />
            )}

            <Composer
              prompt={state.prompt}
              workingDirectory={state.workingDirectory}
              agents={state.agents}
              selectedAgent={state.selectedAgent}
              isRunning={state.isRunning}
              playerRunning={state.playerRunning}
              playerStarting={state.playerStarting}
              onSetPrompt={state.setPrompt}
              onSelectAgent={state.setSelectedAgent}
              onSubmit={() => void state.onSubmit()}
              onStop={() => void state.onStop()}
              onPreview={state.onPreview}
            />
          </div>
        </main>
        <Toaster />
      </>
    </TooltipProvider>
  );
}
