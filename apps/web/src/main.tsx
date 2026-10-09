import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import "@sq/ui/tokens.css";
import "@sq/ui/components.css";
import "./styles/app.css";

import { App } from "./App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { AuthProvider } from "./lib/useAuth";
import { installErrorCapture } from "./lib/capture";
import { installOffline } from "./offline/install";
import { watchInstallPrompt } from "./offline/installPrompt";

// The offline queue wraps fetch before any component can issue one, and the
// install prompt is a page-lifetime subscription (P20). Error capture runs
// first of all: the failures worth reporting are the early ones (P21).
installErrorCapture();
installOffline();
watchInstallPrompt();

const host = document.getElementById("root");
if (!host) throw new Error("#root is missing from index.html");

/**
 * Server state lives in TanStack Query. Retry twice then stop: a local API that is down
 * should surface its error immediately rather than hold the UI on a spinner.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

createRoot(host).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {/* Outermost so a crash in any route still explains itself (P21). */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
