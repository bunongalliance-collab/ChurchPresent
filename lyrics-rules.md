# Lyrics to Slides: Rules

These are the rules the lyrics page (`lyrics.html`) follows when it turns pasted lyrics into slides.

## 1. Title and number

- A line starting with `Title:` or `Title,` fills the **Song title** box.
- A line like `Number: 3`, `Number, 90`, `#90`, or `Number #90` fills the **Song number** box.
- These lines are removed from the lyrics, so they are never sung or shown as lyrics.
- The title and number boxes take priority over these lines.
- A line is only read once it is finished (the cursor has moved below it), so a title is not taken mid-typing.
- A title slide is made from the title and `#number`. It is the first slide.

## 2. Sections and labels

- A **section** is a verse, chorus, bridge, or any block of lyrics.
- A new section starts at a **label line** or after a **blank line** that follows lyrics.
- Label lines can be written any of these ways:
  - `[Verse 1]`, `Verse 1`, `v1`, `V1`
  - `[Chorus]`, `Chorus`, `c1`, `Chorus 2`, `Plõ mpro`, `Plo mpro` (Bunong for chorus)
  - `Bridge 1`, `b1`, `Pre-chorus`, `Intro`, `Outro`, `Tag`, `Ending`, `Refrain`
- Typing `v1`, `c2`, or `b1` on its own line expands to `Verse 1`, `Chorus 2`, or `Bridge 1` as you type.
- A label applies to the lyrics after it, even if a blank line sits between the label and the lyrics.
- Slide labels:
  - Verses show `V1`, `V2`, and so on, in the bottom-right corner. They are faded (about 65% opacity on screen, 35% transparency in the file).
  - Choruses show the word `Chorus` (no number).
  - Other labels show their short form (`B1`, `PC`, `I`, `O`, `T`, `E`).
- The "Show section labels" checkbox turns labels on or off.

## 3. Repeats

- Repeated text is **kept** by default.
- The "Remove repeated text" checkbox removes repeats instead:
  - A run of 6 or more identical words in a row keeps only the first copy.
  - A later section with the same text as an earlier one is dropped (single-line sections are kept).
- Words are compared without case or punctuation, so `toy,` and `toy` match.

## 4. Font size

- **Automatic (blank box):** the size is set so 4 rows fit down the slide, and the longest single word fits across it. The same size is used for the whole deck.
- **Typed size:** any size in points is used, and it can be bigger than the automatic maximum of 84. A warning appears if the text is likely to run off the slide.

## 5. Laying out the rows

- Each **row** is filled with as many words as fit across the slide, inside the margins. The next word starts a new row when the current one is full.
- Each slide has at most the **Maximum lines per slide** (default 4) rows.
- **A section that fits in those rows stays on one slide.** Example: a 4-line verse that fits stays together.
- **A longer section is split into slides with the rows shared evenly**, not inside a row:
  - Rows are never split mid-word, and a row never holds more words than fit the width.
  - No row is left with a single word in the middle of a section.
- **The last slide of a section must have at least 4 words.** If it would have fewer, the missing words are moved from the end of the slide before it.
- A single word at the very end of a section is allowed only if the 4-word rule above still holds.

## 6. Text

- Accented letters (for example Bunong and Vietnamese-style letters) are kept as typed.
- Commas and periods are used as places to break lines. Phrases shorter than 6 words are merged with a neighbour from the same lyric line, up to 8 words.

## 7. Saving, downloading, and the projector

- **Save song** stores the title, number, and lyrics in this browser. **Next song** saves and clears the box.
- **Download PowerPoint (.pptx)** makes a widescreen file with one slide per slide shown in the preview.
- **Open projector view** opens `projector.html` with the same slides. Keys:
  - Right arrow, Space, or click: next slide
  - Left arrow or Backspace: previous slide
  - B: blank the screen
  - F: full screen
  - Home / End: first or last slide
