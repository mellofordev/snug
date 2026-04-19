import React, { useEffect, useMemo, useState } from "react";
import "@hyperframes/player";

/**
 * Each composition lives at `compositions/<id>/index.html`. We load two views:
 * `?url` — the URL the Vite dev server serves the file from (passed to <hyperframes-player src>).
 * `?raw` — the raw HTML string, so we can parse `data-*` metadata off the `#root` element
 *          without re-fetching.
 */
const urlModules = import.meta.glob("../../compositions/*/index.html", {
  query: "?url",
  eager: true,
  import: "default",
}) as Record<string, string>;

const rawModules = import.meta.glob("../../compositions/*/index.html", {
  query: "?raw",
  eager: true,
  import: "default",
}) as Record<string, string>;

interface CompositionEntry {
  id: string;
  url: string;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
}

const DEFAULT_FPS = 30;
const DEFAULT_DURATION_SECONDS = 5;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

function numAttr(el: Element | null, name: string, fallback: number): number {
  const raw = el?.getAttribute(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseMeta(html: string): {
  fps: number;
  durationSeconds: number;
  width: number;
  height: number;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.getElementById("root");
  return {
    fps: numAttr(root, "data-fps", DEFAULT_FPS),
    durationSeconds: numAttr(root, "data-duration", DEFAULT_DURATION_SECONDS),
    width: numAttr(root, "data-width", DEFAULT_WIDTH),
    height: numAttr(root, "data-height", DEFAULT_HEIGHT),
  };
}

function resolveCompositions(): CompositionEntry[] {
  return Object.entries(urlModules).map(([filePath, url]) => {
    const id = filePath.replace("../../compositions/", "").replace("/index.html", "");
    const meta = parseMeta(rawModules[filePath] ?? "");
    return {
      id,
      url,
      fps: meta.fps,
      durationInFrames: Math.round(meta.durationSeconds * meta.fps),
      width: meta.width,
      height: meta.height,
    };
  });
}

function sendToParent(message: Record<string, unknown>) {
  window.parent.postMessage({ source: "snug-player", ...message }, "*");
}

export const PlayerApp: React.FC = () => {
  const compositions = useMemo(() => resolveCompositions(), []);
  const [activeId, setActiveId] = useState<string>("");

  const active = compositions.find((c) => c.id === activeId) ?? compositions[0];

  // Announce compositions to the parent on mount.
  useEffect(() => {
    const items = compositions.map((c) => ({
      id: c.id,
      meta: {
        fps: c.fps,
        durationInFrames: c.durationInFrames,
        width: c.width,
        height: c.height,
      },
    }));
    sendToParent({ type: "compositions", items });
    sendToParent({ type: "ready" });
  }, [compositions]);

  // Echo the active composition so the parent can update its sidebar.
  useEffect(() => {
    if (!active) return;
    sendToParent({
      type: "compositionSelected",
      id: active.id,
      meta: {
        fps: active.fps,
        durationInFrames: active.durationInFrames,
        width: active.width,
        height: active.height,
      },
    });
  }, [active]);

  // Listen for parent-driven composition switches.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.source === "snug-player") return;

      switch (data.type) {
        case "getCompositions": {
          const items = compositions.map((c) => ({
            id: c.id,
            meta: {
              fps: c.fps,
              durationInFrames: c.durationInFrames,
              width: c.width,
              height: c.height,
            },
          }));
          sendToParent({ type: "compositions", items });
          break;
        }
        case "selectComposition":
          if (data.id && compositions.some((c) => c.id === data.id)) {
            setActiveId(data.id);
          }
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [compositions]);

  if (!active) {
    return (
      <div style={{ color: "#888", padding: 40, fontFamily: "system-ui" }}>
        No compositions found. Add an <code>index.html</code> under{" "}
        <code>compositions/&lt;name&gt;/</code>.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <hyperframes-player
        key={active.id}
        src={active.url}
        controls
        style={{
          width: "100%",
          flex: 1,
          aspectRatio: `${active.width} / ${active.height}`,
        }}
      />
    </div>
  );
};
