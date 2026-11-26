import { useEffect, useMemo, useRef, useState } from "react";
import { setTheme, type Theme } from "../lib/theme";
import "./Home.css";

// Letters for the falling curtain under the roof: the app names plus Vietnamese-style marks used in Bunong
const GLYPHS = "NAUMPROBRAHNDUNGƠIơưăâêôđƠƯĂÊÔĐáàảãạớờởỡợ".split("");

function nextSunday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d;
}

function GlyphRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext("2d");
    if (!c || !x) return;
    const size = 13;
    let W = 0, H = 0, cols = 0, drops: number[] = [], raf = 0;
    const fit = () => {
      const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      W = r.width; H = r.height; c.width = W * d; c.height = H * d;
      x.setTransform(d, 0, 0, d, 0, 0);
      cols = Math.floor(W / size);
      drops = Array.from({ length: cols }, () => Math.random() * H / size);
    };
    const draw = (still: boolean) => {
      x.clearRect(0, 0, W, H);
      const g = getComputedStyle(c).getPropertyValue("--hm-glyph");
      x.font = `500 ${size - 1}px "IBM Plex Mono", monospace`;
      x.textAlign = "center";
      const rows = Math.floor(H / size);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if ((i * 31 + j * 17 + Math.floor(drops[i])) % 5 === 0) continue;
          x.globalAlpha = Math.max(0, (1 - j / rows) * (0.35 + 0.65 * ((i * 7 + j) % 3) / 2));
          x.fillStyle = g;
          x.fillText(GLYPHS[(i * 13 + j * 7 + Math.floor(drops[i])) % GLYPHS.length], i * size + size / 2, j * size + size);
        }
        if (!still) drops[i] += 0.04 + ((i * 7) % 5) * 0.01;
      }
      x.globalAlpha = 1;
    };
    fit();
    window.addEventListener("resize", fit);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = () => { draw(reduce); if (!reduce) raf = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, []);
  return <canvas ref={ref} className="hm-rain" aria-hidden="true" />;
}

// Home opens in dark mode unless this browser has chosen light or dark in the app
function homeTheme(): Theme {
  try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") return t; } catch { /* storage blocked */ }
  return "dark";
}

// Small seeded random so the thatch looks the same on every visit
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

// Roof outline: a hipped thatch roof seen from the front, ridge at the top, eaves sagging slightly
const ROOF = "M240 66Q300 58 360 66C420 118 500 186 566 244Q300 262 34 244C100 186 180 118 240 66Z";
const roofLeft = (y: number) => 240 - ((y - 66) / 178) * 206;
const roofRight = (y: number) => 360 + ((y - 66) / 178) * 206;

type Strand = { d: string; c: number };

function makeThatch(): { strands: Strand[]; fringe: Strand[]; courses: string[] } {
  const r = rng(7);
  const strands: Strand[] = [];
  for (let n = 0; n < 2200; n++) {
    const y = 60 + r() * 192;
    const x = roofLeft(y) - 6 + r() * (roofRight(y) - roofLeft(y) + 12);
    const len = 12 + r() * 16;
    const lean = ((x - 300) / 300) * 0.55 + (r() - 0.5) * 0.12; // straw falls away from the ridge
    const k = r();
    strands.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)}l${(lean * len).toFixed(1)} ${len.toFixed(1)}`, c: k < 0.22 ? 1 : k < 0.8 ? 2 : 3 });
  }
  const fringe: Strand[] = [];
  for (let x = 36; x <= 564; x += 2.4) {
    const t = (x - 34) / 532, y = 244 + Math.sin(t * Math.PI) * 9 - 2;
    const len = 5 + r() * 10, lean = ((x - 300) / 300) * 0.35;
    fringe.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)}l${(lean * len).toFixed(1)} ${len.toFixed(1)}`, c: r() < 0.5 ? 2 : 3 });
  }
  // Each course of thatch overlaps the one below and leaves a soft shadow line
  const courses = [98, 130, 162, 194, 224].map((y) => {
    const l = roofLeft(y), rr = roofRight(y);
    return `M${l.toFixed(0)} ${y}Q300 ${y + 10} ${rr.toFixed(0)} ${y}`;
  });
  return { strands, fringe, courses };
}

// A Bunong-style thatched church on stilts, lit from the top left like the sunlight on the page
function HutChurch() {
  const { strands, fringe, courses } = useMemo(makeThatch, []);
  return (
    <svg className="hm-roof" viewBox="0 0 600 380" aria-hidden="true">
      <defs>
        <clipPath id="hm-roofclip"><path d={ROOF} /></clipPath>
        <filter id="hm-blur8" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8" /></filter>
        <filter id="hm-blur2"><feGaussianBlur stdDeviation="1.6" /></filter>
        <linearGradient id="hm-roof-light" x1="0" y1="0" x2="1" y2="0.7">
          <stop offset="0" className="hm-lit" /><stop offset="0.45" className="hm-clear" /><stop offset="1" className="hm-dark" />
        </linearGradient>
        <linearGradient id="hm-wall-light" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="hm-lit" /><stop offset="0.5" className="hm-clear" /><stop offset="1" className="hm-dark" />
        </linearGradient>
        <linearGradient id="hm-eave-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="hm-dark-strong" /><stop offset="1" className="hm-clear" />
        </linearGradient>
        <pattern id="hm-bamboo" width="9" height="64" patternUnits="userSpaceOnUse">
          <rect width="9" height="64" className="hm-bamboo" />
          <rect width="1.4" height="64" className="hm-bamboo-line" />
          <rect y="30" width="9" height="1.2" className="hm-bamboo-line" />
        </pattern>
      </defs>

      {/* cast shadows on the ground, thrown down and to the right */}
      <path d="M70 340L540 340L600 366L150 370Z" className="hm-cast" filter="url(#hm-blur8)" />
      <path d="M150 336L460 336L500 350L200 352Z" className="hm-cast-strong" filter="url(#hm-blur2)" />

      {/* stilts, lit on the left */}
      {[150, 205, 260, 330, 385, 440].map((x) => (
        <g key={x}>
          <rect x={x} y="296" width="8" height="42" className="hm-post" />
          <rect x={x} y="296" width="2.5" height="42" className="hm-post-lit" />
          <rect x={x + 8} y="300" width="10" height="38" className="hm-cast" filter="url(#hm-blur2)" />
        </g>
      ))}
      <rect x="132" y="290" width="336" height="9" className="hm-post" />

      {/* bamboo walls, door and ladder */}
      <rect x="140" y="232" width="320" height="60" fill="url(#hm-bamboo)" />
      <rect x="140" y="232" width="320" height="60" fill="url(#hm-wall-light)" />
      <rect x="276" y="246" width="38" height="46" className="hm-doorway" />
      <rect x="276" y="246" width="3" height="46" className="hm-post-lit" />
      <path d="M282 298l-7 42M308 298l7 42M279 312h32M277 326h36" className="hm-ladder" />
      <rect x="140" y="232" width="320" height="34" fill="url(#hm-eave-shadow)" />

      {/* roof shadow on the wall, deeper on the right */}
      <path d="M140 248Q300 262 460 248L460 276Q300 268 220 262Z" className="hm-cast" filter="url(#hm-blur8)" />

      {/* thatch */}
      <path d={ROOF} className="hm-straw" />
      <g clipPath="url(#hm-roofclip)">
        {strands.map((s, i) => <path key={i} d={s.d} className={`hm-s${s.c}`} />)}
        {courses.map((d, i) => <path key={i} d={d} className="hm-course" filter="url(#hm-blur2)" />)}
        <path d={ROOF} fill="url(#hm-roof-light)" />
      </g>
      {fringe.map((s, i) => <path key={i} d={s.d} className={`hm-s${s.c}`} />)}
      {/* sunlit edge on the left hip */}
      <path d="M240 66C180 118 100 186 34 244" className="hm-rim" />

      {/* ridge bundle with crossed horns, and the cross */}
      <path d="M236 68Q300 56 364 68" className="hm-ridge" />
      <path d="M240 68l-16-30M360 68l16-30" className="hm-ridge" />
      <rect x="296" y="10" width="7" height="54" className="hm-gold" />
      <rect x="283" y="24" width="33" height="6" className="hm-gold" />
      <rect x="300" y="10" width="3" height="54" className="hm-gold-shade" />
      <rect x="303" y="26" width="16" height="40" className="hm-cast" filter="url(#hm-blur2)" transform="skewX(18)" />
    </svg>
  );
}

const apps = [
  { name: "Nau Mpro", text: "The hymn book and this Sunday's service on your phone. No account needed. Pick your church once.", href: "/nau-mpro/", action: "Open Nau Mpro ↗" },
  { name: "Nau Brah Ndu Ngơi", text: "The Bunong Bible. Books you open are saved for reading offline. Highlights and notes back up when you sign in.", href: "/nau-brah-ndu-ngoi/", action: "Open the Bible ↗" },
  { name: "Church Tools", text: "For the worship team: the program, lyric slides, readings, scripture slides and the projector.", href: "#lyrics-v2", action: "Open Church Tools" },
];

export default function Home() {
  useEffect(() => {
    const before = document.title;
    document.title = "Church Tools · Three apps for worship";
    return () => { document.title = before; };
  }, []);

  const [theme, setThemeState] = useState<Theme>(homeTheme);
  const toggleTheme = () => { const next: Theme = theme === "dark" ? "light" : "dark"; setTheme(next); setThemeState(next); };
  const sunday = nextSunday();
  const month = sunday.toLocaleDateString("en-US", { month: "short" });

  return (
    <div className="hm" data-hm-theme={theme}>
      <div className="hm-sun" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="hm-wrap">
        <header className="hm-nav">
          <a className="hm-brand" href="#">Church Tools</a>
          <a href="#lyrics-v2">Lyrics</a>
          <a href="#service">Service Slides</a>
          <a href="#program">Program</a>
          <button type="button" className="hm-theme" onClick={toggleTheme}>{theme === "dark" ? "☀ Light" : "☾ Dark"}</button>
          <a className="hm-signin" href="#team">Sign in</a>
        </header>

        <div className="hm-stage">
          <a className="hm-side hm-l" href="/nau-mpro/"><span className="hm-tile">Nau Mpro</span>Hymns ↗</a>
          <a className="hm-side hm-r" href="/nau-brah-ndu-ngoi/"><span className="hm-tile">Nau Brah Ndu Ngơi</span>Bible ↗</a>
          <HutChurch />
          <GlyphRain />
          <div className="hm-copy">
            <p className="hm-kicker">Montagnard Bunong Alliance Church · Sunday service</p>
            <h1 id="hm-h">Hymns, readings and slides for <em>every Sunday</em>, ready before the first song</h1>
          </div>
          <p className="hm-note">Build the program, put the lyrics on the projector and share the service with the whole church.<a href="#lyrics-v2">Open Lyrics</a></p>
        </div>

        <section>
          <p className="hm-eyebrow">Three apps</p>
          <h2>One for singing, one for reading, one for the team</h2>
          <div className="hm-apps">
            {apps.map((a) => (
              <div className="hm-app" key={a.name}>
                <span className="hm-bar" />
                <h3>{a.name}</h3>
                <p>{a.text}</p>
                <a href={a.href}>{a.action}</a>
              </div>
            ))}
          </div>
        </section>

        <section className="hm-sunday">
          <div>
            <p className="hm-eyebrow">This Sunday</p>
            <p className="hm-date">{month} {sunday.getDate()}<small>Sunday service</small></p>
          </div>
          <div>
            <p className="hm-sunday-text">The order of service, songs and readings for this Sunday are published to Nau Mpro as soon as the team finishes the program.</p>
            <a className="hm-btn hm-dark" href="/nau-mpro/">See this Sunday in Nau Mpro ↗</a>
          </div>
        </section>

        <section>
          <p className="hm-eyebrow">How a Sunday comes together</p>
          <h2>From program to projector</h2>
          <ol className="hm-steps">
            <li><b>Plan the program</b>Fill in the Order of Worship. It saves for the whole team as you type.</li>
            <li><b>Choose songs and readings</b>Pick from the hymn book and your church's readings.</li>
            <li><b>Slides build themselves</b>Service Slides turns the program into a full deck.</li>
            <li><b>Present</b>Open the projector view and step through the service.</li>
          </ol>
        </section>

        <section className="hm-team">
          <div>
            <p className="hm-eyebrow">For your team</p>
            <h2>Your church's work stays with your church</h2>
            <div className="hm-btns">
              <a className="hm-btn hm-dark" href="#team">Start a church</a>
              <a className="hm-btn" href="#team">Join with a code</a>
            </div>
          </div>
          <ul>
            <li>Admins and editors for each church</li>
            <li>Join codes and invites for new members</li>
            <li>A bell when a program is published or a song changes</li>
            <li>Keep a presentation to yourself with Only me</li>
          </ul>
        </section>

        <section className="hm-verse">
          <p className="hm-eyebrow">Verse of the week</p>
          <blockquote>Your word is a lamp to my feet and a light to my path.</blockquote>
          <cite>Psalm 119:105</cite>
        </section>

        <footer className="hm-footer">
          <span className="hm-brand">Church Tools</span>
          <span>Montagnard Bunong Alliance Church, Charlotte, NC</span>
          <a href="/nau-mpro/">Nau Mpro</a>
          <a href="/nau-brah-ndu-ngoi/">Nau Brah Ndu Ngơi</a>
          <a href="#team">Sign in</a>
          <button type="button" className="hm-theme hm-theme-foot" onClick={toggleTheme}>{theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}</button>
        </footer>
      </div>
    </div>
  );
}
