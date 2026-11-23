# Bible data

The Bunong Bible (Vietnam dialect), extracted from the printed PDFs into structured data for the church app.

- Source PDFs: `churchApp/Old/` (39 books) and `churchApp/New/` (27 books), one PDF per book. These stay the original source.
- Extracted data: `bunong-vn/<CODE>.json`, one file per book (GEN … REV).
- Validation report: `bunong-vn/REPORT.md`.
- Database import files: `../supabase/bible-import/`.

Totals: 66 books, 1,189 chapters, 31,105 verse numbers (31,094 rows, because 11 verses are printed together, e.g. "14-15"), 2,681 headings, 83 footnotes.

## Folder layout

```
bible-data/
  README.md              this file
  bunong-vn/             one JSON file per book + REPORT.md
  review/                by-eye review page (sample verses next to their PDF page)
  tools/
    extract.swift        reads the PDFs (macOS PDFKit, no extra installs)
    parse_all.py         builds bunong-vn/<CODE>.json
    report.py            writes REPORT.md
    checked.json         flags checked by hand, with notes (shown in REPORT.md)
    make_sql.py          writes the SQL import files
    review_pick.py       picks sample verses for the review page
    review_render.swift  renders their PDF pages with the verse marked
    review_build.py      builds review/index.html
```

## Regenerate everything

Run from `churchApp/bible-data`. `RAW` is any temporary folder for the extracted text.

```bash
RAW=/tmp/bible-raw && mkdir -p $RAW && swiftc -O tools/extract.swift -o $RAW/extract
```
```bash
$RAW/extract $RAW ../Old/*.pdf ../New/*.pdf
```
```bash
python3 tools/parse_all.py $RAW bunong-vn
```
```bash
python3 tools/report.py bunong-vn > bunong-vn/REPORT.md
```

`parse_all.py` prints one line per book (`OK` or `CHECK n`). Only books marked `CHECK` need looking at.

## Regenerate the import files

You can regenerate the import files at any time from `bible-data` with:

```bash
python3 tools/make_sql.py bunong-vn ../supabase/bible-import
```

It writes `01-…sql` to `11-…sql` (whole books, up to about 700 KB each) and a final `12-check.sql`.

## Importing into Supabase

Run these in the Supabase SQL editor, in order (Claude never runs SQL against the database):

1. `supabase/app-visits.sql` (already run): creates `app_admins`.
2. Add yourself as admin:
   ```sql
   insert into public.app_admins (user_id) select id from auth.users where email = 'YOUR_SIGN_IN_EMAIL' on conflict do nothing;
   ```
3. `supabase/bible.sql`: creates the tables, the 66 books and the `bunong-vn` translation row.
4. `supabase/bible-import/01-…sql` to `11-…sql`, one at a time. Each file runs as one transaction and replaces its own books, so it is safe to run again.
5. `supabase/bible-import/12-check.sql`: the first result should be empty; the second should read 66 books, 31,094 verse rows, 2,681 headings, 83 footnotes.

## Database tables (`supabase/bible.sql`)

| Table | Holds |
|---|---|
| `bible_translations` | One row per translation (`bunong-vn`). |
| `bible_books` | The 66 books: code, order, testament, English name. Shared by all translations. Codes match the Scripture page. |
| `bible_book_names` | Each translation's own book name (EXO → "Nau Ngluh") and printed title lines. |
| `bible_verses` | One row per verse: translation, book, chapter, verse, `verse_end` (for "14-15"), text, `para`. Search index on the text. |
| `bible_headings` | Section headings, psalm titles (`title`) and parallel references (`parallel`), placed before a verse. |
| `bible_footnotes` | Translation notes tied to a verse. |

Everyone can read. Only accounts in `app_admins` can change rows. Chapters come from the verses (no separate table).

## JSON format (one book)

```json
{
 "translation": { "id": "bunong-vn", "name": "Bunong Bible (Vietnam dialect)", "language": "Bunong" },
 "book": { "code": "EXO", "order": 2, "testament": "OT", "name": "Exodus", "local_name": "Nau Ngluh", "title_block": ["NAU NGLUH", "Y-Môis Chih"] },
 "source": { "file": "002. 02EXO.pdf" },
 "chapters": [{
   "chapter": 1,
   "headings": [{ "before_verse": 1, "type": "heading", "text": "Nau Rêh Ni Phung Israel Tâm N'gor Êjipt" }],
   "verses": [{ "verse": 1, "text": "Aơ jêng amoh …", "para": true }]
 }],
 "footnotes": [{ "chapter": 3, "verse": 20, "mark": "a", "text": "Nau ngơi Hebrơ H'Êvơ jêng nau rêh" }],
 "warnings": [{ "ref": "EXO 1:7", "issue": "space before punctuation" }]
}
```

## What the extraction handles

- Capital Ƀ is stored in the PDFs as a private character (U+F20A); it is mapped back to Ƀ.
- Pages are read column by column, with lines rebuilt by position (poetry verse numbers sit in their own gutter).
- Running headers, page numbers and the footnote band at the bottom of the page are removed from the text.
- Footnotes are kept separately; their letter is removed from the verse where it is printed.
- Headings are Title Case lines between verses; psalm titles are the sentence-case lines above verse 1.
- A leftover typesetting code (`****\q1****`, Job 34:37) is removed.

## Known points (see REPORT.md "Checked by hand")

- Verse numbering follows the printed Bible, which differs from English Bibles in places: Numbers 30, 1 Samuel 20/23/24, Job 38–41 (Vietnamese Bible numbering), Hosea 11–12, Micah 4–5, 2 Corinthians 13, 3 John, Revelation 12. The text is complete.
- 1 Chronicles 21:3 and 21:7 stop mid-sentence in the printed Bible itself. Kept as printed.
- 424 verses have a space before punctuation as printed (e.g. "rơ̆ ,"). Kept as printed.
- `para` (paragraph start) is a best guess from punctuation.
- YouVersion's "Bunong" (id 1657) is a different translation, so it cannot be used to check this text.

## Review

- 24 sample verses (8 chosen tricky cases, 16 random) were checked by eye against the PDF pages on 2026-11-22: all matched.
- To make a new sample, run from `bible-data` (needs `$RAW` from the steps above):
  ```bash
  python3 tools/review_pick.py $RAW bunong-vn review/sample.json && swift tools/review_render.swift .. review/sample.json review && python3 tools/review_build.py review/sample.json review/index.html
  ```
  Then open it with the `bible-review` entry in `app/.claude/launch.json` (serves `review/` at http://localhost:5180).
