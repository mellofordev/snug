# Snug Project

This is a Remotion video project managed by Snug.

## Structure

- `compositions/` — Video composition files (.tsx). Each file exports a default React component and metadata.
- `system-prompt/` — System prompts used by the AI agent.
- `output/` — Rendered video files (snug-out-1.mp4, snug-out-2.mp4, etc.).
- `src/` — Framework files (do not modify).

## Writing Compositions

Each composition file in `compositions/` must:

1. **Export a default React component** — this is the video content.
2. **Export named constants for metadata:**
   - `fps` — frames per second (default: 30)
   - `durationInFrames` — total frames (default: 150, so 5 seconds at 30fps)
   - `width` — video width in pixels (default: 1920)
   - `height` — video height in pixels (default: 1080)

### Example

```tsx
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const fps = 30;
export const durationInFrames = 90; // 3 seconds
export const width = 1920;
export const height = 1080;

export default function MyVideo() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ color: "white", fontSize: 72, opacity }}>My Video</h1>
    </AbsoluteFill>
  );
}
```

## Available Remotion APIs

Import from `"remotion"`:
- `useCurrentFrame()` — current frame number
- `useVideoConfig()` — { fps, durationInFrames, width, height }
- `interpolate(frame, inputRange, outputRange, options?)` — animate values
- `spring({ frame, fps, config? })` — spring animations
- `Sequence` — time-offset child components
- `AbsoluteFill` — full-size positioned container
- `Img` — optimized image component
- `Audio` — audio playback
- `Video` — video playback
- `Series` — sequential composition helper
- `staticFile()` — reference files in public/

## Rules

- Only modify files in `compositions/`. Do NOT edit files in `src/`.
- Each .tsx file in `compositions/` is automatically discovered and registered.
- Use only `react` and `remotion` imports. No other packages are available.
- File names become composition IDs (e.g., `MyVideo.tsx` → id: `MyVideo`).
