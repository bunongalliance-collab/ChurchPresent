import qrcode from "qrcode-generator";
import type { DeckItem, ProjDeck } from "../pages/Projector";

// Phone remote: a phone controls the screen window over the internet through a Supabase Realtime
// broadcast channel. Nothing is stored in the database. The screen window and the phone join the same
// channel, named after a pairing code that only this computer shows (in the presenter's Phone remote panel).

const CODE_KEY = "remoteCode";
// No 0/O or 1/I/L, so the code is easy to read off the screen and type
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

// This computer's pairing code, kept until "New code" is pressed (so a paired phone keeps working between services)
export function getRemoteCode(): string {
  try {
    const have = localStorage.getItem(CODE_KEY);
    if (have && /^[A-Z2-9]{8}$/.test(have)) return have;
    const code = makeCode();
    localStorage.setItem(CODE_KEY, code);
    return code;
  } catch {
    return makeCode();
  }
}

// A new code disconnects every phone paired with the old one
export function newRemoteCode(): string {
  const code = makeCode();
  try { localStorage.setItem(CODE_KEY, code); } catch { /* storage blocked */ }
  return code;
}
export const REMOTE_CODE_KEY = CODE_KEY;

export const remoteChannel = (code: string) => `church-remote-${code}`;
export const remoteUrl = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}#remote:${code}`;

// The QR code as an SVG string (dark modules on a light square), for the presenter's pairing panel
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

// What the screen window tells the phone: where it is, and the words on the current and next slide
export interface RemoteState {
  index: number; total: number;
  blackout: boolean; waiting: boolean; logo: boolean; clear: boolean;
  now: string; next: string;
  items: DeckItem[];
}

// The words on one slide as plain text (formatting and verse-number marks removed)
export function slideText(deck: ProjDeck, i: number): string {
  const sl = deck.slides[i];
  if (!sl) return "";
  const rows = sl.segs ? sl.segs.map((l) => l.map((x) => x.text).join("")) : sl.rows ?? [];
  return rows.join(" ").replace(/[\u0001-\u0003]/g, "").replace(/\s+/g, " ").trim();
}

export function stateFor(deck: ProjDeck, s: { index: number; blackout: boolean; waiting: boolean; logo: boolean; clear: boolean }): RemoteState {
  const items = deck.outline?.length ? deck.outline : [{ title: "Slides", first: 0, count: deck.slides.length }];
  return { ...s, total: deck.slides.length, now: slideText(deck, s.index), next: slideText(deck, s.index + 1), items };
}
