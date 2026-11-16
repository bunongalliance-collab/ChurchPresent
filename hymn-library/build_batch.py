"""Build a batch from a compact source file.
Usage: python3 build_batch.py data/src/batch-0002.src

Source format (one song per '##' header):
## 11 | TITLE | REFERENCE | key | meter | chord,chord | 18:full page;19:upper | category
V:            (a verse; lines follow)
C:            (the chorus; repeated after every verse)
A:            (song ends with A-MEN, printed once at the end)
N: note text  (review note)
T: tempo text
X: crop_px for a page, e.g. X: 19:0,0,1142,900
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def parse(path):
    songs, cur, block = [], None, None
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n").strip()
        if line.startswith("## "):
            f = [x.strip() for x in line[3:].split("|")]
            f += [""] * (8 - len(f))
            cur = {"num": f[0], "title": f[1], "ref": f[2] or None, "key": f[3] or None,
                   "meter": f[4] or None, "chords": [c for c in f[5].split(",") if c.strip()],
                   "pages": [(int(p.split(":")[0]), p.split(":", 1)[1] if ":" in p else "full page")
                             for p in f[6].split(";") if p.strip()],
                   "cat": f[7] or None, "verses": [], "chorus": None, "amen": False,
                   "notes": [], "tempo": None, "crop": {}, "chorus2": None}
            songs.append(cur); block = None
        elif cur is None or not line:
            continue
        elif line == "V:":
            block = []; cur["verses"].append(block)
        elif line == "C:":
            block = []; cur["chorus"] = block
        elif line == "C2:":
            block = []; cur["chorus2"] = block
        elif line == "A:":
            cur["amen"] = True
        elif line.startswith("N:"):
            cur["notes"].append(line[2:].strip())
        elif line.startswith("T:"):
            cur["tempo"] = line[2:].strip()
        elif line.startswith("X:"):
            p, b = line[2:].strip().split(":")
            cur["crop"][int(p)] = [int(v) for v in b.split(",")]
        else:
            block.append(line)
    return songs

def record(c):
    seq = []
    for i, v in enumerate(c["verses"], 1):
        seq.append({"type": "verse", "number": i, "lines": list(v)})
        if c["chorus"]:
            ch = c["chorus2"] if (c.get("chorus2") and i % 2 == 0) else c["chorus"]
            seq.append({"type": "chorus", "label": "Plō mprō", "lines": list(ch)})
    if not c["verses"] and c["chorus"]:  # only a refrain survives (e.g. missing page)
        seq.append({"type": "chorus", "label": "Plō mprō", "lines": list(c["chorus"])})
    if c["amen"] and seq:
        seq[-1]["lines"].append("A-MEN.")
    n = c["num"]
    sid = f"hymn-{int(n):04d}" if n.isdigit() else f"hymn-x-{re.sub(r'[^a-z0-9]+', '-', n.lower())}"
    secs = []
    for p, r in c["pages"]:
        s = {"pdf_page": p, "image": f"page-{p}.png", "region": r}
        if p in c["crop"]:
            s["crop_px"] = c["crop"][p]
        secs.append(s)
    return {
        "id": sid, "title": c["title"], "number": n, "reference": c["ref"],
        "alternate_titles": [], "language": "Bunong", "category": c["cat"],
        "lyrics": {"sequence": seq},
        "music": {"key": c["key"], "meter": c["meter"], "tempo": c["tempo"], "tune_name": None,
                  "chords": [{"symbol": x.strip(), "source": "printed"} for x in c["chords"]]},
        "source": {"pdf": "nau mpro.pdf", "image_folder": "nau mpro pages", "sections": secs},
        "files": {"score_pdf": f"{sid}.pdf", "page_images": []},
        "review_status": "needs review", "review_notes": c["notes"],
    }

def fmt(s):
    out = [s["title"], ""]
    if s["reference"]:
        out += [s["reference"], ""]
    for b in s["lyrics"]["sequence"]:
        out.append(f'{b["number"]}.' if b["type"] == "verse" else "Chorus:")
        out += b["lines"] + [""]
    return "\n".join(out).rstrip() + "\n"

src = sys.argv[1]
name = os.path.basename(src).replace(".src", "")
songs = [record(c) for c in parse(src)]
pages = sorted({sec["pdf_page"] for s in songs for sec in s["source"]["sections"]})
problems = [f'{s["id"]}: no lyrics' for s in songs if not s["lyrics"]["sequence"] and not any('NOT TRANSCRIBED' in n for n in s['review_notes'])]
problems += [f'{s["id"]}: no pages' for s in songs if not s["source"]["sections"]]
json.dump({"batch": name, "pages": [pages[0], pages[-1]] if pages else [], "songs": songs},
          open(os.path.join(HERE, "data/batches", name + ".json"), "w"), ensure_ascii=False, indent=2)
open(os.path.join(HERE, "lyrics", name + ".txt"), "w").write("\n\n".join(fmt(s) for s in songs))
print(name, len(songs), "songs", "pages", pages[:1], "-", pages[-1:], "| problems:", problems or "none")
