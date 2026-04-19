import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** Custom element registered by `@hyperframes/player`. */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "hyperframes-player": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string;
          width?: number | string;
          height?: number | string;
          controls?: boolean;
          muted?: boolean;
          autoplay?: boolean;
          loop?: boolean;
          poster?: string;
          "playback-rate"?: number | string;
          "audio-src"?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
