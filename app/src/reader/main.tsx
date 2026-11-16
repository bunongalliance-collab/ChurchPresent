import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "./reader.css";
import Reader from "./Reader";
import { startVisitLogging } from "../lib/visits";
import { startInstallTracking } from "./install";

// Nau Mpro reader: its own page (/nau-mpro/), separate from the team app
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Reader />
  </StrictMode>,
);

// Visits show on the team app's Notes page (signed-in users by account, everyone else as Visitor)
startVisitLogging();

// Counts this device once when the app is installed (no sign-in)
startInstallTracking();
