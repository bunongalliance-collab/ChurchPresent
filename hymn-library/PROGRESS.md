# Hymnal transcription progress

Source images: `~/Downloads/nau mpro pages/page-N.png` (songs on page-7 … page-544).

## Workflow per batch (≈20 pages)
1. Read each page image.
2. Append songs to `data/src/batch-NNNN.src` (format documented at top of `build_batch.py`).
3. `python3 build_batch.py data/src/batch-NNNN.src` → `data/batches/batch-NNNN.json` + `lyrics/batch-NNNN.txt`
4. `.venv/bin/python build_scores.py data/batches/batch-NNNN.json` → `scores/hymn-NNNN.pdf` + `images/` crops
   - shared pages: add `X: page:left,top,right,bottom` crop lines (image is 1142×1615).

## Rules (from the user)
- One record / one page per song; join sections across pages.
- "Plō mprō" marks the chorus; short words before it stay in the verse.
- Chorus repeated after every verse when the song has one; no chorus invented.
- Keep A-MEN as printed, once at the end of the song (`A:` line, or written in the last verse).
- Preserve spelling/accents; flag unclear things in `N:` notes.
- Lower-part echo words are not added to the lyrics (noted instead).

## Status (all pages done)
- Pages 7–544 transcribed in 42 batches → `data/hymns.json` (520 songs, numbers 1–520, none missing) and `lyrics/all-lyrics.txt`.
- 520 score PDFs in `scores/`, crops in `images/`.
- Re-run `python3 merge.py` after any edit to a `data/src/*.src` file + `build_batch.py`/`build_scores.py` for that batch.

## Needs the church / a musician
- Lyrics for the 18 modern songs were added on the church's confirmation that it has permission (192, 237, 238, 242, 316, 375, 409, 411, 418, 436, 437, 452, 453, 456, 465, 466, 467, 518).
- Pages missing from the scan: 263 (only refrain), 288 (page reprints 228). Also printed page 429 is absent, and page-84 duplicates page-83.
- Layout reconstructed, needs a musician: 99, 109, 135, 150, 241, 269, 499.
- Many other songs carry smaller 'check' notes (spellings as printed, echo words left out).
