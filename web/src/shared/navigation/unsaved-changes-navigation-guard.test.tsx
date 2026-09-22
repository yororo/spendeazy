// @vitest-environment jsdom

import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NavigationGuardProvider } from "./navigation-guard-provider";
import { useNavigationGuard } from "./use-navigation-guard";
import { useUnsavedChangesNavigationGuard } from "./use-unsaved-changes-navigation-guard";

function DirtyEditor({ onNavigate }: { readonly onNavigate: () => void }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(true);
  const { requestNavigation } = useNavigationGuard();
  const { dialog } = useUnsavedChangesNavigationGuard({
    enabled: open && draft.length > 0,
    focusScope: () =>
      document
        .querySelector<HTMLInputElement>('input[aria-label="Transaction draft"]')
        ?.closest<HTMLElement>("label") ?? null,
    focusTarget: () =>
      document.querySelector<HTMLInputElement>(
        'input[aria-label="Transaction draft"]',
      ),
    label: "Transaction",
    onDiscard: () => {
      setDraft("");
      setOpen(false);
    },
  });

  return (
    <>
      {open && (
        <label>
          Transaction draft
          <input
            aria-label="Transaction draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
      )}
      <button
        type="button"
        onClick={() => {
          if (!requestNavigation(onNavigate)) onNavigate();
        }}
      >
        Switch Space
      </button>
      {dialog}
    </>
  );
}

afterEach(() => cleanup());

describe("useUnsavedChangesNavigationGuard", () => {
  it("blocks navigation, preserves a canceled draft, and discards the draft before running the action once", () => {
    const onNavigate = vi.fn();

    render(
      <NavigationGuardProvider>
        <DirtyEditor onNavigate={onNavigate} />
      </NavigationGuardProvider>,
    );

    const draft = screen.getByRole("textbox", { name: "Transaction draft" });
    fireEvent.change(draft, { target: { value: "Unsaved dinner" } });
    draft.focus();
    fireEvent.click(screen.getByRole("button", { name: "Switch Space" }));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Leave Transaction editor?" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stay in editor" }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Transaction draft" }),
    ).toHaveProperty("value", "Unsaved dinner");
    expect(document.activeElement).toBe(draft);

    fireEvent.click(screen.getByRole("button", { name: "Switch Space" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("textbox", { name: "Transaction draft" }),
    ).toBeNull();
  });

  it("prevents browser unload only while the editor is dirty", () => {
    render(
      <NavigationGuardProvider>
        <DirtyEditor onNavigate={vi.fn()} />
      </NavigationGuardProvider>,
    );

    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    fireEvent.change(
      screen.getByRole("textbox", { name: "Transaction draft" }),
      { target: { value: "Unsaved dinner" } },
    );
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });
});
