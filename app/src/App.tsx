import { useEffect, useState } from "react";
import "./pages/Linen.css";   // the Scripture page look for pages with class "lt" (all but Lyric)
import LyricsV2 from "./pages/LyricsV2";
import ReadingsV2 from "./pages/ReadingsV2";
import Program from "./pages/Program";
import ProgramV2 from "./pages/ProgramV2";
import ProgramV3 from "./pages/ProgramV3";
import ServicePresentation from "./pages/ServicePresentation";
import Thumbnail from "./pages/Thumbnail";
import Recorder from "./pages/Recorder";
import LowerThirdOverlay from "./pages/LowerThirdOverlay";
import Projector from "./pages/Projector";
import Remote from "./pages/Remote";
import Builder from "./pages/Builder";
import Scripture from "./pages/Scripture";
import Presentations from "./pages/Presentations";
import Notes from "./pages/Notes";
import Team from "./pages/Team";
import Home from "./pages/Home";
import Demos from "./pages/Demos";
import Readings from "./pages/Readings";
import Toasts from "./components/Toasts";

// Pages in one app, chosen by the address hash:
// "#projector" = projector view, "#builder" = presentation builder, "#scripture" = scripture slides,
// no hash = the home page, anything unknown = the Lyric page.
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
  // The main address is the home page; NauBrah starts at Lyric (#lyrics-v2)
  // The "How it helps" page is the home page; the earlier one stays at #home-old
  if (page === "" || page === "#" || page === "#home" || page === "#home-new") return <Home variant="helps" />;
  if (page === "#home-old") return <Home />;
  if (page === "#demos") return <Demos />;
  if (page === "#lyrics") return <LyricsV2 />;
  if (page === "#projector") return <Projector />;
  if (page === "#remote") return <Remote />;
  if (page === "#builder") return <Builder />;
  if (page === "#scripture") return <Scripture />;
  if (page === "#presentations") return <Presentations />;
  if (page === "#notes") return <Notes />;
  if (page === "#team") return <Team />;
  if (page === "#readings") return <Readings />;
  if (page === "#lyrics-v2") return <LyricsV2 />;
  if (page === "#lyrics-blueprint") return <LyricsV2 skin="blueprint" />;
  if (page === "#readings-v2") return <ReadingsV2 />;
  if (page === "#program") return <Program />;
  if (page === "#program-v2") return <ProgramV2 />;
  if (page === "#program-v3") return <ProgramV3 />;
  if (page === "#service") return <ServicePresentation />;
  if (page === "#thumbnail") return <Thumbnail />;
  if (page === "#recorder") return <Recorder />;
  if (page === "#lowerthird") return <LowerThirdOverlay />;
  return <LyricsV2 />;
}
