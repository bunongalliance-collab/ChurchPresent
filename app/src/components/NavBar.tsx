import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { currentTheme, setTheme, type Theme } from "../lib/theme";
import { readForSlides, watchForSlides } from "../lib/forSlides";
import { usePastor } from "../lib/pastor";
import SignInForm from "./SignInForm";
import { useChurch, switchChurch } from "../lib/church";
import NotificationBell, { WelcomeBanner } from "./NotificationBell";
import { countNewPrayer } from "../lib/prayer";

// Shared navigation for the app's pages. The current page is marked with aria-current.
// Sign in and sign out live here, so they are the same on every page.
// newTab: a separate page (the congregation's reader), opened in a new tab so the team app stays open
// The pages, in workflow order (a divider before the smaller tools), and the separate apps (opened in a new tab)
const PAGES: { href: string; label: string; divider?: boolean }[] = [
  { href: "#lyrics-v2", label: "Hymn/Nau Mpro" },
  { href: "#readings-v2", label: "Readings" },
  { href: "#scripture", label: "Scripture/Brah Ndu Ngoi" },
  { href: "#builder", label: "Presentation Builder" },
  { href: "#presentations", label: "Presentations" },
  { href: "#program", label: "Program" },
  { href: "#service", label: "Service Slides" },
  { href: "#projector", label: "Projector" },
  { href: "#thumbnail", label: "Thumbnail", divider: true },
  { href: "#prayer", label: "Prayer" },
  { href: "#notes", label: "Notes" },
  { href: "#team", label: "Team" },
];
const APPS = [
  { href: "/nau-mpro/", label: "Nau Mpro App" },
  { href: "/nau-brah-ndu-ngoi/", label: "Nau Brah Ndu Ngơi" },
];

export default function NavBar() {
  const hash = (window.location.hash || "#").split(":")[0];
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false); // phone menu (hamburger)
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  // Passages sent from the Bible reader and not yet added: a small count on the Scripture link
  const [waiting, setWaiting] = useState(() => readForSlides().length);
  useEffect(() => watchForSlides((list) => setWaiting(list.length)), []);
  // The current church, and people asking to join it (a count on Team, for its admins)
  const church = useChurch();
  const cur = church.current;
  const [asks, setAsks] = useState(0);
  // Open prayer requests nobody follows up yet: a count on Prayer
  const [newPrayer, setNewPrayer] = useState(0);
  useEffect(() => {
    if (!cur || cur.status !== "active") { setNewPrayer(0); return; }
    let live = true;
    void countNewPrayer(cur.id).then((n) => { if (live) setNewPrayer(n); });
    return () => { live = false; };
  }, [cur, hash]);
  // The Pastor tab: first, and only for members marked Pastor on the Team page (lib/pastor.ts)
  const pastor = usePastor();
  const pages = pastor.isPastor ? [{ href: "#pastor", label: "Pastor" }, ...PAGES] : PAGES;
  // One menu open at a time: the church switcher, Apps, the account menu or the sign-in form
  const [pop, setPop] = useState<"" | "church" | "apps" | "acct" | "signin">("");
  useEffect(() => {
    if (!supabase || !cur || cur.role !== "admin") { setAsks(0); return; }
    let live = true;
    supabase.from("church_requests").select("user_id", { count: "exact", head: true }).eq("church_id", cur.id)
      .then(({ count }) => { if (live) setAsks(count ?? 0); });
    return () => { live = false; };
  }, [cur, hash]);
  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : (e.target as Element).isConnected && !(e.target as Element).closest(".tn-popwrap, .tn-sheet")) setPop("");
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [pop]);
  // The phone menu closes when the page changes
  useEffect(() => { setMenuOpen(false); setPop(""); }, [hash]);
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

  const isCurrent = (href: string) => href === hash || (href === "#lyrics-v2" && hash === "#lyrics");
  const counts = (href: string) => (
    <>
      {href === "#team" && asks > 0 && <span className="tn-count" aria-label={`, ${asks} ${asks === 1 ? "person" : "people"} asking to join`}>{asks}</span>}
      {href === "#prayer" && newPrayer > 0 && <span className="tn-count" aria-label={`, ${newPrayer} new prayer request${newPrayer === 1 ? "" : "s"}`}>{newPrayer}</span>}
      {href === "#scripture" && waiting > 0 && <span className="tn-count" aria-label={`, ${waiting} passage${waiting === 1 ? "" : "s"} from the Bible waiting`}>{waiting}</span>}
    </>
  );
  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const Chevron = () => <svg className="tn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>;
  const signInForm = <SignInForm onDone={() => { setPop(""); setMenuOpen(false); }} />;

  // Two rows: who and where you are (brand, church, apps, bell, theme, account), then every page as a tab.
  // Phones: one row (brand, bell, menu) and a menu sheet with everything else. Approved sample: bible-pwa/sample/navbar.html
  return (
    <>
      <div className="tn-top">
        <div className="tn-bar">
          <a className="tn-brand" href="#" title="NauBrah home">NauBrah</a>
          {cur && (
            <>
              <span className="tn-sep" aria-hidden="true" />
              <div className="tn-popwrap tn-church">
                <button type="button" className="tn-churchbtn" aria-haspopup="menu" aria-expanded={pop === "church"} onClick={() => setPop(pop === "church" ? "" : "church")}
                  title={church.churches.length > 1 ? "Switch church" : cur.name}>
                  <span>{cur.name}</span><Chevron />
                </button>
                {pop === "church" && (
                  <div className="tn-pop" role="menu">
                    <small>Your churches</small>
                    {church.churches.map((c) => (
                      <button type="button" role="menuitemradio" aria-checked={c.id === cur.id} key={c.id} onClick={() => { switchChurch(c.id); setPop(""); }}>
                        <span>{c.name}</span><em>{c.status === "waiting" ? "Waiting" : c.role === "admin" ? "Admin" : "Editor"}</em>
                      </button>
                    ))}
                    <a href="#team" role="menuitem" className="tn-poplink" onClick={() => setPop("")}>Join or start a church</a>
                  </div>
                )}
              </div>
            </>
          )}
          <span className="tn-grow" />
          <div className="tn-popwrap tn-apps">
            <button type="button" className="tn-textbtn" aria-haspopup="menu" aria-expanded={pop === "apps"} onClick={() => setPop(pop === "apps" ? "" : "apps")}>Apps<Chevron /></button>
            {pop === "apps" && (
              <div className="tn-pop tn-right" role="menu">
                <small>Opens in a new tab</small>
                {APPS.map((a) => <a key={a.href} role="menuitem" href={a.href} target="_blank" rel="noopener" onClick={() => setPop("")}>{a.label} <span aria-hidden="true">↗</span></a>)}
              </div>
            )}
          </div>
          {session && <NotificationBell />}
          <button type="button" className="tn-icon tn-theme" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {theme === "dark"
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>}
          </button>
          {supabase && (
            <div className="tn-popwrap tn-account">
              {session ? (
                <button type="button" className="tn-avatar" aria-haspopup="menu" aria-expanded={pop === "acct"} aria-label={`Account: ${session.user.email ?? ""}`} onClick={() => setPop(pop === "acct" ? "" : "acct")}>
                  {(session.user.email ?? "?")[0].toUpperCase()}
                </button>
              ) : (
                <button type="button" className="tn-signinbtn" aria-expanded={pop === "signin"} onClick={() => setPop(pop === "signin" ? "" : "signin")}>Sign in</button>
              )}
              {pop === "acct" && session && (
                <div className="tn-pop tn-right" role="menu">
                  <div className="tn-me"><b>{session.user.email}</b>{cur && <span>{cur.role === "admin" ? "Admin" : "Editor"} · {cur.name}</span>}</div>
                  <a href="#team" role="menuitem" onClick={() => setPop("")}>Team</a>
                  <button type="button" role="menuitem" onClick={() => { setPop(""); void supabase?.auth.signOut(); }}>Sign out</button>
                </div>
              )}
              {pop === "signin" && !session && <div className="tn-pop tn-right tn-signinpop">{signInForm}</div>}
            </div>
          )}
          <button type="button" className="tn-icon tn-menubtn" aria-expanded={menuOpen} aria-controls="tn-sheet" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
          </button>
        </div>
      </div>

      <nav className="tn-tabs" aria-label="Pages">
        <ul>
          {pages.map((p) => (
            <li key={p.href} className={p.divider ? "tn-div" : undefined}>
              <a href={p.href} aria-current={isCurrent(p.href) ? "page" : undefined}>{p.label}{counts(p.href)}</a>
            </li>
          ))}
        </ul>
      </nav>

      {menuOpen && (
        <div className="tn-sheet" id="tn-sheet">
          {cur && church.churches.length > 1 && (
            <div className="tn-sheet-churches" role="group" aria-label="Your churches">
              {church.churches.map((c) => (
                <button type="button" key={c.id} aria-pressed={c.id === cur.id} onClick={() => switchChurch(c.id)}>{c.name}</button>
              ))}
            </div>
          )}
          {cur && church.churches.length <= 1 && <p className="tn-sheet-church">{cur.name}</p>}
          <nav aria-label="Pages">
            {pages.map((p) => <a key={p.href} href={p.href} aria-current={isCurrent(p.href) ? "page" : undefined}>{p.label}{counts(p.href)}</a>)}
            {APPS.map((a) => <a key={a.href} href={a.href} target="_blank" rel="noopener">{a.label} <span aria-hidden="true">↗</span></a>)}
          </nav>
          <div className="tn-sheet-foot">
            <button type="button" onClick={toggleTheme}>{theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}</button>
            {session
              ? <button type="button" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
              : supabase && <button type="button" onClick={() => setPop("signin")}>Sign in</button>}
          </div>
          {!session && pop === "signin" && signInForm}
        </div>
      )}
      <div className="tn-end" aria-hidden="true" />
      {session && <WelcomeBanner />}
    </>
  );
}
