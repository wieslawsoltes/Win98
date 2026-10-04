# Architecture and package contract

## Composition

`main.js` creates the shared filesystem, preferences, window manager, menu manager and renderer. Packages register their apps with the host. `shell` supplies the desktop and taskbar; `explorer` supplies virtual file navigation; app packages create windows through the same contract.

| Package | Responsibility |
| --- | --- |
| `core` | Path normalization, case-insensitive virtual volume, serialized IndexedDB persistence, settings, escaping and size formatting. |
| `window-manager` | Retained window geometry, focus, modality, minimize/maximize, taskbar entries, pointer drag/resize and close lifecycle. |
| `ui` | Pixel icons, hierarchical menu lifecycle, file dialogs, prompts and status bars. |
| `shell` | Start menu, desktop icons, taskbar, recent documents, shortcuts, welcome, Run, shutdown and session return screen. |
| `explorer` | Folders, drives, Control Panel index, Recycle Bin, search, imports/exports and properties. |
| `graphics` | WebGPU/WebGL2/Canvas2D surfaces, image upload and procedural screen-saver scenes. |
| `accessories` | Editors, calculator engine and virtual DOS interpreter. |
| `paint` | Image editing, tools, selection, transforms and undo/history. |
| `games` | Pure game models and classic interactive views. |
| `media` | Shared audio engine, recording, local messages and contacts. |
| `browser` | Host-engine browsing, safe local HTML viewing and Help. |
| `system` | Settings, system diagnostics, tasks, registry and volume maintenance. |
| `utilities` | Image viewing, clipboard interaction, tones and serial text IO. |

## Host interface

```ts
interface AppDefinition {
  id: string;
  title: string;
  icon: string;
  open(args?: Record<string, unknown>): DesktopWindow | Promise<DesktopWindow>;
}

interface DesktopWindow {
  id: string;
  el: HTMLElement;
  body: HTMLElement;
  title: string;
  rect: { x: number; y: number; width: number; height: number };
  appId: string | null;
  closed: boolean;
  minimized: boolean;
  maximized: boolean;
  onBeforeClose: null | (() => boolean | Promise<boolean>);
  setTitle(title: string): void;
  close(): Promise<boolean>;
  focus(): void;
  addCleanup(cleanup: () => void): void;
}

interface DesktopHost {
  apps: Map<string, AppDefinition>;
  events: EventTarget;
  vfs: VirtualFileSystem;
  settings: Settings;
  renderer: DesktopRenderer;
  registerApp(app: AppDefinition): void;
  open(id: string, args?: Record<string, unknown>): Promise<DesktopWindow | null>;
  openPath(path: string): Promise<unknown>;
  execute(command: string): Promise<unknown>;
  icon(name: string, size?: number): string;
  menuBar(window: DesktopWindow, menus: MenuDefinition[]): HTMLElement;
  contextMenu(items: MenuItem[], x: number, y: number): HTMLElement;
  statusBar(window: DesktopWindow, text: string): HTMLElement;
  dialog(options: DialogOptions): Promise<unknown>;
  prompt(options: { title?: string; message: string; value?: string }): Promise<string | null>;
  fileDialog(options: FileDialogOptions): Promise<string | null>;
  download(data: string | Blob | ArrayBuffer, name: string, mime?: string): Promise<void>;
  printHTML(html: string, title?: string): void;
  notify(message: string): void;
}
```

Menu definitions use `{label, items}`. An item is `{label, action, icon?, shortcut?, disabled?, checked?, items?}` or `{type:'separator'}`. `items`, `disabled` and `checked` can be functions so menus reflect current state when opened. Menu actions can return promises; errors are presented through the shared dialog service.

## Virtual volume semantics

Paths accept `/` or `\`, resolve dot segments, preserve display case and compare case-insensitively. A file record stores `path`, `name`, `type:'file'`, `content`, `mime`, `size`, `created`, `modified`, and optional flags. Directory records use `type:'directory'`.

Text is a string. Imported binary data is a data URL, allowing portable JSON backup. This favors simplicity and portability over large-file efficiency: base64 increases binary storage size and complete volume commits copy the record set. This volume is intended for desktop documents and sample media, not multi-gigabyte disks.

Copy and move validate every destination before mutating the map. Ancestor overlap, read-only files and file/directory collisions fail atomically. Case-only rename is supported. Moving a directory emits one completed state. Directory overwrite merges contents while retaining unrelated existing children.

Delete moves a complete subtree into one recoverable group. Backup includes live entries and those groups. Import validates the entire graph, duplicates, names and recycle subtrees before replacement. Malformed input leaves the active volume unchanged.

Browser storage can be denied or exhausted. The UI retains editor content, reports failed durable saves and supports export. Clearing site data removes the volume. The current implementation does not synchronize concurrent tab writes; use one active desktop tab per browser profile and keep portable backups.

## Window input and lifecycle

Window geometry belongs to the manager. Pointer capture keeps drag/resize attached to the starting control. Each move coalesces into one `requestAnimationFrame` update. Applications that change their preferred size update `win.rect` and use `wm.applyRect(win)`.

Modal windows are kept above application windows and trap Tab traversal. They use transparent input scrims, preserving the undimmed Windows classic appearance. The manager honors `onBeforeClose`, rejects duplicate close attempts and runs registered resource cleanup once.

The host operating system can intercept Alt+Tab, Alt+F4, Ctrl+Shift+Escape and other reserved keys. F6 provides an application-level window-switching alternative.

## Graphics

The renderer presents a full-screen triangle for wallpaper and sampled images. Screen-saver geometry uses an alpha-blended triangle pipeline. The WebGPU uniform block is 64 bytes, containing four aligned `vec4<f32>` fields. The fallback renderer uses matching scene geometry and procedural patterns.

A canvas cannot change its established context type. When changing APIs after loss/failure, the renderer replaces its canvas with a shallow clone preserving DOM attributes. Read `renderer.canvas` after a backend change. Put input handlers on its containing element.

Device/context loss triggers fallback. Static scenes invalidate on settings, image or size changes. Active animation pauses on document visibility changes. `frameTime` is a CPU metric; no GPU timestamps are invented.

## Security boundaries

User filenames and text are inserted as text or escaped. WordPad sanitizes imported rich text. Local HTML uses a sandbox without script execution. External websites use a sandboxed frame and provide a direct browser link for sites that reject embedding. No native binary execution, browser-security relaxation, plugin execution or raw socket proxy is present.

Microphone, clipboard and serial device access happen only after explicit in-app user actions and remain subject to normal browser permission prompts. Outlook stores local messages and hands drafts to the user's mail application; it does not send mail itself.

The optional WebMCP registry exposes application listing/opening and virtual folder listing through validated inputs. It reuses the same application actions as the UI and unregisters on page exit. Unsupported browsers simply skip registration.
