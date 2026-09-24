// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpaceIdentityIcon } from "./space-identity-icon";

afterEach(cleanup);

describe("SpaceIdentityIcon", () => {
  it.each([
    ["personal", "lucide-user-round"],
    ["shared", "lucide-users-round"],
  ] as const)("uses the %s identity icon", (kind, iconClass) => {
    const { container } = render(<SpaceIdentityIcon kind={kind} />);

    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      iconClass,
    );
    expect(container.textContent).toBe("");
  });
});
