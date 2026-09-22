import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "./api-client";
import { getAccessibleSpaces } from "./space";

describe("getAccessibleSpaces", () => {
  it("loads the authenticated Space catalog", async () => {
    const get = vi.fn(async () => [
      {
        id: "10",
        kind: "personal",
        status: "active",
        accessLevel: "write",
        members: [{ id: "42", name: "Ada Lovelace" }],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const signal = new AbortController().signal;

    await expect(
      getAccessibleSpaces({ get } as Pick<ApiClient, "get">, signal),
    ).resolves.toEqual([
      expect.objectContaining({ id: "10", kind: "personal" }),
    ]);
    expect(get).toHaveBeenCalledWith("/spaces", { signal });
  });

  it("rejects a malformed Space catalog", async () => {
    const get = vi.fn(async () => [{ id: "not-a-space" }]);

    await expect(
      getAccessibleSpaces({ get } as Pick<ApiClient, "get">),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it("rejects a Space without member identity details", async () => {
    const get = vi.fn(async () => [
      {
        id: "10",
        kind: "personal",
        status: "active",
        accessLevel: "write",
        members: [],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);

    await expect(
      getAccessibleSpaces({ get } as Pick<ApiClient, "get">),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it.each([
    ["a non-UTC timestamp", "2026-09-01T00:00:00.000+00:00"],
    ["an impossible timestamp", "2026-02-30T00:00:00.000Z"],
    ["a non-string timestamp", 0],
  ] as const)("rejects %s", (_, createdAt) => {
    const get = vi.fn(async () => [
      {
        id: "10",
        kind: "personal",
        status: "active",
        accessLevel: "write",
        members: [{ id: "42", name: "Ada Lovelace" }],
        createdAt,
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);

    return expect(
      getAccessibleSpaces({ get } as Pick<ApiClient, "get">),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });
});
