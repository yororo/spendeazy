import type { ReactNode } from "react";

import type { AppSessionUser } from "../src/shared/session/app-session";

const LOCAL_TEST_SCENARIOS = ["primary", "secondary", "new"] as const;

type LocalTestScenario = (typeof LOCAL_TEST_SCENARIOS)[number];

interface LocalTestPanelProps {
  user: AppSessionUser;
  scenario: LocalTestScenario;
  isBusy: boolean;
  errorMessage: string | null;
  onSelectScenario: (scenario: LocalTestScenario) => void;
  onExpireSession: () => void | Promise<void>;
  onRevokeSession: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  children: ReactNode;
}

function LocalTestPanel({
  user,
  scenario,
  isBusy,
  errorMessage,
  onSelectScenario,
  onExpireSession,
  onRevokeSession,
  onSignOut,
  children,
}: LocalTestPanelProps) {
  return (
    <div className="min-h-screen pt-24">
      <aside
        data-testid="local-test-panel"
        aria-label="Local test environment"
        className="fixed inset-x-0 top-0 z-50 border-b-2 border-primary bg-secondary px-4 py-2 font-mono text-xs text-secondary-foreground"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p>
            <span className="font-bold text-primary">LOCAL TEST</span>{" "}
            Synthetic sessions · real API · isolated PostgreSQL
          </p>
          <p data-testid="local-test-active-user" aria-live="polite">
            {user.fullName ?? user.primaryEmail ?? "Synthetic User"}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-secondary-foreground/70">Switch User:</span>
          <button
            type="button"
            className={scenarioButtonClass(scenario === "primary")}
            aria-pressed={scenario === "primary"}
            disabled={isBusy}
            onClick={() => onSelectScenario("primary")}
          >
            Populated User
          </button>
          <button
            type="button"
            className={scenarioButtonClass(scenario === "secondary")}
            aria-pressed={scenario === "secondary"}
            disabled={isBusy}
            onClick={() => onSelectScenario("secondary")}
          >
            Second User
          </button>
          <button
            type="button"
            className={scenarioButtonClass(false)}
            disabled={isBusy}
            onClick={() => onSelectScenario("new")}
          >
            New User
          </button>
          <span className="mx-1 hidden h-5 border-l border-secondary-foreground/40 sm:block" />
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={isBusy}
            onClick={() => void onExpireSession()}
          >
            Expire token
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={isBusy}
            onClick={() => void onRevokeSession()}
          >
            Revoke session
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={isBusy}
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        </div>
        {errorMessage ? (
          <p role="alert" className="mt-2 text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </aside>
      {children}
    </div>
  );
}

function LocalTestSignedOut({ onResume }: { onResume: () => void }) {
  return (
    <main
      data-testid="local-test-signed-out"
      className="grid min-h-screen place-content-center bg-secondary px-4 text-secondary-foreground"
    >
      <section className="max-w-lg border border-primary p-6">
        <p className="text-label text-primary">Local test environment</p>
        <h1 className="mt-3 text-2xl font-bold">Synthetic session signed out</h1>
        <p className="mt-3 text-sm text-secondary-foreground/70">
          The protected route sent you here without contacting Clerk. Resume a
          fictional User to enter the real API again.
        </p>
        <button
          type="button"
          className="mt-5 min-h-10 bg-primary px-4 font-mono text-xs font-bold text-primary-foreground uppercase"
          onClick={onResume}
        >
          Resume synthetic session
        </button>
      </section>
    </main>
  );
}

function scenarioButtonClass(isSelected: boolean): string {
  return isSelected
    ? "min-h-8 bg-primary px-3 font-bold text-primary-foreground"
    : secondaryButtonClass;
}

const secondaryButtonClass =
  "min-h-8 border border-secondary-foreground/50 px-3 text-secondary-foreground hover:bg-secondary-foreground hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

export {
  LOCAL_TEST_SCENARIOS,
  LocalTestPanel,
  LocalTestSignedOut,
};
export type { LocalTestPanelProps, LocalTestScenario };
