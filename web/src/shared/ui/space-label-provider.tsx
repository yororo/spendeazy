import { useContext, type ReactNode } from "react";

import { SpaceLabelContext, type SpaceLabelSource } from "./space-label-context";

function SpaceLabelProvider({ spaces, children }: {
  readonly spaces?: readonly SpaceLabelSource[];
  readonly children: ReactNode;
}) {
  const inheritedSpaces = useContext(SpaceLabelContext);
  return (
    <SpaceLabelContext.Provider value={spaces ?? inheritedSpaces}>
      {children}
    </SpaceLabelContext.Provider>
  );
}

export { SpaceLabelProvider };
