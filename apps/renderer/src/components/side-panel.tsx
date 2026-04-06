import * as React from "react";

import type { NativeApi, PromptOutput, UpdateStatus, User } from "@acme/contracts";
import { Add01Icon, ArrowReloadHorizontalIcon, ComputerIcon, Delete02Icon, Download04Icon, Edit02Icon, FolderOpenIcon, FolderViewIcon, LogoutIcon, MenuIcon, Moon02Icon, SettingsIcon, SunIcon, UserIcon } from "@hugeicons/core-free-icons";
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
  SidebarMenuAction,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";

function projectLabel(fullPath: string) {
  const parts = fullPath.split(/[/\\]/u).filter(Boolean);
  return parts[parts.length - 1] ?? fullPath;
}

interface SidePanelProps {
  api: NativeApi;
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
  updateStatus: UpdateStatus | null;
  onDismissUpdate: () => void;
  onSelectProject: (path: string) => void;
  onRenameProject: (path: string, nextName: string) => void;
  onDeleteProject: (path: string) => void;
  onRevealProject: (path: string) => void;
  onNewProject: () => void;
  onCreateProject: () => void;
  onChangeBaseDirectory: () => void;
  onSetNewProjectName: (name: string) => void;
  onCloseSidebarNewProject: () => void;
  onLogout: () => void;
}

export function SidePanel({
  api,
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
  updateStatus,
  onDismissUpdate,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  onRevealProject,
  onNewProject,
  onCreateProject,
  onChangeBaseDirectory,
  onSetNewProjectName,
  onCloseSidebarNewProject,
  onLogout
}: SidePanelProps) {
  const { theme, setTheme } = useTheme();
  const [renameTargetPath, setRenameTargetPath] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTargetPath, setDeleteTargetPath] = React.useState<string | null>(null);

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
                className="inline-flex border  rounded-full h-5 w-5 min-h-5 min-w-5 max-h-5 max-w-5 shrink-0 items-center justify-center  p-0 text-muted-foreground shadow-none transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <DropdownMenuSubTrigger className="flex items-center gap-2"><HugeiconsIcon icon={SettingsIcon} size={14} strokeWidth={2} className="shrink-0" /> Settings</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-44">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                        <HugeiconsIcon icon={SunIcon} size={14} strokeWidth={2} className="shrink-0" />
                        <span>Theme</span>
                      </DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={theme}
                        onValueChange={(value) => {
                          if (value === "light" || value === "dark" || value === "system") {
                            setTheme(value as ThemePreference);
                          }
                        }}
                      >
                        <DropdownMenuRadioItem value="light" className="gap-2">
                          <HugeiconsIcon icon={SunIcon} size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                          <span>Light</span>
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dark" className="gap-2">
                          <HugeiconsIcon icon={Moon02Icon} size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                          <span>Dark</span>
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="system" className="gap-2">
                          <HugeiconsIcon icon={ComputerIcon} size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                          <span>System</span>
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="flex items-center gap-2"><HugeiconsIcon icon={LogoutIcon} size={14} strokeWidth={2} className="shrink-0" /> Log out</DropdownMenuItem>
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
                          className="h-auto items-center gap-2.5 py-2 pr-10"
                        >
                          <span className={`size-1.5 shrink-0 rounded-full ${dotColor}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-normal">
                              {projectLabel(path)}
                            </span>
                          </span>
                        </SidebarMenuButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="absolute top-1/2 right-2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/60 opacity-0 outline-none transition-colors transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/menu-item:opacity-100 data-[popup-open]:opacity-100"
                            aria-label={`Project options for ${projectLabel(path)}`}
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            <HugeiconsIcon icon={MenuIcon} size={14} strokeWidth={2} className="shrink-0" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => onSelectProject(path)}>
                              <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} className="shrink-0" />
                              Open project
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setRenameTargetPath(path);
                                setRenameValue(projectLabel(path));
                              }}
                            >
                              <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} className="shrink-0" />
                              Modify
                            </DropdownMenuItem>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <HugeiconsIcon icon={FolderViewIcon} size={14} strokeWidth={2} className="shrink-0" />
                                Open in…
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-44">
                                <DropdownMenuItem onClick={() => onRevealProject(path)}>
                                  <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} className="shrink-0" />
                                  Reveal in folder
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTargetPath(path)}
                            >
                              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} className="shrink-0" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-2 pb-3">
          <UpdateBanner status={updateStatus} onDismiss={onDismissUpdate} onInstall={() => void api.app.installUpdate()} />
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
        <RenameProjectDialog
          open={Boolean(renameTargetPath)}
          projectName={renameValue}
          onSetProjectName={setRenameValue}
          onClose={() => {
            setRenameTargetPath(null);
            setRenameValue("");
          }}
          onConfirm={() => {
            if (!renameTargetPath) return;
            onRenameProject(renameTargetPath, renameValue);
            setRenameTargetPath(null);
            setRenameValue("");
          }}
        />
        <DeleteProjectDialog
          open={Boolean(deleteTargetPath)}
          projectName={deleteTargetPath ? projectLabel(deleteTargetPath) : ""}
          onClose={() => setDeleteTargetPath(null)}
          onConfirm={() => {
            if (!deleteTargetPath) return;
            onDeleteProject(deleteTargetPath);
            setDeleteTargetPath(null);
          }}
        />
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
        </DialogHeader>

        {baseDirectory ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0"><HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} className="shrink-0" /></span>
            <span className="min-w-0 truncate">{baseDirectory}</span>
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
        <div className="flex flex-col gap-2">
        <Label className="text-xs font-normal">Choose a name for your project folder</Label>
        <Input
          value={projectName}
          onChange={(e) => onSetName(e.target.value)}
          placeholder="Project name"
          onKeyDown={(e) => { if (e.key === "Enter" && baseDirectory) onCreate(); }}
          autoFocus
        />
        </div>
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

interface RenameProjectDialogProps {
  open: boolean;
  projectName: string;
  onSetProjectName: (name: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

function RenameProjectDialog({
  open,
  projectName,
  onSetProjectName,
  onClose,
  onConfirm
}: RenameProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modify project</DialogTitle>
          <DialogDescription>
            Rename the project folder.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={projectName}
          onChange={(event) => onSetProjectName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && projectName.trim()) onConfirm();
          }}
          placeholder="Project name"
          autoFocus
        />

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!projectName.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteProjectDialogProps {
  open: boolean;
  projectName: string;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteProjectDialog({
  open,
  projectName,
  onClose,
  onConfirm
}: DeleteProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            This will permanently delete <span className="font-medium text-foreground">{projectName}</span> from disk.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline update banner (replaces toast) ──────────────────────────────

interface UpdateBannerProps {
  status: UpdateStatus | null;
  onDismiss: () => void;
  onInstall: () => void;
}

function UpdateBanner({ status, onDismiss, onInstall }: UpdateBannerProps) {
  if (!status || status.state === "checking" || status.state === "not-available") {
    return null;
  }

  if (status.state === "error") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <span className="flex-1 truncate">Update failed</span>
        <button type="button" onClick={onDismiss} className="shrink-0 text-[10px] text-destructive/70 hover:text-destructive">
          Dismiss
        </button>
      </div>
    );
  }

  if (status.state === "downloaded") {
    return (
      <button
        type="button"
        onClick={onInstall}
        className="group flex w-full items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/10"
      >
        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} className="shrink-0" />
        <span className="flex-1 text-left">
          Snug {status.info.version} ready — <span className="font-medium">restart to update</span>
        </span>
      </button>
    );
  }

  // "available" or "downloading"
  const pct = status.state === "downloading" ? Math.round(status.progress.percent) : null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <HugeiconsIcon icon={Download04Icon} size={14} className="shrink-0 animate-pulse" />
      <span className="flex-1 truncate">
        {pct !== null ? `Downloading update… ${pct}%` : `Downloading ${status.state === "available" ? `v${status.info.version}` : "update"}…`}
      </span>
      <button type="button" onClick={onDismiss} className="shrink-0 text-[10px] text-muted-foreground/70 hover:text-foreground">
        ✕
      </button>
    </div>
  );
}
