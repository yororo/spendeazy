import { StrictMode } from "react";
import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./index.css";
import App from "./App.tsx";
import { initializeAppearance } from "@/components/app/appearance";

const disposeAppearance = initializeAppearance();
if (import.meta.hot) import.meta.hot.dispose(disposeAppearance);

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY. Copy .env.example to .env.local and add your Clerk publishable key.",
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
);
