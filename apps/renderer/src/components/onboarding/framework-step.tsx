import { FRAMEWORKS, type Framework } from "@acme/contracts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FrameworkMeta {
  label: string;
  description: string;
}

const FRAMEWORK_META: Record<Framework, FrameworkMeta> = {
  remotion: {
    label: "Remotion",
    description: "Compose programmatic videos in React.",
  },
  hyperframes: {
    label: "Hyperframes",
    description: "Snug's lightweight motion runtime.",
  },
};

interface FrameworkStepProps {
  framework: Framework;
  onSetFramework: (framework: Framework) => void;
  onContinue: () => void;
}

export function FrameworkStep({ framework, onSetFramework, onContinue }: FrameworkStepProps) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6">
      <p className="text-center text-sm text-muted-foreground">
        Choose a framework for your project.
      </p>

      <div className="flex w-full flex-col gap-2">
        {FRAMEWORKS.map((fw) => {
          const meta = FRAMEWORK_META[fw];
          const selected = framework === fw;
          return (
            <button
              key={fw}
              type="button"
              onClick={() => onSetFramework(fw)}
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-[calc(var(--radius)+4px)] border bg-card px-4 py-3 text-left transition-colors outline-none",
                "hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected
                  ? "border-foreground/40 ring-1 ring-foreground/20"
                  : "border-border"
              )}
            >
              <span className="text-sm font-medium">{meta.label}</span>
              <span className="text-xs text-muted-foreground">{meta.description}</span>
            </button>
          );
        })}
      </div>

      <Button size="lg" className="w-full" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
