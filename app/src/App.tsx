import { useEffect, useState } from "react";
import LyricsV2 from "./pages/LyricsV2";
import ReadingsV2 from "./pages/ReadingsV2";
import Program from "./pages/Program";
import ProgramV2 from "./pages/ProgramV2";
import ProgramV3 from "./pages/ProgramV3";
import ProgramSimple from "./pages/ProgramSimple";
import ServicePresentation from "./pages/ServicePresentation";
import Thumbnail from "./pages/Thumbnail";
import Recorder from "./pages/Recorder";
import Projector from "./pages/Projector";
import Remote from "./pages/Remote";
import Builder from "./pages/Builder";
import Scripture from "./pages/Scripture";
import Presentations from "./pages/Presentations";
import Notes from "./pages/Notes";
import Readings from "./pages/Readings";
import Toasts from "./components/Toasts";

// Pages in one app, chosen by the address hash:
// "#projector" = projector view, "#builder" = presentation builder, "#scripture" = scripture slides,
// anything else = lyrics page.
export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  // Some pages take extra data after a colon (#builder:<id>), so route on the part before it
  const page = hash.split(":")[0];
  const body = renderPage(page);
  return <div className="ct-app">{body}<Toasts /></div>;
}

function renderPage(page: string) {
  if (page === "#projector") return <Projector />;
  if (page === "#remote") return <Remote />;
  if (page === "#builder") return <Builder />;
  if (page === "#scripture") return <Scripture />;
  if (page === "#presentations") return <Presentations />;
  if (page === "#notes") return <Notes />;
  if (page === "#readings") return <Readings />;
  if (page === "#lyrics-v2") return <LyricsV2 />;
  if (page === "#readings-v2") return <ReadingsV2 />;
  if (page === "#program") return <Program />;
  if (page === "#program-v2") return <ProgramV2 />;
  if (page === "#program-v3") return <ProgramV3 />;
  if (page === "#program-simple") return <ProgramSimple />;
  if (page === "#service") return <ServicePresentation />;
  if (page === "#thumbnail") return <Thumbnail />;
  if (page === "#recorder") return <Recorder />;
  return <LyricsV2 />;
}
