import { FRAMEWORKS, type Framework, type User } from "@acme/contracts";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpenIcon } from "@hugeicons/core-free-icons";

const STAGE_LABEL: Record<"scaffold" | "install" | "player", string> = {
  scaffold: "Copying template…",
  install: "Installing packages…",
  player: "Starting preview…",
};

const FRAMEWORK_LABEL: Record<Framework, string> = {
  remotion: "Remotion",
  hyperframes: "Hyperframes",
};

interface CreateProjectStepProps {
  user: User;
  baseDirectory: string | null;
  projectName: string;
  framework: Framework;
  creating: boolean;
  createStage: "scaffold" | "install" | "player" | null;
  onSetName: (name: string) => void;
  onSetFramework: (framework: Framework) => void;
  onChangeBase: () => void;
  onCreate: () => void;
}

export function CreateProjectStep({
  user,
  baseDirectory,
  projectName,
  framework,
  creating,
  createStage,
  onSetName,
  onSetFramework,
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
        <div className="flex w-full justify-center items-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} className="shrink-0" />
          <span className="min-w-0 truncate">{baseDirectory}</span>
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

      {/* Framework picker */}
      <div className="flex w-full gap-2">
        {FRAMEWORKS.map((fw) => (
          <Button
            key={fw}
            type="button"
            variant={framework === fw ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => onSetFramework(fw)}
            disabled={creating}
          >
            {FRAMEWORK_LABEL[fw]}
          </Button>
        ))}
      </div>

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
