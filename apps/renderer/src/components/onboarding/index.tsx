import * as React from "react";

import type { User } from "@acme/contracts";

import { Badge } from "@/components/ui/badge";

import { CreateProjectStep } from "./create-project-step";
import { LoginStep } from "./login-step";

function ProgressBar({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <div className="flex justify-center pt-14">
      <div className="flex w-40 gap-1.5">
        {Array.from({ length: totalSteps }, (_, i) => (
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
  creating: boolean;
  createStage: "scaffold" | "install" | "player" | null;
  onSetName: (name: string) => void;
  onChangeBase: () => void;
  onCreate: () => void;
}

type StepKey = "login" | "details";

export function Onboarding(props: OnboardingProps) {
  const includesLoginRef = React.useRef(!props.user);
  const includesLogin = includesLoginRef.current;

  const totalSteps = includesLogin ? 2 : 1;
  const activeKey: StepKey = !props.user ? "login" : "details";

  const step = !props.user ? 1 : includesLogin ? 2 : 1;

  const previousKeyRef = React.useRef<StepKey>(activeKey);
  const direction: "forward" | "backward" =
    keyOrder(activeKey) >= keyOrder(previousKeyRef.current) ? "forward" : "backward";
  React.useEffect(() => {
    previousKeyRef.current = activeKey;
  }, [activeKey]);

  const stepContent = !props.user ? (
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
      creating={props.creating}
      createStage={props.createStage}
      onSetName={props.onSetName}
      onChangeBase={props.onChangeBase}
      onCreate={props.onCreate}
    />
  );

  return (
    <main
      className="flex h-screen flex-col bg-background text-foreground"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <ProgressBar step={step} totalSteps={totalSteps} />

      <div
        className="flex flex-1 flex-col items-center justify-center"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">snug</h1>
          <Badge variant="secondary" className="text-[10px]">beta</Badge>
        </div>

        <div
          key={activeKey}
          className={`flex w-full justify-center duration-300 ease-out animate-in fade-in-0 ${
            direction === "forward"
              ? "slide-in-from-right-3"
              : "slide-in-from-left-3"
          }`}
        >
          {stepContent}
        </div>
      </div>
    </main>
  );
}

function keyOrder(key: StepKey): number {
  switch (key) {
    case "login":
      return 0;
    case "details":
      return 1;
  }
}
