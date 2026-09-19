import type { ReactNode } from "react";

interface LocalTestPanelProps {
  onSignOut: () => void | Promise<void>;
  children: ReactNode;
}

function LocalTestPanel({ onSignOut, children }: LocalTestPanelProps) {
  return (
    <div className="min-h-screen pt-12">
      <aside
        data-testid="local-test-panel"
        aria-label="Local test environment"
        className="fixed inset-x-0 top-0 z-50 flex min-h-12 items-center justify-between gap-4 border-b-2 border-primary bg-secondary px-4 py-2 font-mono text-xs text-secondary-foreground"
      >
        <p>
          <span className="font-bold text-primary">LOCAL TEST</span>{" "}
          Synthetic session · real API · isolated PostgreSQL
        </p>
        <button
          type="button"
          className="min-h-8 border border-secondary-foreground/50 px-3 text-secondary-foreground hover:bg-secondary-foreground hover:text-secondary focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => void onSignOut()}
        >
          Sign out
        </button>
      </aside>
      {children}
    </div>
  );
}

function LocalTestSignedOut({ onResume }: { onResume: () => void }) {
  return (
    <main className="grid min-h-screen place-content-center bg-secondary px-4 text-secondary-foreground">
      <section className="max-w-lg border border-primary p-6">
        <p className="text-label text-primary">Local test environment</p>
        <h1 className="mt-3 text-2xl font-bold">Synthetic session signed out</h1>
        <p className="mt-3 text-sm text-secondary-foreground/70">
          Resume the fixed fictional User to exercise the real API again.
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

export { LocalTestPanel, LocalTestSignedOut };
