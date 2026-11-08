# Church Tools: how the app works

This guide describes every page, how they connect, where data is stored, and how to set up and deploy the app.

## 1. Overview

Church Tools is one React app with these pages:

| Page | Address (hash) | Purpose |
|---|---|---|
| Lyrics | `#` (default) | Write and save songs, check their slides, add them to a presentation |
| Scripture | `#scripture` | Fetch Bible passages, build scripture slides, save studies |
| Presentation Builder | `#builder` | Combine saved songs, scripture and custom slides into one presentation |
| Presentations | `#presentations` | List, open, present, download, duplicate and delete saved presentations |
| Notes | `#notes` | Personal notes, stored in the browser |
| Projector | `#projector` | Full-screen slide display for the service |

Every page except the projector shows the same top navigation bar. The current page is highlighted, and sign-in and sign-out are in the bar on the right.

The app runs in the browser. Saved songs, studies and presentations are stored in a Supabase database and are private to each signed-in user, except that saved songs can be read by anyone (see section 7). Some working data (the current unsaved song, scripture or presentation) is kept in the browser tab, so moving between pages does not lose it.

## 2. Navigation and sign-in

- **Navigation bar:** links to every page. Pages with extra data after a colon, such as `#builder:<id>` or `#lyrics:<id>`, still highlight their page.
- **Sign in:** click **Sign in**, enter an email and a password (at least 6 characters), then **Sign in**. Use **Create account** the first time. Email confirmation may be needed.
- **Sign out:** shown next to your email once signed in.
- Saving, deleting, and adding to a presentation need you to be signed in. Reading public songs does not.

## 3. Lyrics page

**Purpose:** write a song, check the slides it makes, save it, and add it to a presentation.

**Layout (two columns):**
- **Left (editor):** saved song dropdown, action buttons, song title and number, the lyrics box, and **Slide Appearance**.
- **Right (preview):** the selected slide large, Previous and Next buttons, and a grid of thumbnails three rows tall that scrolls down.
- **Header:** **Open Projector** and **Download PowerPoint**.

**Actions:**
- **Choose a saved song…** loads a song. Songs already in the presentation show a check mark.
- **Save Song:** saves the title, number, lyrics and appearance to your account (or to this browser if you are not signed in).
- **Next Song:** saves the current song, then clears the form for a new one.
- **+ Add to Presentation:** saves the song and lists it under "Added this session". It shows a green message, and the button changes to "✓ Added" for 2 seconds, then "✓ In presentation". Songs you add appear in the Presentation Builder's Recent songs. **Open Presentation Builder** is in the list box.
- **More → Delete song:** deletes the selected saved song after confirmation.
- **Back to Presentation Builder:** appears when you opened the song from the builder with **Edit formatting**.

**Writing lyrics (the parser):**
- Section labels such as `[Verse 1]`, `Verse 2`, `[Chorus]`, `Bridge 1`, `Pre-chorus`, `Intro`, `Outro`, `Tag`, `Ending`, `Refrain` start a new section. A blank line also ends a section.
- Shortcuts: typing `v1`, `c2` or `b1` on its own line becomes `Verse 1`, `Chorus 2`, or `Bridge 1`.
- A line such as `Title, …` or `Number, …` (or `#90`) fills the title and number boxes and is removed from the lyrics.
- Long lines are split into phrases of about 8 words. Sections longer than the lines-per-slide setting are split over several slides, and the last slide of a section keeps at least 4 words.
- Remove repeated text (option) removes runs of 6 or more repeated words, and repeated sections.

**Slide Appearance** (collapsed by default; the summary shows font, lines and size):
- **Typography:** font (Arial, Verdana, Calibri, Georgia), maximum lines per slide (2–6), and font size. Size is **Automatic** by default. **Manual** enables a slider from 20 to 200 pt.
- **Colors:** background and text colour.
- **Display:** add a title slide, show section labels (V1, Chorus), remove repeated text.
- A warning appears under the status line if the text may not fit the slide at this size.

**Slide labels:** verses show `V1`, `V2` and so on, faded. Choruses show `Chorus`.

## 4. Scripture page

**Purpose:** fetch Bible passages, arrange them with custom and question slides, format them, and save the study.

**Top bar:** title field, saved studies dropdown, **Save**, **Add to presentation**, **New**, **More** (Duplicate, Delete), **Present** (primary), **Download .pptx**.

**Presentation Settings** (collapsed by default, summary line shows shape, font, size and lines). When open, four groups:
- **Layout:** shape (16:9 or 4:3) and lines per slide.
- **Typography:** font and font size (blank means automatic).
- **Colors:** background, text, verse number and title colours.
- **Display:** show verse numbers, show slide labels.

**Three columns:**
1. **Edit slide (left):**
   - For passage slides: **Bible version** radio buttons (Bunong, Vietnamese, English by default), **Manage versions** (add or remove versions by their YouVersion ID), the **passage picker** (book from the list, chapter, first and last verse), **Fetch passage**, and the slide label.
   - For custom and question slides: the slide title.
   - All slides: the text box (one verse or line per row) and a formatting toolbar (bold, italic, underline, text colour, reset).
   - **Fetch passage** asks before replacing text only if you edited the text by hand since the last fetch.
2. **Slides (middle):** the ordered slide list. **+ Passage**, **+ Custom**, **+ Questions** add slides. Each slide has a ⋯ menu with **Move up**, **Move down**, **Copy** and **Remove**. The selected slide has a green edge.
3. **Preview (right):** cards for the selected slide, one per output slide. Click a card to select it. Previous, Next and a counter sit below.

**Typed references:** under **Or type a reference** (on older layouts) English book names work, such as `John 3:16-18`. The picker uses book codes, so it works in every language.

**Saving:** signed in, **Save** stores the study. **Add to presentation** saves it and opens the Presentation Builder, where it appears under Recent scriptures.

**Bible text:** each verse is requested from the YouVersion API through the app's own server function (`/api/yv`), so the API key stays on the server (see section 8).

## 5. Presentation Builder

**Purpose:** build one presentation in order, from songs, scripture and custom slides.

**Top bar:** presentation title, saved presentations dropdown, **Save**, **New**, **Duplicate**, **Delete**, **Present** (primary), and the sign-in status.

**Left column:**
- **Recent songs:** the 8 most recently saved songs. **Add** puts a song in the presentation. Its formatting (font, colours, size, lines per slide) comes with it.
- **Recent scriptures:** the 8 most recent scripture studies. **Add** puts the study in, with its formatting.
- **+ Custom slide:** adds a custom slide at the end.

**Middle column (Presentation order):** each item shows its position number, its type (Song, Scripture, Custom), and a title. Buttons:
- **↑ / ↓** move the item.
- **+ above** inserts a custom slide above it.
- **Edit formatting** (songs) opens the song on the Lyrics page. **Back to Presentation Builder** returns you here.
- **Refresh** (appears when the library song has changed) updates the item from the library.
- **Remove** deletes the item.

**Right column (Preview):** cards for the selected item's slides. With nothing selected, cards show the whole presentation. For a custom slide, the editor below the preview changes its title and text. Other settings there are the font, lines per slide, and labels for the presentation's own look.

**Working copy:** the unsaved presentation is kept for this browser tab, so moving to another page and back keeps it. Closing the tab clears it. **Save** stores it in your account.

## 6. Presentations page

**Purpose:** manage saved presentations.

- **Recently modified:** the five most recent presentations.
- **All presentations:** search by title, sort by last modified or name.
- **Columns:** title, last modified, number of songs, scripture studies, custom slides, and total slides.
- **Actions:** **Open in Builder** (restores the whole presentation), **Present** (sends the slides to the projector), **Download .pptx**, **Duplicate** (independent copy), and **Delete** (after confirmation).
- **Empty state:** explains what a presentation is and offers **Create a presentation**.

## 7. Projector page

- Opened from **Present**, **Open Projector**, or **Open projector view**. It reads the slides saved in the browser for the projector and shows one slide at a time at full screen (16:9 stage).
- **Keys:** Right arrow, Down arrow, Space or Enter go to the next slide. Left arrow, Up arrow or Backspace go back. **Home** and **End** jump to the first and last slide. **B** blanks the screen (press again to show). **F** toggles full screen.
- **Mouse:** clicking the slide goes to the next one.
- The counter at the bottom right shows position (for example `3 / 17`).

## 8. Notes page

- A simple list of notes with a title and text. **New note** adds one, **Delete note** removes the selected one.
- Notes are stored in this browser only, so they are not synced between devices. They work offline.
- The first note explains how offline use works.

## 9. Data and the database

Supabase (PostgreSQL) holds the data. Row-level security makes each user see only their own rows, except the public reading of songs.

| Table | Contents | Who can read |
|---|---|---|
| `lyric_songs` | title, song number, lyrics, saved look (formatting) | Everyone (for the song list); changes only by owner |
| `scripture_studies` | study title, reference, the study data (slides and look) | Owner only |
| `presentations` | presentation title and its data (ordered items and settings) | Owner only |

Run these files in the Supabase SQL editor, in this order (each one is safe to run twice):

1. `supabase/schema.sql`: creates the tables for a new project and the owner-only rules.
2. `supabase/public-read-lyrics.sql`: lets everyone read saved songs.
3. `supabase/scripture-studies.sql`: the scripture studies table.
4. `supabase/presentations.sql`: the presentations table.
5. `supabase/lyric-look.sql`: adds the saved formatting column for songs.

Local (browser) storage is used for: notes, the Bible versions list, default scripture look, the projector's slides, and the offline cache. Session storage holds working drafts for each browser tab.

## 10. Offline use

- The app is a progressive web app. Once it has loaded online, its pages and code are cached, so they open without the internet.
- Saved songs, presentations and scripture studies are cached when they are loaded. The last loaded copy is shown offline.
- Bible verses are cached after they are fetched once.
- Presenting works offline, because the projector reads its slides from the browser.
- **Not offline:** saving, deleting, signing in, and fetching a passage for the first time. Changes made offline are not queued.

## 11. Setup

**Local development**

```bash
cd churchApp/app
npm install
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173`.

**Settings file:** create `churchApp/app/.env.local` (never commit it):

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon public key>
YV_APP_KEY=<your YouVersion key>
```

- The two `VITE_` values are read when the app is built, so restart the dev server after changing them.
- `YV_APP_KEY` is used only on the server. It is never sent to the browser.

**Deployment (Vercel)**

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `app`. Leave "Include files outside the root directory" unchecked.
3. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `YV_APP_KEY` under Environment Variables, for Production.
4. Deploy. After any change to the environment variables, redeploy.

The Bible function is in `app/api/yv.js` and runs as a Vercel function.

**Checks:** `npm run build` runs the TypeScript check and the production build. There are no automated tests yet.

## 12. Folder guide

| Path | What it is |
|---|---|
| `app/src/pages/` | One file per page: `Lyrics.tsx`, `Scripture.tsx`, `Builder.tsx`, `Presentations.tsx`, `Notes.tsx`, `Projector.tsx` |
| `app/src/components/NavBar.tsx` | Navigation bar and sign-in |
| `app/src/lib/slides.ts` | Shared slide engine (splitting lyrics into slides, sizing, formatting rules) |
| `app/src/lib/pptx.ts` | Shared PowerPoint export |
| `app/src/lib/supabase.ts` | Supabase connection |
| `app/src/index.css` | All styles (sections are labelled) |
| `app/api/yv.js` | Bible server function |
| `app/vite.config.ts` | Build settings, offline setup, and the local Bible proxy for development |
| `supabase/` | Database SQL files (section 9) |
| `docs/` | Documentation, including this guide and the formatting list |

The older HTML pages in `churchApp/` (such as `index.html`, `lyrics.html`, `projector.html`) are no longer used. They are not part of the published site.

## 13. Known limits

- **Reordering:** only the up and down buttons. Drag and drop is not built.
- **Text formatting:** bold, italic, underline and colour apply to a whole slide. Formatting selected words is not built.
- **Alignment:** centred text only.
- **Per-slide background:** each song or scripture item has its own background, but a single slide cannot differ within an item.
- **Projector shape:** the projector always shows 16:9. A 4:3 choice affects the scripture preview and the PowerPoint output.
- **Offline changes:** saving while offline is not queued.
- **Copyright:** song lyrics and Bible text may be licensed. Check your church's licence before showing them publicly, including on the public website.
- **Preview sizing:** the builder's preview uses a fixed text size. The projector and PowerPoint use the size you set.
