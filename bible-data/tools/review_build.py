# Build review/index.html: each sample verse as extracted, next to its PDF page with the verse start marked.
# Usage: python3 review_build.py review/sample.json review/index.html
import json, sys, html
items = json.load(open(sys.argv[1]))
data = json.dumps([{k: x[k] for k in ('ref', 'local', 'text', 'headings', 'page', 'pdf')} | {'img': f'v{i}.jpg'} for i, x in enumerate(items)], ensure_ascii=False)

page = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bible Text Review</title>
<style>
:root { --bg:#f7f6f2; --card:#fff; --ink:#1f2328; --muted:#5f6670; --line:#dedbd2; --accent:#7a2b3a; --ok:#1f7a4d; --bad:#b3261e; --chip:#efece4; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#171b20; --card:#20252c; --ink:#e7e9ec; --muted:#a0a8b3; --line:#323944; --accent:#e0a3ae; --ok:#5cc495; --bad:#ff8a80; --chip:#2a3038; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
header { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line); }
.bar { max-width:1280px; margin:0 auto; padding:12px 16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
h1 { font-size:18px; margin:0; flex:1; min-width:200px; }
.count { color:var(--muted); font-size:14px; }
button { font:inherit; font-size:14px; border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:8px; padding:6px 12px; cursor:pointer; }
button:hover { border-color:var(--muted); }
main { max-width:1280px; margin:0 auto; padding:16px; display:grid; gap:16px; }
.intro { color:var(--muted); font-size:15px; margin:0; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap:16px; }
.card.ok { border-color:var(--ok); } .card.bad { border-color:var(--bad); }
.ref { font-weight:600; font-size:17px; } .local { color:var(--muted); font-size:14px; }
.heading { display:inline-block; background:var(--chip); border-radius:6px; padding:2px 8px; font-size:13px; margin:8px 0 0; }
.text { font-size:19px; line-height:1.6; margin:12px 0; font-family: Georgia, "Times New Roman", serif; }
.where { color:var(--muted); font-size:13px; }
.actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
.actions .on-ok { background:var(--ok); border-color:var(--ok); color:#fff; }
.actions .on-bad { background:var(--bad); border-color:var(--bad); color:#fff; }
textarea { width:100%; margin-top:8px; font:inherit; font-size:14px; padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--ink); min-height:60px; display:none; }
.card.bad textarea { display:block; }
.img { overflow:auto; max-height:640px; border:1px solid var(--line); border-radius:8px; background:#fff; }
.img img { width:100%; display:block; cursor:zoom-in; }
.img.zoom img { width:200%; cursor:zoom-out; }
@media (max-width: 760px) { .card { grid-template-columns:1fr; } .img { max-height:480px; } }
</style></head><body>
<header><div class="bar"><h1>Bunong Bible (Vietnam dialect): text review</h1><span class="count" id="count"></span><button id="copy">Copy results</button></div></header>
<main>
<p class="intro">Each verse is shown as it was extracted (left) next to its page in the PDF (right). The yellow mark and red bar show where the verse starts; the verse number is just before it. Read the verse on the page to its end and compare every word, accent and the verse break. Click the page to zoom.</p>
<div id="list"></div>
</main>
<script>
const items = __DATA__;
const KEY = 'bunongReview';
let state = {}; try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const list = document.getElementById('list');
list.style.display = 'grid'; list.style.gap = '16px';
items.forEach((it, i) => {
  const st = state[i] || {};
  const card = document.createElement('section');
  card.className = 'card' + (st.v === 'ok' ? ' ok' : st.v === 'bad' ? ' bad' : '');
  card.innerHTML = `<div>
      <div class="ref">${i + 1}. ${esc(it.ref)}</div><div class="local">${esc(it.local)}</div>
      ${it.headings.map(h => `<div class="heading">${esc(h)}</div>`).join(' ')}
      <p class="text">${esc(it.text)}</p>
      <div class="where">${esc(it.pdf)}, page ${it.page}</div>
      <div class="actions"><button data-v="ok">Matches</button><button data-v="bad">Problem</button></div>
      <textarea placeholder="What is different?">${esc(st.note || '')}</textarea>
    </div>
    <div class="img"><img loading="lazy" src="${it.img}" alt="PDF page ${it.page}"></div>`;
  const paint = () => {
    const v = (state[i] || {}).v;
    card.classList.toggle('ok', v === 'ok'); card.classList.toggle('bad', v === 'bad');
    card.querySelector('[data-v=ok]').className = v === 'ok' ? 'on-ok' : '';
    card.querySelector('[data-v=bad]').className = v === 'bad' ? 'on-bad' : '';
    count();
  };
  card.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { state[i] = { ...(state[i] || {}), v: b.dataset.v }; save(); paint(); });
  card.querySelector('textarea').oninput = e => { state[i] = { ...(state[i] || {}), note: e.target.value }; save(); };
  card.querySelector('.img').onclick = e => e.currentTarget.classList.toggle('zoom');
  list.appendChild(card); paint();
});
function count() {
  const v = Object.values(state); const ok = v.filter(x => x.v === 'ok').length, bad = v.filter(x => x.v === 'bad').length;
  document.getElementById('count').textContent = `${ok} match · ${bad} problem · ${items.length - ok - bad} to check`;
}
document.getElementById('copy').onclick = async () => {
  const lines = items.map((it, i) => { const s = state[i] || {}; return `${it.ref}: ${s.v === 'ok' ? 'matches' : s.v === 'bad' ? 'PROBLEM' + (s.note ? ' - ' + s.note : '') : 'not checked'}`; });
  const txt = lines.join('\\n');
  try { await navigator.clipboard.writeText(txt); document.getElementById('copy').textContent = 'Copied'; } catch (e) { prompt('Copy these results:', txt); }
  setTimeout(() => document.getElementById('copy').textContent = 'Copy results', 1500);
};
</script></body></html>
"""
open(sys.argv[2], 'w').write(page.replace('__DATA__', data))
print('wrote', sys.argv[2], len(items), 'verses')
