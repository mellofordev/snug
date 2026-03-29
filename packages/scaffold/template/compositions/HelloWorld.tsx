import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";

export const fps = 30;
export const durationInFrames = 150;
export const width = 1920;
export const height = 1080;

export default function HelloWorld() {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  const scale = interpolate(frame, [0, 30], [0.8, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <h1
        style={{
          color: "white",
          fontSize: 80,
          fontFamily: "system-ui, sans-serif",
          fontWeight: 700,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        Hello World
      </h1>
    </AbsoluteFill>
  );
}
