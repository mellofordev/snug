import { Player } from "@remotion/player";
import React, { useEffect, useMemo, useState } from "react";

const modules = import.meta.glob("../../compositions/*.tsx", { eager: true });

type CompositionModule = {
  default: React.ComponentType;
  fps?: number;
  durationInFrames?: number;
  width?: number;
  height?: number;
};

interface CompositionEntry {
  id: string;
  component: React.ComponentType;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
}

function resolveCompositions(): CompositionEntry[] {
  return Object.entries(modules).map(([filePath, mod]) => {
    const m = mod as CompositionModule;
    const id = filePath.replace("../../compositions/", "").replace(".tsx", "");
    return {
      id,
      component: m.default,
      fps: m.fps ?? 30,
      durationInFrames: m.durationInFrames ?? 150,
      width: m.width ?? 1920,
      height: m.height ?? 1080,
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

  // Notify parent of available compositions on mount
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

  // Notify parent when active composition changes
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

  // Listen for messages from parent
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
        No compositions found. Add .tsx files to the compositions/ directory.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Player
        key={active.id}
        component={active.component}
        durationInFrames={active.durationInFrames}
        fps={active.fps}
        compositionWidth={active.width}
        compositionHeight={active.height}
        style={{ width: "100%", flex: 1 }}
        controls
        autoPlay={false}
      />
    </div>
  );
};
