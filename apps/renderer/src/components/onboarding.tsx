import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OnboardingProps {
  loading: boolean;
  error: string | null;
  onLogin: () => void;
}

export function Onboarding({ loading, error, onLogin }: OnboardingProps) {
  return (
    <main
      className="flex h-screen flex-col items-center justify-center bg-background text-foreground"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-6 px-6"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {/* Branding */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">snug</h1>
          <Badge variant="secondary" className="text-[10px]">beta</Badge>
        </div>

        

        {/* Login */}
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={loading}
          onClick={onLogin}
        >
          {loading ? "Signing in…" : "Sign in with Google"}
        </Button>

        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}

        <p className="text-center text-[11px] text-muted-foreground/60">
          By signing in you agree to our terms of service.
        </p>
      </div>
    </main>
  );
}
