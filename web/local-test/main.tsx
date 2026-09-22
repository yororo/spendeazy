import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import App from "../src/App";
import { initializeAppearance } from "../src/components/app/appearance";
import "../src/index.css";
import "./layout.css";
import { SyntheticSessionProvider } from "./synthetic-session-provider";

const sessionToken = import.meta.env.VITE_LOCAL_TEST_SESSION_TOKEN;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const initialScenario = readInitialScenario();
if (!sessionToken) {
  throw new Error(
    "Missing VITE_LOCAL_TEST_SESSION_TOKEN. Start the app with the local test launcher.",
  );
}
if (!apiBaseUrl) {
  throw new Error(
    "Missing VITE_API_BASE_URL. Start the app with the local test launcher.",
  );
}

const disposeAppearance = initializeAppearance();
if (import.meta.hot) import.meta.hot.dispose(disposeAppearance);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SyntheticSessionProvider
        token={sessionToken}
        apiBaseUrl={apiBaseUrl}
        initialScenario={initialScenario}
      >
        {(signedOutPage) => <App signInElement={signedOutPage} />}
      </SyntheticSessionProvider>
    </BrowserRouter>
  </StrictMode>,
);

function readInitialScenario(): "secondary" | "new" | undefined {
  const scenario = new URLSearchParams(window.location.search).get(
    "localTestScenario",
  );
  return scenario === "secondary" || scenario === "new"
    ? scenario
    : undefined;
}
