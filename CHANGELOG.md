# Changelog

## 2.0.0 - 2026-11-22
### Added
- **Faster entry:** one-tap quick-add chips built from your repeated expenses (with Undo), the last-used category is remembered, and the amount field accepts sums such as `3.5+2.2`.
- **Savings goals:** target, optional deadline, progress ring, "save X a month" figure, and an option to count contributions as Savings spending.
- **Rollover:** per-category switch that carries unspent budget into the next month.
- **Multi-currency:** log an expense in another currency with a remembered rate; it counts in your home currency.
- **Expense splitting:** enter the total and number of people, your share is what counts.
- **Insights:** change vs last month per category, spending by weekday, and "on pace to go over" warnings.
- **First-run setup wizard** (currency, income, category limits).
- **Backups:** weekly reminder banner and Save backup via the iOS share sheet (Save to Files / iCloud Drive).
- **iPhone touch:** swipe left to delete, pull down to refresh/update.
- **Tests:** 16 automated tests for all money logic, run by GitHub Actions on every push.
### Changed
- All five tabs now fit on a phone screen.
- Pace warnings ignore fixed recurring costs and no longer fire when a category is exactly at its limit.
- Code split into `index.html`, `style.css`, `lib.js` (pure logic), `app.js` (UI).
- Data format upgraded to v2; old data migrates automatically.
- Categories with no limit no longer show as "over budget".

## 1.0.0
- First release: overview, charts, transactions, budget planner, recurring items, PWA install.
