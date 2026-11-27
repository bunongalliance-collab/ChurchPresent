import re,json,sys,unicodedata
src,out=sys.argv[1],sys.argv[2]
STD=[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38]
t=open(src).read().replace('','Ƀ')
t=unicodedata.normalize('NFC',t); t=re.sub(r'NAU NGLUH[\d ,]*\x08','\n',t)
lines=[]
for l in t.split('\n'):
    s=l.strip()
    if not s or re.match(r'=====PAGE',s) or re.match(r'^NAU NGLUH[\d ,]*$',s) or re.match(r'^\d{2,3}$',s): continue
    lines.append(s)
merged=[]
for l in lines:
    if merged and merged[-1].startswith('(') and merged[-1].count('(')>merged[-1].count(')') and re.search(r'\d+:\d+',merged[-1]): merged[-1]+=' '+l
    else: merged.append(l)
lines=merged
# book title = lines before first chapter marker
first=next(i for i,l in enumerate(lines) if re.match(r'^\d+ \x03$',l))
full=[x.strip() for x in open(sys.argv[3]).read().split('\n') if x.strip() and not x.startswith('=====')]
title=full[0]; pre=[full[1]]; fi=next(i for i,x in enumerate(full) if re.match(r'^\d+ \x03$',x)); first_heads=full[2:fi]
chapters=[]; warnings=[]; ch=None; pending=[]; cur=None
def endsent(s): return bool(re.search(r'[.?!:;”’,)]$',s))
i=first
# Heading lines: preceded by a sentence-ending line (or chapter start) and followed (possibly via more heading lines / parallel ref) by a line starting with a verse number or chapter marker
def isheading(k):
    prev=lines[k-1] if k>0 else ''
    if re.match(r'^\d',lines[k]) : return False
    if not (endsent(prev) or re.match(r'^\d+ \x03$',prev) or re.match(r'^\(.*\)$',prev) or k in heads): return False
    j=k
    while j<len(lines) and not re.match(r'^\d',lines[j]):
        if endsent(lines[j]) and not re.match(r'^\(.*\)$',lines[j]): return False
        j+=1
        if j-k>3: return False
    return True
heads=set()
PAR=r'^\(?[^\d(][^()]*\d+:\d+[\d:\-–;, A-Za-zÀ-ỹ]*\)?$'
for k in range(first,len(lines)):
    if re.match(PAR,lines[k]):
        heads.add(k); j=k-1
        while j>first and k-j<=3 and not re.match(r'^\d',lines[j]) and not endsent(lines[j]): heads.add(j); j-=1
text_stream=[]  # tokens: ('H',text) ('P',text) ('C',n) ('T',line)
for k in range(first,len(lines)):
    l=lines[k]
    m=re.match(r'^(\d+) \x03$',l)
    if m: text_stream.append(('C',int(m.group(1)))); continue
    if k in heads or isheading(k):
        heads.add(k)
        if re.match(PAR,l): text_stream.append(('P',l))
        else: text_stream.append(('H',l))
        continue
    text_stream.append(('T',l))
# merge consecutive H lines; split T text into verses
for kind,val in text_stream:
    if kind=='C':
        carry=[h for h in (ch['headings'] if ch else []) if h['before_verse']>len(ch['verses'])]
        if ch: ch['headings']=[h for h in ch['headings'] if h not in carry]
        ch={'chapter':val,'verses':[], 'headings':[dict(h,before_verse=1) for h in carry]}; chapters.append(ch)
        if val==1 and first_heads: ch['headings'].append({'before_verse':1,'type':'heading','text':' '.join(first_heads)})
        cur=None; continue
    if kind in 'HP':
        nxt=len(ch['verses'])+1
        if kind=='H' and ch['headings'] and ch['headings'][-1]['before_verse']==nxt and ch['headings'][-1]['type']=='heading' and not ch['headings'][-1].get('_closed'):
            ch['headings'][-1]['text']+=' '+val
        else: ch['headings'].append({'before_verse':nxt,'type':'heading' if kind=='H' else 'parallel','text':val})
        if kind=='P': ch['headings'][-1]['_closed']=True
        continue
    # text line: find verse numbers that are the next expected verse
    pos=0; s=val
    startpara = (not re.match(r'^\d',s) and False)
    pieces=[]; last=0
    expect=(cur['verse']+1) if cur else 1
    for m in re.finditer(r'(?:(?<=^)|(?<=\s))(\d+) ',s):
        if int(m.group(1))==expect:
            pieces.append((s[last:m.start()],None)); pieces.append((None,expect)); last=m.end(); expect+=1
    pieces.append((s[last:],None))
    linestart_verse = bool(re.match(r'^(\d+) ',s)) and pieces[1:2] and pieces[1][1]
    for txt,vn in pieces:
        if vn:
            cur={'verse':vn,'text':''}
            if (linestart_verse==vn and ch['verses'] and re.search(r'[.?!”]$',ch['verses'][-1]['text'])) or vn==1: cur['para']=True
            ch['verses'].append(cur)
        elif txt and txt.strip():
            if cur is None: warnings.append({'ref':f"EXO {ch['chapter']}",'issue':'text before verse 1','text':txt}); continue
            c=cur['text']
            cur['text']=(c[:-1]+txt.strip()) if c.endswith('-') and not c.endswith(' -') and re.search(r'[A-Za-zÀ-ỹ]-$',c) and txt.strip()[:1].isupper() else (c+' '+txt.strip()).strip()
for ch in chapters:
    for h in ch['headings']: h.pop('_closed',None)
    for v in ch['verses']:
        v['text']=re.sub(r'\s+',' ',v['text']).strip()
        if re.search(r' [,.;:?!]',v['text']): warnings.append({'ref':f"EXO {ch['chapter']}:{v['verse']}",'issue':'space before punctuation'})
        if re.search(r'[-\x00-\x08\x0b-\x1f]',v['text']): warnings.append({'ref':f"EXO {ch['chapter']}:{v['verse']}",'issue':'unknown character'})
        if not v['text']: warnings.append({'ref':f"EXO {ch['chapter']}:{v['verse']}",'issue':'empty verse'})
    exp=STD[ch['chapter']-1]
    if len(ch['verses'])!=exp: warnings.append({'ref':f"EXO {ch['chapter']}",'issue':f"has {len(ch['verses'])} verses, expected {exp}"})
book={'translation':{'id':'bunong-vn','name':'Bunong Bible (Vietnam dialect)','language':'Bunong'},
 'book':{'code':'EXO','order':2,'testament':'OT','name':'Exodus','local_name':title.title(),'local_subtitle':' '.join(pre)},
 'source':{'file':'002. 02EXO.pdf','pages':47},
 'chapters':chapters,'warnings':warnings}
json.dump(book,open(out,'w'),ensure_ascii=False,indent=1)
print(len(chapters),'chapters',sum(len(c['verses']) for c in chapters),'verses',sum(len(c['headings']) for c in chapters),'headings/parallels',len(warnings),'warnings')
for w in warnings[:25]: print(w)
