# Asset provenance

## Bitmap fonts

MS Sans Serif and MS Sans Serif Bold are pixel font recreations by FontStruct user **lou**, distributed by the 98.css project. The font-specific license is **Creative Commons Attribution Share Alike 3.0**, which is separate from the CSS code’s MIT license. The font readmes recommend rendering at **11px**. Retain the accompanying regular and bold license and readme files when redistributing.

- Regular original: https://fontstruct.com/fontstructions/show/1384746
- Bold original: https://fontstruct.com/fontstructions/show/1384862
- WOFF2 source: https://github.com/jdan/98.css/tree/main/fonts/converted
- Font source and notices: https://github.com/jdan/98.css/tree/main/fonts/src
- Font license: https://creativecommons.org/licenses/by-sa/3.0/
- 98.css code and MIT notice: https://github.com/jdan/98.css

## Icons

The PNG icons in this bundle are unmodified copies from https://github.com/alexh/vintage-icons/tree/main/static/icons. Its README declares MIT and credits Windows 98 UI (https://windows98-ui.netlify.app/) for the Windows icon collection. Original Windows graphics are Microsoft assets; this collection does not separately document Microsoft's rights or a Microsoft redistribution grant. The repository's statement should not be treated as an independent clearance of the underlying Microsoft graphics.

The exact filename and source URL mapping is in the adjacent `asset-manifest.json`. Original variants remain in the parent `icons` folder. The chosen pairs are native 16px and 32px drawings, favoring higher color versions where both exist. Windows flag versions are native 16px, 22px, and 32px. Do not interpolate these bitmap icons.

## Visual reference

98.css is MIT: https://github.com/jdan/98.css/blob/main/style.css. It uses the font at 11px, surface #c0c0c0, white #ffffff highlights, #dfdfdf inner bevel face, #808080 shadows, black outlines, and active title gradient #000080 to #1084d0.

A historical Windows Default.theme mirrored in 98.js records desktop #008080, highlight #000080, white content panels, #c0c0c0 inactive title text, and #ffffe1 tooltips. Its native non-client metrics encode a 1px border width, 18px caption height, 18px menu height, 13px scrollbars, and MS Sans Serif at -11 logical pixels for normal caption/menu text. This is a legacy theme reference (file copyright 1995), not independent proof of every Windows 98 SE installation default.

98.js reference: https://github.com/1j01/98. It explicitly says the project is not yet licensed and is source-available. No 98.js code has been included in the selected bundle.

Reconstruction rendering guidance: keep bitmap font and icon positioning on integer CSS pixels, 32px desktop icons, native 16px title/menu icons, no antialiased scaling, a 3px window frame, compact caption/menu rows, and square corners. The exact taskbar/spacing dimensions should be tuned against a Windows 98 SE screenshot rather than inherited blindly from a modern recreation.
