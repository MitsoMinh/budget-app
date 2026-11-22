# Budget

A free, private monthly budgeting app. Runs in the browser on PC and as an installable app on iPhone. No account, no server: your data stays on your device.

**Live:** https://mitsominh.github.io/budget-app/

## Features
- Overview with spending ring, donut, daily chart, 6-month trend, weekday pattern
- Budget planner with sliders, rollover of unspent money, and income
- Quick-add chips, calculator-style amounts (`3.5+2.2`), remembered category
- Savings goals, recurring items, expense splitting, multi-currency
- Search, CSV export, JSON backup and restore, light/dark theme
- Swipe to delete and pull to refresh on iPhone

## Install on iPhone
Open the link in **Safari**, tap Share, then **Add to Home Screen**. Keep "Open as Web App" on. Data is stored per mode, so pick one and stick with it.

## Backups
Data lives in the browser's local storage. Use **Budget > Save backup** (on iPhone choose **Save to Files**). The app reminds you weekly.

## Project layout
| File | Purpose |
|---|---|
| `index.html` | Page shell |
| `style.css` | Design tokens and styles |
| `lib.js` | Pure money logic (no DOM), unit tested |
| `app.js` | UI and events |
| `sw.js`, `manifest.json`, icons | PWA offline support and install |
| `tests/lib.test.js` | Automated tests |

## Develop
```
node tests/lib.test.js        # run tests, no dependencies
python3 -m http.server 8000   # then open http://localhost:8000
```
When you change cached files, bump `CACHE` in `sw.js`.

## Deploy
GitHub Pages: Settings > Pages > Deploy from branch `main`, folder `/ (root)`.

## Roadmap
- Cloud sync across devices (needs a backend such as Supabase; not built because it requires an account and keys)
- Charts per goal, budgets per year

## Known limits
Tested in desktop Chrome with automated browser tests. Not yet tested on a physical iPhone, so touch gestures may need tuning.

## Replicate it
Ask Claude: "Build a single-page PWA monthly budgeting app in vanilla JS (no frameworks), localStorage, hand-written SVG charts, light/dark theme, recurring items, savings goals, rollover, splitting, backups, iPhone-friendly, host on GitHub Pages. Keep money logic in a separate tested module."
