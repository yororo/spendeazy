import { useEffect } from "react";
import { useAuth, useSignIn } from "@clerk/react";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { AuthLoading } from "@/shared/ui/auth-loading";
import { LedgerMark } from "@/shared/ui/ledger-mark";
import { Button } from "@/components/ui/button";

interface SignInLocationState {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
}

const benefits = [
  "Import transactions",
  "Automatic categorization",
  "Privacy first",
];

function getRedirectUrl(
  state: SignInLocationState | null,
  search = "",
): string {
  const requestedReturnTo = new URLSearchParams(search).get("returnTo");
  const returnTo = safeLocalPath(requestedReturnTo);
  if (returnTo && returnTo !== "/sign-in") return returnTo;

  const from = state?.from;
  if (!from?.pathname || from.pathname === "/sign-in") return "/";

  return (
    safeLocalPath(`${from.pathname}${from.search ?? ""}${from.hash ?? ""}`) ??
    "/"
  );
}

function safeLocalPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function SignInPage() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const location = useLocation();

  useEffect(() => {
    document.title = "Sign in · Spendeazy";
  }, []);

  if (!isAuthLoaded) return <AuthLoading />;
  const redirectUrl = getRedirectUrl(
    location.state as SignInLocationState | null,
    location.search,
  );
  if (isSignedIn) {
    return <Navigate to={redirectUrl} replace />;
  }
  const errorMessage = errors?.global?.[0]?.message;
  const isSubmitting = fetchStatus === "fetching";

  const startGoogleSso = async () => {
    await signIn.sso({
      strategy: "oauth_google",
      redirectUrl,
      redirectCallbackUrl: "/sso-callback",
    });
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.18fr)_minmax(32rem,1fr)]">
      <section className="flex min-h-[25rem] flex-col justify-between bg-secondary px-6 py-7 text-secondary-foreground sm:px-10 lg:min-h-screen lg:px-13 lg:py-11">
        <LedgerMark interactive={false} />

        <div className="my-14 max-w-2xl lg:my-10">
          <p className="text-label text-primary">Your money, made eazy</p>
          <h1 className="mt-4 text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Spend confidently.
            <br />
            Save effortlessly.
          </h1>
          <p className="mt-5 max-w-lg text-base text-white/70">
            A straightforward and secure expense tracker for everyone
          </p>
          <ul className="mt-8 grid gap-3 font-mono text-xs tracking-wide uppercase sm:grid-cols-3 lg:grid-cols-1">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3">
                <span aria-hidden="true" className="size-1.5 bg-primary" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <p className="font-mono text-xs tracking-wider text-white/50 uppercase">
          © 2026 Spendeazy
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-14 sm:px-12 lg:px-18">
        <div className="w-full max-w-[26.25rem]">
          <h2 className="text-4xl font-bold tracking-tight">
            Sign in or create an account
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Choose your identity provider to continue to Spendeazy.
          </p>

          <div className="mt-7 space-y-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => void startGoogleSso()}
              className="h-14 w-full justify-start px-5 text-sm normal-case"
            >
              <span
                aria-hidden="true"
                className="w-5 text-center font-sans text-lg font-bold text-provider-google"
              >
                G
              </span>
              <span className="flex-1 text-left">Continue with Google</span>
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {errorMessage ? (
            <p
              className="mt-4 border border-destructive bg-background p-3 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-7 flex items-start gap-3 border-t pt-5 text-sm text-muted-foreground">
            <ShieldCheckIcon
              className="mt-0.5 size-5 shrink-0 text-foreground"
              aria-hidden="true"
            />
            <p>Secure single sign-on. We never see or store your password.</p>
          </div>

          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link
              className="inline-block min-h-6 align-baseline font-semibold text-foreground underline decoration-1 underline-offset-4 hover:bg-primary hover:text-primary-foreground focus-ledger"
              rel="noopener noreferrer"
              target="_blank"
              to="/terms"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              className="inline-block min-h-6 align-baseline font-semibold text-foreground underline decoration-1 underline-offset-4 hover:bg-primary hover:text-primary-foreground focus-ledger"
              rel="noopener noreferrer"
              target="_blank"
              to="/privacy"
            >
              Privacy Policy
            </Link>
            .
          </p>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Having trouble signing in? Contact support →
          </p>
        </div>
      </section>
    </main>
  );
}

export { SignInPage };
