import type { Framework, User } from "@acme/contracts";

import { Badge } from "@/components/ui/badge";

import { CreateProjectStep } from "./create-project-step";
import { LoginStep } from "./login-step";

const TOTAL_STEPS = 2;

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex justify-center pt-14">
      <div className="flex w-40 gap-1.5">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < step ? "bg-foreground" : "bg-muted-foreground/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export interface OnboardingProps {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  onLogin: () => void;
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

export function Onboarding(props: OnboardingProps) {
  const step = props.user ? 2 : 1;

  return (
    <main
      className="flex h-screen flex-col bg-background text-foreground"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <ProgressBar step={step} />

      <div
        className="flex flex-1 flex-col items-center justify-center"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {/* Branding */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">snug</h1>
          <Badge variant="secondary" className="text-[10px]">beta</Badge>
        </div>

        {!props.user ? (
          <LoginStep
            loading={props.authLoading}
            error={props.authError}
            onLogin={props.onLogin}
          />
        ) : (
          <CreateProjectStep
            user={props.user}
            baseDirectory={props.baseDirectory}
            projectName={props.projectName}
            framework={props.framework}
            creating={props.creating}
            createStage={props.createStage}
            onSetName={props.onSetName}
            onSetFramework={props.onSetFramework}
            onChangeBase={props.onChangeBase}
            onCreate={props.onCreate}
          />
        )}
      </div>
    </main>
  );
}
