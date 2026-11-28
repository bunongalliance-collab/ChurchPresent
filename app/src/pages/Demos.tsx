import { useEffect, useRef, useState } from "react";
import { setTheme, type Theme } from "../lib/theme";
import "./Home.css";

// Demos page (#demos): the three demo loops from the home page (public/demo/*.html), all on one page,
// one after another, each on its own band. The demos open with ?real=1, so their app windows show the
// real app's light colours (index.css) on any page theme. Same theme and language switch as the home page.

type Lang = "en" | "vi";
type Which = "lyric" | "scripture" | "bible";

function demosTheme(): Theme {
  try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") return t; } catch { /* storage blocked */ }
  return "dark";
}
function demosLang(): Lang {
  try { const l = localStorage.getItem("homeLang"); if (l === "en" || l === "vi") return l; } catch { /* storage blocked */ }
  return "en";
}

const TEXT = {
  en: {
    title: "Demos · NauBrah",
    eyebrow: "See it at work",
    demos: {
      lyric: ["Lyric", "Pick a hymn from Nau Mpro and get slides ready for the projector."],
      scripture: ["Scripture", "Type a passage and NauBrah lays it out as readable slides."],
      bible: ["Bible", "Share a verse from Nau Brah Ndu Ngơi, and another member opens it from Latest shared."],
    } as Record<Which, [string, string]>,
    start: "Create Your First Slide", home: "Home", other: "Tiếng Việt", otherShort: "VI",
    light: "☀ Light", dark: "☾ Dark", signIn: "Sign in",
  },
  vi: {
    title: "Xem thử · NauBrah",
    eyebrow: "Xem ứng dụng hoạt động",
    demos: {
      lyric: ["Bài hát", "Chọn một bài hát trong Nau Mpro và có ngay trang chiếu cho máy chiếu."],
      scripture: ["Kinh Thánh", "Gõ một đoạn Kinh Thánh, NauBrah sắp xếp thành trang chiếu dễ đọc."],
      bible: ["Nau Brah", "Chia sẻ một câu từ Nau Brah Ndu Ngơi, người khác mở ở mục Mới chia sẻ."],
    } as Record<Which, [string, string]>,
    start: "Tạo trang chiếu đầu tiên", home: "Trang chủ", other: "English", otherShort: "EN",
    light: "☀ Sáng", dark: "☾ Tối", signIn: "Đăng nhập",
  },
};

// One demo loop in a frame that grows to the demo's height (the demo posts its height to this page)
function DemoFrame({ which, label, theme, lang, eager }: { which: Which; label: string; theme: Theme; lang: Lang; eager: boolean }) {
  const [height, setHeight] = useState(760);
  const frame = useRef<HTMLIFrameElement>(null);
  const first = useRef({ theme, lang });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.name === which && e.data.demoHeight) setHeight(e.data.demoHeight); };
    addEventListener("message", onMsg);
    return () => removeEventListener("message", onMsg);
  }, [which]);
  useEffect(() => { frame.current?.contentWindow?.postMessage({ demo: true, theme, lang }, location.origin); }, [theme, lang]);
  return (
    <iframe ref={frame} title={label} src={`/demo/${which}.html?name=${which}&theme=${first.current.theme}&lang=${first.current.lang}&real=1`}
      onLoad={() => frame.current?.contentWindow?.postMessage({ demo: true, theme, lang }, location.origin)}
      style={{ height }} loading={eager ? "eager" : "lazy"} />
  );
}

export default function Demos() {
  const [lang, setLangState] = useState<Lang>(demosLang);
  const [theme, setThemeState] = useState<Theme>(demosTheme);
  const t = TEXT[lang];
  const toggleLang = () => {
    const next: Lang = lang === "en" ? "vi" : "en";
    try { localStorage.setItem("homeLang", next); } catch { /* storage blocked */ }
    setLangState(next);
  };
  const toggleTheme = () => { const next: Theme = theme === "dark" ? "light" : "dark"; setTheme(next); setThemeState(next); };

  useEffect(() => {
    const before = document.title;
    document.title = t.title;
    window.scrollTo(0, 0);
    return () => { document.title = before; };
  }, [t.title]);

  const order: Which[] = ["lyric", "scripture", "bible"];
  return (
    <div className="hm hm-helps hm-demos-page" data-hm-theme={theme} lang={lang}>
      <div className="hm-wrap">
        <header className="hm-nav">
          <a className="hm-brand" href="#">NauBrah</a>
          <a href="#">{t.home}</a>
          <button type="button" className="hm-theme" onClick={toggleLang} aria-label={t.other} title={t.other}>{t.otherShort}</button>
          <button type="button" className="hm-theme hm-theme-2" onClick={toggleTheme}>{theme === "dark" ? t.light : t.dark}</button>
          <a className="hm-signin" href="#team">{t.signIn}</a>
        </header>

        <div className="hm-demos-head">
          <h1 className="hm-sr">{t.eyebrow}</h1>
          <nav className="hm-demos-jump" aria-label={t.eyebrow}>
            {order.map((k, i) => <a key={k} href={`#demos:${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`demo-${k}`)?.scrollIntoView({ behavior: "smooth" }); }}>{i + 1}. {t.demos[k][0]}</a>)}
          </nav>
        </div>

        {order.map((k, i) => (
          <section key={k} id={`demo-${k}`} className="hm-demo hm-demos-item">
            <p className="hm-eyebrow">{String(i + 1).padStart(2, "0")}</p>
            <h2>{t.demos[k][0]}</h2>
            <p className="hm-demos-sub">{t.demos[k][1]}</p>
            <div className="hm-demos-band"><DemoFrame which={k} label={t.demos[k][0]} theme={theme} lang={lang} eager={i === 0} /></div>
          </section>
        ))}

        <div className="hm-demos-end">
          <a className="hm-btn hm-dark hm-go" href="#lyrics-v2">{t.start}<span className="hm-arrow" aria-hidden="true">→</span></a>
        </div>
      </div>
    </div>
  );
}
