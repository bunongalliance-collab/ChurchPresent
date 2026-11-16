"""Merge all batch JSON files into data/hymns.json and lyrics/all-lyrics.txt; report checks."""
import glob, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
songs, seen = [], {}
for f in sorted(glob.glob(os.path.join(HERE, "data/batches/batch-*.json"))):
    for s in json.load(open(f))["songs"]:
        if s["id"] in seen:
            print("DUPLICATE", s["id"], "in", os.path.basename(f), "and", seen[s["id"]])
            continue
        seen[s["id"]] = os.path.basename(f)
        songs.append(s)

songs.sort(key=lambda s: int(s["number"]) if s["number"].isdigit() else 10**6)
nums = [int(s["number"]) for s in songs if s["number"].isdigit()]
missing = sorted(set(range(1, max(nums) + 1)) - set(nums))
held = [s["number"] for s in songs if any("NOT TRANSCRIBED" in n for n in s["review_notes"])]
incomplete = [s["number"] for s in songs if any(n.startswith(("INCOMPLETE", "MISSING")) for n in s["review_notes"])]
unclear = [s["number"] for s in songs if any("LAYOUT UNCLEAR" in n for n in s["review_notes"])]
nofile = [s["id"] for s in songs if not os.path.exists(os.path.join(HERE, "scores", s["files"]["score_pdf"]))]

out = {"source_pdf": "nau mpro.pdf", "song_count": len(songs), "songs": songs}
json.dump(out, open(os.path.join(HERE, "data/hymns.json"), "w"), ensure_ascii=False, indent=2)
texts = sorted(glob.glob(os.path.join(HERE, "lyrics/batch-*.txt")))
open(os.path.join(HERE, "lyrics/all-lyrics.txt"), "w").write("\n\n".join(open(t).read().strip() for t in texts) + "\n")

print("songs:", len(songs), "| numbers 1 -", max(nums))
print("missing numbers:", missing or "none")
print("lyrics held (rights):", held)
print("incomplete / missing in scan:", incomplete)
print("layout needs musician review:", unclear)
print("score PDFs missing:", nofile or "none")
print("songs with review notes:", sum(1 for s in songs if s["review_notes"]))
