# Pick verses for a by-eye review and find the PDF page each one is on.
# Usage: python3 review_pick.py <rawDir> <dataDir> <out.json>
import json, glob, os, re, random, sys, unicodedata
RAW, DATA, OUT = sys.argv[1:4]
random.seed(7)
books = {json.load(open(f))['book']['code']: json.load(open(f)) for f in glob.glob(os.path.join(DATA, '[0-9A-Z]*.json'))}
squash = lambda t: re.sub(r'[\W\d_]+', '', unicodedata.normalize('NFC', t.replace('', 'Ƀ'))).lower()

# Tricky cases first (capital Ƀ, poetry, genealogy, combined verse, headings, numbering differences), then random verses
fixed = [('EXO',1,7), ('PSA',23,1), ('MAT',1,13), ('JOB',41,25), ('LEV',5,14), ('1CH',21,3), ('REV',12,18), ('2CO',13,13)]
picks = list(fixed)
codes = sorted(books, key=lambda c: books[c]['book']['order'])
while len(picks) < 24:
    c = random.choice(codes); ch = random.choice(books[c]['chapters']); v = random.choice(ch['verses'])
    if (c, ch['chapter'], v['verse']) not in picks: picks.append((c, ch['chapter'], v['verse']))

out = []
for c, chn, vn in picks:
    b = books[c]; ch = b['chapters'][chn-1]; v = [x for x in ch['verses'] if x['verse'] == vn][0]
    raw = open(os.path.join(RAW, b['source']['file'] + '.cols.txt')).read()
    pages = re.split(r'=====PAGE (\d+)=====', raw)   # ['', '1', text, '2', text, ...]
    key = squash(v['text'])[:40]
    page = next((int(pages[i]) for i in range(1, len(pages), 2) if key[:25] in squash(pages[i+1])), None)
    if page is None:   # verse starts at the bottom of one page and continues on the next
        for i in range(1, len(pages) - 2, 2):
            if key[:25] in squash(pages[i+1] + pages[i+3]): page = int(pages[i]); break
    plain = lambda w: 'ƀ' not in w.lower() and '̆' not in w   # a separate breve or a Ƀ is stored differently in the PDF
    ws = v['text'].split()
    find = []   # search strings for the highlight, best first: verse number + first words, then three words in a row
    if all(plain(w) for w in ws[:2]): find.append(f"{vn} " + ' '.join(ws[:2]))
    if plain(ws[0]): find.append(f"{vn} {ws[0]}")
    for k in range(len(ws) - 2):
        if all(plain(w) for w in ws[k:k+3]) and len(find) < 8: find.append(' '.join(ws[k:k+3]))
    out.append({'ref': f"{b['book']['name']} {chn}:{vn}" + (f"-{v['verse_end']}" if v.get('verse_end') else ''), 'code': c, 'chapter': chn, 'verse': vn,
                'local': f"{b['book']['local_name']} {chn}:{vn}", 'text': v['text'],
                'headings': [{'heading': 'Heading', 'title': 'Psalm title', 'parallel': 'Parallel passage'}[h['type']] + ': ' + h['text'] for h in ch['headings'] if h['before_verse'] == vn],
                'pdf': os.path.join('Old' if b['book']['testament'] == 'OT' else 'New', b['source']['file']), 'page': page, 'find': find})
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(len(out), 'verses;', sum(1 for x in out if x['page'] is None), 'without a page')
for x in out: print(x['ref'], 'p', x['page'], '|', x['find'])
