import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts ship with the app (Latin and Vietnamese letter sets), so they work offline
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/400-italic.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "./bible.css";
import Bible from "./Bible";
import { startVisitLogging } from "../lib/visits";

// Bunong Bible reader: its own installable page (/nau-brah-ndu-ngoi/), separate from the team app
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Bible />
  </StrictMode>,
);

startVisitLogging();
