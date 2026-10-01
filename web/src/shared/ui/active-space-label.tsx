import { useContext } from "react";

import { SpaceLabelContext, type SpaceLabelSource } from "./space-label-context";

interface ActiveSpaceLabelProps {
  readonly spaceId?: string;
  readonly spaces?: readonly SpaceLabelSource[];
}

function ActiveSpaceLabel({ spaceId, spaces }: ActiveSpaceLabelProps) {
  const inheritedSpaces = useContext(SpaceLabelContext);
  const availableSpaces = spaces ?? inheritedSpaces;
  const space = availableSpaces.find((candidate) => spaceId === undefined
    ? candidate.kind === "personal"
    : candidate.id === spaceId);
  const resolvedKind = space?.kind;
  return (
    <span className="mb-3 inline-flex min-h-8 items-center rounded-md bg-primary px-3 font-mono text-sm font-semibold text-primary-foreground">
      {resolvedKind === "personal" || (resolvedKind === undefined && spaceId === undefined)
        ? "Personal"
        : resolvedKind === "shared" ? "Shared" : "Space"}
    </span>
  );
}

export { ActiveSpaceLabel };
