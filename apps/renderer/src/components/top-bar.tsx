function projectLabel(fullPath: string) {
  const parts = fullPath.split(/[/\\]/u).filter(Boolean);
  return parts[parts.length - 1] ?? fullPath;
}

interface TopBarProps {
  workingDirectory: string;
}

export function TopBar({ workingDirectory }: TopBarProps) {
  const activeProjectName = workingDirectory ? projectLabel(workingDirectory) : null;

  return (
    <header
      className="flex h-[38px] shrink-0 items-center gap-3 px-5"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="min-w-0 flex-1">
        {activeProjectName ? (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{activeProjectName}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select or create a project</p>
        )}
      </div>
    </header>
  );
}
