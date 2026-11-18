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
      <h2>Your slideshow{all.length ? <span className="lv2-show-count"> · {all.length}</span> : null}</h2>
      {all.length ? (
        <ol className="lv2-show-items">
          {all.map((x, i) => (
            <li key={`${x.id}-${i}`}><span className="lv2-show-n">{i + 1}</span>{x.label}</li>
          ))}
        </ol>
      ) : (
        <p className="lv2-show-empty">Nothing added yet. Items you add appear here, in order.</p>
      )}
      <button className="secondary small" onClick={() => { window.location.href = "/#builder"; }}>Open Presentation Builder</button>
    </section>
  );
}
