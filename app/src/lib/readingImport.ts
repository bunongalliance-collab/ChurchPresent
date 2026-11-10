// Turns pasted readings into separate readings. A new reading starts at each "Number:" line.
// Inside a reading: "Title:" is the title, the first "Subtitle:" is the subtitle, and any later
// "Subtitle:" is a heading inside the content (it starts a new paragraph). "Verse N:" lines become
// "N text". Other lines continue the verse above them.

export interface ParsedReading { number: string; title: string; subtitle: string; content: string }

export function parseReadings(text: string): ParsedReading[] {
  const out: ParsedReading[] = [];
  let cur: { number: string; title: string; subtitle: string; paras: string[] } | null = null;
  let verse: string | null = null; // the verse line being built (continuation lines are added to it)
  const flushVerse = () => { if (cur && verse !== null) { cur.paras.push(verse); } verse = null; };
  const finish = () => {
    flushVerse();
    if (!cur) return;
    const content = cur.paras.join("\n").trim();
    out.push({ number: cur.number, title: cur.title, subtitle: cur.subtitle, content: content });
    cur = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const field = line.match(/^(verse\s*\d+|[A-Za-z]+)\s*:\s*(.*)$/i);
    const key = field ? field[1].trim().toLowerCase().replace(/\s+/g, " ") : "";
    if (key === "number") {
      finish();
      cur = { number: field![2].trim(), title: "", subtitle: "", paras: [] };
    } else if (!cur) {
      continue; // text before the first "Number:" is ignored
    } else if (key === "title") {
      flushVerse(); cur.title = field![2].trim();
    } else if (key === "subtitle") {
      flushVerse();
      if (!cur.subtitle) cur.subtitle = field![2].trim();
      else cur.paras.push(`\u0000${field![2].trim()}`); // a heading inside the content (own paragraph)
    } else if (/^verse\s*\d+$/.test(key)) {
      flushVerse();
      verse = `${key.match(/\d+/)![0]} ${field![2].trim()}`;
    } else if (verse !== null) {
      verse += " " + line; // continues the verse
    } else {
      cur.paras.push(line);
    }
  }
  finish();
  // Headings are marked with \u0000 so they get a blank line before them; apply that now
  return out.map((r) => ({ ...r, content: r.content.replace(/\n?\u0000/g, "\n\n") .replace(/^\n+/, "") }));
}
