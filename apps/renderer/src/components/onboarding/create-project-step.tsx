import type { User } from "@acme/contracts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STAGE_LABEL: Record<"scaffold" | "install" | "player", string> = {
  scaffold: "Copying template…",
  install: "Installing packages…",
  player: "Starting preview…",
};

interface CreateProjectStepProps {
  user: User;
  baseDirectory: string | null;
  projectName: string;
  creating: boolean;
  createStage: "scaffold" | "install" | "player" | null;
  onSetName: (name: string) => void;
  onChangeBase: () => void;
  onCreate: () => void;
}

export function CreateProjectStep({
  user,
  baseDirectory,
  projectName,
  creating,
  createStage,
  onSetName,
  onChangeBase,
  onCreate,
}: CreateProjectStepProps) {
  const safeName = projectName.trim().replace(/[^a-zA-Z0-9_-]/g, "-");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6">
      <p className="text-center text-sm text-muted-foreground">
        Welcome, {user.name.split(" ")[0]}! Create your first project.
      </p>

      {/* Base directory picker */}
      {baseDirectory ? (
        <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">Location:</span>
          <span className="min-w-0 truncate font-mono">{baseDirectory}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto shrink-0 p-0 text-xs"
            onClick={onChangeBase}
          >
            change
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={onChangeBase}>
          Pick a location…
        </Button>
      )}

      {/* Project name */}
      <Input
        value={projectName}
        onChange={(e) => onSetName(e.target.value)}
        placeholder="my-video-project"
        onKeyDown={(e) => {
          if (e.key === "Enter" && baseDirectory && projectName.trim()) onCreate();
        }}
        autoFocus
      />

      {safeName && baseDirectory && (
        <p className="w-full truncate font-mono text-xs text-muted-foreground">
          {baseDirectory}/{safeName}
        </p>
      )}

      {/* Progress indicator */}
      {createStage && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-2 animate-pulse rounded-full bg-blue-500" />
          {STAGE_LABEL[createStage]}
        </p>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={!projectName.trim() || !baseDirectory || creating}
        onClick={onCreate}
      >
        {creating ? STAGE_LABEL[createStage ?? "scaffold"] : "Create project"}
      </Button>
    </div>
  );
}
