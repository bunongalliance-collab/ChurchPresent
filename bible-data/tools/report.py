# Validation report for bible-data/<translation>/*.json.  Usage: python3 report.py bunong-vn > bunong-vn/REPORT.md
import json, glob, sys, os, collections
d = sys.argv[1]
books = sorted((json.load(open(f)) for f in glob.glob(os.path.join(d, '[0-9A-Z]*.json'))), key=lambda b: b['book']['order'])
checked = json.load(open(os.path.join(os.path.dirname(__file__), 'checked.json')))
V = lambda c: c['verses'][-1].get('verse_end', c['verses'][-1]['verse']) if c['verses'] else 0
tv = sum(V(c) for b in books for c in b['chapters']); tc = sum(len(b['chapters']) for b in books)
print(f"# {books[0]['translation']['name']}: extraction report\n")
print(f"- Books: {len(books)} of 66 (OT {sum(b['book']['testament']=='OT' for b in books)}, NT {sum(b['book']['testament']=='NT' for b in books)})")
print(f"- Chapters: {tc} (standard 1189)\n- Verses: {tv} (standard English numbering 31102)")
print(f"- Headings: {sum(len(c['headings']) for b in books for c in b['chapters'])}, footnotes: {sum(len(b['footnotes']) for b in books)}\n")
print("| Book | Name | Chapters | Verses | Flags |\n|---|---|---|---|---|")
for b in books:
    w = [x for x in b['warnings'] if x['issue'] != 'space before punctuation' and x['ref'] not in checked]
    print(f"| {b['book']['code']} | {b['book']['local_name']} | {len(b['chapters'])} | {sum(V(c) for c in b['chapters'])} | {len(w) or ''} |")
print("\n## Flags still to review\n")
open_flags = [x for b in books for x in b['warnings'] if x['issue'] != 'space before punctuation' and x['ref'] not in checked]
for x in open_flags: print(f"- {x['ref']}: {x['issue']}")
if not open_flags: print("None.")
print("\n## Checked by hand\n")
for ref, note in checked.items():
    if not ref.startswith('_'): print(f"- {ref}: {note}")
n = sum(1 for b in books for x in b['warnings'] if x['issue'] == 'space before punctuation')
print(f"\n{n} verses have a space before punctuation as printed (e.g. \"rơ̆ ,\"); left as printed.")
