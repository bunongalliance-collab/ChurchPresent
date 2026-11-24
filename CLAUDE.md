# Church Tools: working rules

App: React + TypeScript + Vite in `app/`, Supabase backend, deployed to Vercel from the `main` branch of this repo.

## Git
- Commit only when the user asks. Push only when the user asks.
- Never commit `readings-*.txt` (the user's own files) or `supabase-config.js` (private).
- Commit messages end with the `Co-Authored-By` line used in the session.

## Database
- Never run SQL against the database. Write the migration as a file in `supabase/` and tell the user to run it in the Supabase SQL editor.
- Never sign in for the user or enter passwords. Ask the user to sign in.

## Design rules
- Show a sample page first when the user asks for a design change. Publish samples as artifacts.
- Navbar: Lyric, Readings, Program, Scripture, Presentation Builder, Presentations, Projector, Notes, Thumbnail, Team. A church switcher sits next to the brand when the signed-in account belongs to a church. The navbar sits full width above each page, and every page uses the same width (max 1280px, same side margins), except Lyric, Readings and Scripture, which use the full window width (16px side margins).
- Light mode is the default. Use the colour tokens in `index.css`. Don't hard-code colours in UI components. Dark mode must still work.
- The brochure PDF is set in serif throughout, with burgundy only for headings and small accents. The PDF and the on-screen program use the same type scale.
- Capitalise names in the program (each word starts with a capital).

## Lyric slide rules (Lyric page: preview, thumbnails, projector and PowerPoint all follow them)
- 16:9 slide, scaled proportionally on every device. Padding is 10 px on every side (8 pt on the 960 pt slide, `SLIDE_PAD` in CSS), the same as Scripture and Readings slides, plus a 24 pt band at the bottom for the section label.
- Font is a fixed 70 pt (a manual size, if chosen, is also fixed). Left-aligned. Never shrink the font to fit.
- The lines of a verse flow together as one paragraph. Words wrap naturally across the full width. Never add a line break when the next word fits. Breaks stay only between verses and sections, which each get their own slides.
- The text always starts at the top of the padded area (short verses are not centred).
- If the next row would pass the bottom of the padded area, continue on a new slide at the same size and padding. Break at the end of a lyric line when one is available, otherwise at a word boundary. Never split a word, clip text or leave text out.
- The last slide of a verse never holds a single row (at least two).
- Line spacing is 1.15 (fits every Vietnamese mark in Arial and Times New Roman). Verdana is 1.22, Georgia and Calibri 1.3, because their tallest accent plus deepest descender is taller.
- The section label (V1, C) is 16 pt and sits in the label band, 10 px from the right and bottom edges, never over the lyrics.
- "Fit verses on one slide" (in Slide Appearance) picks the biggest size, down to 36 pt, at which every verse of the song fits on one slide. It sets a manual size.
- Keep every word, accent and diacritic. Keep the existing colours and theme.
- Tests: `app/src/lib/slides.test.ts` (run `npx vitest run`) covers word and accent preservation, fixed size, flowing paragraphs, top start, filling the height, tail rule, wide words and the fit size.
- Code: `lyricSlides` in `app/src/lib/slides.ts` (used by `buildDeck` with `fill`), the preview and thumbnails in `pages/LyricsV2.tsx`, the projector in `pages/Projector.tsx` (`align` and `top` on a slide), and the PowerPoint export in `downloadPptx`.

## Slide fill rule (Scripture, Readings and Lyric slides: preview, thumbnails, projector)
- Text starts 10 px below the top edge, with 10 px on the left and right. It fills downward; a row that would not fit goes to the next slide.
- The bottom limit is 10 px above the bottom edge, or above the band for the reference (Scripture, 60 pt) or the section label (Lyric, 24 pt).
- Code: `layoutPassage` and `lyricSlides` in `app/src/lib/slides.ts` (`SCRIPTURE_BOX_H`, `READING_BOX_H`, `LYRIC_BOX_H`), `SCRIPTURE_PAD_BOTTOM` and `LYRIC_PAD_CSS` for the CSS padding.

## Verification before saying a change is done
- Check UI changes in the browser at desktop and phone width. Check the active, hover and selected states.
- For the program PDF, generate it and read the file back. Check that content fits on the two pages.
- Run `npx tsc -b` from `app/` before reporting that code compiles.
- Say clearly what was not tested.

## Code notes
- The PDF is built in `app/src/lib/programPdf.ts` with pdf-lib. Fonts live in `app/public/fonts`.
- The thumbnail engine is ported in `app/src/lib/thumbnail.ts`. It is untyped by design.
- Before editing a file, read it first. Make small, targeted edits.

## Project overview (for new sessions)
"The church app" means this project: a church presentation tool for Montagnard Bunong Alliance Church.

### Pages and routes (hash routes in `app/src/App.tsx`)
- `/` (no hash, or `#home`): Home page listing the apps (Nau Mpro, Nau Brah Ndu Ngơi, Church Tools). `pages/Home.tsx`. "Church Tools" in the navbar links here.
- `#lyrics-v2` (and `#lyrics:<songId>` from the Builder; unknown hashes): Lyric. Songs, slides, projector deck. `pages/LyricsV2.tsx`. The installed team app starts here.
- `#readings-v2`: Readings. `pages/ReadingsV2.tsx`
- `#program`: Service program editor and PDF. `pages/Program.tsx`, `lib/programPdf.ts`. The Order of Worship is edited in a table above the brochure (`components/OrderTable.tsx`), and the brochure shows it as it prints.
- `#scripture`: Scripture slides. `pages/Scripture.tsx`
- `#service`: Service presentation. Slides for the whole service, built live from the Program's order (it stores nothing of its own). Preview, Present (uses the projector view), Print. `pages/ServicePresentation.tsx`, `lib/servicePresentation.ts`
- `#builder`: Presentation Builder. `pages/Builder.tsx`
- `#presentations`: Saved presentations list. `pages/Presentations.tsx`
- `#projector`: Projector output. `pages/Projector.tsx`
- `#notes`: Notes. `pages/Notes.tsx`
- `#team`: Team. Churches, roles (admin, editor) per church, join codes, invites, new churches accepted by a site admin (`app_admins`). `pages/Team.tsx`, `lib/church.ts`, `supabase/churches.sql`. Stage 2: songs, readings and reading categories have a `church_id` (`supabase/churches-songs-readings.sql`); the church's team edits them (`canEdit` in `lib/church.ts`, `can_edit_row` in SQL), reading stays public, the hymn book (no owner) is shared. Stage 3: presentations, scripture studies and saved people have a `church_id` (`supabase/churches-team-work.sql`), readable and editable by the church team; saved people are no longer public. Programs are shared: one per church per date in `programs` (`supabase/programs.sql`); the Program page's program bar (`components/ProgramBar.tsx`, `useSharedProgram` in `lib/programs.ts`) loads it into the local draft (which Service Slides reads) and saves 1.5 s after typing, with a notice when someone else changed it. Stage 4: published services have a `church_id` (`supabase/churches-services.sql`), one per church per date, published by the church's admins only. The Nau Mpro App has no sign-in: it asks once which church (`readerChurch` in `lib/publishedService.ts`; picked automatically when there is only one) and shows that church's service to anyone.
- `#thumbnail`: Sermon thumbnail maker. `pages/Thumbnail.tsx`, `lib/thumbnail.ts`
- `/nau-brah-ndu-ngoi/` (its own installable page, like `/scripture/` and `/nau-mpro/`; linked in the navbar as "Nau Brah Ndu Ngơi ↗"; the old `/bible/` only redirects here): Bunong Bible reader. Reads `bible_verses` and `bible_headings` (translation `bunong-vn`), saves each opened book in IndexedDB for offline reading. Highlights, saved verses and notes stay on the device. `app/nau-brah-ndu-ngoi/index.html`, `public/nau-brah-ndu-ngoi/` (manifest and icons), `src/bible/`. Own styles in `src/bible/bible.css` (design approved from `bible-pwa/sample/index.html`).
- Old `pages/Lyrics.tsx` and `pages/Readings.tsx` still exist in code but are not linked in the navbar.

### Database (Supabase)
- `lyric_songs`, `readings`, `reading_categories`, `scripture_studies`, `presentations`, `saved_people`.
- Migrations live in `supabase/*.sql`. Each one is run by the user, never by Claude.
- Public read on songs, readings and saved people. Writes are limited to the signed-in owner.

### Browser storage and accounts
- Work the app keeps in the browser (slideshow list, recent items, drafts, favourites, notes, projector deck) belongs to one account. `lib/accountData.ts` sets it aside when a different account (or nobody) signs in on the same browser and brings it back on that account's next sign-in. Add any new browser key that holds account work to its `KEYS` list.
- The Program page only turns its browser draft into a program for the account and church that made it (`programDraftOwner`).

### Key files
- `app/src/components/NavBar.tsx`: navbar links and the Light/Dark button.
- `app/src/index.css`: all styles, including the colour tokens at the top.
- `app/src/lib/programPdf.ts`: builds the two-page program PDF.
- `app/src/lib/slides.ts`, `lib/richtext.ts`: slide layout and formatting.
- `app/public/fonts/`: fonts used by the PDF.

### Open items
- Saved people table: the SQL file exists, and the user has run it.
- Program PDF: the Order of Worship layout is being refined. Check the latest PDF before changing it again.
- The original `churchApp/index.html` thumbnail page has been ported to `#thumbnail`.
