import { useMemo } from "react";

import type { NativeApi } from "@acme/contracts";

export function useNativeApi(): NativeApi | undefined {
  return useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return window.nativeApi;
  }, []);
}
