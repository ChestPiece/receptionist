# Landing perf baseline (2026-11-02)

Prod build (`bun run build && bun run start`), built-in browser, `http://localhost:3001/`, 3 s after load, landscape pane.

| Metric | Before |
|---|---|
| DOMContentLoaded | 281 ms |
| load | 1389 ms |
| LCP | 2056 ms |
| JS requests / encoded KB | 16 / 356 KB |
| Film frame requests in first 3 s | 150 (1835 KB) |

After landing fixes (first cold load, same method): film frames 20 (142 KB), JS 16 / 344 KB. DCL and LCP were noisy (1430 / 6460 ms) because the machine was busy running three agents' builds and tests; re-measure on an idle machine. Hero bubble is now in the server HTML (verified in `.next/server/app/index.html`).

Target after fixes: frame requests in first 3 s about 20, hero chat bubble visible at first paint, LCP lower.
