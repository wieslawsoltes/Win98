# Verification record — 4 October 2026

This record separates checks that ran from capabilities implemented in source.

## Supplied automated checks

`npm run check` checked all 19 JavaScript modules and the HTML's local asset references. `npm test` passed all 12 tests, with no failures, skips, cancellations or pending tests.

The regression suite covers Windows path handling; read-only preservation; atomic rejection of overlapping moves and file/folder collisions; case-only rename; recovery of deleted subtrees through backup; atomic malformed-backup rejection; calculator repeated equals, operator replacement and percentage; Minesweeper's safe first-click neighborhood; Solitaire deal and undo; FreeCell moves and undo; and a complete legal Hearts hand.

During package development, additional native Canvas raster checks exercised Paint and the fallback renderer. Card-model simulations also exercised complete Hearts games and move invariants. Those development checks do not certify every UI gesture or graphics driver.

## Integrated browser observations

The managed Chromium preview was inspected at a 1363 × 936 CSS-pixel desktop viewport.

- The Windows 98 desktop and Welcome window started with classic fonts, icons, title bars, taskbar and nested Start menus.
- System Information reported **56 registered applications and system panels**.
- Explorer opened My Documents and its text documents in Notepad.
- A changed text document was saved under a new name. Explorer immediately reflected the file, and it reopened with the expected text after a page reload.
- A dirty Notepad close prompted Yes/No/Cancel. Closing that prompt using its caption X preserved the edited document. A subsequent save cleared its modified marker.
- Calculator produced **56** for **7 × 8**.
- Start → Run launched Paint. A pointer drag drew a rectangle, and Paint saved a **480 × 300** PNG into the shared volume. Explorer reopened that PNG in Paint.
- System Information reported the **Canvas2D** backend and **“WebGL2 is unavailable.”** The graphics module throws that message when a WebGL2 context cannot be created, before GLSL compilation. The diagnostic code was subsequently improved to retain all candidate failure reasons.
- No application module errors appeared in the final Windows 98 startup console inspection. Unrelated browser-extension errors were present.

The shared preview was replaced by a separate concurrent project during testing. The final attempt to smoke-test additional utilities was therefore stopped before interacting with the other project. The 56 registration count is not a claim that every control in every application received a browser test.

## Not established by these checks

Actual WGSL/WebGL shader execution, microphone recording, clipboard permissions, physical serial hardware, all browser combinations, native Windows binary compatibility, and exhaustive pixel-for-pixel reference comparisons have not been verified. Read `COMPATIBILITY.md` for implemented boundaries and the remaining integration checklist.

Production is built from the same desktop source as a static HTML/JS application. The managed-preview framework wrapper is not part of the production runtime.
