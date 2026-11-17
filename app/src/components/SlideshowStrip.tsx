// "Your slideshow": the items in the Presentation Builder's working presentation, in order (read-only here;
// they are arranged and removed in the Builder). `extra` lists items added on this page that the Builder has not picked up yet.
export interface StripItem { id: string; label: string }

function builderItems(): StripItem[] {
  try {
    const d = JSON.parse(sessionStorage.getItem("builderDraft") || "null");
    const items: { id?: string; songId?: string; title?: string; number?: string }[] = d?.items ?? [];
    return items.map((i, n) => ({ id: i.songId ?? i.id ?? String(n), label: `${i.number ? i.number + ". " : ""}${i.title || "(untitled)"}` }));
  } catch {
    return [];
  }
}

export default function SlideshowStrip({ extra = [] }: { extra?: StripItem[] }) {
  const all = builderItems();
  for (const x of extra) if (!all.some((a) => a.id === x.id)) all.push(x);
  return (
    <section className="lv2-card lv2-show" aria-label="Your slideshow">
      <div className="lv2-show-head">
        <h2>Your slideshow</h2>
        <span className="lv2-sub">{all.length ? `${all.length} item${all.length === 1 ? "" : "s"}` : ""}</span>
        <button className="secondary small" onClick={() => { window.location.hash = "#builder"; }}>Open Presentation Builder</button>
      </div>
      {all.length ? (
        <ol className="lv2-show-items">
          {all.map((x, i) => (
            <li key={`${x.id}-${i}`}><span className="lv2-show-n">{i + 1}</span>{x.label}</li>
          ))}
        </ol>
      ) : (
        <p className="lv2-sub">Nothing added yet. Items you add appear here, in order.</p>
      )}
    </section>
  );
}
