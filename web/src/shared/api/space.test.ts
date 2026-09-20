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
});
