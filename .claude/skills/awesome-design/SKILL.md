---
name: awesome-design
description: Reference library of 84 DESIGN.md files describing the design languages of well-known sites (Stripe, Linear, Notion, Apple, Airbnb, Vercel, ...). Use for inspiration when the user asks for a page "like <site>" or wants design directions to compare.
---

# Awesome design (DESIGN.md library)

`design-md/<site>/DESIGN.md` describes one site's design language: colours, type, spacing, components and tone.
Sites: `ls design-md` (84 folders, e.g. `stripe`, `linear.app`, `notion`, `apple`, `airbnb`, `vercel`, `supabase`).

## How to use
1. Pick 1–3 sites that fit the request and read only their `DESIGN.md`. Don't read the whole library.
2. Borrow the ideas (layout rhythm, type scale, spacing, tone), never the brand: no logos, names, wordmarks,
   exact colours or copy from the source site.
3. Translate what you borrow into this project's rules in `CLAUDE.md`, which come first:
   - colours come from the tokens in `app/src/index.css` (light default, dark must still work);
   - the navbar, page widths and slide rules stay as they are;
   - a design change gets a sample page published as an artifact before the real code changes.
4. Say which site(s) you drew on, in one line.

Source: VoltAgent/awesome-design-md (MIT, see LICENSE).
