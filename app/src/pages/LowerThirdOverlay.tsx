import { useEffect, useRef } from "react";
import { captionAt, LowerThird } from "../lib/recorder/lowerThird";
import { cleanCode, hideCaption, useFollowPresenter } from "../lib/recorder/follow";

// The lower third alone, on a transparent background, for OBS (Browser Source, 1920 × 1080, above the camera).
// #lowerthird:<pairing code> follows the presenter over the internet (OBS is its own browser, so it cannot use
// the same-computer channel). #lowerthird without a code follows a screen window in this same browser.

const W = 1920;
const H = 1080;

export default function LowerThirdOverlay() {
  const code = cleanCode(window.location.hash.split(":")[1] || "");
  const { connected, screen, outline, problem } = useFollowPresenter(code ? "code" : "local", code);
  const caption = !hideCaption(screen) ? captionAt(outline, screen.index) : null;
  const live = useRef(caption);
  live.current = caption;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // A see-through page: the app's background colour is switched off while this page is open
  useEffect(() => {
    document.documentElement.classList.add("lt-overlay");
    return () => document.documentElement.classList.remove("lt-overlay");
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const lt = new LowerThird();
    let raf = 0;
    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      lt.set(live.current, t);
      lt.draw(ctx, W, H, t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="lt-page">
      <canvas ref={canvasRef} width={W} height={H} className="lt-canvas" aria-label={caption ? `${caption.title} ${caption.subtitle}` : "Lower third"} />
      {/* Only while setting up: disappears once the presentation is found, so it is never in the recording */}
      {(problem || !connected) && <p className="lt-setup" role="status">{problem || (code ? "Lower third: connecting to the presenter…" : "Lower third: waiting for the screen window…")}</p>}
    </div>
  );
}
