import { StrictMode } from "react";
import { ClerkProvider } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";
import App from "./App.tsx";
import { initializeAppearance } from "@/components/app/appearance";
import { ClerkSessionProvider } from "@/shared/session";

const disposeAppearance = initializeAppearance();
if (import.meta.hot) import.meta.hot.dispose(disposeAppearance);

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Public invitation previews are available before authentication and therefore
// need a small application-level query cache outside the authenticated scope.
const publicQueryClient = new QueryClient();

if (!publishableKey) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY. Copy .env.example to .env.local and add your Clerk publishable key.",
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={publicQueryClient}>
      <ClerkProvider publishableKey={publishableKey}>
        <ClerkSessionProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ClerkSessionProvider>
      </ClerkProvider>
    </QueryClientProvider>
  </StrictMode>,
);
