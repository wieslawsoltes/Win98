# Windows 98 Browser Desktop

**Live demo:** https://wieslawsoltes.github.io/Win98/ — `node scripts/build-pages.mjs` writes the static site to `_site/`; the `Deploy to GitHub Pages` workflow publishes it on every push to `main`.

A working, independently implemented Windows 98 Second Edition style desktop in HTML, CSS, and JavaScript. The application itself has **no runtime package dependencies**. WebGPU accelerates wallpaper and screen-saver surfaces, with WebGL2 and Canvas 2D fallbacks.

This project recreates desktop workflows and applications. It is **not an x86 emulator or a binary-compatible Windows operating system**. Original Win32, Win16, DOS, drivers, DirectX programs, ActiveX controls, and Windows services do not execute. See [COMPATIBILITY.md](./COMPATIBILITY.md) for the precise boundary.

## Run locally

Requires a current Node.js runtime. No package installation is needed.

```sh
node serve.mjs
```

Open `http://localhost:8080`. You can also run `npm start`, or serve this directory with any static HTTP server. Use HTTP on localhost or HTTPS in deployment; WebGPU, microphone, clipboard and serial APIs have browser permission and secure-context requirements. Opening `index.html` directly with `file://` does not reliably support modules or persistent storage.

```sh
npm test
npm run check
```

## Desktop and files

- Movable, resizable, minimized and maximized windows, active/inactive title bars, system menus, task switching, cascade/tile and Show Desktop.
- Start menu with nested Programs, Accessories, Games, Entertainment, System Tools, recent documents, Favorites, settings, Run and shutdown.
- Draggable desktop icons, selection, context menus, folders and shortcuts.
- Explorer with virtual drives, navigation history, folder tree and Web view, large/small/details views, search, sorting, multi-selection, clipboard operations and drag/drop.
- A case-insensitive virtual filesystem with atomic copy/move preflight, read-only attributes, preserved metadata, Recycle Bin and validated portable backups.
- Device-local IndexedDB persistence. Files stay on the current browser/device; they are not synchronized or uploaded automatically. Export a backup before clearing website data.

## Applications

| Package | Applications and behavior |
| --- | --- |
| Accessories | Notepad with newline-preserving saves and asynchronous dirty-state guards; formatted WordPad; standard/scientific Calculator; a DOS-style interpreter operating on the shared volume. |
| Paint | Sixteen tools, flood fill, selections, curves, polygons, text, colors, bounded undo/redo, crop, resize, flip/rotate, zoom, image import and PNG export. |
| Games | Minesweeper, Klondike Solitaire, FreeCell and Hearts, with independent testable models, validated moves, undo where appropriate, timers and saved preferences/statistics. |
| Media | Shared audio playlist, Windows Media Player, CD-style player, microphone Sound Recorder and functional mixer controls. |
| Communications | Local Outlook Express messages, drafts, replies/forwarding, `.eml` exports and mail-app handoff; Address Book contact management and CSV export. |
| Browser | Internet Explorer style navigation, built-in help/home pages, favorites, history, sandboxed local HTML and external website viewing/handoff. |
| System | Display, time/date, system information, Task Manager, Registry Editor, local disk utilities, scheduled tasks and browser-backed Control Panel applets. |
| Utilities | Imaging, Clipboard Viewer, DTMF Phone Dialer and a Web Serial/loopback HyperTerminal. |

Control Panel hardware views describe the host capabilities they can actually access. They do not invent hardware, capacity, Windows processes, live email delivery, or GPU timing.

## Reusable packages

Each `packages/*` directory contains an ES module and an independent package manifest. The application packages depend on a small injected host contract rather than the desktop's global DOM:

```js
import { registerPaint } from './packages/paint/index.js';
import { registerGames } from './packages/games/index.js';

registerPaint(host);
registerGames(host);
```

The core contract is documented in [ARCHITECTURE.md](./ARCHITECTURE.md). It supplies application registration, window creation, menus, dialogs, virtual files, settings, downloads and event dispatch. Include each package's stylesheet plus `styles/classic.css` when using the provided shell.

For lower-level reuse:

```js
import { VirtualFileSystem } from './packages/core/index.js';
import { CalculatorEngine } from './packages/accessories/index.js';
import { MinesweeperModel, PatienceModel, HeartsModel }
  from './packages/games/index.js';
import { DesktopRenderer } from './packages/graphics/index.js';

const disk = await new VirtualFileSystem().init();
disk.write('C:/My Documents/Example.txt', 'Hello from Windows 98.\r\n');
await disk.flush();

const calculator = new CalculatorEngine();
calculator.digit('7');
calculator.binary('multiply');
calculator.digit('8');
calculator.equals();
console.log(calculator.value); // 56

const renderer = new DesktopRenderer(document.querySelector('canvas'));
await renderer.init('auto');
await renderer.setWallpaper({ color: '#008080', pattern: 'none' });
```

## Rendering and performance

The graphics package uses actual WGSL render pipelines and GLSL ES 3.00 fallbacks. A static wallpaper renders when invalidated, without a perpetual animation loop. Screen savers pause when the page is hidden. Surface dimensions and DPR are bounded; render size follows ResizeObserver rather than per-frame layout reads.

Window chrome, text and controls remain native HTML/CSS composed by the browser. Paint's mutable image surface uses Canvas 2D; `DesktopRenderer.present(sourceCanvas)` is available for GPU texture presentation in other clients. The project does not describe this as rendering every DOM pixel through WebGPU.

`renderer.stats.frameTime` measures CPU scene preparation/submission, **not GPU execution time**. Actual GPU timestamp profiling and native Windows performance equivalence are not claimed.

## Data and lifecycle

The virtual volume is saved under IndexedDB database `windows98-local-machine`; local preferences use `win98-settings`. Writes update the shared in-memory model and queue a serialized durable commit. Explicit editor saves await the commit and retain the exact document snapshot written. Edits made during a save remain dirty.

Applications receive `addCleanup()` and `onBeforeClose` hooks. Closing a dirty editor prompts Save/Discard/Cancel; dismissing the prompt preserves the document. Window shutdown runs those guards and flushes the volume.

## Visual fidelity

Native 16/32-pixel historical icon assets, a bitmap MS Sans Serif recreation at 11px, Windows classic colors, one-pixel bevels, compact caption controls and era-style layouts form the visual baseline. It is a high-fidelity reconstruction; exhaustive per-pixel equivalence across all Windows 98 applications, display modes and dialogs has not been certified.

## Attribution

Original implementation code is MIT licensed. Font and icon assets retain their separate source notices in `assets/ASSET-SOURCES.md`. The bitmap font recreation by lou is CC BY-SA 3.0. The icon collection declares MIT, while its underlying Windows artwork remains associated with Microsoft; its repository does not independently document Microsoft redistribution rights. Microsoft and Windows are trademarks of Microsoft. This is an independent project.
