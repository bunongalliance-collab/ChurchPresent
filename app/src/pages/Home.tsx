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
  },
};

export default function Home() {
  const [lang, setLangState] = useState<Lang>(homeLang);
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
    <div className="hm" data-hm-theme={theme} lang={lang}>
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
          <a className="hm-side hm-l" href="/nau-mpro/"><span className="hm-tile">Nau Mpro</span>{t.hymns}</a>
          <a className="hm-side hm-r" href="/nau-brah-ndu-ngoi/"><span className="hm-tile">Nau Brah Ndu Ngơi</span>{t.bible}</a>
          <HutChurch />
          <GlyphRain />
          <div className="hm-copy">
            <p className="hm-kicker">{t.kicker}</p>
            <h1 id="hm-h">{t.h1a}<em>{t.h1em}</em>{t.h1b}</h1>
          </div>
          <p className="hm-note">{t.note}<a href="#lyrics-v2">{t.openLyrics}</a></p>
        </div>

        <section>
          <p className="hm-eyebrow">{t.appsEyebrow}</p>
          <h2>{t.appsTitle}</h2>
          <div className="hm-apps">
            {t.apps.map((a) => (
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
            <p className="hm-eyebrow">{t.sundayEyebrow}</p>
            <p className="hm-date">{dateText}<small>{t.sundaySmall}</small></p>
          </div>
          <div>
            <p className="hm-sunday-text">{t.sundayText}</p>
            <a className="hm-btn hm-dark" href="/nau-mpro/">{t.sundayBtn}</a>
          </div>
        </section>

        <section>
          <p className="hm-eyebrow">{t.stepsEyebrow}</p>
          <h2>{t.stepsTitle}</h2>
          <ol className="hm-steps">
            {t.steps.map(([b, d]) => <li key={b}><b>{b}</b>{d}</li>)}
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

        <section className="hm-verse">
          <p className="hm-eyebrow">{t.verseEyebrow}</p>
          <blockquote>{t.verse}</blockquote>
          <cite>{t.cite}</cite>
        </section>

        <footer className="hm-footer">
          <span className="hm-brand">NauBrah</span>
          <span>{t.footChurch}</span>
          <a href="/nau-mpro/">Nau Mpro</a>
          <a href="/nau-brah-ndu-ngoi/">Nau Brah Ndu Ngơi</a>
          <a href="#team">{t.signIn}</a>
          <button type="button" className="hm-theme hm-theme-foot" onClick={toggleLang}>{t.other}</button>
          <button type="button" className="hm-theme hm-theme-2" onClick={toggleTheme}>{theme === "dark" ? t.lightMode : t.darkMode}</button>
        </footer>
      </div>
    </div>
  );
}
