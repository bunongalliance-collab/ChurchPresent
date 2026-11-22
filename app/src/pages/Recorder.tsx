import { useCallback, useEffect, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { cleanCode, hideCaption, useFollowPresenter, type FollowMode } from "../lib/recorder/follow";
import { getRemoteCode } from "../lib/remote";
import { captionAt, LowerThird } from "../lib/recorder/lowerThird";
import { AUDIO_BPS, cameraMode, canSaveDirect, fileName, gbPerHour, listInputs, openAudio, openSink, openVideo, pickFormat, QUALITIES, qualityOf, startTicker, stopStream, type CameraMode, type Inputs, type Sink } from "../lib/recorder/media";

// Recorder: the camera (a camcorder through a capture card, or a webcam) with the current Program Order item as a
// lower third, recorded to a file on this computer. The lower third follows the presentation: the projector window
// tells every window of this app which slide it is on (the "church-projector" channel), and the Recorder looks up
// which Program Order item that slide belongs to. Run it on the presenting computer, in the same browser.

const NO_AUDIO = "none";
const PREFS_KEY = "recorderInputs";


interface Prefs { video: string; audio: string; quality: string; fps: number; follow: FollowMode; code: string }
const DEFAULT_PREFS: Prefs = { video: "", audio: "", quality: "highest", fps: 30, follow: "local", code: "" };
function readPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch { return DEFAULT_PREFS; }
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};
const size = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`);

export default function Recorder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStream = useRef<MediaStream | null>(null);
  const audioStream = useRef<MediaStream | null>(null);

  const [inputs, setInputs] = useState<Inputs>({ video: [], audio: [] });
  const [videoId, setVideoId] = useState(() => readPrefs().video);
  const [audioId, setAudioId] = useState(() => readPrefs().audio);
  const [camError, setCamError] = useState("");
  const [micError, setMicError] = useState("");

  // Quality: the recording's frame size, bitrate and frame rate, and what the camera really sends
  const [qualityId, setQualityId] = useState(() => readPrefs().quality);
  const [fps, setFps] = useState(() => (readPrefs().fps === 60 ? 60 : 30));
  const q = qualityOf(qualityId);
  const W = q.width;
  const H = q.height;
  const [mode, setMode] = useState<CameraMode | null>(null);
  const [camFps, setCamFps] = useState(0);  // camera frames arriving per second, measured
  const [drawFps, setDrawFps] = useState(0); // frames drawn per second, measured

  // What the projector window is showing
  // Following the presentation: on this computer, or on another one through the presenter's pairing code
  const [follow, setFollow] = useState<FollowMode>(() => (readPrefs().follow === "code" ? "code" : "local"));
  const [code, setCode] = useState(() => cleanCode(readPrefs().code));
  const { connected, screen, outline, problem } = useFollowPresenter(follow, code);
  const overlayCode = follow === "code" ? code : getRemoteCode();
  const overlayUrl = `${window.location.origin}${import.meta.env.BASE_URL}#lowerthird:${overlayCode}`;
  const [hidden, setHidden] = useState(false);

  // Recording
  const recRef = useRef<MediaRecorder | null>(null);
  const sinkRef = useRef<Sink | null>(null);
  const [rec, setRec] = useState<{ start: number; name: string; direct: boolean; ext: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [bytes, setBytes] = useState(0);
  const [saved, setSaved] = useState("");
  const [recError, setRecError] = useState("");

  // The draw loop reads these refs, so it never restarts
  // A short internet drop keeps the last item on screen until updates come back
  const caption = !hidden && !hideCaption(screen) ? captionAt(outline, screen.index) : null;
  const live = useRef(caption);
  live.current = caption;

  const refreshInputs = useCallback(async () => {
    try { setInputs(await listInputs()); } catch { /* no media devices API */ }
  }, []);

  // Camera: stop the old one first, so a capture card is never held open twice
  useEffect(() => {
    let cancelled = false;
    stopStream(videoStream.current);
    videoStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setMode(null);
    openVideo(videoId, W, H, fps).then((s) => {
      if (cancelled) { stopStream(s); return; }
      videoStream.current = s;
      setMode(cameraMode(s));
      setCamError("");
      if (videoRef.current) { videoRef.current.srcObject = s; void videoRef.current.play().catch(() => {}); }
      void refreshInputs(); // names show once permission is given
      s.getVideoTracks()[0]?.addEventListener("ended", () => setCamError("The camera was disconnected. Plug it back in, or choose another camera."));
    }).catch((e: DOMException) => {
      if (cancelled) return;
      setCamError(e?.name === "NotAllowedError" ? "Camera permission was refused. Allow the camera for this site in the address bar, then reload."
        : e?.name === "NotReadableError" ? "This camera is in use by another app or tab. Close it there, then choose the camera again."
        : e?.name === "OverconstrainedError" ? "That camera is no longer connected. Choose another camera." : "The camera could not be opened.");
    });
    return () => { cancelled = true; };
  }, [videoId, W, H, fps, refreshInputs]);

  // Count the camera's frames as they arrive (a card can promise 30 fps and send fewer)
  useEffect(() => {
    const v = videoRef.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void }) | null;
    if (!v?.requestVideoFrameCallback) return;
    let n = 0;
    let h = 0;
    const onFrame = () => { n++; h = v.requestVideoFrameCallback!(onFrame); };
    h = v.requestVideoFrameCallback(onFrame);
    const t = window.setInterval(() => { setCamFps(n); n = 0; }, 1000);
    return () => { window.clearInterval(t); v.cancelVideoFrameCallback?.(h); };
  }, []);

  // Sound: separate from the camera (capture-card HDMI audio, or a microphone), or none
  useEffect(() => {
    let cancelled = false;
    stopStream(audioStream.current);
    audioStream.current = null;
    if (audioId === NO_AUDIO) { setMicError(""); return; }
    openAudio(audioId).then((s) => {
      if (cancelled) { stopStream(s); return; }
      audioStream.current = s;
      setMicError("");
    }).catch(() => { if (!cancelled) setMicError("The sound input could not be opened. Choose another one."); });
    return () => { cancelled = true; };
  }, [audioId]);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ video: videoId, audio: audioId, quality: qualityId, fps, follow, code })); } catch { /* storage blocked */ }
  }, [videoId, audioId, qualityId, fps, follow, code]);

  // Plugging in or unplugging a camera or capture card updates the lists
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    md.addEventListener("devicechange", refreshInputs);
    return () => md.removeEventListener("devicechange", refreshInputs);
  }, [refreshInputs]);

  // Leaving the page releases the camera and microphone
  useEffect(() => () => { stopStream(videoStream.current); stopStream(audioStream.current); }, []);

  // H shows or hides the lower third (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "h" || e.key === "H") setHidden((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Draw the camera and the lower third onto the canvas, 30 times a second
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const lt = new LowerThird();
    let drawn = 0;
    const count = window.setInterval(() => { setDrawFps(drawn); drawn = 0; }, 1000);
    const stopTicker = startTicker(fps, () => {
      const t = performance.now();
      drawn++;
      const v = videoRef.current;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (v && v.readyState >= 2 && v.videoWidth) {
        // Fill the frame, cropping the edges if the camera is not 16:9
        const k = Math.max(W / v.videoWidth, H / v.videoHeight);
        const dw = v.videoWidth * k;
        const dh = v.videoHeight * k;
        ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      lt.set(live.current, t);
      lt.draw(ctx, W, H, t);
    });
    return () => { stopTicker(); window.clearInterval(count); };
  }, [W, H, fps]);

  // The timer and file size while recording
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.clearInterval(t); window.removeEventListener("beforeunload", warn); };
  }, [rec]);

  async function start() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRecError(""); setSaved("");
    const fmt = pickFormat();
    const sink = await openSink(fileName(fmt.ext), fmt.mime, fmt.ext); // the save dialog comes first, straight from the click
    if (!sink) return;
    const stream = canvas.captureStream(fps);
    audioStream.current?.getAudioTracks().forEach((t) => stream.addTrack(t));
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, { ...(fmt.mime ? { mimeType: fmt.mime } : {}), videoBitsPerSecond: q.videoBps, audioBitsPerSecond: AUDIO_BPS });
    } catch {
      setRecError("This browser cannot record video. Use Chrome or Edge.");
      return;
    }
    sinkRef.current = sink;
    recRef.current = mr;
    setBytes(0);
    mr.ondataavailable = (e) => {
      if (!e.data.size) return;
      setBytes((b) => b + e.data.size);
      sink.write(e.data).catch(() => setRecError("Writing to the file failed (is the drive full?). Stop and start a new recording."));
    };
    mr.onstop = async () => {
      stream.getVideoTracks().forEach((t) => t.stop()); // the canvas track only; the camera and sound keep running
      try { await sink.close(); setSaved(sink.direct ? `Saved as ${sink.name}.` : `${sink.name} was downloaded (check your Downloads folder).`); }
      catch { setRecError("The file could not be finished. Part of the recording may be missing."); }
      recRef.current = null; sinkRef.current = null;
      setRec(null);
    };
    mr.start(1000); // a piece every second, written to the file as it comes
    setNow(Date.now());
    setRec({ start: Date.now(), name: sink.name, direct: sink.direct, ext: fmt.ext });
  }

  function stop() {
    if (recRef.current?.state !== "inactive") recRef.current?.stop();
  }

  const label = (d: MediaDeviceInfo, i: number, what: string) => d.label || `${what} ${i + 1}`;
  // Warnings about the picture: the camera sending a smaller size or fewer frames than the recording, or the computer falling behind
  const lowRes = mode && mode.height < H;
  const lowFps = mode && mode.fps > 0 && mode.fps < fps - 1;
  const slowCam = camFps > 0 && camFps < fps * 0.8 && !lowFps;
  const slowDraw = !!rec && drawFps > 0 && drawFps < fps * 0.85;
  const status = problem ? problem
    : !connected ? (follow === "code" ? "Connecting to the presenter's computer… (both computers need internet, and the presentation must be showing)" : "Waiting for the screen window. Press Present on the Service page.")
    : !outline?.length ? "No Program Order in this presentation. Present from the Service page."
    : screen.blackout ? "Screen is black: lower third hidden."
    : screen.waiting || screen.logo ? "Screen shows the welcome or logo: lower third hidden."
    : hidden ? "Lower third hidden (press H to show)." : "Following the presentation.";

  return (
    <>
      <NavBar />
      <div className="rc">
        <header className="rc-top">
          <div>
            <h1>Recorder</h1>
            <p className="rc-sub">The camera with the Program Order as a lower third, saved to this computer.</p>
          </div>
          <div className="rc-actions">
            {rec ? (
              <>
                <span className="rc-live" role="status"><span className="rc-dot" aria-hidden="true" />REC {clock(now - rec.start)} · {size(bytes)}</span>
                <button type="button" className="primary rc-stop" onClick={stop}>Stop recording</button>
              </>
            ) : (
              <button type="button" className="primary" onClick={start} disabled={!!camError}>Start recording</button>
            )}
          </div>
        </header>
        {recError && <p className="rc-msg rc-error" role="alert">{recError}</p>}
        {saved && <p className="rc-msg" role="status">{saved}</p>}

        <div className="rc-grid">
          <section className="rc-stage" aria-label="Recording preview">
            <canvas ref={canvasRef} width={W} height={H} className="rc-canvas" />
            <video ref={videoRef} muted playsInline className="rc-video" />
            {camError && <p className="rc-camerr" role="alert">{camError}</p>}
          </section>

          <aside className="rc-side">
            <div className="rc-card">
              <h2>Inputs</h2>
              <label htmlFor="rc-cam">Camera</label>
              <select id="rc-cam" value={videoId} onChange={(e) => setVideoId(e.target.value)} disabled={!!rec}>
                <option value="">Default camera</option>
                {inputs.video.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, "Camera")}</option>)}
              </select>
              <label htmlFor="rc-mic">Sound</label>
              <select id="rc-mic" value={audioId} onChange={(e) => setAudioId(e.target.value)} disabled={!!rec}>
                <option value="">Default microphone</option>
                {inputs.audio.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{label(d, i, "Microphone")}</option>)}
                <option value={NO_AUDIO}>No sound</option>
              </select>
              {micError && <p className="rc-note rc-error">{micError}</p>}
              <p className="rc-note">A camcorder connects through an HDMI-to-USB capture card and shows up here as a camera. For its sound, choose the capture card under Sound.</p>
            </div>

            <div className="rc-card">
              <h2>Quality</h2>
              <label htmlFor="rc-q">Recording</label>
              <select id="rc-q" value={q.id} onChange={(e) => setQualityId(e.target.value)} disabled={!!rec}>
                {QUALITIES.map((x) => <option key={x.id} value={x.id}>{x.label} · about {gbPerHour(x).toFixed(1)} GB per hour</option>)}
              </select>
              <label htmlFor="rc-fps">Frame rate</label>
              <select id="rc-fps" value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={!!rec}>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps (smoother, needs a 60 fps camera and a fast computer)</option>
              </select>
              <dl className="rc-readout">
                <dt>Camera sends</dt>
                <dd className={lowRes || lowFps ? "warn" : ""}>{mode ? `${mode.width}×${mode.height} · ${mode.fps || "?"} fps` : "—"}</dd>
                <dt>Recording</dt>
                <dd>{W}×{H} · {fps} fps · {q.videoBps / 1e6} Mbps</dd>
                <dt>Frames now</dt>
                <dd className={slowCam || slowDraw ? "warn" : ""}>camera {camFps || "—"} · drawn {drawFps || "—"} per second</dd>
              </dl>
              {lowRes && <p className="rc-note rc-warn">The camera sends a smaller picture than the recording, so it will look soft. Set the camcorder's HDMI output to 1080p, use a USB 3 port, or choose 720p.</p>}
              {lowFps && <p className="rc-note rc-warn">The camera sends only {mode?.fps} fps. Try a USB 3 port, or choose 30 fps.</p>}
              {slowCam && <p className="rc-note rc-warn">Fewer camera frames are arriving than expected. Check the USB cable and port.</p>}
              {slowDraw && <p className="rc-note rc-warn" role="alert">This computer is falling behind and the recording will stutter. Close other apps, or choose 720p or 30 fps.</p>}
            </div>

            <div className="rc-card">
              <h2>Lower third</h2>
              <fieldset className="rc-mode">
                <legend>Presentation is on</legend>
                <label className="check"><input type="radio" name="rc-follow" checked={follow === "local"} onChange={() => setFollow("local")} /> This computer</label>
                <label className="check"><input type="radio" name="rc-follow" checked={follow === "code"} onChange={() => setFollow("code")} /> Another computer</label>
              </fieldset>
              {follow === "code" && (
                <>
                  <label htmlFor="rc-code">Presenter's pairing code</label>
                  <input id="rc-code" type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={8} placeholder="ABCD2345"
                    value={code} onChange={(e) => setCode(cleanCode(e.target.value))} className="rc-code" />
                  <p className="rc-note">The presenter finds it in Presenter view → Phone remote. Following only listens: it never changes their slides.</p>
                </>
              )}
              <p className={`rc-follow${connected ? " on" : ""}`} role="status">{status}</p>
              <div className="rc-now" aria-live="polite">
                <span className="rc-now-k">On screen now</span>
                {caption ? <><strong>{caption.title}</strong>{caption.subtitle && <span>{caption.subtitle}</span>}</> : <span className="rc-none">Nothing</span>}
              </div>
              <button type="button" className="secondary" onClick={() => setHidden((v) => !v)} aria-pressed={hidden}>{hidden ? "Show lower third (H)" : "Hide lower third (H)"}</button>
              <p className="rc-note">The title changes when the presenter moves to the next Program Order item. Keep this window open and visible while recording.</p>
            </div>

            <div className="rc-card">
              <h2>Using OBS instead</h2>
              <p className="rc-note">Add a Browser Source in OBS with this address, size 1920 × 1080, above the camera. It shows only the lower third, on a transparent background, and follows the presenter{follow === "code" ? "" : " (through this computer's pairing code, so it needs internet)"}.</p>
              <input type="text" readOnly value={overlayCode.length === 8 ? overlayUrl : "Enter the pairing code first"} className="rc-url" aria-label="Lower-third address for OBS" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="secondary" disabled={overlayCode.length !== 8} onClick={() => void navigator.clipboard?.writeText(overlayUrl)}>Copy address</button>
            </div>

            <p className="rc-note">{canSaveDirect() ? "Start recording asks where to save the file, then writes to it every second." : "This browser saves the file to Downloads when you stop. Chrome or Edge can write straight to a folder you choose."}</p>
          </aside>
        </div>
      </div>
    </>
  );
}
