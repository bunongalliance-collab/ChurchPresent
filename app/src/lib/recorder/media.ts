// The Recorder's media plumbing: camera and microphone inputs, a frame timer that keeps running when the
// window is in the background, the recording format, and saving straight to a file on the computer.

export interface Inputs { video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }

// Device names are blank until the browser has been given camera permission once
export async function listInputs(): Promise<Inputs> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return { video: all.filter((d) => d.kind === "videoinput"), audio: all.filter((d) => d.kind === "audioinput") };
}

export function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

// Recording quality: the frame size and how many bits per second the encoder may use (more = sharper, bigger file)
export type QualityId = "highest" | "high" | "standard" | "small";
export interface Quality { id: QualityId; label: string; width: number; height: number; videoBps: number }
export const QUALITIES: Quality[] = [
  // Highest: about as far as 1080p is worth pushing (a capture card like the HD60 S+ sends 1080p at most)
  { id: "highest", label: "Highest · 1080p", width: 1920, height: 1080, videoBps: 25_000_000 },
  { id: "high", label: "High · 1080p", width: 1920, height: 1080, videoBps: 16_000_000 },
  { id: "standard", label: "Standard · 1080p", width: 1920, height: 1080, videoBps: 8_000_000 },
  { id: "small", label: "Smaller file · 720p", width: 1280, height: 720, videoBps: 5_000_000 },
];
export const AUDIO_BPS = 192_000;
export const qualityOf = (id: string) => QUALITIES.find((q) => q.id === id) ?? QUALITIES[0];
// Rough file size per hour at a quality (the encoder may use a little less)
export const gbPerHour = (q: Quality) => ((q.videoBps + AUDIO_BPS) * 3600) / 8 / 1e9;

// A camcorder through an HDMI-to-USB capture card shows up as a webcam. Ask for the quality's size and frame rate;
// the card gives its nearest mode, which cameraMode() reads back.
export function openVideo(deviceId: string, width = 1920, height = 1080, fps = 30): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps } },
    audio: false,
  });
}

// What the camera or capture card is really sending
export interface CameraMode { width: number; height: number; fps: number }
export function cameraMode(s: MediaStream | null): CameraMode | null {
  const st = s?.getVideoTracks()[0]?.getSettings();
  return st?.width && st.height ? { width: st.width, height: st.height, fps: Math.round(st.frameRate ?? 0) } : null;
}

// Voice processing is off so capture-card (HDMI) audio and music come through unchanged
export function openAudio(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false,
  });
}

// Browsers slow down timers in background windows, but not inside a worker, so frames keep coming at 30 fps
export function startTicker(fps: number, onTick: () => void): () => void {
  const code = `let t=setInterval(()=>postMessage(0),${Math.round(1000 / fps)});onmessage=()=>clearInterval(t);`;
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  const w = new Worker(url);
  w.onmessage = onTick;
  return () => { w.postMessage("stop"); w.terminate(); URL.revokeObjectURL(url); };
}

// The best format this browser records: MP4 where supported (plays everywhere), otherwise WebM
const FORMATS = [
  { mime: "video/mp4;codecs=avc1.640028,mp4a.40.2", ext: "mp4" },
  { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4" },
  { mime: "video/mp4", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];
export function pickFormat(): { mime: string; ext: string } {
  return FORMATS.find((f) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(f.mime)) ?? { mime: "", ext: "webm" };
}

// Where the recording goes. Chrome and Edge write each second straight to the chosen file, so a long service
// does not fill memory and a crash keeps what was already saved. Other browsers download the file at Stop.
export interface Sink { write(chunk: Blob): Promise<void>; close(): Promise<void>; name: string; direct: boolean }

type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) =>
  Promise<{ name: string; createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;

export const canSaveDirect = () => typeof (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker === "function";

// Must be called straight from a click: the browser only shows the save dialog after a user action.
// Returns null when the person cancels the dialog.
export async function openSink(name: string, mime: string, ext: string): Promise<Sink | null> {
  const picker = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  const base = mime.split(";")[0] || `video/${ext}`;
  if (picker) {
    try {
      const handle = await picker.call(window, { suggestedName: name, types: [{ description: "Video", accept: { [base]: [`.${ext}`] } }] });
      const out = await handle.createWritable();
      let queue = Promise.resolve();
      return {
        name: handle.name, direct: true,
        write: (b) => (queue = queue.then(() => out.write(b))),
        close: async () => { await queue; await out.close(); },
      };
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return null;
      // Any other failure (for example a blocked folder): fall back to a download
    }
  }
  const parts: Blob[] = [];
  return {
    name, direct: false,
    write: async (b) => { parts.push(b); },
    close: async () => {
      const url = URL.createObjectURL(new Blob(parts, { type: base }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}

export function fileName(ext: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `Service ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}.${ext}`;
}
