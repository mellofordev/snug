/// <reference types="vite/client" />

import type { NativeApi } from "@acme/contracts";

declare global {
  interface Window {
    nativeApi?: NativeApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: boolean;
        },
        HTMLElement
      >;
    }
  }
}

export {};
