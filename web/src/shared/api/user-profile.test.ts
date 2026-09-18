import { describe, expect, it, vi } from "vitest";

import { ApiError } from "./api-client";
import {
  getUserProfile,
  provisionUser,
  requireUserProfile,
} from "./user-profile";

const validUser = {
  id: "42",
  name: "Ada Lovelace",
  email: "ada@example.test",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

describe("requireUserProfile", () => {
  it("accepts the closed OpenAPI User model", () => {
    expect(requireUserProfile(validUser)).toEqual(validUser);
  });

  it.each([
    ["a non-object", null],
    ["a non-positive id", { ...validUser, id: "0" }],
    ["an id with a leading zero", { ...validUser, id: "042" }],
    ["a numeric id", { ...validUser, id: 42 }],
    ["an empty name", { ...validUser, name: "" }],
    ["a whitespace-only name", { ...validUser, name: "   " }],
    ["an overlong name", { ...validUser, name: "a".repeat(201) }],
    ["an invalid email", { ...validUser, email: "not-an-email" }],
    ["a local part with consecutive dots", {
      ...validUser,
      email: "a..b@example.com",
    }],
    ["a domain with a trailing dot", {
      ...validUser,
      email: "ada@example.test.",
    }],
    ["a non-UTC timestamp", {
      ...validUser,
      createdAt: "2026-08-29T00:00:00.000+00:00",
    }],
    ["an impossible timestamp", {
      ...validUser,
      updatedAt: "2026-02-30T00:00:00.000Z",
    }],
    ["an unexpected field", { ...validUser, avatarUrl: "avatar" }],
  ] as const)("rejects %s", (_, response) => {
    expect(() => requireUserProfile(response)).toThrowError(
      expect.objectContaining({
        kind: "malformed-response",
      } satisfies Partial<ApiError>),
    );
  });

  it("provisions without sending a request body", async () => {
    const put = vi.fn().mockResolvedValue(validUser);
    const signal = new AbortController().signal;

    await expect(provisionUser({ put }, signal)).resolves.toEqual(validUser);
    expect(put).toHaveBeenCalledWith("", undefined, {
      signal,
      expectedStatuses: [200, 201],
    });
  });

  it("fetches a current profile through the self-scoped GET operation", async () => {
    const get = vi.fn().mockResolvedValue(validUser);
    const signal = new AbortController().signal;

    await expect(getUserProfile({ get }, signal)).resolves.toEqual(validUser);
    expect(get).toHaveBeenCalledWith("", { signal });
  });
});
