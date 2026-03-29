import { Composition } from "remotion";

const modules = import.meta.glob("../compositions/*.tsx", { eager: true });

type CompositionModule = {
  default: React.ComponentType;
  fps?: number;
  durationInFrames?: number;
  width?: number;
  height?: number;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {Object.entries(modules).map(([filePath, mod]) => {
        const m = mod as CompositionModule;
        const name = filePath.replace("../compositions/", "").replace(".tsx", "");
        return (
          <Composition
            key={name}
            id={name}
            component={m.default}
            durationInFrames={m.durationInFrames ?? 150}
            fps={m.fps ?? 30}
            width={m.width ?? 1920}
            height={m.height ?? 1080}
          />
        );
      })}
    </>
  );
};
