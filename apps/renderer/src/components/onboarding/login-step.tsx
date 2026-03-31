import { Button } from "@/components/ui/button";

interface LoginStepProps {
  loading: boolean;
  error: string | null;
  onLogin: () => void;
}

export function LoginStep({ loading, error, onLogin }: LoginStepProps) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6">
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
  );
}
