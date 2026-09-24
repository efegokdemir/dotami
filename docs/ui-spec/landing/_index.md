# Landing — control index

Page: `/` · Component: `components/discovery/landing-page.tsx`

Last updated: 2026-09-24 — shared footer: disclaimer and repository link added on every route;
hero copy: "Map any venture. / Find your path." with the
subtitle "Every path to financial freedom — structures, write-offs, grants, thresholds —
sourced, risk-rated, cited to the law. Canada is the first jurisdiction mapped." (was
"Map any Canadian venture."; the page-mechanics workshop below is from 2026-07-02).

## Controls

| Group | File | Summary |
|-------|------|---------|
| Free-text box + Map it | `01-free-text-entry.md` | The page's one real control — captures text, calls intent parse, routes to intake |
| Example chips | `02-example-chips.md` | Fill the box, no submission |
| Escape hatches | `03-escape-hatches.md` | Sample venture + open cockpit — both skip parsing |

The shared root layout also renders a footer on every route: "Information, not legal or tax
advice · a prep tool for you and your accountant · open source on GitHub", with the final phrase
linking to the public repository. The root footer has a fixed `2.5rem` height; viewport-filling
landing, journey and cockpit wrappers subtract that height so the disclaimer remains visible
without page-level scrolling. Intake content may still scroll internally when its form exceeds
the viewport.

## Page-level state

`useJourney()` — reads/writes `intake` (via `setIntake`) and `scenario` (via `setScenario`).
No other server state on this page.
