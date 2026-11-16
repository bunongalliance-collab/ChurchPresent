"""Build per-song score crops and PDFs from a batch JSON.
Usage: .venv/bin/python build_scores.py data/batches/batch-0001.json
Region text: 'full page', or starts with 'upper'/'lower'. Optional 'crop_px': [left, top, right, bottom]."""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = os.path.expanduser("~/Downloads/nau mpro pages")
SPLIT = {14: 985}  # y pixel where the lower song starts on shared pages

def box(sec, w, h):
    if "crop_px" in sec:
        return tuple(sec["crop_px"])
    r, y = sec["region"].lower(), SPLIT.get(sec["pdf_page"], h // 2)
    if r.startswith("upper"):
        return (0, 0, w, y)
    if r.startswith("lower"):
        return (0, y, w, h)
    return (0, 0, w, h)

batch = json.load(open(sys.argv[1]))
for s in batch["songs"]:
    crops, names = [], []
    for sec in s["source"]["sections"]:
        im = Image.open(os.path.join(PAGES, sec["image"])).convert("RGB")
        b = box(sec, *im.size)
        sec["crop_px"] = list(b)
        c = im.crop(b)
        name = f'{s["id"]}-page-{sec["pdf_page"]}.png'
        c.save(os.path.join(HERE, "images", name), optimize=True)
        crops.append(c); names.append(name)
    crops[0].save(os.path.join(HERE, "scores", s["files"]["score_pdf"]), save_all=True,
                  append_images=crops[1:], resolution=150)
    s["files"]["page_images"] = names
json.dump(batch, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print("scores:", len(batch["songs"]))
