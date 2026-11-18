import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
// The reader's fonts ship with the app (no Google Fonts request), so the first paint does not wait on another server
import "@fontsource/alegreya/400.css";
import "@fontsource/alegreya/400-italic.css";
import "@fontsource/alegreya/500.css";
import "@fontsource/alegreya/700.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
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
