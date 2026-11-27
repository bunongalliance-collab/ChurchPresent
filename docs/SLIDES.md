# Slides: how text is laid out

This describes how lyric and scripture text becomes slides in the church app. The same layout is used by the slide preview and by Present (the projector view).

## Where the code lives

- `app/src/lib/slides.ts`: the layout engine (wrapping, fitting, splitting into slides).
- `app/src/pages/LyricsV2.tsx`: the Lyric page, its Slide Appearance panel, and the slide preview.
- `app/src/pages/Scripture.tsx`: the Scripture page, its settings, and the slide preview.
- `app/src/pages/Projector.tsx`: draws each slide full screen (Present).

## Shared rules

- **One font size per song or passage.** The chosen size is used on every slide. Text is never shrunk on one slide to make it fit.
- **Automatic size is capped at the recommended 58 pt.** Pick a manual size, or use the "Recommended 58 pt" link, to set it directly.
- **Padding is 0.8% of the slide width** (about 10 px on the projector), on every side. Preview and Present use the same value.
- **Text is measured in the browser** with the chosen font, so line breaks match what is shown. A small safety margin (3% of the width) stops lines wrapping late.
- **Words are never cut, repeated, or reordered.** Overflow continues on the next slide, in order.

## Lyric slides (singing)

- **Lines are kept whole.** A lyric line is one phrase. It is only split at a colon, or after a sentence end (`.`, `!`, `?`, with an optional closing quote). Commas do not split a line.
- **Sections:** each verse and each chorus is one section, separated by blank lines or labels. A section stays on one slide when it fits.
- **Repeats are kept.** "Remove repeated text" does not apply to singing slides, so every chorus is shown.
- **The "Plõ mpro" marker is not shown.** It is only a verse marker, and it is matched with or without accents (for example "Plõ mprõ"). It ends the section above it and is not printed on the slide.
- **Fitting:** if a section is too tall at the chosen size, line spacing is tightened down to 1.1. If it is still too tall, the section is split at a phrase boundary, at the same font size.

## Scripture slides (passages)

- **Words wrap at word boundaries** to the slide width. A word moves to the next line if it would go past the edge.
- **As many lines as fit** on each slide, based on the height that is left after the padding and the reference band. There is no fixed "lines per slide" limit.
- **Reference band:** the verse reference is shown in a band at the bottom of every slide of the passage. The text area leaves room for it.
- **Superscript verse numbers** get a little extra room per line, so the last line is never cut off.
- **Too-wide words:** if a single word is wider than the slide at the chosen size, a warning appears in Presentation Settings. The font is not shrunk automatically. Reduce the size yourself.

## Checks

- Count the words on all slides and compare them with the source text. Nothing should be missing or repeated.
- Open Present and step through the slides. No text should touch the edges, and the reference should be visible.
- Change the font size. The text should re-flow, with the same size on every slide.

## Known gaps

- **PowerPoint export** (`app/src/lib/pptx.ts`) still uses its own sizing and padding. It can differ from the screen.
- **Lyric slides** have not been checked as carefully in Present as scripture slides.
- **Sentence-aware breaks** for scripture are not done. A slide can end in the middle of a sentence when it is full.
- **Fonts:** if the browser has not loaded the chosen font yet, line breaks can be measured with a fallback font. Re-measuring after the font loads is not done.
