# Parse every extracted book into bible-data/bunong-vn/<CODE>.json and print one summary line per book.
# Usage: python3 parse_all.py <rawDir> <outDir>
# rawDir holds <pdf name>.cols.txt and <pdf name>.title.txt and .header.txt from extract.swift.
import re, json, sys, os, unicodedata, glob

RAW, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

BOOKS = [("GEN","Genesis"),("EXO","Exodus"),("LEV","Leviticus"),("NUM","Numbers"),("DEU","Deuteronomy"),("JOS","Joshua"),("JDG","Judges"),("RUT","Ruth"),("1SA","1 Samuel"),("2SA","2 Samuel"),("1KI","1 Kings"),("2KI","2 Kings"),("1CH","1 Chronicles"),("2CH","2 Chronicles"),("EZR","Ezra"),("NEH","Nehemiah"),("EST","Esther"),("JOB","Job"),("PSA","Psalms"),("PRO","Proverbs"),("ECC","Ecclesiastes"),("SNG","Song of Songs"),("ISA","Isaiah"),("JER","Jeremiah"),("LAM","Lamentations"),("EZK","Ezekiel"),("DAN","Daniel"),("HOS","Hosea"),("JOL","Joel"),("AMO","Amos"),("OBA","Obadiah"),("JON","Jonah"),("MIC","Micah"),("NAM","Nahum"),("HAB","Habakkuk"),("ZEP","Zephaniah"),("HAG","Haggai"),("ZEC","Zechariah"),("MAL","Malachi"),("MAT","Matthew"),("MRK","Mark"),("LUK","Luke"),("JHN","John"),("ACT","Acts"),("ROM","Romans"),("1CO","1 Corinthians"),("2CO","2 Corinthians"),("GAL","Galatians"),("EPH","Ephesians"),("PHP","Philippians"),("COL","Colossians"),("1TH","1 Thessalonians"),("2TH","2 Thessalonians"),("1TI","1 Timothy"),("2TI","2 Timothy"),("TIT","Titus"),("PHM","Philemon"),("HEB","Hebrews"),("JAS","James"),("1PE","1 Peter"),("2PE","2 Peter"),("1JN","1 John"),("2JN","2 John"),("3JN","3 John"),("JUD","Jude"),("REV","Revelation")]

# Standard (English) verse counts per chapter, used only to flag differences
STD = {k: [int(x) for x in v.split(",")] for k, v in [l.split(":") for l in """
GEN:31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26
EXO:22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38
LEV:17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34
NUM:54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13
DEU:46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12
JOS:18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33
JDG:36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25
RUT:22,23,18,22
1SA:28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13
2SA:27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25
1KI:53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53
2KI:18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30
1CH:54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30
2CH:17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23
EZR:11,70,13,24,17,22,28,36,15,44
NEH:11,20,32,23,19,19,73,18,38,39,36,47,31
EST:22,23,15,17,14,14,10,17,32,3
JOB:22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17
PSA:6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6
PRO:33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31
ECC:18,26,22,16,20,12,29,17,18,20,10,14
SNG:17,17,11,16,16,13,13,14
ISA:31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24
JER:19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34
LAM:22,22,66,22,22
EZK:28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35
DAN:21,49,30,37,31,28,28,27,27,21,45,13
HOS:11,23,5,19,15,11,16,14,17,15,12,14,16,9
JOL:20,32,21
AMO:15,16,15,13,27,14,17,14,15
OBA:21
JON:17,10,10,11
MIC:16,13,12,13,15,16,20
NAM:15,13,19
HAB:17,20,19
ZEP:18,15,20
HAG:15,23
ZEC:21,13,10,14,11,15,14,23,17,12,17,14,9,21
MAL:14,17,18,6
MAT:25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20
MRK:45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20
LUK:80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53
JHN:51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25
ACT:26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31
ROM:32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27
1CO:31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24
2CO:24,17,18,18,21,18,16,24,15,18,33,21,14
GAL:24,21,29,31,26,18
EPH:23,22,21,32,33,24
PHP:30,30,21,23
COL:29,23,25,18
1TH:10,20,13,18,28
2TH:12,17,18
1TI:20,15,16,16,25,21
2TI:18,26,17,22
TIT:16,15,15
PHM:25
HEB:14,18,19,16,14,20,28,13,28,39,40,29,25
JAS:27,26,18,17,20
1PE:25,25,22,19,14
2PE:21,22,18
1JN:10,29,24,21,21
2JN:13
3JN:14
JUD:25
REV:20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21
""".split()]}

CHAP = re.compile(r'^(\d+) \x03$')                       # chapter drop-cap
PAR = re.compile(r'^\(?[^\d(][^()]*\d+:\d+[\d:\-–;, A-Za-zÀ-ỹ]*\)?$')  # parallel reference line
def endsent(s):
    if re.search(r'\([^()]*\d[^()]*\)$', s) and not re.match(r'^\d', s): return False   # heading ending in a reference, e.g. "(Luk 10:21-22)"
    return bool(re.search(r'[.?!:;”’,)]$', s))

def clean_lines(text):
    text = unicodedata.normalize('NFC', text.replace('\uf20a', 'Ƀ'))
    text = re.sub(r'[^\n]*\x08', '\n', text)
    text = re.sub(r'([\u0300-\u036f])(\d+ )(?=[A-ZÀ-ỸƁɃ“‘])', '\\1\n\\2', text)   # heading with a raised accent merged with the verse beside it
    text = re.sub(r'(?m)(\d+) \x03 *', lambda m: '\n' + m.group(1) + ' \x03\n', text)   # drop-cap chapter number on its own line   # running header fragments end in a backspace control
    out = []
    for l in text.split('\n'):
        s = l.strip()
        if not s or s.startswith('=====PAGE'): continue
        if re.fullmatch(r'\d{1,4}', s): out.append('\x07' + s); continue   # bare number: poetry verse number or page number
        if unicodedata.combining(s[0]) and out:   # a stray accent that landed on the next row belongs to the end of the previous line
            k = 0
            while k < len(s) and (unicodedata.combining(s[k]) or s[k] == ' '): k += 1
            out[-1] += s[:k].replace(' ', ''); s = s[k:].strip()
            if not s: continue
        out.append(s)
    joined = []
    for s in out:   # put a bare number in front of the line that follows it
        if joined and re.fullmatch(r'\x07\d+', joined[-1]): joined[-1] = joined[-1] + ' ' + s
        else: joined.append(s)
    out = [s for s in joined if not re.fullmatch(r'\x07\d+', s)]
    for k in range(1, len(out)):   # the tall drop-cap sorts below the first line of verse 1; put it back in front
        if re.match(r'^\d+ \x03$', out[k]) and re.match(r'^\x07?1 ', out[k-1]): out[k-1], out[k] = out[k], out[k-1]
    merged = []   # join a parenthesised reference broken over two lines
    for l in out:
        if merged and merged[-1].startswith('(') and merged[-1].count('(') > merged[-1].count(')') and re.search(r'\d+:\d+', merged[-1]):
            merged[-1] += ' ' + l
        else: merged.append(l)
    return merged

def take_footnotes(cols):
    notes = []
    def grab(m):
        body = ' '.join(x.strip() for x in m.group(1).split('\n') if x.strip())
        for part in re.split(r'\s+(?=[a-z] ?\d+[:.] ?\d+(?:-\d+)?[a-z]?(?: |$))', body):
            f = re.match(r'^([a-z]) ?(\d+)[:.] ?(\d+)(?:-(\d+))?([a-z]?)\s*(.*)$', part)
            if f: notes.append({'chapter': int(f.group(2)), 'verse': int(f.group(3)), 'verse_end': int(f.group(4)) if f.group(4) else None, 'mark': f.group(1), 'part': f.group(5) or None, 'text': unicodedata.normalize('NFC', f.group(6).replace('\uf20a', 'Ƀ')).strip()})
        return '\n'
    cols = re.sub(r'=====FOOT=====\n(.*?)=====ENDFOOT=====', grab, cols, flags=re.S)
    return cols, notes

def parse(code, name, order, testament, cols, page1, src, header=''):
    cols, footnotes = take_footnotes(cols)
    lines = clean_lines(cols)
    # page1 = the page-1 title block (centred lines above the text), kept as printed
    title_lines = [x.strip() for x in unicodedata.normalize('NFC', page1.replace('', 'Ƀ')).split('\n') if x.strip() and not re.fullmatch(r'\d+', x.strip())]
    warnings = []
    starts = [i for i, l in enumerate(lines) if CHAP.match(l)]
    single = not starts
    if single:  # one-chapter book: no drop-cap, starts at the first "1 "
        first = next(i for i, l in enumerate(lines) if re.match(r'^\x07?1 ', l))
        lines.insert(first, '1 \x03')
    else:
        first = starts[0]
    # Book's own name: the most common running header without its chapter numbers ("NAU NGLUH 2 , 3" -> "NAU NGLUH")
    hs = []
    for h in header.split('\n'):
        h = unicodedata.normalize('NFC', h.replace('', 'Ƀ')).replace('\x08', ' ')
        h = re.sub(r'\b\d+\b|[,–-](?=\s|$)', ' ', h); h = re.sub(r'\s+', ' ', h).strip()   # chapter numbers and ranges like '2 – 4'
        if re.search(r'[A-Za-zÀ-ỹ]', h): hs.append(h)
    if hs: title = max(set(hs), key=hs.count)
    else:   # one-page book with no running header (2 John, 3 John): the capitals line of the title, with I/II/III from the English name
        caps = [x for x in title_lines if x == x.upper() and re.search(r'[A-ZÀ-Ỹ]', x)]
        num = {'1': 'I', '2': 'II', '3': 'III'}.get(name[0], '')
        title = ((num + ' ') if num else '') + (caps[-1] if caps else name)
    # Heading above chapter 1: column text before the drop-cap, minus title fragments in capitals
    first_heads = [x for x in lines[:first] if not x.startswith('\x07') and not (x == x.upper() and re.search(r'[A-ZÀ-Ỹ]', x))]

    heads = set()
    def titlecase(t):   # headings are in Title Case; verse lines are mostly lower case
        if re.fullmatch(r'\([^()]*\)', t): return True
        t = re.sub(r'\([^()]*\)', '', t)
        if re.search(r'[.;:!?] ', t): return False   # headings have no sentence punctuation inside them
        words = [w for w in t.split() if re.match(r'\w', w)]
        return bool(words) and sum(1 for w in words if w[0].isupper()) / len(words) >= 0.6 and not re.search(r'\s\d+ ', ' ' + t)
    for k in range(first, len(lines)):
        if PAR.match(lines[k]) and not re.match(r'^\d', lines[k]):
            heads.add(k); j = k - 1
            while j > first and k - j <= 3 and not re.match(r'^\d', lines[j]) and not endsent(lines[j]) and titlecase(lines[j]): heads.add(j); j -= 1
    def isheading(k):
        prev = lines[k-1] if k > 0 else ''
        if not titlecase(lines[k]): return False
        if re.match(r'^\d', lines[k]): return False
        if not (endsent(prev) or CHAP.match(prev) or k-1 in heads or labels.get(k-1) in ('H', 'P')): return False
        j = k
        while j < len(lines) and not re.match(r'^\d', lines[j]):
            if endsent(lines[j]): return False
            if not titlecase(lines[j]): break   # e.g. a psalm title in sentence case follows the heading
            j += 1
            if j - k > 5: return False
        return True

    def next_is_start(k):   # the next numbered line opens a chapter or verse 1 (so this line is a title above it)
        j = k + 1
        while j < len(lines) and j - k <= 5:
            if CHAP.match(lines[j]) or re.match(r'^1 ', lines[j]): return True
            if re.match(r'^\x07?\d', lines[j]): return False
            j += 1
        return False
    # Label every line: C chapter, H heading, P parallel reference, S psalm title (sentence case, above verse 1), T verse text
    labels = {}; prev = 'T'
    for k in range(first, len(lines)):
        l = lines[k]
        if CHAP.match(l): lab = 'C'
        elif re.match(r'^\x07?\d', l): lab = 'T'
        elif k in heads: lab = 'P' if PAR.match(l) else 'H'
        elif prev in ('H', 'P'):
            if PAR.match(l): lab = 'P'
            elif titlecase(l) and not endsent(l): lab = 'H'
            else: lab = 'S' if next_is_start(k) else 'T'
        elif prev == 'S': lab = 'S'
        elif prev == 'C' and not re.match(r'^\x07?\d', l) and next_is_start(k): lab = 'S'
        elif isheading(k): lab = 'H'
        else: lab = 'T'
        labels[k] = lab; prev = lab

    chapters = []; ch = None; cur = None
    for k in range(first, len(lines)):
        l = lines[k]
        m = CHAP.match(l)
        if m:
            carry = [h for h in (ch['headings'] if ch else []) if h['before_verse'] > len(ch['verses'])]
            if ch: ch['headings'] = [h for h in ch['headings'] if h not in carry]
            n = int(m.group(1))
            if chapters and n != chapters[-1]['chapter'] + 1: warnings.append({'ref': f"{code} {n}", 'issue': f"chapter {n} follows {chapters[-1]['chapter']}"})
            ch = {'chapter': n, 'headings': [dict(h, before_verse=1) for h in carry], 'verses': []}
            if n == 1 and first_heads and not single: ch['headings'].append({'before_verse': 1, 'type': 'heading', 'text': ' '.join(first_heads)})
            chapters.append(ch); cur = None; continue
        lab = labels[k]
        if lab in ('H', 'P', 'S'):
            kind = {'H': 'heading', 'P': 'parallel', 'S': 'title'}[lab]
            nxt = len(ch['verses']) + 1
            hs = ch['headings']
            if kind != 'parallel' and hs and hs[-1]['before_verse'] == nxt and hs[-1]['type'] == kind and hs[-1].get('_open'):
                hs[-1]['text'] += ' ' + l
            else: hs.append({'before_verse': nxt, 'type': kind, 'text': l, '_open': kind != 'parallel'})
            continue
        if ch['headings']: ch['headings'][-1]['_open'] = False
        expect = (cur.get('verse_end', cur['verse']) + 1) if cur else 1
        pieces = []; last = 0
        bare = re.match(r'^\x07(\d+) ', l)
        if bare:   # a bare number is only a verse number when it is the next one; otherwise it was a page number
            l = (l[1:] if int(bare.group(1)) in (expect, expect + 1) else l[bare.end():])
        for m in re.finditer(r'(?:(?<=^)|(?<=\s))(\d+)(?:-(\d+))? ', l):
            n = int(m.group(1)); n2 = int(m.group(2)) if m.group(2) else n
            if n2 < n or n2 - n > 5: continue
            if n == expect or (n == expect + 1 and cur and (m.start() == 0 or re.match(r'[“‘A-ZÀ-Ỹ\u0181Ƀ]', l[m.end():m.end()+1]))):
                if n != expect: warnings.append({'ref': f"{code} {ch['chapter']}:{expect}", 'issue': 'verse number not found (skipped)'})
                pieces.append((l[last:m.start()], None)); pieces.append((None, (n, n2))); last = m.end(); expect = n2 + 1
        pieces.append((l[last:], None))
        for txt, vn in pieces:
            if vn:
                vn, vend = vn
                cur = {'verse': vn, 'text': ''}
                if vend != vn: cur['verse_end'] = vend   # verses printed together, e.g. "14-15"
                vn_last = vend
                prev = ch['verses'][-1]['text'] if ch['verses'] else ''
                if vn == 1 or (l.startswith(f"{vn} ") and re.search(r'[.?!”]$', prev)): cur['para'] = True
                ch['verses'].append(cur)
            elif txt.strip():
                if cur is None: warnings.append({'ref': f"{code} {ch['chapter']}", 'issue': 'text before verse 1', 'text': txt.strip()[:80]}); continue
                cur['text'] = (cur['text'] + ' ' + txt.strip()).strip()

    for f in footnotes:   # remove the footnote caller letter left after the word it marks
        for ch in chapters:
            if ch['chapter'] != f['chapter']: continue
            for v in ch['verses']:
                if v['verse'] <= (f['verse_end'] or f['verse']) and v.get('verse_end', v['verse']) >= f['verse']:
                    # the caller is a lone letter (a, b, c …) standing as its own word
                    v['text'], n = re.subn(r'\s?(?<![\w])' + f['mark'] + r'(?![\w])(?=[\s.,;:!?”’]|$)', '', v['text'], count=1)
                    if n: f['found'] = True; break
            if f.get('found'): break
        f.pop('found', None)   # some callers are not printed in the verse; the footnote stays linked by chapter and verse
    std = STD[code]
    for ch in chapters:
        for h in ch['headings']: h.pop('_open', None)
        for idx, v in enumerate(ch['verses']):
            v['text'] = re.sub(r'\*+\\q\d\*+', '', v['text'])   # leftover typesetting code (poetry marker), not Scripture
            v['text'] = re.sub(r'\s+', ' ', v['text']).strip()
            n = v['verse']
            v['text'] = re.sub(rf'^{n} (?=\S)', '', v['text'])
            dup = re.search(rf'(?<=[.;,!?”]) {n} (?=[A-ZÀ-ỸƁƀɃ“‘\w])', v['text'])
            if dup and idx > 0:   # the part before the inline number belongs to the previous verse
                ch['verses'][idx-1]['text'] += ' ' + v['text'][:dup.start()].strip()
                v['text'] = v['text'][dup.end():].strip()
                warnings.append({'ref': f"{code} {ch['chapter']}:{n}", 'issue': 'verse start moved to the inline number (check)'})
            ref = f"{code} {ch['chapter']}:{v['verse']}"
            if not v['text']: warnings.append({'ref': ref, 'issue': 'empty verse'})
            if re.search(r' [,.;:?!]', v['text']): warnings.append({'ref': ref, 'issue': 'space before punctuation'})
            if re.search(r'[\uE000-\uF8FF\x00-\x1f]', v['text']): warnings.append({'ref': ref, 'issue': 'unknown character'})
            if re.search(r'\d', v['text']): warnings.append({'ref': ref, 'issue': 'digit in verse text (check for a heading or reference)'})
        exp = std[ch['chapter'] - 1] if ch['chapter'] <= len(std) else None
        last_v = ch['verses'][-1].get('verse_end', ch['verses'][-1]['verse']) if ch['verses'] else 0
        if last_v != exp: warnings.append({'ref': f"{code} {ch['chapter']}", 'issue': f"has {last_v} verses, standard {exp}"})
    if len(chapters) != len(std): warnings.append({'ref': code, 'issue': f"has {len(chapters)} chapters, standard {len(std)}"})
    return {
        'translation': {'id': 'bunong-vn', 'name': 'Bunong Bible (Vietnam dialect)', 'language': 'Bunong'},
        'book': {'code': code, 'order': order, 'testament': testament, 'name': name, 'local_name': ' '.join(w if re.fullmatch(r'[IVX]+', w) else w.title() for w in title.split()), 'title_block': title_lines},
        'source': {'file': src},
        'chapters': chapters, 'footnotes': footnotes, 'warnings': warnings,
    }

report = []
for order, (code, name) in enumerate(BOOKS, 1):
    files = [f for f in glob.glob(os.path.join(RAW, '*.cols.txt')) if re.search(r'\.\s*\d{2}' + re.escape(code) + r'\.pdf', os.path.basename(f))]
    if not files: report.append(f"{code:4} MISSING PDF"); continue
    src = os.path.basename(files[0])[:-len('.cols.txt')]
    try:
        b = parse(code, name, order, 'OT' if order <= 39 else 'NT', open(files[0]).read(), open(os.path.join(RAW, src + '.title.txt')).read(), src, open(os.path.join(RAW, src + '.header.txt')).read())
    except Exception as e:
        report.append(f"{code:4} ERROR {e}"); continue
    json.dump(b, open(os.path.join(OUT, f"{code}.json"), 'w'), ensure_ascii=False, indent=1)
    nv = sum(c['verses'][-1].get('verse_end', c['verses'][-1]['verse']) for c in b['chapters'] if c['verses'])
    serious = [w for w in b['warnings'] if w['issue'] != 'space before punctuation']
    report.append(f"{code:4} {len(b['chapters']):3} ch {nv:5} v  {'OK' if not serious else 'CHECK ' + str(len(serious))}")
print('\n'.join(report))
