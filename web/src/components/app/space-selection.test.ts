import { describe, expect, it } from "vitest";

import { getArchivedSpaces, type AccessibleSpace } from "@/shared/api";

import {
  buildCanonicalSpaceSearch,
  resolveSpaceSelection,
} from "./space-selection";

const spaces: readonly AccessibleSpace[] = [
  {
    id: "10",
    kind: "personal",
    status: "active",
    accessLevel: "write",
    members: [{ id: "1", name: "Ada Lovelace" }],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "20",
    kind: "shared",
    status: "active",
    accessLevel: "write",
    members: [
      { id: "1", name: "Ada Lovelace" },
      { id: "2", name: "Grace Hopper" },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "30",
    kind: "shared",
    status: "archived",
    accessLevel: "read",
    members: [
      { id: "1", name: "Ada Lovelace" },
      { id: "2", name: "Grace Hopper" },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

describe("resolveSpaceSelection", () => {
  it("keeps an authorized active Space selected", () => {
    expect(resolveSpaceSelection(spaces, "20", null)).toBe("20");
  });

  it.each([
    ["unavailable", "999"],
    ["unauthorized", "21"],
    ["archived", "30"],
    ["malformed", "not-a-space"],
  ])("falls back to Personal for a %s remembered selection", (_, spaceId) => {
    expect(resolveSpaceSelection(spaces, null, spaceId)).toBe("10");
  });

  it("falls back to Personal when a requested URL Space is not active", () => {
    expect(resolveSpaceSelection(spaces, "30", "20")).toBe("10");
  });

  it("uses Personal when there is no remembered selection", () => {
    expect(resolveSpaceSelection(spaces, null, null)).toBe("10");
  });
});

describe("getArchivedSpaces", () => {
  it("keeps archived Shared Spaces available for history without making them active choices", () => {
    expect(getArchivedSpaces(spaces)).toEqual([spaces[2]]);
  });
});

describe("buildCanonicalSpaceSearch", () => {
  it("removes the Personal Space query while preserving other parameters", () => {
    expect(buildCanonicalSpaceSearch("?month=2026-09&spaceId=20", "10", "10")).toBe(
      "?month=2026-09",
    );
  });

  it("writes a Shared Space query while preserving other parameters", () => {
    expect(buildCanonicalSpaceSearch("?month=2026-09", "20", "10")).toBe(
      "?month=2026-09&spaceId=20",
    );
  });
});
