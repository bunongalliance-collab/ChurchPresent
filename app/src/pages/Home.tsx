import { useEffect, useMemo, useRef, useState } from "react";
import { setTheme, type Theme } from "../lib/theme";
import { supabase } from "../lib/supabase";
import "./Home.css";


function nextSunday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d;
}

// The 66 book names of the Bunong Bible (Vietnam dialect), as in supabase/bible-book-names-fix.sql
const BOOK_NAMES: string[] = ["Nau Ntơm", "Nau Ngluh", "Kan Lêvi", "Nau Kơp", "Nau Vay Rơh Bar", "Y-Yôsuê", "Phung Kôranh Phat Dôih", "H'Rut", "I Y-Samuel", "II Y-Samuel", "I Kan Hađăch", "II Kan Hađăch", "I Nau Rêh Jêng", "II Nau Rêh Jêng", "Y-Êsra", "Y-Nêhêmi", "H'Êsther", "Y-Yôp", "Nau Mprơ Ơm", "Nau Hôr", "Kôranh Nơm Nti", "Nau Mprơ Ueh", "Y-Êsai", "Y-Yêrêmi", "Nau Y-Yêrêmi Nhĭm Vơl", "Y-Êsêkiêl", "Y-Daniel", "Y-Ôsê", "Y-Yôel", "Y-Amôt", "Y-Apdia", "Y-Yôna", "Y-Mika", "Y-Nahum", "Y-Habakuk", "Y-Sôphôni", "Y-Agê", "Y-Sakari", "Y-Malaki", "Y-Mathiơ", "Y-Markôs", "Y-Luk", "Y-Yôhan", "Kan Phung Oh Mon", "Rôm", "I Kôrintô", "II Kôrintô", "Galati", "Êphêsô", "Philip", "Kôlôs", "I Têsalônik", "II Têsalônik", "I Timôthê", "II Timôthê", "Y-Tit", "Y-Philêmôn", "Hêbrơ", "Y-Yakơ", "I Y-Pêtrôs", "II Y-Pêtrôs", "I Y-Yôhan", "II Y-Yôhan", "III Y-Yôhan", "Y-Yut", "Nau Tâm Mpơl"];

// The words hidden among the chimes: one chime in the middle spells them and flashes now and then
const HIDDEN = "NAU BRAH NDU NGƠI";

type Chime = { x: number; drop: number; text: string; amp: number; freq: number; phase: number; fade: number; next: string | null };

// Letters hanging like wind chimes under the church: each strand holds Bunong book names,
// sways in a shared breeze, and now and then swaps its names so every book appears in turn
function GlyphRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext("2d");
    if (!c || !x) return;
    let size = 13, gap = 15;
    let W = 0, H = 0, raf = 0, start = 0, lastSwap = 0;
    let chimes: Chime[] = [], queue: string[] = [], hiddenIdx = 0;

    const shuffled = () => [...BOOK_NAMES].sort(() => Math.random() - 0.5).map((n) => n.toUpperCase());
    const takeNames = (cap: number) => {
      let t = "";
      while (t.length < cap) {
        if (!queue.length) queue = shuffled();
        const n = queue.shift()!;
        t = t ? `${t} · ${n}` : n;
      }
      return t;
    };

    const fit = () => {
      const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      if (!r.width || !r.height) return;
      W = r.width; H = r.height; c.width = W * d; c.height = H * d;
      size = H < 260 ? 10.5 : 13; gap = size + 2; // smaller letters on short screens so the whole name fits
      x.setTransform(d, 0, 0, d, 0, 0);
      const n = Math.max(3, Math.floor(W / gap));
      const left = (W - (n - 1) * gap) / 2;
      hiddenIdx = Math.floor(n / 2);
      chimes = Array.from({ length: n }, (_, i) => {
        const drop = 4 + Math.random() * Math.min(18, H * 0.08);       // short bare string above the letters
        const cap = Math.max(4, Math.floor((H - drop) / size) - 2);
        return {
          x: left + i * gap, drop, text: i === hiddenIdx ? `${HIDDEN} · ${takeNames(cap)}` : takeNames(cap),
          amp: (7 + Math.random() * 10) / H, /* bottom of each strand swings 7–17px on any screen */ freq: 0.5 + Math.random() * 0.7, phase: Math.random() * Math.PI * 2, fade: 1, next: null,
        };
      });
      chimes[hiddenIdx].drop = 4;
    };

    const draw = (t: number) => {
      x.clearRect(0, 0, W, H);
      const css = getComputedStyle(c);
      const ink = css.getPropertyValue("--hm-glyph").trim();
      x.textAlign = "center"; x.textBaseline = "middle";
      // the bar the chimes hang from
      x.globalAlpha = 0.5; x.strokeStyle = ink; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(chimes[0]?.x - 8 || 0, 1); x.lineTo((chimes[chimes.length - 1]?.x ?? W) + 8, 1); x.stroke();
      const breeze = Math.sin(t * 0.35) * 0.6 + Math.sin(t * 0.9 + 1.3) * 0.4; // gusts every chime feels
      chimes.forEach((ch, i) => {
        const angle = ch.amp * Math.sin(t * ch.freq * 2 + ch.phase) + breeze * (8 / H);
        const hidden = i === hiddenIdx;
        // the hidden chime flashes: a slow glow plus a quick bright flash every few seconds
        const pulse = hidden ? 0.55 + 0.45 * Math.max(Math.sin(t * 1.6) ** 8, (Math.sin(t * 0.7) > 0.97 ? 1 : 0)) : 1;
        x.save();
        x.translate(ch.x, 1);
        x.rotate(angle);
        x.globalAlpha = 0.35 * ch.fade; x.lineWidth = 0.8;
        x.beginPath(); x.moveTo(0, 0); x.lineTo(0, ch.drop); x.stroke();
        x.font = hidden ? `700 ${size}px "IBM Plex Mono", monospace` : `500 ${size - 1}px "IBM Plex Mono", monospace`;
        if (hidden) { x.shadowColor = ink; x.shadowBlur = 10 * pulse; }
        let y = ch.drop + size * 0.6, k = 0;
        for (const chr of ch.text) {
          if (y > H - size * 0.5) break;
          const lit = hidden && k < HIDDEN.length;
          if (hidden && k === HIDDEN.length) { x.shadowBlur = 0; x.font = `500 ${size - 1}px "IBM Plex Mono", monospace`; }
          if (chr !== " ") {
            const depth = 1 - y / H;
            x.globalAlpha = lit ? pulse : Math.max(0, ch.fade * depth * (0.35 + 0.45 * ((k * 7 + i) % 3) / 2));
            x.fillStyle = ink;
            x.fillText(chr, 0, y);
          }
          y += size; k++;
        }
        x.shadowBlur = 0;
        // a small weight at the end of the strand
        x.globalAlpha = 0.5 * ch.fade * Math.max(0, 1 - y / H);
        x.beginPath(); x.arc(0, Math.min(y, H - 4) - size * 0.2, 2, 0, Math.PI * 2); x.fillStyle = ink; x.fill();
        x.restore();
      });
      x.globalAlpha = 1;
    };

    // Every couple of seconds one chime fades out, takes the next book names and fades back in
    const swap = (t: number, dt: number) => {
      if (t - lastSwap > 1.6) {
        lastSwap = t;
        const i = Math.floor(Math.random() * chimes.length);
        if (i !== hiddenIdx && !chimes[i].next) chimes[i].next = takeNames(Math.max(4, Math.floor((H - chimes[i].drop) / size) - 2));
      }
      for (const ch of chimes) {
        if (ch.next) { ch.fade -= dt * 2; if (ch.fade <= 0) { ch.text = ch.next; ch.next = null; ch.fade = 0; } }
        else if (ch.fade < 1) ch.fade = Math.min(1, ch.fade + dt * 1.5);
      }
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ro = new ResizeObserver(() => { fit(); if (reduce) draw(0); });
    ro.observe(c);
    fit();
    let prev = 0;
    const loop = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 1000, dt = prev ? Math.min(0.1, t - prev) : 0;
      prev = t;
      swap(t, dt);
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
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

// Which picture sits at the top of Home: "bible" (an open Bible) or "church" (the thatched hut church).
// Change this one word to switch between them.
const HERO_ART: "bible" | "church" = "church";

// Page outlines for the open Bible: each page curls up from the spine and dips at the outer edge
const PAGE_L = "M300 268C250 236 150 226 58 240L76 98C160 82 248 90 300 122Z";
const PAGE_R = "M300 268C350 236 450 226 542 240L524 98C440 82 352 90 300 122Z";

// Lines of print on one page, following the page's curve. side -1 = left page, 1 = right page
function printLines(side: -1 | 1): string[] {
  const out: string[] = [];
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const yIn = 132 + t * 116, yOut = 112 + t * 112;          // the inner end sits lower, near the spine
    const xIn = 300 + side * 18, xOut = 300 + side * (214 - t * 6);
    const short = i === 5 || i === 11 ? 0.55 : 1;             // paragraph ends
    const xEnd = xIn + (xOut - xIn) * short, yEnd = yIn + (yOut - yIn) * short;
    const midX = (xIn + xEnd) / 2, midY = (yIn + yEnd) / 2 - 6;
    out.push(`M${xIn} ${yIn}Q${midX} ${midY} ${xEnd} ${yEnd}`);
  }
  return out;
}

// An open Bible lying on the page, lit from the top left like the sunlight, with a ribbon marker
function OpenBible() {
  const left = useMemo(() => printLines(-1), []);
  const right = useMemo(() => printLines(1), []);
  return (
    <svg className="hm-roof" viewBox="0 0 600 380" aria-hidden="true">
      <defs>
        <filter id="hm-bblur8" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id="hm-bblur2"><feGaussianBlur stdDeviation="1.6" /></filter>
        <linearGradient id="hm-page-l" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" className="hm-page-lit" /><stop offset="0.82" className="hm-page" /><stop offset="1" className="hm-page-shade" />
        </linearGradient>
        <linearGradient id="hm-page-r" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" className="hm-page-shade" /><stop offset="0.18" className="hm-page" /><stop offset="1" className="hm-page-dim" />
        </linearGradient>
        <linearGradient id="hm-leather" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="hm-leather-lit" /><stop offset="1" className="hm-leather" />
        </linearGradient>
      </defs>

      {/* shadow on the table, thrown down and to the right */}
      <path d="M70 262Q300 250 560 262L600 312Q330 318 120 306Z" className="hm-cast" filter="url(#hm-bblur8)" />

      {/* leather cover showing under the pages */}
      <path d="M36 246Q170 232 300 280Q430 232 564 246L560 268Q430 256 300 298Q170 256 40 268Z" fill="url(#hm-leather)" />
      {/* page block edges */}
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <path d={`M${46 + k * 2.5} ${243 - k * 1.2}Q170 ${231 - k} 300 ${276 - k * 2}`} className="hm-edge" />
          <path d={`M${554 - k * 2.5} ${243 - k * 1.2}Q430 ${231 - k} 300 ${276 - k * 2}`} className="hm-edge" />
        </g>
      ))}

      {/* pages */}
      <path d={PAGE_L} fill="url(#hm-page-l)" />
      <path d={PAGE_R} fill="url(#hm-page-r)" />
      {left.map((d, i) => <path key={`l${i}`} d={d} className="hm-print" />)}
      {right.map((d, i) => <path key={`r${i}`} d={d} className="hm-print" />)}
      {/* gold initial and the spine's shadow */}
      <rect x="252" y="128" width="12" height="16" className="hm-gold" transform="rotate(14 258 136)" />
      <path d="M300 122L300 268" className="hm-spine" filter="url(#hm-bblur2)" />
      {/* sunlit edge on the left page */}
      <path d="M76 98C160 82 248 90 300 122" className="hm-rim" />

      {/* ribbon marker */}
      <path d="M296 122L304 122L310 330L300 318L290 330Z" className="hm-ribbon" />
      <path d="M304 124L311 330L320 334" className="hm-cast" filter="url(#hm-bblur2)" fill="none" />
    </svg>
  );
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

type Lang = "en" | "vi";

// Home opens in Vietnamese when the browser is set to Vietnamese, unless the visitor picked a language here
function homeLang(): Lang {
  try { const l = localStorage.getItem("homeLang"); if (l === "en" || l === "vi") return l; } catch { /* storage blocked */ }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
}

const TEXT = {
  en: {
    title: "NauBrah · Three apps for worship",
    navLyrics: "Lyrics", navService: "Service Slides", navProgram: "Program",
    light: "☀ Light", dark: "☾ Dark", lightMode: "☀ Light mode", darkMode: "☾ Dark mode", signIn: "Sign in", other: "Tiếng Việt", otherShort: "VI",
    hymns: "Hymns ↗", bible: "Bible ↗",
    kicker: "Montagnard Bunong Alliance Church · Sunday service",
    h1a: "Hymns, readings and slides for ", h1em: "every Sunday", h1b: ", ready before the first song",
    note: "Build the program, put the lyrics on the projector and share the service with the whole church.", openLyrics: "Open Lyrics",
    appsEyebrow: "Three apps", appsTitle: "One for singing, one for reading, one for the team",
    apps: [
      { name: "Nau Mpro", text: "The hymn book and this Sunday's service on your phone. No account needed. Pick your church once.", href: "/nau-mpro/", action: "Open Nau Mpro ↗" },
      { name: "Nau Brah Ndu Ngơi", text: "The Bunong Bible. Books you open are saved for reading offline. Highlights and notes back up when you sign in.", href: "/nau-brah-ndu-ngoi/", action: "Open the Bible ↗" },
      { name: "NauBrah", text: "For the worship team: the program, lyric slides, readings, scripture slides and the projector.", href: "#lyrics-v2", action: "Open NauBrah" },
    ],
    sundayEyebrow: "This Sunday", sundaySmall: "Sunday service",
    sundayText: "The order of service, songs and readings for this Sunday are published to Nau Mpro as soon as the team finishes the program.",
    sundayBtn: "See this Sunday in Nau Mpro ↗",
    stepsEyebrow: "How a Sunday comes together", stepsTitle: "From program to projector",
    steps: [
      ["Plan the program", "Fill in the Order of Worship. It saves for the whole team as you type."],
      ["Choose songs and readings", "Pick from the hymn book and your church's readings."],
      ["Slides build themselves", "Service Slides turns the program into a full deck."],
      ["Present", "Open the projector view and step through the service."],
    ],
    teamEyebrow: "For your team", teamTitle: "Your church's work stays with your church",
    start: "Start a church", join: "Join with a code",
    team: ["Admins and editors for each church", "Join codes and invites for new members", "A bell when a program is published or a song changes", "Keep a presentation to yourself with Only me"],
    verseEyebrow: "Verse of the week", verse: "Your word is a lamp to my feet and a light to my path.", cite: "Psalm 119:105",
    footChurch: "Montagnard Bunong Alliance Church, Charlotte, NC",
    // The "How it helps" home page (#home-new)
    xH1a: "Sunday Service ready in ", xH1em: "minutes", xH1b: ", not hours",
    xH1sub: "From lines of text to presentation in seconds",
    xMproTile: "Nau Mpro (Bunong) - 520 Songs",
    xSub: "Fill in the program once. NauBrah makes the slides, the printout and the phone version.",
    xPlan: "Create Your First Slide", xHow: "See how it works",
    xProof: "520 hymns · 66 Bible books · Works offline",
    xBeforeLabel: "Before", xBefore: "Retyping every song and verse from scratch, line by line, every week. Wasted hours.",
    xAfterLabel: "With NauBrah", xAfter: "Pick the songs or passage. The rest is done for you.",
    xCompareEyebrow: "Why NauBrah", xCompareTitle: "Less time on slides, more on worship",
    xStepsTitle: "From lines of text to projector in seconds",
    xStepsNote: "Do it once, available everywhere.",
    xSteps: [
      ["Pick songs and readings", "Add hymns, scripture, or custom notes to your service."],
      ["Projection builds automatically", "Your choices instantly turn into a full presentation deck."],
      ["Present", "Open the projector view and step through the service."],
    ],
    otherHome: "See the other home page",
  },
  vi: {
    title: "NauBrah · Ba ứng dụng cho sự thờ phượng",
    navLyrics: "Lời bài hát", navService: "Trình chiếu buổi lễ", navProgram: "Chương trình",
    light: "☀ Sáng", dark: "☾ Tối", lightMode: "☀ Chế độ sáng", darkMode: "☾ Chế độ tối", signIn: "Đăng nhập", other: "English", otherShort: "EN",
    hymns: "Thánh ca ↗", bible: "Kinh Thánh ↗",
    kicker: "Hội Thánh Montagnard Bunong Alliance · Lễ Chúa Nhật",
    h1a: "Thánh ca, bài đọc và trình chiếu cho ", h1em: "mỗi Chúa Nhật", h1b: ", sẵn sàng trước bài hát đầu tiên",
    note: "Soạn chương trình, đưa lời bài hát lên máy chiếu và chia sẻ buổi lễ với cả hội thánh.", openLyrics: "Mở Lời bài hát",
    appsEyebrow: "Ba ứng dụng", appsTitle: "Một để hát, một để đọc, một cho ban phục vụ",
    apps: [
      { name: "Nau Mpro", text: "Sách thánh ca và chương trình Chúa Nhật này trên điện thoại. Không cần tài khoản. Chọn hội thánh một lần.", href: "/nau-mpro/", action: "Mở Nau Mpro ↗" },
      { name: "Nau Brah Ndu Ngơi", text: "Kinh Thánh tiếng Bunong. Sách đã mở được lưu để đọc khi không có mạng. Đánh dấu và ghi chú được sao lưu khi bạn đăng nhập.", href: "/nau-brah-ndu-ngoi/", action: "Mở Kinh Thánh ↗" },
      { name: "NauBrah", text: "Cho ban thờ phượng: chương trình, trình chiếu lời bài hát, bài đọc, Kinh Thánh và máy chiếu.", href: "#lyrics-v2", action: "Mở NauBrah" },
    ],
    sundayEyebrow: "Chúa Nhật này", sundaySmall: "Lễ Chúa Nhật",
    sundayText: "Chương trình, bài hát và bài đọc của Chúa Nhật này được đăng lên Nau Mpro ngay khi ban phục vụ soạn xong.",
    sundayBtn: "Xem Chúa Nhật này trên Nau Mpro ↗",
    stepsEyebrow: "Chuẩn bị một buổi lễ Chúa Nhật", stepsTitle: "Từ chương trình đến máy chiếu",
    steps: [
      ["Soạn chương trình", "Điền Chương trình thờ phượng. Mọi thay đổi được lưu cho cả ban khi bạn gõ."],
      ["Chọn bài hát và bài đọc", "Chọn từ sách thánh ca và các bài đọc của hội thánh."],
      ["Trình chiếu tự tạo", "Trình chiếu buổi lễ biến chương trình thành bộ trình chiếu đầy đủ."],
      ["Trình chiếu", "Mở màn hình máy chiếu và đi qua từng phần của buổi lễ."],
    ],
    teamEyebrow: "Cho ban phục vụ", teamTitle: "Công việc của hội thánh ở lại với hội thánh",
    start: "Tạo hội thánh", join: "Tham gia bằng mã",
    team: ["Quản trị viên và người biên tập cho mỗi hội thánh", "Mã tham gia và lời mời cho thành viên mới", "Thông báo khi chương trình được đăng hoặc bài hát thay đổi", "Giữ bài trình chiếu cho riêng mình với Chỉ mình tôi"],
    verseEyebrow: "Câu gốc trong tuần", verse: "Lời Chúa là ngọn đèn cho chân tôi, ánh sáng cho đường lối tôi.", cite: "Thi Thiên 119:105",
    footChurch: "Hội Thánh Montagnard Bunong Alliance, Charlotte, NC",
    xH1a: "Buổi lễ Chúa Nhật sẵn sàng trong ", xH1em: "vài phút", xH1b: ", không phải vài giờ",
    xH1sub: "Từ dòng chữ đến bản trình chiếu trong vài giây",
    xMproTile: "Nau Mpro (Bunong) - 520 bài hát",
    xSub: "Điền chương trình một lần. NauBrah tạo trình chiếu, bản in và bản trên điện thoại.",
    xPlan: "Tạo trang trình chiếu đầu tiên", xHow: "Xem cách hoạt động",
    xProof: "520 thánh ca · 66 sách Kinh Thánh · Dùng không cần mạng",
    xBeforeLabel: "Trước đây", xBefore: "Gõ lại từng bài hát và câu Kinh Thánh từ đầu, từng dòng một, mỗi tuần. Mất hàng giờ.",
    xAfterLabel: "Với NauBrah", xAfter: "Chọn bài hát hoặc đoạn Kinh Thánh. Phần còn lại được làm sẵn.",
    xCompareEyebrow: "Vì sao chọn NauBrah", xCompareTitle: "Ít thời gian cho trình chiếu, nhiều hơn cho thờ phượng",
    xStepsTitle: "Từ dòng chữ đến máy chiếu, chỉ trong vài giây",
    xStepsNote: "Làm một lần, dùng ở mọi nơi.",
    xSteps: [
      ["Chọn bài hát và bài đọc", "Thêm thánh ca, Kinh Thánh hoặc ghi chú riêng vào buổi lễ."],
      ["Trình chiếu tự tạo", "Lựa chọn của bạn lập tức thành một bộ trình chiếu đầy đủ."],
      ["Trình chiếu", "Mở màn hình máy chiếu và đi qua từng phần của buổi lễ."],
    ],
    otherHome: "Xem trang chủ còn lại",
  },
};

// variant "helps": the same page with copy that explains how the app helps (#home-new)
// The verse of the week in the Bunong Bible (shown when the page is in Vietnamese). null until loaded or offline.
const WEEK_VERSE = { book: "PSA", chapter: 119, verse: 105 };
function useBunongVerse(on: boolean) {
  const [v, setV] = useState<{ text: string; cite: string } | null>(null);
  useEffect(() => {
    if (!on || v || !supabase) return;
    let live = true;
    const { book, chapter, verse } = WEEK_VERSE;
    Promise.all([
      supabase.from("bible_verses").select("text").eq("translation_id", "bunong-vn").eq("book_code", book).eq("chapter", chapter).eq("verse", verse).maybeSingle(),
      supabase.from("bible_book_names").select("name").eq("translation_id", "bunong-vn").eq("book_code", book).maybeSingle(),
    ]).then(([t, n]) => {
      const text = (t.data as { text?: string } | null)?.text?.trim().replace(/[,;:]$/, ".");   // a verse alone reads as a whole sentence
      if (live && text) setV({ text, cite: `${(n.data as { name?: string } | null)?.name ?? book} ${chapter}:${verse}` });
    }, () => {});
    return () => { live = false; };
  }, [on, v]);
  return on ? v : null;
}

export default function Home({ variant = "classic" }: { variant?: "classic" | "helps" }) {
  const helps = variant === "helps";
  const [lang, setLangState] = useState<Lang>(homeLang);
  const bunong = useBunongVerse(lang === "vi");
  const t = TEXT[lang];
  const toggleLang = () => {
    const next: Lang = lang === "en" ? "vi" : "en";
    try { localStorage.setItem("homeLang", next); } catch { /* storage blocked */ }
    setLangState(next);
  };

  useEffect(() => {
    const before = document.title;
    document.title = t.title;
    return () => { document.title = before; };
  }, [t.title]);

  const [theme, setThemeState] = useState<Theme>(homeTheme);
  const toggleTheme = () => { const next: Theme = theme === "dark" ? "light" : "dark"; setTheme(next); setThemeState(next); };
  const sunday = nextSunday();
  const dateText = lang === "vi" ? `${sunday.getDate()} tháng ${sunday.getMonth() + 1}` : `${sunday.toLocaleDateString("en-US", { month: "short" })} ${sunday.getDate()}`;

  return (
    <div className={helps ? "hm hm-helps" : "hm"} data-hm-theme={theme} lang={lang}>
      <div className="hm-sun" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="hm-wrap">
        <header className="hm-nav">
          <a className="hm-brand" href="#">NauBrah</a>
          <a href="#lyrics-v2">{t.navLyrics}</a>
          <a href="#service">{t.navService}</a>
          <a href="#program">{t.navProgram}</a>
          <button type="button" className="hm-theme" onClick={toggleLang} aria-label={t.other} title={t.other}>{t.otherShort}</button>
          <button type="button" className="hm-theme hm-theme-2" onClick={toggleTheme}>{theme === "dark" ? t.light : t.dark}</button>
          <a className="hm-signin" href="#team">{t.signIn}</a>
        </header>

        <div className="hm-stage">
          {helps ? <>
            {/* How it helps: the promise on the left, both reading apps stacked on the right */}
            <div className="hm-side hm-r hm-stack">
              <a className="hm-side" href="/nau-mpro/"><span className="hm-tile">Nau Mpro</span>{t.hymns}</a>
              <a className="hm-side" href="/nau-brah-ndu-ngoi/"><span className="hm-tile">Nau Brah Ndu Ngơi</span>{t.bible}</a>
            </div>
          </> : <>
            <a className="hm-side hm-l" href="/nau-mpro/"><span className="hm-tile">Nau Mpro</span>{t.hymns}</a>
            <a className="hm-side hm-r" href="/nau-brah-ndu-ngoi/"><span className="hm-tile">Nau Brah Ndu Ngơi</span>{t.bible}</a>
          </>}
          {HERO_ART === "bible" ? <OpenBible /> : <HutChurch />}
          <GlyphRain />
          <div className="hm-copy">
            <p className="hm-kicker">{t.kicker}</p>
            {helps
              ? <><h1 id="hm-h">{t.xH1a}<em>{t.xH1em}</em>{t.xH1b}</h1><p className="hm-kicker hm-tagline">{t.xH1sub}</p></>
              : <h1 id="hm-h">{t.h1a}<em>{t.h1em}</em>{t.h1b}</h1>}
          </div>
          {helps ? (
            <div className="hm-note">
              <p>{t.xSub}</p>
              <div className="hm-btns">
                <a className="hm-btn hm-dark hm-go" href="#lyrics-v2">{t.xPlan}<span className="hm-arrow" aria-hidden="true">→</span></a>
                <a className="hm-btn" href="#how" onClick={(e) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }); }}>{t.xHow}</a>
              </div>
              <p className="hm-proof">{t.xProof}</p>
            </div>
          ) : (
            <p className="hm-note">{t.note}<a href="#lyrics-v2">{t.openLyrics}</a></p>
          )}
        </div>

        {helps && (
          <section className="hm-compare">
            <p className="hm-eyebrow">{t.xCompareEyebrow}</p>
            <h2>{t.xCompareTitle}</h2>
            <div className="hm-compare-grid">
              <div className="hm-before"><b>{t.xBeforeLabel}</b><p>{t.xBefore}</p></div>
              <div className="hm-after"><b>{t.xAfterLabel}</b><p>{t.xAfter}</p></div>
            </div>
          </section>
        )}

        {!helps && <>
        <section>
          <p className="hm-eyebrow">{t.appsEyebrow}</p>
          <h2>{t.appsTitle}</h2>
          <div className="hm-apps">
            {t.apps.map((a) => (
              <div className="hm-app" key={a.name}>
                <span className="hm-bar" />
                <h3>{helps && a.href === "/nau-mpro/" ? t.xMproTile : a.name}</h3>
                <p>{a.text}</p>
                <a href={a.href}>{a.action}</a>
              </div>
            ))}
          </div>
        </section>

        <section className="hm-sunday">
          <div>
            <p className="hm-eyebrow">{t.sundayEyebrow}</p>
            <p className="hm-date">{dateText}<small>{t.sundaySmall}</small></p>
          </div>
          <div>
            <p className="hm-sunday-text">{t.sundayText}</p>
            <a className="hm-btn hm-dark" href="/nau-mpro/">{t.sundayBtn}</a>
          </div>
        </section>
        </>}

        <section id="how">
          <p className="hm-eyebrow">{t.stepsEyebrow}</p>
          <h2>{helps ? <>{t.xStepsTitle} <span className="hm-h2-note">{t.xStepsNote}</span></> : t.stepsTitle}</h2>
          <ol className="hm-steps">
            {(variant === "helps" ? t.xSteps : t.steps).map(([b, d]) => <li key={b}><b>{b}</b>{d}</li>)}
          </ol>
        </section>

        <section className="hm-team">
          <div>
            <p className="hm-eyebrow">{t.teamEyebrow}</p>
            <h2>{t.teamTitle}</h2>
            <div className="hm-btns">
              <a className="hm-btn hm-dark" href="#team">{t.start}</a>
              <a className="hm-btn" href="#team">{t.join}</a>
            </div>
          </div>
          <ul>{t.team.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        {/* How it helps: the apps and this Sunday come after For your team */}
        {helps && <>
        <section>
          <p className="hm-eyebrow">{t.appsEyebrow}</p>
          <h2>{t.appsTitle}</h2>
          <div className="hm-apps">
            {t.apps.map((a) => (
              <div className="hm-app" key={a.name}>
                <span className="hm-bar" />
                <h3>{helps && a.href === "/nau-mpro/" ? t.xMproTile : a.name}</h3>
                <p>{a.text}</p>
                <a href={a.href}>{a.action}</a>
              </div>
            ))}
          </div>
        </section>

        <section className="hm-sunday">
          <div>
            <p className="hm-eyebrow">{t.sundayEyebrow}</p>
            <p className="hm-date">{dateText}<small>{t.sundaySmall}</small></p>
          </div>
          <div>
            <p className="hm-sunday-text">{t.sundayText}</p>
            <a className="hm-btn hm-dark" href="/nau-mpro/">{t.sundayBtn}</a>
          </div>
        </section>
        </>}

        <section className="hm-verse">
          <p className="hm-eyebrow">{t.verseEyebrow}</p>
          <blockquote>{bunong?.text ?? t.verse}</blockquote>
          <cite>{bunong?.cite ?? t.cite}</cite>
        </section>

        <footer className="hm-footer">
          <span className="hm-brand">NauBrah</span>
          <span>{t.footChurch}</span>
          <a href="/nau-mpro/">Nau Mpro</a>
          <a href="/nau-brah-ndu-ngoi/">Nau Brah Ndu Ngơi</a>
          <a href="#team">{t.signIn}</a>
          <a href={helps ? "#home-old" : "#home"}>{t.otherHome}</a>
          <button type="button" className="hm-theme hm-theme-foot" onClick={toggleLang}>{t.other}</button>
          <button type="button" className="hm-theme hm-theme-2" onClick={toggleTheme}>{theme === "dark" ? t.lightMode : t.darkMode}</button>
        </footer>
      </div>
    </div>
  );
}
