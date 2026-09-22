import { describe, expect, it } from "vitest";

import { isUtcDateTime } from "./api-response";

describe("isUtcDateTime", () => {
  it.each([
    "2026-09-23T12:34:56Z",
    "2026-09-23T12:34:56.000Z",
    "2024-02-29T23:59:59.999Z",
  ])("accepts %s", (value) => {
    expect(isUtcDateTime(value)).toBe(true);
  });

  it.each([
    ["a non-string value", 0],
    ["a non-UTC offset", "2026-09-23T12:34:56.000+00:00"],
    ["an impossible calendar date", "2026-02-29T12:34:56.000Z"],
    ["an impossible clock time", "2026-09-23T24:00:00.000Z"],
  ] as const)("rejects %s", (_, value) => {
    expect(isUtcDateTime(value)).toBe(false);
  });
});
