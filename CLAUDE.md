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
