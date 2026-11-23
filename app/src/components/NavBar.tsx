import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { currentTheme, setTheme, type Theme } from "../lib/theme";
import { readForSlides, watchForSlides } from "../lib/forSlides";

// Shared navigation for the app's pages. The current page is marked with aria-current.
// Sign in and sign out live here, so they are the same on every page.
// newTab: a separate page (the congregation's reader), opened in a new tab so the team app stays open
const PAGES: { href: string; label: string; newTab?: boolean }[] = [
  { href: "#", label: "Hymn/Nau Mpro" },
  { href: "/nau-mpro/", label: "Nau Mpro App ↗", newTab: true },
  { href: "#readings-v2", label: "Readings" },
  { href: "#scripture", label: "Scripture/Brah Ndu Ngoi" },
  { href: "#builder", label: "Presentation Builder" },
  { href: "#program", label: "Program" },
  { href: "#program-simple", label: "Program Builder" },
  { href: "#service", label: "Service Slides" },
  { href: "#thumbnail", label: "Thumbnail" },
  { href: "#presentations", label: "Presentations" },
  { href: "#projector", label: "Projector" },
  { href: "#notes", label: "Notes" },
];

export default function NavBar() {
  const hash = (window.location.hash || "#").split(":")[0];
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // phone menu (hamburger)
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  // Passages sent from the Bible reader and not yet added: a small count on the Scripture link
  const [waiting, setWaiting] = useState(() => readForSlides().length);
  useEffect(() => watchForSlides((list) => setWaiting(list.length)), []);
  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function auth(kind: "in" | "up") {
    if (!supabase) return;
    if (!email.trim() || pass.length < 6) { setMsg("Enter an email and a password of 6+ characters."); return; }
    const creds = { email: email.trim(), password: pass };
    const { data, error } = kind === "up" ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds);
    if (error) { setMsg(error.message); return; }
    if (kind === "up" && !data.session) { setMsg("Account created. Check your email to confirm, then sign in."); return; }
    setPass(""); setMsg(""); setOpen(false);
  }

  return (
    <nav className={`navbar${menuOpen ? " menu-open" : ""}`} aria-label="Main">
      <span className="brand">Church Tools</span>
      <button className="nav-toggle" type="button" aria-expanded={menuOpen} aria-controls="nav-links" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((v) => !v)}>
        <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
      </button>
      <ul id="nav-links" onClick={() => setMenuOpen(false)}>
        {PAGES.map((p) => {
          const current = p.href === hash || (p.href === "#" && hash === "");
          return (
            <li key={p.href}>
              {p.newTab ? (
                <a href={p.href} target="_blank" rel="noopener" aria-label={`${p.label.replace(" ↗", "")} (opens in a new tab)`}>
                  {p.label}
                </a>
              ) : (
                <a href={p.href} aria-current={current ? "page" : undefined} className={current ? "active" : undefined}>
                  {p.label}
                  {p.href === "#scripture" && waiting > 0 && <span className="nav-count" aria-label={`, ${waiting} passage${waiting === 1 ? "" : "s"} from the Bible waiting`}>{waiting}</span>}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="theme-toggle secondary small" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
        {theme === "dark" ? "☀ Light" : "☾ Dark"}
      </button>
      {supabase && (
        <div className="nav-auth">
          {session ? (
            <>
              <button className="secondary small" onClick={() => supabase?.auth.signOut()}>Sign out</button>
            </>
          ) : (
            <>
              <button className="secondary small" onClick={() => { setOpen((v) => !v); setMsg(""); }} aria-expanded={open}>
                {open ? "Close" : "Sign in"}
              </button>
              {open && (
                <form className="nav-auth-panel" onSubmit={(e) => { e.preventDefault(); auth("in"); }}>
                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input type="password" placeholder="Password (6+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} />
                  <div className="row">
                    <button type="submit">Sign in</button>
                    <button type="button" className="secondary" onClick={() => auth("up")}>Create account</button>
                  </div>
                  {msg && <p className="status error">{msg}</p>}
                </form>
              )}
            </>
          )}
        </div>
      )}
    </nav>
  );
}
