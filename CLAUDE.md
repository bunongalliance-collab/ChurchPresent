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
