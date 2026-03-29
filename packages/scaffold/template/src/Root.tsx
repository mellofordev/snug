/// <reference types="webpack-env" />
import type { ComponentType, FC } from "react";
import { Composition } from "remotion";

type CompositionModule = {
  default: ComponentType;
  fps?: number;
  durationInFrames?: number;
  width?: number;
  height?: number;
};

/**
 * Remotion CLI bundles this file with webpack. `import.meta.glob` is Vite-only and
 * throws at render time ({}.glob is not a function). Webpack's require.context
 * discovers the same composition files the Vite player finds via import.meta.glob.
 */
const compositionModules = require.context("../compositions", false, /\.tsx$/);

export const RemotionRoot: FC = () => {
  return (
    <>
      {compositionModules.keys().map((key: string) => {
        const mod = compositionModules(key) as CompositionModule;
        const name = key.replace(/^\.\//, "").replace(/\.tsx$/, "");
        return (
          <Composition
            key={name}
            id={name}
            component={mod.default}
            durationInFrames={mod.durationInFrames ?? 150}
            fps={mod.fps ?? 30}
            width={mod.width ?? 1920}
            height={mod.height ?? 1080}
          />
        );
      })}
    </>
  );
};
