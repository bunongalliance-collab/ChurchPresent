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
- Navbar: Lyric, Readings, Program, Scripture, Presentation Builder, Presentations, Projector, Notes, Thumbnail. The navbar sits full width above each page, and every page uses the same width (max 1280px, same side margins).
- Light mode is the default. Use the colour tokens in `index.css`. Don't hard-code colours in UI components. Dark mode must still work.
- The brochure PDF is set in serif throughout, with burgundy only for headings and small accents. The PDF and the on-screen program use the same type scale.
- Capitalise names in the program (each word starts with a capital).

## Lyric slide rules (Lyric page: preview, thumbnails, projector and PowerPoint all follow them)
- 16:9 slide, scaled proportionally on every device. Safe-area padding is 4% on each side (4% of the width left and right, 4% of the height top and bottom).
- Font is a fixed 70 pt (a manual size, if chosen, is also fixed). Left-aligned. Never shrink the font to fit.
- The lines of a verse flow together as one paragraph. Words wrap naturally across the full width. Never add a line break when the next word fits. Breaks stay only between verses and sections, which each get their own slides.
- After wrapping, if the text uses less than half the safe area's height, centre it vertically. A longer block starts at the top of the safe area.
- If the text would pass the bottom of the safe area, continue on a new slide at the same size and padding. Break at the end of a lyric line when one is available, otherwise at a word boundary. Never split a word, clip text or leave text out.
- The last slide of a verse never holds a single row (at least two).
- Line spacing is 1.15 (fits every Vietnamese mark in Arial and Times New Roman). Verdana is 1.22, Georgia and Calibri 1.3, because their tallest accent plus deepest descender is taller.
- The section label (V1, C) is 16 pt and sits inside the bottom padding, never over the lyrics.
- "Fit verses on one slide" (in Slide Appearance) picks the biggest size, down to 36 pt, at which every verse of the song fits on one slide. It sets a manual size.
- Keep every word, accent and diacritic. Keep the existing colours and theme.
- Tests: `app/src/lib/slides.test.ts` (run `npx vitest run`) covers word and accent preservation, fixed size, flowing paragraphs, centring, tail rule, wide words and the fit size.
- Code: `lyricSlides` in `app/src/lib/slides.ts` (used by `buildDeck` with `fill`), the preview and thumbnails in `pages/LyricsV2.tsx`, the projector in `pages/Projector.tsx` (`align` and `top` on a slide), and the PowerPoint export in `downloadPptx`.

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
- `#` (default) and `#lyrics-v2`: Lyric. Songs, slides, projector deck. `pages/LyricsV2.tsx`
- `#readings-v2`: Readings. `pages/ReadingsV2.tsx`
- `#program`: Service program editor and PDF. `pages/Program.tsx`, `lib/programPdf.ts`
- `#scripture`: Scripture slides. `pages/Scripture.tsx`
- `#builder`: Presentation Builder. `pages/Builder.tsx`
- `#presentations`: Saved presentations list. `pages/Presentations.tsx`
- `#projector`: Projector output. `pages/Projector.tsx`
- `#notes`: Notes. `pages/Notes.tsx`
- `#thumbnail`: Sermon thumbnail maker. `pages/Thumbnail.tsx`, `lib/thumbnail.ts`
- Old `pages/Lyrics.tsx` and `pages/Readings.tsx` still exist in code but are not linked in the navbar.

### Database (Supabase)
- `lyric_songs`, `readings`, `reading_categories`, `scripture_studies`, `presentations`, `saved_people`.
- Migrations live in `supabase/*.sql`. Each one is run by the user, never by Claude.
- Public read on songs, readings and saved people. Writes are limited to the signed-in owner.

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
