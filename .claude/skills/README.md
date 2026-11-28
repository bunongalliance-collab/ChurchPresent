# Design skills for Claude

Third-party skills added on 2026-11-28 so Claude sessions on this project can use them. Each folder
keeps its own LICENSE. The project's own rules in `CLAUDE.md` come first.

| Folder | What it does | Source | Version |
|---|---|---|---|
| `impeccable/` | Design, critique, audit, polish and animate a frontend (`/impeccable audit`, `/impeccable polish`, ...). Its launcher downloads its engine from GitHub on first use and checks it against `scripts/engine-checksums.txt`. | [pbakaus/impeccable](https://github.com/pbakaus/impeccable), Apache-2.0 | 4.11.1, commit 2fc5e14 |
| `design-taste-frontend/` | "Taste": anti-generic design rules and a library of layouts, photos and effects, mainly for marketing and company sites. Runs a finish check (`scripts/gate.mjs`) when a turn ends while it is in use. | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), MIT | 2.5.1, commit 952435f |
| `playwright-cli/` | Drive a real browser to test pages and take screenshots. Needs the `playwright-cli` command on the computer running Claude: `npm install -g @playwright/cli@latest`. | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli), Apache-2.0 | commit dc5f4d5 |
| `awesome-design/` | 84 DESIGN.md files describing well-known sites' design languages, for inspiration. `SKILL.md` was written for this project. | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md), MIT | commit fcc7028 |

To update one, replace its folder with the same folder from the newer release (keep its LICENSE).
