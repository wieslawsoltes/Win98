# Compatibility and verification

## Explicit support boundary

This is a JavaScript desktop recreation, not Windows 98 running in a virtual machine. It does not boot a Windows kernel or execute x86 machine code. It has no binary ABI compatibility with Win32, Win16, DOS, VxD, DirectX or ActiveX.

| Feature | Current behavior |
| --- | --- |
| Window system | Browser-contained windows, menus, focus, modal dialogs and taskbar. Host-level windows are not created. |
| Executables | Known program names launch registered JavaScript apps. Imported native executables are retained as files but not run. |
| DOS | An explicit command interpreter acts on the virtual volume. It is not MS-DOS emulation, an assembler, or a complete batch interpreter. |
| File storage | Device-local IndexedDB records, text/data-URL content, recycle groups and JSON backups. No FAT32 disk image or arbitrary host filesystem access. |
| Notepad | Plain text, CRLF/LF preservation, search/replace, undo/redo, file save/open, print and export. Text encoding is JavaScript/UTF-8 rather than full historical ANSI code-page fidelity. |
| WordPad | Formatted HTML and plain text. Native binary DOC/WRI and complete RTF import/export are not implemented. |
| Paint | Real raster editing and PNG output. Image decode support follows the host browser. Native Windows BMP encoding and exact historical tool quirks are not certified. |
| Games | Working game rules, including AI Hearts. FreeCell's seeded deals are deterministic but are not Microsoft deal-number compatible. Original card artwork/layout is not reproduced byte-for-byte. |
| Media | Host-supported audio decoding, shared playback and recording. Physical CD audio, MIDI device emulation and legacy codecs are absent. |
| Email | Local messages/contacts, drafts, export and mail-app handoff. No POP3/IMAP/SMTP transport or automatic delivery. |
| Internet Explorer | Browser-native HTML rendering, internal pages and isolated local documents. Trident, VBScript, Java/ActiveX and old browser exploits are not emulated. |
| Networking | Browser HTTP/HTTPS and optional Web Serial. No SMB, NetBIOS, PPP dial-up, Windows networking stack or arbitrary TCP sockets. |
| Printing | Browser print flow; no spooler or native printer drivers. |
| Control Panel | Settings with actual browser/application effects; hardware views report available capabilities and limits. They cannot reconfigure the physical operating system. |
| Registry | An editor for this desktop's real application settings, with JSON values. It is not a Windows hive implementation. |
| Maintenance | Real virtual-volume consistency checks, cleanup and serialization/optimization. No physical disk scan or defragmentation. |
| Task Manager | Actual application windows and available browser metrics. It does not enumerate host processes. |
| Scheduled tasks | Run while this desktop is open. Browser shutdown/suspension stops execution. |
| Login/passwords | The containing website/browser account controls access. The desktop's session-return screen does not add password security. |
| WebGPU | Actual implemented pipelines with adapter detection and WebGL2/Canvas2D fallback; availability depends on secure context, browser and device. |
| Pixel fidelity | Native bitmap font/icon assets and classic metrics. No exhaustive all-screen reference-image certification has been performed. |

## Verification strategy

The project combines pure-model checks, raster checks and integration UI checks. The core regression suite is supplied in `tests/`. It verifies atomic file mutations, metadata, read-only handling, case-only rename, valid backup restore, malformed backup rejection, calculator arithmetic and game rules.

Package development also exercised real raster operations for Paint and graphics through a native Canvas implementation, and full-game simulations for the card models. These checks do not prove GPU shader execution or every browser/permission combination.

Integration verification should cover the same workflows on the supported target browser:

1. Open a text document from Explorer, save a changed copy, reopen it, reload and confirm persistence.
2. Dismiss a dirty close prompt using X and confirm the document stays open.
3. Move/resize/minimize/maximize a window, use taskbar switching and nested Start menus.
4. Draw, undo, save and reopen a PNG in Paint.
5. Reveal/flag mines and draw/move/undo cards.
6. Apply wallpaper/theme settings and preview each screen saver.
7. Check the actual backend and fallback reason in System Information.
8. Test recording, clipboard and serial access only with permission and hardware available.

Do not label CPU submission time as GPU duration or interpret Canvas tests as proof that WGSL compiled. The application's System Information reports the selected backend.
