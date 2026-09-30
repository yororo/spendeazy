import { createContext } from "react";

interface SpaceLabelSource {
  readonly id: string;
  readonly kind: "personal" | "shared";
}

const SpaceLabelContext = createContext<readonly SpaceLabelSource[]>([]);

export { SpaceLabelContext };
export type { SpaceLabelSource };
