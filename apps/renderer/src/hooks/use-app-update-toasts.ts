import { useEffect } from "react";
import { toast } from "sonner";

import type { NativeApi, UpdateStatus } from "@acme/contracts";

const UPDATE_TOAST_ID = "snug-app-update";

/**
 * Surfaces electron-updater status as Sonner toasts. Updates download in the background
 * (autoDownload); UI shows progress, then restart / dismiss when the payload is ready.
 */
export function useAppUpdateToasts(
  api: NativeApi | undefined,
  updateStatus: UpdateStatus | null,
  dismissUpdate: () => void
): void {
  useEffect(() => {
    if (!api) {
      toast.dismiss(UPDATE_TOAST_ID);
      return;
    }

    if (!updateStatus || updateStatus.state === "checking" || updateStatus.state === "not-available") {
      toast.dismiss(UPDATE_TOAST_ID);
      return;
    }

    if (updateStatus.state === "available") {
      toast.loading("Update downloading", {
        id: UPDATE_TOAST_ID,
        description: `Snug ${updateStatus.info.version} — fetching in the background.`,
        duration: Infinity,
        cancel: {
          label: "Dismiss",
          onClick: () => {
            dismissUpdate();
          }
        }
      });
      return;
    }

    if (updateStatus.state === "downloading") {
      const pct = Math.round(updateStatus.progress.percent);
      toast.loading(`Downloading update… ${pct}%`, {
        id: UPDATE_TOAST_ID,
        description: "You can keep using Snug; we’ll prompt you when it’s ready to install.",
        duration: Infinity,
        cancel: {
          label: "Dismiss",
          onClick: () => {
            dismissUpdate();
          }
        }
      });
      return;
    }

    if (updateStatus.state === "downloaded") {
      toast.success("Update ready", {
        id: UPDATE_TOAST_ID,
        description: `Snug ${updateStatus.info.version} will apply after restart.`,
        duration: Infinity,
        action: {
          label: "Restart & update",
          onClick: () => {
            void api.app.installUpdate();
          }
        },
        cancel: {
          label: "Dismiss",
          onClick: () => {
            dismissUpdate();
          }
        }
      });
      return;
    }

    if (updateStatus.state === "error") {
      toast.error("Update failed", {
        id: UPDATE_TOAST_ID,
        description: updateStatus.message,
        duration: Infinity,
        cancel: {
          label: "Dismiss",
          onClick: () => {
            dismissUpdate();
          }
        }
      });
    }
  }, [api, updateStatus, dismissUpdate]);
}
