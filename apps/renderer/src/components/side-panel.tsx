import type { PromptOutput, User } from "@acme/contracts";
import { Add01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePreference } from "@/components/theme-provider";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

function projectLabel(fullPath: string) {
  const parts = fullPath.split(/[/\\]/u).filter(Boolean);
  return parts[parts.length - 1] ?? fullPath;
}

function truncatePath(path: string, max = 38) {
  if (path.length <= max) return path;
  const keep = max - 3;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${path.slice(0, head)}…${path.slice(-tail)}`;
}

interface SidePanelProps {
  user: User;
  recentProjects: string[];
  workingDirectory: string;
  currentRun: PromptOutput | null;
  isRunning: boolean;
  baseDirectory: string | null;
  sidebarNewProjectOpen: boolean;
  newProjectName: string;
  creatingProject: boolean;
  createStage: "scaffold" | "install" | "player" | null;
  onSelectProject: (path: string) => void;
  onNewProject: () => void;
  onCreateProject: () => void;
  onChangeBaseDirectory: () => void;
  onSetNewProjectName: (name: string) => void;
  onCloseSidebarNewProject: () => void;
  onLogout: () => void;
}

export function SidePanel({
  user,
  recentProjects,
  workingDirectory,
  currentRun,
  isRunning,
  baseDirectory,
  sidebarNewProjectOpen,
  newProjectName,
  creatingProject,
  createStage,
  onSelectProject,
  onNewProject,
  onCreateProject,
  onChangeBaseDirectory,
  onSetNewProjectName,
  onCloseSidebarNewProject,
  onLogout
}: SidePanelProps) {
  const { theme, setTheme } = useTheme();

  return (
    <SidebarProvider className="min-h-0 w-auto flex-none">
      <Sidebar collapsible="none">
        {/* Draggable header — traffic lights sit here on macOS */}
        <SidebarHeader
          className="box-border h-[38px] min-h-[38px] max-h-[38px] flex-row flex-nowrap items-center justify-between gap-2 p-0 pl-[78px] pr-2"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="flex h-full min-w-0 items-center gap-2">
            <span className="text-sm font-semibold leading-tight tracking-tight">
              snug
            </span>
            <Badge
              variant="secondary"
              className="h-5 shrink-0 px-1.5 py-0 text-[10px] font-medium leading-none"
            >
              beta
            </Badge>
          </div>

          <div
            className="flex h-full shrink-0 items-center self-stretch"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                className="box-border inline-flex border rounded-full h-5 w-5 min-h-5 min-w-5 max-h-5 max-w-5 shrink-0 items-center justify-center  p-0 text-muted-foreground shadow-none transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                <HugeiconsIcon icon={UserIcon} size={14} strokeWidth={2} className="shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Settings</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-44">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Theme
                      </DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={theme}
                        onValueChange={(value) => {
                          if (value === "light" || value === "dark" || value === "system") {
                            setTheme(value as ThemePreference);
                          }
                        }}
                      >
                        <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarGroupContent>
              {recentProjects.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  Create a new project to get started.
                </p>
              ) : (
                <SidebarMenu>
                  {recentProjects.map((path) => {
                    const active = path === workingDirectory;
                    const showStatus = active && currentRun;

                    let dotColor = "bg-muted-foreground/30";
                    if (showStatus && isRunning) dotColor = "animate-pulse bg-blue-500";
                    else if (showStatus && currentRun.status === "completed") dotColor = "bg-emerald-500";
                    else if (showStatus && currentRun.status === "failed") dotColor = "bg-rose-500";

                    return (
                      <SidebarMenuItem key={path}>
                        <SidebarMenuButton
                          isActive={active}
                          onClick={() => onSelectProject(path)}
                          className="h-auto items-start gap-2.5 py-2"
                        >
                          <span className={`mt-[5px] size-1.5 shrink-0 rounded-full ${dotColor}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {projectLabel(path)}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-sidebar-foreground/50">
                              {truncatePath(path)}
                            </span>
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <NewProjectDialog
            open={sidebarNewProjectOpen}
            baseDirectory={baseDirectory}
            projectName={newProjectName}
            creating={creatingProject}
            createStage={createStage}
            isRunning={isRunning}
            onOpen={onNewProject}
            onClose={onCloseSidebarNewProject}
            onSetName={onSetNewProjectName}
            onChangeBase={onChangeBaseDirectory}
            onCreate={onCreateProject}
          />
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );
}

const STAGE_LABEL: Record<"scaffold" | "install" | "player", string> = {
  scaffold: "Copying template…",
  install:  "Installing packages…",
  player:   "Starting preview…",
};

interface NewProjectDialogProps {
  open: boolean;
  baseDirectory: string | null;
  projectName: string;
  creating: boolean;
  createStage: "scaffold" | "install" | "player" | null;
  isRunning: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSetName: (name: string) => void;
  onChangeBase: () => void;
  onCreate: () => void;
}

function NewProjectDialog({
  open,
  baseDirectory,
  projectName,
  creating,
  createStage,
  isRunning,
  onOpen,
  onClose,
  onSetName,
  onChangeBase,
  onCreate
}: NewProjectDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) onOpen();
        else onClose();
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center"
            disabled={isRunning}
          />
        }
      >
        <HugeiconsIcon icon={Add01Icon} size={14} />
        New project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new project</DialogTitle>
          <DialogDescription>
            Choose a name for your Remotion project folder.
          </DialogDescription>
        </DialogHeader>

        {baseDirectory ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Location:</span>
            <span className="min-w-0 truncate font-mono">{baseDirectory}</span>
            <Button
              variant="link"
              size="xs"
              className="h-auto shrink-0 p-0"
              onClick={onChangeBase}
            >
              change
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              Choose a folder where new projects will be created.
            </p>
            <Button variant="outline" size="sm" onClick={onChangeBase}>
              Pick location…
            </Button>
          </div>
        )}

        <Input
          value={projectName}
          onChange={(e) => onSetName(e.target.value)}
          placeholder="my-video-project"
          onKeyDown={(e) => { if (e.key === "Enter" && baseDirectory) onCreate(); }}
          autoFocus
        />

        {projectName.trim() && baseDirectory && (
          <p className="font-mono text-xs text-muted-foreground">
            {baseDirectory}/{projectName.trim().replace(/[^a-zA-Z0-9_-]/g, "-")}
          </p>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
          {createStage && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block size-2 animate-pulse rounded-full bg-blue-500" />
              {STAGE_LABEL[createStage]}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
            <Button
              disabled={!projectName.trim() || !baseDirectory || creating}
              onClick={onCreate}
            >
              {creating ? STAGE_LABEL[createStage ?? "scaffold"] : "Create project"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
