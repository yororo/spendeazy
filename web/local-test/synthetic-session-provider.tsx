import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

import { AppSessionProvider } from "../src/shared/session/app-session-provider";
import type {
  AppSession,
  AppSessionUser,
} from "../src/shared/session/app-session";
import {
  LocalTestPanel,
  LocalTestSignedOut,
  type LocalTestScenario,
} from "./local-test-panel";

interface SyntheticSessionProviderProps {
  token: string;
  apiBaseUrl: string;
  initialScenario?: LocalTestScenario;
  children: (signedOutPage: ReactNode) => ReactNode;
}

interface SyntheticSessionResponse {
  readonly token: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
}

interface SyntheticExpiredSessionResponse {
  readonly expiredSession: SyntheticSessionResponse;
  readonly refreshedSession: SyntheticSessionResponse;
}

interface SyntheticRevokedSessionResponse {
  readonly revokedSessionId: string;
  readonly resumeSession: SyntheticSessionResponse;
}

interface ActiveSyntheticSession {
  readonly token: string;
  readonly sessionId: string;
  readonly user: AppSessionUser;
  readonly scenario: LocalTestScenario;
  readonly mode: "active" | "expired" | "revoked";
  readonly refreshSession?: ActiveSyntheticSession;
}

const INITIAL_USER: AppSessionUser = {
  id: "local-test-populated-user",
  fullName: "Local Test User",
  firstName: "Local",
  primaryEmail: "local-test-user@example.invalid",
};
const LOCAL_TEST_SIGNED_OUT_KEY = "spendeazy-local-test-signed-out";

function createInitialSession(token: string): ActiveSyntheticSession {
  return {
    token,
    sessionId: "local-test-session-initial",
    user: INITIAL_USER,
    scenario: "primary",
    mode: "active",
  };
}

function isLocallySignedOut(): boolean {
  return globalThis.sessionStorage?.getItem(LOCAL_TEST_SIGNED_OUT_KEY) === "1";
}

function SyntheticSessionProvider({
  token,
  apiBaseUrl,
  initialScenario,
  children,
}: SyntheticSessionProviderProps) {
  const navigate = useNavigate();
  const initialScenarioAttempted = useRef(false);
  const [currentSession, setCurrentSession] = useState<
    ActiveSyntheticSession | null
  >(() => (isLocallySignedOut() ? null : createInitialSession(token)));
  const [resumeSession, setResumeSession] =
    useState<ActiveSyntheticSession | null>(() =>
      isLocallySignedOut() ? createInitialSession(token) : null,
    );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    globalThis.sessionStorage?.setItem(LOCAL_TEST_SIGNED_OUT_KEY, "1");
    setResumeSession((existingSession) => {
      if (existingSession || !currentSession) return existingSession;
      return currentSession.mode === "expired"
        ? currentSession.refreshSession ?? null
        : currentSession.mode === "active"
          ? currentSession
          : null;
    });
    setCurrentSession(null);
    setErrorMessage(null);
  }, [currentSession]);

  const resume = useCallback(() => {
    if (!resumeSession) return;

    setCurrentSession({
      ...resumeSession,
      mode: "active",
      refreshToken: undefined,
    });
    setResumeSession(null);
    globalThis.sessionStorage?.removeItem(LOCAL_TEST_SIGNED_OUT_KEY);
    setErrorMessage(null);
    navigate("/", { replace: true });
  }, [navigate, resumeSession]);

  const selectScenario = useCallback(
    async (scenario: LocalTestScenario) => {
      if (!currentSession) return;

      setIsBusy(true);
      setErrorMessage(null);
      try {
        const response = await postLocalTestSession<SyntheticSessionResponse>(
          apiBaseUrl,
          currentSession.token,
          "",
          { scenario },
        );
        const nextSession = toActiveSession(response, scenario);
        globalThis.sessionStorage?.removeItem(LOCAL_TEST_SIGNED_OUT_KEY);
        setCurrentSession(nextSession);
        setResumeSession(null);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      } finally {
        setIsBusy(false);
      }
    },
    [apiBaseUrl, currentSession],
  );

  useEffect(() => {
    if (
      initialScenario === undefined ||
      initialScenario === "primary" ||
      initialScenarioAttempted.current ||
      currentSession?.scenario !== "primary"
    ) {
      return;
    }

    initialScenarioAttempted.current = true;
    void selectScenario(initialScenario);
  }, [currentSession?.scenario, initialScenario, selectScenario]);

  const expireSession = useCallback(async () => {
    if (!currentSession) return;

    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await postLocalTestSession<SyntheticExpiredSessionResponse>(
        apiBaseUrl,
        currentSession.token,
        "/expire",
      );
      const expiredSession = toActiveSession(
        response.expiredSession,
        currentSession.scenario,
      );
      const refreshedSession = toActiveSession(
        response.refreshedSession,
        currentSession.scenario,
      );
      setCurrentSession({
        ...expiredSession,
        mode: "expired",
        refreshSession: refreshedSession,
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }, [apiBaseUrl, currentSession]);

  const revokeSession = useCallback(async () => {
    if (!currentSession) return;

    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await postLocalTestSession<SyntheticRevokedSessionResponse>(
        apiBaseUrl,
        currentSession.token,
        "/revoke",
      );
      setResumeSession(
        toActiveSession(response.resumeSession, currentSession.scenario),
      );
      setCurrentSession({
        ...currentSession,
        sessionId: `${response.revokedSessionId}-revoked`,
        mode: "revoked",
        refreshSession: undefined,
      });
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }, [apiBaseUrl, currentSession]);

  const session = useMemo<AppSession>(
    () => ({
      isLoaded: true,
      isSignedIn: currentSession !== null,
      sessionId: currentSession?.sessionId ?? null,
      user: currentSession?.user ?? null,
      getToken: async (options) => {
        if (!currentSession) return null;

        if (currentSession.mode === "revoked") {
          return options?.skipCache ? null : currentSession.token;
        }

        if (currentSession.mode === "expired") {
          if (options?.skipCache && currentSession.refreshSession) {
            const refreshedSession = currentSession.refreshSession;
            setCurrentSession((activeSession) => {
              if (
                activeSession?.mode !== "expired" ||
                activeSession.sessionId !== currentSession.sessionId
              ) {
                return activeSession;
              }

              return refreshedSession;
            });
            return refreshedSession.token;
          }

          return currentSession.token;
        }

        return currentSession.token;
      },
      signOut,
    }),
    [currentSession, signOut],
  );

  const signedOutPage = <LocalTestSignedOut onResume={resume} />;
  const app = children(signedOutPage);

  return (
    <AppSessionProvider session={session}>
      {currentSession ? (
        <LocalTestPanel
          user={currentSession.user}
          scenario={currentSession.scenario}
          sessionMode={currentSession.mode}
          isBusy={isBusy}
          errorMessage={errorMessage}
          onSelectScenario={(scenario) => void selectScenario(scenario)}
          onExpireSession={() => void expireSession()}
          onRevokeSession={() => void revokeSession()}
          onSignOut={signOut}
        >
          {app}
        </LocalTestPanel>
      ) : (
        app
      )}
    </AppSessionProvider>
  );
}

async function postLocalTestSession<T>(
  apiBaseUrl: string,
  token: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  const requestInit: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  };

  const response = await fetch(
    `${apiBaseUrl.replace(/\/+$/, "")}/api/v1/users/me/local-test/sessions${path}`,
    requestInit,
  );
  const responseBody = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    throw new Error(readErrorMessage(responseBody));
  }

  return responseBody as T;
}

function toActiveSession(
  response: SyntheticSessionResponse,
  scenario: LocalTestScenario,
): ActiveSyntheticSession {
  if (!isSyntheticSessionResponse(response)) {
    throw new Error("The local test API returned an invalid synthetic session.");
  }

  return {
    token: response.token,
    sessionId: response.sessionId,
    user: {
      id: response.user.id,
      fullName: response.user.name,
      firstName: response.user.name.split(/\s+/)[0] ?? null,
      primaryEmail: response.user.email,
    },
    scenario,
    mode: "active",
  };
}

function isSyntheticSessionResponse(
  value: unknown,
): value is SyntheticSessionResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const response = value as Record<string, unknown>;
  const user = response.user;
  return (
    typeof response.token === "string" &&
    typeof response.sessionId === "string" &&
    typeof response.userId === "string" &&
    user !== null &&
    typeof user === "object" &&
    !Array.isArray(user) &&
    typeof (user as Record<string, unknown>).id === "string" &&
    typeof (user as Record<string, unknown>).name === "string" &&
    typeof (user as Record<string, unknown>).email === "string"
  );
}

function readErrorMessage(value: unknown): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const error = (value as Record<string, unknown>).error;
    if (error !== null && typeof error === "object" && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") return message;
    }
  }

  return "The local test session could not be changed.";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The local test session could not be changed.";
}

export { SyntheticSessionProvider };
