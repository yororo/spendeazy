interface SpaceIdentitySource {
  readonly kind: "personal" | "shared";
  readonly members: readonly { readonly name: string }[];
}

function getSpaceIdentityLabel(
  space: SpaceIdentitySource,
  includeSpaceWord = false,
): string {
  const memberNames = space.members.map((member) => member.name);
  const identity = memberNames.length > 0 ? memberNames.join(" & ") : "Members";
  const kind = space.kind === "personal" ? "Personal" : "Shared";

  return `${kind}${includeSpaceWord ? " Space" : ""} · ${identity}`;
}

export { getSpaceIdentityLabel };
export type { SpaceIdentitySource };
