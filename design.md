# Cloudflare — Style Reference
> sunrise on a blueprint. Lay crisp white engineering grids with hairline dashes, then break them open with full-bleed Cloudflare orange panels and a single white pill.

**Theme:** light

Source measurements are normalized; roles and recommendations are interpreted. Font summary lists are independent, not paired by position. HTML examples are reconstructions, not source components.

Cloudflare is a white-canvas infrastructure site drawn like a technical blueprint: a 1200px content column is fenced by 1px #f0f0f0 hairlines and dashed gutter rails, and almost everything inside is flat Paper with Graphite Ink #262626 type. That restraint lets Cloudflare Orange #ff5e1f land hard, as a 16px-rounded hero slab with a pale sunrise glow at its base, a solid orange feature panel, a pricing tab, and a closing call-to-action band. STK Bureau Sans runs the whole page at only 400 and 500, with tight -0.025em tracking on the 56px and 48px headlines, so statements read calm and engineered rather than loud; Apercu Mono Pro appears only inside agent and terminal demos. Buttons are 9999px pills, cards are near-square 3–4px boxes, and depth comes from borders, not shadows.

## Colors

| Name | Value | Role |
|------|-------|------|
| Cloudflare Orange | `#ff5e1f` | Hero slab, call-to-action band, sticky Start building pill, active pricing tab and the solid feature panel — one saturated orange carries the whole identity |
| Paper | `#ffffff` | Page canvas, cards and grid cells, the hero CTA pill, and all text set on orange |
| Graphite Ink | `#262626` | Headlines, navigation, body copy, footer links and line icons — a soft near-black instead of pure #000 |
| Hairline | `#f0f0f0` | Every 1px solid and dashed rule: grid cells, card frames, pill outlines, gutter rails and divider lines |
| Quiet Graphite | `#676767` | Section subheads, card descriptions and pricing subtitles; measured as Graphite Ink at 70% opacity |
| Tertiary Gray | `#727272` | Footer column headings, legal links and small helper text under prices |
| Pill Black | `#1f1f1f` | Label text on the white Start building for free pill inside orange panels |
| Ember Orange | `#ff7038` | Globe dot-map points and the View docs pill inside the orange band — a half-step lighter so it reads as orange on orange |
| Burnt Sienna | `#bf4c14` | Muted orange status text and loading dots in deploy and agent demos, where full orange would shout |
| Peach Wash | `#ffeee8` | Tinted version rows in the deploy list and mono agent-name chips — the 10% orange tint of the brand on Paper |
| Attack Crimson | `#b52831` | The Under attack? link and its shield icon in the header — the only red in the chrome |
| Alert Red | `#ed1641` | P0 incident pills in the problem collage, set on a 10% red tint |

## Typography

### STK Bureau Sans — The single voice of the page, from 56px headlines down to 13px footer headings, used only at 400 and 500. Headlines sit at 500 with 1.0 line-height and -0.025em tracking (-1.4px at 56px, -1.2px at 48px, -0.8px at 32px), so big claims stay quiet and engineered; body and nav run at 16px with 0 to -0.04px tracking.
- **Substitute:** Inter, Arial, sans-serif
- **Licence:** commercial; buy a licence from its foundry, or use the substitute
- **Weights:** 400, 500
- **Sizes:** 13px, 14px, 16px, 18px, 19.2px, 32px, 48px, 56px
- **Line height:** 1.00, 1.15, 1.20, 1.25, 1.50
- **Letter spacing:** -1.4px at 56px; -1.2px at 48px; -0.8px at 32px; -0.48px at 19.2px; -0.45px at 18px; -0.14px at 14px; 0 to -0.04px at 16px

### Apercu Mono Pro — Confined to product demos: agent names in Peach Wash chips, token counts and the terminal prompt. Set at 12px/400 with -0.24px to -0.48px tracking, it reads as live tooling output and never appears in marketing copy or labels.
- **Substitute:** IBM Plex Mono, Menlo, monospace
- **Licence:** commercial; buy a licence from its foundry, or use the substitute
- **Weights:** 400
- **Sizes:** 12px, 14px
- **Line height:** 1.20, 1.33
- **Letter spacing:** -0.24px to -0.48px at 12px; -0.56px at 14px

### Type Scale

| Role | Family | Weight | Size | Line Height | Letter Spacing |
|------|--------|--------|------|-------------|----------------|
| mono-label | Apercu Mono Pro | 400 | 12px | 1.2 | -0.24px |
| footer-heading | STK Bureau Sans | 500 | 13px | 1 | 0px |
| caption | STK Bureau Sans | 400 | 14px | 1.15 | -0.14px |
| body | STK Bureau Sans | 400 | 16px | 1.2 | -0.04px |
| nav | STK Bureau Sans | 500 | 16px | 1.5 | 0px |
| card-title | STK Bureau Sans | 500 | 18px | 1.2 | -0.45px |
| lede | STK Bureau Sans | 400 | 19.2px | 1.2 | -0.48px |
| quote | STK Bureau Sans | 500 | 32px | 1 | -0.8px |
| section-heading | STK Bureau Sans | 500 | 48px | 1 | -1.2px |
| display | STK Bureau Sans | 500 | 56px | 1 | -1.4px |

## Spacing & Layout

**Base unit:** 4px

**Density:** comfortable

- **Page max-width:** 1200px
- **Section gap:** 128px
- **Card padding:** 32px
- **Element gap:** 8px

### Border Radius

- **buttons:** 9999px
- **pills:** 9999px
- **hero-panels:** 16px
- **controls:** 8px
- **tags:** 6px
- **cards:** 4px
- **panels:** 3px

## Components

### Blueprint Header Bar
**Role:** Top-level site navigation

A 72px Paper bar with the orange cloud wordmark at left, centered STK Bureau Sans 16px/500 Graphite Ink links with 6px 12px padding and 6px radius, then an Attack Crimson #b52831 Under attack? link and Login and Contact sales 9999px outline pills (1px Hairline #f0f0f0, 6px 12px padding).

### Orange Hero Slab
**Role:** Primary landing introduction

Fill a full-width 1480px panel with Cloudflare Orange #ff5e1f, 16px radius and the white inset glass highlight. Center a 56px/500 Paper headline at 56px line-height and -1.4px tracking, a 19.2px/400 lede at -0.48px, and one Paper Pill Button; let a pale sunrise glow rise from the bottom edge.

### Announcement Outline Pill
**Role:** Event or release link above the hero headline

A transparent 9999px pill with a 1px rgba(255, 255, 255, 0.5) border on Cloudflare Orange, Paper STK Bureau Sans 16px/500 text at 20px line-height, and a trailing white circle holding an orange arrow.

### Paper Pill Button
**Role:** Primary call to action on orange

Paper #ffffff fill and 1px #ffffff border, Pill Black #1f1f1f label in STK Bureau Sans 16px/500 at 24px line-height, 9999px radius and 12px 24px padding for a 50px height. No shadow.

### Cloudflare Orange Pill Button
**Role:** Sticky header and on-white primary action

Cloudflare Orange #ff5e1f fill with a matching 1px border, Paper 16px/500 label at 24px line-height, 9999px radius and 6px 12px padding for a 38px height. Inside orange bands use the Ember Orange #ff7038 variant at 12px 24px.

### Hairline Outline Pill
**Role:** Secondary header and plan actions

Transparent fill with a 1px Hairline #f0f0f0 border, Graphite Ink #262626 16px/500 label, 9999px radius and 6px 12px padding. Used for Login, Contact sales and the See plan links under each pricing column.

### Feature Grid Cell
**Role:** Three-up capability explanation

A Paper cell with 32px padding divided from its neighbours by a 1px Hairline #f0f0f0 left rule, no radius and no shadow. Stack a thin line icon, an 18px/500 Graphite Ink title at -0.45px tracking, and 16px/400 Quiet Graphite #676767 copy at 1.2 line-height.

### Dashed Bracket Callout
**Role:** Annotation on diagrams

A 240px rgba(255, 255, 255, 0.8) box with a 1px dashed Cloudflare Orange #ff5e1f border, 12px padding, square corners and solid orange corner brackets; set 16px/400 Graphite Ink copy inside.

### Logo Tab Strip
**Role:** Customer testimonial selector

A row of 16px/400 Graphite Ink tabs with brand marks, 16px 12px padding and no radius; the active tab gets a 2px solid Cloudflare Orange #ff5e1f bottom border. The quote below is STK Bureau Sans 32px/500 at 32px line-height and -0.8px tracking.

### Orange Statement Panel
**Role:** Half-width feature contrast block

A Cloudflare Orange #ff5e1f panel with 48px padding, square corners and the white inset glass shadow, holding a centered 48px/500 Paper heading and a translucent rgba(255, 255, 255, 0.05) status chip with an 8px radius and a dashed white rule.

### Segmented Pricing Tab
**Role:** Product family switcher

A 9999px pill group of 16px/500 tabs at -0.16px tracking with leading line icons; the active tab fills Cloudflare Orange #ff5e1f with Paper text, inactive tabs are Graphite Ink on transparent.

### Pricing Column
**Role:** Plan summary in a four-column grid

A Paper column with 32px padding and a 1px Hairline #f0f0f0 right rule. Stack a 16px/500 plan name, a Quiet Graphite tagline, a 32px/500 price with a 14px Tertiary Gray suffix, 6px-radius dashed Hairline feature tags (4px 10px padding), and a Hairline Outline Pill.

### Deploy Status Card
**Role:** Live product demo tile

A Paper card with a 1px Hairline #f0f0f0 border and 4px radius listing build rows on Peach Wash #ffeee8 in Cloudflare Orange 16px/500 text, each ending in a Building spinner or Deployed check that fades down the list.

### Agent Terminal Card
**Role:** AI agent product demo

A Paper card with a 4px radius inside the Ember Halo Card shadow. Use Apercu Mono Pro 12px/400 at -0.48px tracking in 9999px Peach Wash chips (2px 6px padding), Burnt Sienna #bf4c14 status lines, and a Cloudflare Orange 8px-radius Enter button.

### Orange Closing Band
**Role:** Final call to action

Repeat the 16px-radius Cloudflare Orange slab with floating translucent icon tiles, a 56px/500 Paper headline, a Paper Pill Button beside an Ember Orange pill, and a bottom ticker of 16px/500 Paper benefit lines with small line icons.

### Link Column Footer
**Role:** Site-wide link directory

A Paper footer with the wordmark at left and four link columns: 13px/500 Tertiary Gray #727272 headings over 16px/400 Graphite Ink links with 8px 0 padding. Legal links run at 14px/400 Tertiary Gray separated by thin dividers.

## Do's and Don'ts

### Do
- Use Paper #ffffff as the canvas and frame the 1200px content column with 1px Hairline #f0f0f0 solid rules and dashed gutter rails.
- Set headlines in STK Bureau Sans 500 at 56px/56px with -1.4px tracking, and section headings at 48px/48px with -1.2px tracking.
- Reserve Cloudflare Orange #ff5e1f for full panels (16px-radius hero slab, CTA band, feature panel), the active tab and the sticky Start building pill.
- Use a Paper #ffffff 9999px pill with Pill Black #1f1f1f 16px/500 text and 12px 24px padding as the primary action on orange.
- Keep cards near-square at 3px or 4px radius with 32px padding and a 1px Hairline #f0f0f0 border instead of a shadow.
- Set supporting subheads in Quiet Graphite #676767 STK Bureau Sans 19.2px/400 with -0.48px tracking, centered under the heading.
- Apply the 0.2s cubic-bezier(0.19, 1, 0.22, 1) transition to colour, border and background changes on links, tabs and pills.

### Don't
- Do not set headlines in 600 or 700 weights; STK Bureau Sans stays at 500 even at 56px.
- Do not round cards to 12-24px; only the full-width orange hero slab and CTA band take 16px, everything else is 3-4px.
- Do not tint section backgrounds grey or cream; sections stay Paper #ffffff and are separated by Hairline #f0f0f0 rules.
- Do not use pure black for text or icons; use Graphite Ink #262626.
- Do not use Cloudflare Orange #ff5e1f as a text-link colour in body copy; it appears as fills, borders and the odd status label.
- Do not add grey drop shadows to cards; the only shadows are the white inset on orange panels and the rgba(255, 80, 10, 0.1) orange halo.
- Do not use Apercu Mono Pro for eyebrows or labels; keep it inside terminal and agent demos at 12px.

## Elevation

- **Orange Glass Panel:** `rgba(255, 255, 255, 0.2) 1px 6px 6px 0px inset, rgba(255, 255, 255, 0.35) 0px 0px 0px 0px inset, rgba(0, 0, 0, 0.02) 0px 4px 12px 0px, rgba(0, 0, 0, 0.02) 0px 0px 0px 0px, rgba(0, 0, 0, 0.03) 0px 2px 12px 0px`
- **Ember Halo Card:** `rgba(255, 80, 10, 0.1) 0px 4px 100px 0px, rgba(0, 0, 0, 0.02) 0px 0px 32px 0px, rgba(0, 0, 0, 0.03) 0px 2px 12px 0px`

## Surfaces

- **Paper** (`#ffffff`) — Page canvas, header, grid cells, cards and pricing columns.
- **Peach Wash** (`#ffeee8`) — Tinted deploy rows and mono agent chips inside demo cards.
- **Cloudflare Orange** (`#ff5e1f`) — Hero slab, feature panel, active tab and closing CTA band.
- **Ember Orange** (`#ff7038`) — Secondary pills and raised tiles set on orange panels.

## Imagery

There is no photography. The hero is a looping background video of a dotted, scan-line orange field with a soft pale-yellow sunrise glowing up from its bottom edge, and the closing band reuses it with tilted translucent icon tiles floating in the orange. In the white sections, imagery is diagrammatic: a dotted globe in Ember Orange with circular user and database nodes, an orange-bracketed dashed callout, faded incident-ticket collages with P0 pills, and live-looking UI fragments such as a deploy list with Peach Wash rows and an agent terminal in Apercu Mono Pro. Icons are thin Graphite Ink line glyphs; customer logos run in full colour in a marquee.

## Layout

The page sits inside a 1480px frame whose outer gutters are drawn with dashed Hairline rails,, around a 1200px content column outlined by 1px Hairline rules so each section reads as a blueprint cell. A 72px white header centers four 16px/500 menu links and collapses on scroll to the logo plus an orange Start building pill. The hero is a 16px-rounded Cloudflare Orange slab spanning the full frame, centering an announcement pill, a two-line 56px white headline, a lede and one white pill. Below, every section repeats the same centered pattern: a 48px heading, a Quiet Graphite subhead, then a hairline-ruled module (three-column feature cells, a tabbed testimonial, a split white/orange comparison, a four-column pricing grid, an uneven bento of deploy and agent demos). The page closes with a second full-width orange band carrying two pills and a scrolling orange ticker, then a four-column link footer.

## Similar Brands

- **Vercel** — Shares a white canvas divided by hairline grid rules and dashed guides, with product demos drawn as live UI fragments.
- **Supabase** — Uses bordered bento cells, mono-set terminal snippets and pill buttons to show developer workflows as live tooling.
- **Stripe** — Pairs large calm medium-weight headlines with animated product fragments and a restrained neutral grid.


UI rules. Check every screen against these before showing it.

Rules marked (default) are starting points. Break them when the design needs it.

Spacing

- Use gaps from one scale only: 4, 8, 16, 24, 32. (default)

- Put a label closer to its own field than to the field above.

- More space between groups than within a group.

- Align everything on one edge. No mixed centering. (default)

- Pad cards with 16px or more. (default)

- Nested corners: inner radius = outer radius minus padding, never below 0.

Color

- One accent color, for the main action only. Other buttons are neutral. (default)

- Never show an error with color alone. Add a message.

- Keep meanings fixed: red is danger, green is success.

- Check text contrast on colored buttons too (4.5:1 minimum).

- Soft tints for large areas, strong color only for small details. (default)

- Links get color and an underline.

Mobile

- Tap targets at least 44x44.

- Main button at the bottom, where the thumb is. (default)

- Inputs use 16px text, or iPhone zooms in on focus.

- Set the right input type so the right keyboard opens.

- No hover-only actions.

- Bottom sheets instead of small centered dialogs. (default)

Dashboards

- Lead with the one number that matters most. (default)

- Every number gets a period and a change ("+8.1% vs September").

- Bar charts start at zero.

- More than 3 parts? Sorted bars, not a pie. (default)

- Right-align numbers in tables.

- Highlight one line, gray out the rest. (default)

