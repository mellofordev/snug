import type { UpdateStatus } from "@acme/contracts";
import { ArrowReloadHorizontalIcon, Cancel01Icon, Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface UpdateBannerProps {
  status: UpdateStatus | null;
  onDismiss: () => void;
  onInstall: () => void;
}

export function UpdateBanner({ status, onDismiss, onInstall }: UpdateBannerProps) {
  if (!status || status.state === "checking" || status.state === "not-available") {
    return null;
  }

  if (status.state === "error") {
    return (
      <Card size="sm" className="gap-2 py-2.5 px-0">
        <CardHeader className="gap-1 px-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={2} className="shrink-0 text-destructive" />
            <CardTitle className="text-xs">Update failed</CardTitle>
          </div>
          <CardAction>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-sm p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
              aria-label="Dismiss"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
            </button>
          </CardAction>
          <CardDescription className="text-[11px] leading-snug">{status.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status.state === "downloaded") {
    return (
      <Card size="sm" className="gap-2 py-2.5 px-0">
        <CardHeader className="gap-1 px-3">
            <CardTitle className="text-xs">Snug {status.info.version} ready</CardTitle>
          <CardDescription className="text-[11px] leading-snug">Restart to apply the update.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" className="w-full" onClick={onInstall}>
          <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} strokeWidth={2} /> Restart &amp; update
          </Button>
        </CardContent>
      </Card>
    );
  }

  // "available" or "downloading"
  const pct = status.state === "downloading" ? Math.round(status.progress.percent) : null;
  const version = status.state === "available" ? status.info.version : null;

  return (
    <Card size="sm" className="gap-2 py-2.5 px-0">
      <CardHeader className="gap-1 px-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={2} className="shrink-0 animate-pulse text-muted-foreground" />
          <CardTitle className="text-xs">
            {pct !== null ? `Downloading… ${pct}%` : `Downloading${version ? ` v${version}` : ""}…`}
          </CardTitle>
        </div>
        <CardAction>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-sm p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </CardAction>
        <CardDescription className="text-[11px] leading-snug">This runs in the background.</CardDescription>
      </CardHeader>
      {pct !== null && (
        <CardContent className="px-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
