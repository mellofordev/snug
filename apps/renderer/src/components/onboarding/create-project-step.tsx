import type { Framework, User } from "@acme/contracts";
import { ArrowLeft, FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

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
  onChangeBase: () => void;
  onCreate: () => void;
  onBack: () => void;
}

export function CreateProjectStep({
  user,
  baseDirectory,
  projectName,
  framework,
  creating,
  createStage,
  onSetName,
  onChangeBase,
  onCreate,
  onBack,
}: CreateProjectStepProps) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6">
      <p className="text-center text-sm text-muted-foreground">
        Welcome, {user.name.split(" ")[0]}! Name your {FRAMEWORK_LABEL[framework]} project.
      </p>

      <div className="flex w-full flex-col gap-1.5">
        <InputGroup>
          <InputGroupInput
            value={projectName}
            onChange={(e) => onSetName(e.target.value)}
            placeholder="my-video-project"
            onKeyDown={(e) => {
              if (e.key === "Enter" && baseDirectory && projectName.trim()) onCreate();
            }}
            autoFocus
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={onChangeBase}
              disabled={creating}
              aria-label="Change location"
              title={baseDirectory ?? "Choose a location"}
            >
              <FolderOpen />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

      </div>

      <div className="flex w-full flex-col gap-2">
        <Button
          size="lg"
          className="w-full"
          disabled={!projectName.trim() || !baseDirectory || creating}
          onClick={onCreate}
        >
          {creating ? STAGE_LABEL[createStage ?? "scaffold"] : "Create project"}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={onBack}
          disabled={creating}
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Change framework
        </Button>
      </div>
    </div>
  );
}
