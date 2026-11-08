import { useEffect, useState } from "react";
import Lyrics from "./pages/Lyrics";
import Projector from "./pages/Projector";
import Builder from "./pages/Builder";
import Scripture from "./pages/Scripture";
import Presentations from "./pages/Presentations";
import Notes from "./pages/Notes";

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
  if (page === "#projector") return <Projector />;
  if (page === "#builder") return <Builder />;
  if (page === "#scripture") return <Scripture />;
  if (page === "#presentations") return <Presentations />;
  if (page === "#notes") return <Notes />;
  return <Lyrics />;
}
