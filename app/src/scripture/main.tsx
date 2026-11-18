import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import Scripture from "../pages/Scripture";
import Toasts from "../components/Toasts";
import { startInstallTracking } from "../reader/install";
import { startVisitLogging } from "../lib/visits";

// Scripture as its own installable app at /scripture/, separate from the team app.
// The navbar keeps sign-in but hides the links to the other pages (sc-app in index.css).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="ct-app sc-app">
      <Scripture />
      <Toasts />
    </div>
  </StrictMode>,
);

startVisitLogging();

// Counts this device once when this app is installed (shown on the Notes page)
startInstallTracking("scripture");
