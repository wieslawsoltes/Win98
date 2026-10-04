/* A self-contained, classic Paint application for the desktop shell. */
export function registerPaint(sys) {
  let clipboard = null;
  const MAX_SIDE = 4096;
  const MAX_PIXELS = 8 * 1024 * 1024;
  const HISTORY_BYTES = 64 * 1024 * 1024;
  const PALETTE = ['#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000', '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040'];
  const TOOLS = [['free-select', 'Free-Form Select', 'Draw around an area. Drag inside the selection to move it.'], ['select', 'Select', 'Drag to select an area. Hold Ctrl while dragging a selection to copy it.'], ['eraser', 'Eraser / Color Eraser', 'Drag to erase with the background color. Right-drag replaces the foreground color.'], ['fill', 'Fill With Color', 'Click an area to fill it. Right-click uses the background color.'], ['picker', 'Pick Color', 'Click to pick the foreground color. Right-click to pick the background color.'], ['zoom', 'Magnifier', 'Click to zoom in. Right-click to zoom out.'], ['pencil', 'Pencil', 'Drag to draw a one-pixel line. Hold Shift for a straight line.'], ['brush', 'Brush', 'Drag to paint with the selected brush.'], ['airbrush', 'Airbrush', 'Hold the mouse button to spray color.'], ['text', 'Text', 'Drag a text box and type. Click outside or press Ctrl+Enter to apply.'], ['line', 'Line', 'Drag a straight line. Hold Shift to constrain its angle.'], ['curve', 'Curve', 'Draw a line, then drag twice to bend it. Enter finishes; Esc cancels.'], ['rectangle', 'Rectangle', 'Drag a rectangle. Hold Shift to draw a square.'], ['polygon', 'Polygon', 'Click each corner. Double-click or press Enter to close the polygon.'], ['ellipse', 'Ellipse', 'Drag an ellipse. Hold Shift to draw a circle.'], ['rounded', 'Rounded Rectangle', 'Drag a rounded rectangle. Hold Shift to draw a square.']];
  const paths = {
    'free-select': '<path d="M4 3 9 2 12 5 17 5 18 10 14 12 15 17 9 18 7 14 2 12 3 7Z" fill="none" stroke-dasharray="2 2"/>',
    select: '<rect x="3" y="3" width="15" height="14" fill="none" stroke-dasharray="2 2"/>',
    eraser: '<path d="m3 12 8-9 8 5-8 9H7Z" fill="#fff"/><path d="m3 12 4 5h4l4-5-8-5Z" fill="#f9a9c0"/><path d="m7 7 8 5"/>',
    fill: '<path d="m5 6 6-4 7 9-7 7-9-7Z" fill="#c0c0c0"/><path d="m2 11 8-5 8 5-7 7Z" fill="#fff"/><path d="m9 4 2-3 6 4v5" fill="none"/><path d="M18 12s-3 4-2 6c1 2 4 1 4-1Z" fill="#0000ff" stroke="none"/>',
    picker: '<path d="m4 15 8-9 4 3-9 8-4 1Z" fill="#fff"/><path d="m11 4 3-2 5 5-2 3Z" fill="#808080"/><path d="m6 13 3 3"/>',
    zoom: '<circle cx="9" cy="8" r="6" fill="#fff"/><path d="m13 13 6 6" stroke-width="4"/><path d="M5 8h8M9 4v8" stroke="#000080"/>',
    pencil: '<path d="m3 17 2-5L15 2l4 4L9 16Z" fill="#ffff00"/><path d="m3 17 2-5 4 4Z" fill="#d6ab7a"/><path d="m3 17 3-1-2-2Z" fill="#000"/><path d="m13 4 4 4M7 13l8-8" fill="none"/>',
    brush: '<path d="m9 11 7-9 3 2-7 10Z" fill="#804000"/><path d="M8 10c-5 2-1 6-6 8 7 2 12-3 10-6Z" fill="#0000ff"/><path d="m8 10 4 3" stroke="#c0c0c0" stroke-width="2"/>',
    airbrush: '<path d="M9 9h7v9H8V9Zm1-3h5v3h-5Zm1-3h3v3h-3Z" fill="#ffff00"/><path d="M2 4h1M5 2h1M5 5h1M2 8h1M5 8h1M7 4h1" stroke-width="1.5"/><path d="M9 12h7"/>',
    text: '<path d="m3 18 6-15h3l6 15h-4l-1-4H7l-1 4Zm5-7h4l-2-6Z" fill="#000" stroke="none"/>',
    line: '<path d="m3 17 15-14" stroke-width="2"/>',
    curve: '<path d="M3 17C20 15 0 3 17 3" stroke-width="2" fill="none"/>',
    rectangle: '<rect x="3" y="4" width="15" height="13" fill="#fff" stroke-width="1.5"/>',
    polygon: '<path d="m3 17 4-13 5 6 5-7 2 14Z" fill="#fff" stroke-width="1.5"/>',
    ellipse: '<ellipse cx="10.5" cy="10.5" rx="8" ry="6.5" fill="#fff" stroke-width="1.5"/>',
    rounded: '<rect x="3" y="4" width="15" height="13" rx="4" fill="#fff" stroke-width="1.5"/>'
  };
  const toolIcon = id => `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" shape-rendering="geometricPrecision" fill="none" stroke="black" stroke-width="1">${paths[id]}</svg>`;
  const makeCanvas = (w, h) => {
    const result = document.createElement('canvas');
    result.width = Math.max(1, Math.round(w));
    result.height = Math.max(1, Math.round(h));
    return result;
  };
  const cloneCanvas = source => {
    const copy = makeCanvas(source.width, source.height);
    copy.getContext('2d').drawImage(source, 0, 0);
    return copy;
  };
  const baseName = path => String(path || 'Untitled.png').split(/[\\/]/).pop();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const colorHex = data => '#' + [data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  sys.registerApp({
    id: 'paint',
    title: 'Paint',
    icon: 'paint',
    open(args = {}) {
      const win = sys.wm.create({
        title: 'Untitled - Paint',
        icon: 'paint',
        width: 640,
        height: 490,
        minWidth: 470,
        minHeight: 350,
        x: args.x,
        y: args.y
      });
      const root = element('div', 'paint-app');
      root.tabIndex = 0;
      const row = element('div', 'paint-work-row');
      const toolbox = element('div', 'paint-toolbox');
      toolbox.setAttribute('aria-label', 'Drawing tools');
      const toolGrid = element('div', 'paint-tool-grid');
      const options = element('div', 'paint-tool-options sunken');
      const work = element('div', 'paint-workspace sunken');
      work.setAttribute('aria-label', 'Image workspace');
      const surface = element('div', 'paint-surface');
      const canvas = makeCanvas(480, 300);
      const overlay = makeCanvas(480, 300);
      canvas.className = 'paint-canvas';
      canvas.setAttribute('aria-label', 'Drawing canvas');
      overlay.className = 'paint-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      const ctx = canvas.getContext('2d', {
        willReadFrequently: true
      });
      const ox = overlay.getContext('2d');
      surface.append(canvas, overlay);
      work.append(surface);
      toolbox.append(toolGrid, options);
      row.append(toolbox, work);
      const palette = element('div', 'paint-palette');
      const currentColors = element('button', 'paint-current-colors');
      currentColors.type = 'button';
      currentColors.title = 'Foreground and background colors. Click to swap.';
      currentColors.setAttribute('aria-label', 'Swap foreground and background colors');
      const backColor = element('span', 'paint-color-back');
      const frontColor = element('span', 'paint-color-front');
      currentColors.append(backColor, frontColor);
      const swatchGrid = element('div', 'paint-swatches');
      const customColor = element('input', 'paint-hidden-file');
      customColor.type = 'color';
      customColor.value = '#000000';
      customColor.setAttribute('aria-label', 'Custom paint color');
      palette.append(currentColors, swatchGrid, customColor);
      root.append(row, palette);
      let tool = 'pencil';
      let lastDrawTool = 'pencil';
      let fg = '#000000';
      let bg = '#ffffff';
      let strokeWidth = 1;
      let brushSize = 4;
      let brushShape = 'round';
      let eraserSize = 8;
      let spraySize = 12;
      let shapeMode = 'outline';
      let selectionOpaque = true;
      let textOpaque = true;
      let fontFamily = 'Arial';
      let fontSize = 16;
      let fontBold = false;
      let fontItalic = false;
      let zoom = 1;
      let selection = null;
      let active = null;
      let curve = null;
      let polygon = null;
      let textBox = null;
      let sprayTimer = null;
      let filePath = null;
      let documentName = 'Untitled';
      let history = [];
      let historyIndex = -1;
      let nextSnapshotId = 0;
      let savedId = null;
      let closed = false;
      let busy = false;
      let statusText;
      let statusCoords;
      let statusSize;
      let statusZoom;
      const toolButtons = new Map();
      function info(message) {
        if (statusText) statusText.textContent = message || TOOLS.find(t => t[0] === tool)?.[2] || 'For Help, click Help Topics on the Help menu.';
      }
      function dirty() {
        return history[historyIndex]?.id !== savedId || !!textBox?.value;
      }
      function updateTitle() {
        win.setTitle(`${dirty() ? '*' : ''}${documentName} - Paint`);
      }
      function updateSize() {
        if (statusSize) statusSize.textContent = `${canvas.width} × ${canvas.height} px`;
        if (statusZoom) statusZoom.textContent = `${Math.round(zoom * 100)}%`;
      }
      function paintBackground(target = ctx, w = canvas.width, h = canvas.height, color = bg) {
        target.save();
        target.globalCompositeOperation = 'source-over';
        target.fillStyle = color;
        target.fillRect(0, 0, w, h);
        target.restore();
      }
      function snapshot() {
        return {
          id: ++nextSnapshotId,
          width: canvas.width,
          height: canvas.height,
          pixels: ctx.getImageData(0, 0, canvas.width, canvas.height)
        };
      }
      function remember(clean = false, reset = false) {
        if (reset) {
          history = [];
          historyIndex = -1;
        }
        if (historyIndex < history.length - 1) history.splice(historyIndex + 1);
        const entry = snapshot();
        history.push(entry);
        let byteCount = history.reduce((sum, item) => sum + item.pixels.data.byteLength, 0);
        while (history.length > 2 && (history.length > 24 || byteCount > HISTORY_BYTES)) {
          byteCount -= history.shift().pixels.data.byteLength;
        }
        historyIndex = history.length - 1;
        if (clean) savedId = entry.id;
        updateTitle();
        updateSize();
      }
      function fitSurface() {
        surface.style.width = `${canvas.width * zoom}px`;
        surface.style.height = `${canvas.height * zoom}px`;
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        if (textBox) positionTextBox();
        updateSize();
        renderOverlay();
      }
      function restore(entry) {
        if (!entry) return;
        selection = null;
        curve = null;
        polygon = null;
        removeTextBox();
        canvas.width = entry.width;
        canvas.height = entry.height;
        ctx.putImageData(entry.pixels, 0, 0);
        fitSurface();
        updateTitle();
      }
      function undo() {
        if (busy) return;
        if (active) cancelActive();
        if (textBox) {
          removeTextBox();
          updateTitle();
          return;
        }
        if (polygon || curve) {
          polygon = null;
          curve = null;
          renderOverlay();
          return;
        }
        if (historyIndex > 0) restore(history[--historyIndex]);else info('There is nothing to undo.');
      }
      function redo() {
        if (busy) return;
        if (active) cancelActive();
        if (historyIndex < history.length - 1) restore(history[++historyIndex]);else info('There is nothing to redo.');
      }
      function validSize(w, h) {
        return Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= MAX_SIDE && h <= MAX_SIDE && w * h <= MAX_PIXELS;
      }
      async function sizeError() {
        await sys.dialog({
          title: 'Paint',
          icon: 'warning',
          message: 'Choose dimensions from 1 to 4096 pixels, with no more than 8,388,608 pixels in the image.',
          buttons: [{
            label: 'OK',
            value: 'ok'
          }]
        });
      }
      function setSize(w, h, scale = false, record = true) {
        if (!validSize(w, h)) {
          sizeError();
          return false;
        }
        finishPending();
        const copy = cloneCanvas(canvas);
        selection = null;
        canvas.width = w;
        canvas.height = h;
        paintBackground();
        ctx.imageSmoothingEnabled = false;
        if (scale) ctx.drawImage(copy, 0, 0, w, h);else ctx.drawImage(copy, 0, 0);
        fitSurface();
        if (record) remember();
        return true;
      }
      async function resizeImage(scale) {
        finishPending();
        const result = await sys.prompt({
          title: scale ? 'Resize Image' : 'Image Attributes',
          message: scale ? 'Enter the new width × height in pixels. The picture will be stretched to this size.' : 'Enter the canvas width × height in pixels. The picture stays in the upper-left corner.',
          value: `${canvas.width} × ${canvas.height}`
        });
        if (result === null || result === undefined) return;
        const match = String(result).trim().match(/^(\d+)\s*(?:[x×,]|\s)\s*(\d+)$/i);
        if (!match || !validSize(Number(match[1]), Number(match[2]))) return sizeError();
        const w = Number(match[1]);
        const h = Number(match[2]);
        if (w !== canvas.width || h !== canvas.height) setSize(w, h, scale);
      }
      function setZoom(value, anchor) {
        const newZoom = clamp(value, 0.25, 8);
        const oldZoom = zoom;
        const viewX = anchor ? anchor.x * oldZoom - work.scrollLeft : work.clientWidth / 2;
        const viewY = anchor ? anchor.y * oldZoom - work.scrollTop : work.clientHeight / 2;
        const docX = anchor ? anchor.x : (work.scrollLeft + viewX) / oldZoom;
        const docY = anchor ? anchor.y : (work.scrollTop + viewY) / oldZoom;
        zoom = newZoom;
        fitSurface();
        work.scrollLeft = Math.max(0, docX * zoom - viewX);
        work.scrollTop = Math.max(0, docY * zoom - viewY);
        if (tool === 'zoom') rebuildOptions();
      }
      function zoomStep(direction, anchor) {
        const levels = [0.25, 0.5, 1, 2, 4, 6, 8];
        const choices = direction > 0 ? levels.filter(level => level > zoom) : levels.filter(level => level < zoom).reverse();
        if (choices.length) setZoom(choices[0], anchor);
      }
      function normalizeRect(a, b) {
        const x = Math.floor(Math.min(a.x, b.x));
        const y = Math.floor(Math.min(a.y, b.y));
        return {
          x,
          y,
          w: Math.max(1, Math.ceil(Math.max(a.x, b.x)) - x),
          h: Math.max(1, Math.ceil(Math.max(a.y, b.y)) - y)
        };
      }
      function point(event, bounded = false) {
        const rect = canvas.getBoundingClientRect();
        let x = Math.floor((event.clientX - rect.left) / zoom);
        let y = Math.floor((event.clientY - rect.top) / zoom);
        if (bounded) {
          x = clamp(x, 0, canvas.width - 1);
          y = clamp(y, 0, canvas.height - 1);
        }
        return {
          x,
          y
        };
      }
      function constrained(start, end, square, shift) {
        if (!shift) return end;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (square) {
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          return {
            x: start.x + (dx < 0 ? -side : side),
            y: start.y + (dy < 0 ? -side : side)
          };
        }
        const length = Math.hypot(dx, dy);
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
        return {
          x: Math.round(start.x + Math.cos(angle) * length),
          y: Math.round(start.y + Math.sin(angle) * length)
        };
      }
      function configureStroke(target, color, width = strokeWidth) {
        target.strokeStyle = color;
        target.fillStyle = color;
        target.lineWidth = width;
        target.lineCap = 'round';
        target.lineJoin = 'round';
      }
      function shapePath(target, type, start, end) {
        const box = normalizeRect(start, end);
        target.beginPath();
        if (type === 'line') {
          target.moveTo(start.x + 0.5, start.y + 0.5);
          target.lineTo(end.x + 0.5, end.y + 0.5);
        } else if (type === 'ellipse') {
          target.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
        } else if (type === 'rounded') {
          const r = Math.min(12, box.w / 4, box.h / 4);
          target.moveTo(box.x + r, box.y);
          target.lineTo(box.x + box.w - r, box.y);
          target.quadraticCurveTo(box.x + box.w, box.y, box.x + box.w, box.y + r);
          target.lineTo(box.x + box.w, box.y + box.h - r);
          target.quadraticCurveTo(box.x + box.w, box.y + box.h, box.x + box.w - r, box.y + box.h);
          target.lineTo(box.x + r, box.y + box.h);
          target.quadraticCurveTo(box.x, box.y + box.h, box.x, box.y + box.h - r);
          target.lineTo(box.x, box.y + r);
          target.quadraticCurveTo(box.x, box.y, box.x + r, box.y);
          target.closePath();
        } else target.rect(box.x + 0.5, box.y + 0.5, box.w, box.h);
      }
      function finishShape(target, item, lineOnly = false) {
        if (!lineOnly && item.mode !== 'outline') {
          target.fillStyle = item.mode === 'filled' ? item.color : item.background;
          target.fill();
        }
        if (lineOnly || item.mode !== 'filled') target.stroke();
      }
      function drawShape(target, item) {
        target.save();
        configureStroke(target, item.color, item.width);
        shapePath(target, item.tool, item.start, item.end);
        finishShape(target, item, item.tool === 'line');
        target.restore();
      }
      function drawCurve(target, item) {
        target.save();
        configureStroke(target, item.color, item.width);
        target.beginPath();
        target.moveTo(item.start.x + 0.5, item.start.y + 0.5);
        if (item.c2) target.bezierCurveTo(item.c1.x, item.c1.y, item.c2.x, item.c2.y, item.end.x + 0.5, item.end.y + 0.5);else if (item.c1) target.quadraticCurveTo(item.c1.x, item.c1.y, item.end.x + 0.5, item.end.y + 0.5);else target.lineTo(item.end.x + 0.5, item.end.y + 0.5);
        target.stroke();
        target.restore();
      }
      function drawPolygon(target, item, close = false) {
        if (!item.points.length) return;
        target.save();
        configureStroke(target, item.color, item.width);
        target.beginPath();
        target.moveTo(item.points[0].x + 0.5, item.points[0].y + 0.5);
        for (let i = 1; i < item.points.length; i++) target.lineTo(item.points[i].x + 0.5, item.points[i].y + 0.5);
        if (!close && item.hover) target.lineTo(item.hover.x + 0.5, item.hover.y + 0.5);
        if (close) target.closePath();
        if (close) finishShape(target, item);else target.stroke();
        target.restore();
      }
      function dashedOutline(draw) {
        ox.save();
        ox.lineWidth = 1 / zoom;
        ox.strokeStyle = '#ffffff';
        ox.setLineDash([]);
        draw();
        ox.stroke();
        ox.strokeStyle = '#000000';
        ox.setLineDash([3 / zoom, 3 / zoom]);
        draw();
        ox.stroke();
        ox.restore();
      }
      function renderOverlay() {
        ox.clearRect(0, 0, overlay.width, overlay.height);
        if (selection) {
          if (selection.lifted) ox.drawImage(selection.image, selection.x, selection.y);
          dashedOutline(() => {
            ox.beginPath();
            ox.rect(selection.x + 0.5 / zoom, selection.y + 0.5 / zoom, selection.w - 1 / zoom, selection.h - 1 / zoom);
          });
        }
        if (curve) drawCurve(ox, curve);
        if (polygon) drawPolygon(ox, polygon);
        if (!active) return;
        if (active.kind === 'shape' || active.kind === 'pencil-line') drawShape(ox, active);
        if (active.kind === 'curve-line') drawCurve(ox, active);
        if (active.kind === 'select' || active.kind === 'text-box') {
          if (active.free && active.points.length > 1) dashedOutline(() => {
            ox.beginPath();
            ox.moveTo(active.points[0].x, active.points[0].y);
            active.points.slice(1).forEach(p => ox.lineTo(p.x, p.y));
            ox.closePath();
          });else {
            const r = normalizeRect(active.start, active.end);
            dashedOutline(() => {
              ox.beginPath();
              ox.rect(r.x + 0.5 / zoom, r.y + 0.5 / zoom, r.w, r.h);
            });
          }
        }
      }
      function selectionAt(p) {
        if (!selection || p.x < selection.x || p.y < selection.y || p.x >= selection.x + selection.w || p.y >= selection.y + selection.h) return false;
        const alpha = selection.mask.getContext('2d').getImageData(p.x - selection.x, p.y - selection.y, 1, 1).data[3];
        return alpha > 0;
      }
      function captureSelection(rect, points) {
        const x = clamp(rect.x, 0, canvas.width - 1);
        const y = clamp(rect.y, 0, canvas.height - 1);
        const w = Math.max(1, Math.min(rect.x + rect.w, canvas.width) - x);
        const h = Math.max(1, Math.min(rect.y + rect.h, canvas.height) - y);
        const image = makeCanvas(w, h);
        const mask = makeCanvas(w, h);
        const mx = mask.getContext('2d');
        mx.fillStyle = '#000000';
        if (points?.length >= 3) {
          mx.beginPath();
          mx.moveTo(points[0].x - x, points[0].y - y);
          points.slice(1).forEach(p => mx.lineTo(p.x - x, p.y - y));
          mx.closePath();
          mx.fill();
        } else mx.fillRect(0, 0, w, h);
        const ix = image.getContext('2d');
        ix.drawImage(canvas, x, y, w, h, 0, 0, w, h);
        ix.globalCompositeOperation = 'destination-in';
        ix.drawImage(mask, 0, 0);
        ix.globalCompositeOperation = 'source-over';
        selection = {
          x,
          y,
          w,
          h,
          image,
          mask,
          lifted: false
        };
        renderOverlay();
      }
      function transparentCopy(source) {
        const result = cloneCanvas(source);
        if (selectionOpaque) return result;
        const context = result.getContext('2d');
        const pixels = context.getImageData(0, 0, result.width, result.height);
        const back = rgb(bg);
        for (let i = 0; i < pixels.data.length; i += 4) {
          if (pixels.data[i] === back[0] && pixels.data[i + 1] === back[1] && pixels.data[i + 2] === back[2]) pixels.data[i + 3] = 0;
        }
        context.putImageData(pixels, 0, 0);
        return result;
      }
      function eraseSelection() {
        if (!selection) return;
        const erasure = makeCanvas(selection.w, selection.h);
        const ex = erasure.getContext('2d');
        ex.fillStyle = bg;
        ex.fillRect(0, 0, erasure.width, erasure.height);
        ex.globalCompositeOperation = 'destination-in';
        ex.drawImage(selection.mask, 0, 0);
        ctx.drawImage(erasure, selection.x, selection.y);
      }
      function deselect() {
        selection = null;
        renderOverlay();
      }
      function selectAll() {
        finishPending();
        setTool('select');
        captureSelection({
          x: 0,
          y: 0,
          w: canvas.width,
          h: canvas.height
        });
      }
      function copySelection() {
        finishPending();
        if (!selection) {
          info('Select an area to copy, or choose Select All.');
          return false;
        }
        clipboard = {
          image: cloneCanvas(selection.image),
          mask: cloneCanvas(selection.mask)
        };
        info('Selection copied. Choose Paste to place a copy in the picture.');
        return true;
      }
      function deleteSelection() {
        if (!selection) return;
        eraseSelection();
        deselect();
        remember();
      }
      function cutSelection() {
        if (copySelection()) deleteSelection();
      }
      function pasteImage(source, sourceMask) {
        if (closed) return;
        finishPending();
        if (!validSize(source.width, source.height)) {
          sizeError();
          return;
        }
        const w = Math.max(canvas.width, source.width);
        const h = Math.max(canvas.height, source.height);
        if (!validSize(w, h)) {
          sizeError();
          return;
        }
        if (w !== canvas.width || h !== canvas.height) setSize(w, h, false, false);
        setTool('select');
        const image = transparentCopy(source);
        const mask = sourceMask ? cloneCanvas(sourceMask) : makeCanvas(image.width, image.height);
        if (!sourceMask) {
          const mx = mask.getContext('2d');
          mx.fillStyle = '#000000';
          mx.fillRect(0, 0, mask.width, mask.height);
        }
        selection = {
          x: 0,
          y: 0,
          w: image.width,
          h: image.height,
          image,
          mask,
          lifted: false
        };
        ctx.drawImage(image, 0, 0);
        remember();
        renderOverlay();
        info('Pasted selection. Drag it into place.');
      }
      function pasteClipboard() {
        if (clipboard) pasteImage(clipboard.image, clipboard.mask);else info('Copy an area first, or use Paste From to insert a saved image. You can also paste an image from the clipboard.');
      }
      function moveSelection(dx, dy, copy = false) {
        if (!selection) return;
        if (!copy) eraseSelection();
        selection.image = transparentCopy(selection.image);
        selection.x += dx;
        selection.y += dy;
        ctx.drawImage(selection.image, selection.x, selection.y);
        remember();
        renderOverlay();
      }
      function cropSelection() {
        finishPending();
        if (!selection) {
          info('Select the area you want to keep before choosing Crop to Selection.');
          return;
        }
        const chosen = selection;
        selection = null;
        canvas.width = chosen.w;
        canvas.height = chosen.h;
        paintBackground();
        ctx.drawImage(chosen.image, 0, 0);
        fitSurface();
        remember();
      }
      function transformSource(source, type) {
        const quarter = type === 'right' || type === 'left';
        const result = makeCanvas(quarter ? source.height : source.width, quarter ? source.width : source.height);
        const tx = result.getContext('2d');
        tx.imageSmoothingEnabled = false;
        if (type === 'horizontal') {
          tx.translate(result.width, 0);
          tx.scale(-1, 1);
        }
        if (type === 'vertical') {
          tx.translate(0, result.height);
          tx.scale(1, -1);
        }
        if (type === 'right') {
          tx.translate(result.width, 0);
          tx.rotate(Math.PI / 2);
        }
        if (type === 'left') {
          tx.translate(0, result.height);
          tx.rotate(-Math.PI / 2);
        }
        if (type === 'half') {
          tx.translate(result.width, result.height);
          tx.rotate(Math.PI);
        }
        tx.drawImage(source, 0, 0);
        return result;
      }
      function transform(type) {
        finishPending();
        if (selection) {
          eraseSelection();
          selection.image = transformSource(selection.image, type);
          selection.mask = transformSource(selection.mask, type);
          selection.w = selection.image.width;
          selection.h = selection.image.height;
          ctx.drawImage(selection.image, selection.x, selection.y);
        } else {
          const result = transformSource(canvas, type);
          canvas.width = result.width;
          canvas.height = result.height;
          ctx.drawImage(result, 0, 0);
          fitSurface();
        }
        remember();
        renderOverlay();
      }
      function invertColors() {
        finishPending();
        const target = selection ? selection.image : canvas;
        const tx = target.getContext('2d');
        const pixels = tx.getImageData(0, 0, target.width, target.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          if (!pixels.data[i + 3]) continue;
          pixels.data[i] = 255 - pixels.data[i];
          pixels.data[i + 1] = 255 - pixels.data[i + 1];
          pixels.data[i + 2] = 255 - pixels.data[i + 2];
        }
        tx.putImageData(pixels, 0, 0);
        if (selection) ctx.drawImage(selection.image, selection.x, selection.y);
        remember();
        renderOverlay();
      }
      function clearImage() {
        finishPending();
        selection = null;
        paintBackground();
        remember();
        renderOverlay();
      }
      function floodFill(x, y, color) {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = image.data;
        const width = image.width;
        const height = image.height;
        const start = (y * width + x) * 4;
        const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
        const replacement = [...rgb(color), 255];
        if (target.every((v, i) => v === replacement[i])) return false;
        const matches = (px, py) => {
          const index = (py * width + px) * 4;
          return data[index] === target[0] && data[index + 1] === target[1] && data[index + 2] === target[2] && data[index + 3] === target[3];
        };
        const stack = [x, y];
        while (stack.length) {
          const sy = stack.pop();
          let sx = stack.pop();
          if (!matches(sx, sy)) continue;
          while (sx > 0 && matches(sx - 1, sy)) sx--;
          let above = false;
          let below = false;
          for (; sx < width && matches(sx, sy); sx++) {
            const index = (sy * width + sx) * 4;
            data[index] = replacement[0];
            data[index + 1] = replacement[1];
            data[index + 2] = replacement[2];
            data[index + 3] = 255;
            if (sy > 0) {
              const match = matches(sx, sy - 1);
              if (match && !above) stack.push(sx, sy - 1);
              above = match;
            }
            if (sy < height - 1) {
              const match = matches(sx, sy + 1);
              if (match && !below) stack.push(sx, sy + 1);
              below = match;
            }
          }
        }
        ctx.putImageData(image, 0, 0);
        return true;
      }
      function colorErase(p, size) {
        const left = clamp(Math.floor(p.x - size / 2), 0, canvas.width);
        const top = clamp(Math.floor(p.y - size / 2), 0, canvas.height);
        const right = clamp(Math.ceil(p.x + size / 2), 0, canvas.width);
        const bottom = clamp(Math.ceil(p.y + size / 2), 0, canvas.height);
        if (right <= left || bottom <= top) return;
        const pixels = ctx.getImageData(left, top, right - left, bottom - top);
        const from = rgb(fg);
        const to = rgb(bg);
        for (let i = 0; i < pixels.data.length; i += 4) {
          if (pixels.data[i] === from[0] && pixels.data[i + 1] === from[1] && pixels.data[i + 2] === from[2]) {
            pixels.data[i] = to[0];
            pixels.data[i + 1] = to[1];
            pixels.data[i + 2] = to[2];
            pixels.data[i + 3] = 255;
          }
        }
        ctx.putImageData(pixels, left, top);
      }
      function drawStroke(a, b, item) {
        if (item.tool === 'pencil') {
          let x = Math.round(a.x);
          let y = Math.round(a.y);
          const endX = Math.round(b.x);
          const endY = Math.round(b.y);
          const dx = Math.abs(endX - x);
          const dy = -Math.abs(endY - y);
          const sx = x < endX ? 1 : -1;
          const sy = y < endY ? 1 : -1;
          let error = dx + dy;
          ctx.fillStyle = item.color;
          for (;;) {
            ctx.fillRect(x, y, 1, 1);
            if (x === endX && y === endY) break;
            const twice = 2 * error;
            if (twice >= dy) {
              error += dy;
              x += sx;
            }
            if (twice <= dx) {
              error += dx;
              y += sy;
            }
          }
          return;
        }
        if (item.tool === 'eraser' && item.right) {
          const distance = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
          for (let i = 0; i <= distance; i++) colorErase({
            x: a.x + (b.x - a.x) * i / distance,
            y: a.y + (b.y - a.y) * i / distance
          }, item.width);
          return;
        }
        ctx.save();
        configureStroke(ctx, item.color, item.width);
        if (item.tool === 'eraser' || item.tool === 'brush' && item.brushShape === 'square') {
          const distance = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
          for (let i = 0; i <= distance; i++) ctx.fillRect(Math.round(a.x + (b.x - a.x) * i / distance - item.width / 2), Math.round(a.y + (b.y - a.y) * i / distance - item.width / 2), item.width, item.width);
        } else if (item.tool === 'brush' && (item.brushShape === 'slash' || item.brushShape === 'backslash')) {
          const distance = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
          ctx.lineWidth = 1;
          for (let i = 0; i <= distance; i++) {
            const x = a.x + (b.x - a.x) * i / distance;
            const y = a.y + (b.y - a.y) * i / distance;
            const sign = item.brushShape === 'slash' ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(x - item.width / 2, y - sign * item.width / 2);
            ctx.lineTo(x + item.width / 2, y + sign * item.width / 2);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(a.x + 0.5, a.y + 0.5);
          ctx.lineTo(b.x + 0.5, b.y + 0.5);
          ctx.stroke();
          if (a.x === b.x && a.y === b.y) {
            ctx.beginPath();
            ctx.arc(a.x + 0.5, a.y + 0.5, item.width / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      function spray() {
        if (!active || active.kind !== 'airbrush') return;
        ctx.fillStyle = active.color;
        const amount = Math.max(8, Math.round(active.width * 1.25));
        for (let i = 0; i < amount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.sqrt(Math.random()) * active.width;
          ctx.fillRect(Math.round(active.end.x + Math.cos(angle) * radius), Math.round(active.end.y + Math.sin(angle) * radius), 1, 1);
        }
      }
      function stopSpray() {
        if (sprayTimer !== null) {
          clearInterval(sprayTimer);
          sprayTimer = null;
        }
      }
      function positionTextBox() {
        if (!textBox) return;
        const r = textBox.paintRect;
        textBox.style.left = `${r.x * zoom}px`;
        textBox.style.top = `${r.y * zoom}px`;
        textBox.style.width = `${r.w * zoom}px`;
        textBox.style.height = `${r.h * zoom}px`;
        textBox.style.font = `${fontItalic ? 'italic ' : ''}${fontBold ? 'bold ' : ''}${fontSize * zoom}px ${fontFamily}`;
        textBox.style.lineHeight = `${fontSize * 1.2 * zoom}px`;
        textBox.style.color = fg;
        textBox.style.backgroundColor = textOpaque ? bg : 'transparent';
      }
      function startText(rect) {
        rect.w = Math.max(100, rect.w);
        rect.h = Math.max(40, rect.h);
        rect.w = Math.min(rect.w, Math.max(20, canvas.width - rect.x));
        rect.h = Math.min(rect.h, Math.max(20, canvas.height - rect.y));
        textBox = element('textarea', 'paint-text-editor');
        textBox.setAttribute('aria-label', 'Text to draw');
        textBox.spellcheck = false;
        textBox.paintRect = rect;
        textBox.addEventListener('input', updateTitle);
        textBox.addEventListener('keydown', e => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            removeTextBox();
            updateTitle();
            root.focus();
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.stopPropagation();
            e.preventDefault();
            commitText();
            root.focus();
          }
        });
        surface.append(textBox);
        positionTextBox();
        textBox.focus();
      }
      function removeTextBox() {
        if (textBox) {
          textBox.remove();
          textBox = null;
        }
      }
      function wrappedLines(text, maxWidth) {
        const lines = [];
        for (const paragraph of text.split('\n')) {
          if (!paragraph) {
            lines.push('');
            continue;
          }
          let line = '';
          for (const word of paragraph.split(/(\s+)/)) {
            if (line && ctx.measureText(line + word).width > maxWidth) {
              lines.push(line.trimEnd());
              line = '';
            }
            if (ctx.measureText(word).width > maxWidth) {
              for (const character of word) {
                if (line && ctx.measureText(line + character).width > maxWidth) {
                  lines.push(line);
                  line = '';
                }
                line += character;
              }
            } else line += word;
          }
          lines.push(line);
        }
        return lines;
      }
      function commitText() {
        if (!textBox) return;
        const box = textBox;
        const value = box.value;
        const rect = {
          ...box.paintRect,
          w: box.offsetWidth / zoom,
          h: box.offsetHeight / zoom
        };
        removeTextBox();
        if (!value) {
          updateTitle();
          return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();
        if (textOpaque) {
          ctx.fillStyle = bg;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.fillStyle = fg;
        ctx.font = `${fontItalic ? 'italic ' : ''}${fontBold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'top';
        const lines = wrappedLines(value, Math.max(1, rect.w - 4));
        lines.forEach((line, i) => ctx.fillText(line, rect.x + 2, rect.y + 2 + i * fontSize * 1.2));
        ctx.restore();
        remember();
        renderOverlay();
      }
      function finishCurve() {
        if (!curve) return;
        drawCurve(ctx, curve);
        curve = null;
        remember();
        renderOverlay();
      }
      function finishPolygon() {
        if (!polygon) return;
        if (polygon.points.length >= 2) {
          drawPolygon(ctx, polygon, true);
          remember();
        }
        polygon = null;
        renderOverlay();
      }
      function finishPending() {
        if (active) finishActive();
        commitText();
        finishCurve();
        finishPolygon();
      }
      function optionButton(label, selected, callback, title) {
        const button = element('button', `paint-option-button${selected ? ' is-selected' : ''}`, label);
        button.type = 'button';
        button.title = title || label;
        button.setAttribute('aria-pressed', String(selected));
        button.addEventListener('click', () => {
          callback();
          rebuildOptions();
          if (textBox) {
            positionTextBox();
            textBox.focus();
          } else root.focus();
        });
        return button;
      }
      function optionLabel(text) {
        options.append(element('div', 'paint-option-label', text));
      }
      function widthOptions(values, current, update, squares = false) {
        const group = element('div', 'paint-width-options');
        values.forEach(width => {
          const button = optionButton('', current === width, () => update(width), `${width} pixel${width === 1 ? '' : 's'}`);
          const mark = element('span', squares ? 'paint-size-square' : 'paint-size-line');
          if (squares) {
            mark.style.width = `${Math.min(width, 17)}px`;
            mark.style.height = `${Math.min(width, 17)}px`;
          } else mark.style.height = `${Math.min(width, 8)}px`;
          button.append(mark);
          group.append(button);
        });
        options.append(group);
      }
      function rebuildOptions() {
        options.replaceChildren();
        options.hidden = false;
        if (tool === 'select' || tool === 'free-select') {
          optionLabel('Selection');
          options.append(optionButton('Opaque', selectionOpaque, () => {
            selectionOpaque = true;
          }, 'Move all selected pixels'));
          options.append(optionButton('Clear', !selectionOpaque, () => {
            selectionOpaque = false;
          }, 'Treat the background color as transparent when moving or pasting'));
        } else if (tool === 'eraser') {
          optionLabel('Size');
          widthOptions([4, 8, 12, 20], eraserSize, value => {
            eraserSize = value;
          }, true);
        } else if (tool === 'brush') {
          const grid = element('div', 'paint-brush-options');
          [['round', '●', 'Round brush'], ['square', '■', 'Square brush'], ['slash', '/', 'Diagonal brush'], ['backslash', '\\', 'Backwards diagonal brush']].forEach(([value, mark, title]) => grid.append(optionButton(mark, brushShape === value, () => {
            brushShape = value;
          }, title)));
          options.append(grid);
          widthOptions([2, 4, 8, 12], brushSize, value => {
            brushSize = value;
          });
        } else if (tool === 'airbrush') {
          optionLabel('Spray');
          widthOptions([6, 12, 20], spraySize, value => {
            spraySize = value;
          }, true);
        } else if (tool === 'zoom') {
          [1, 2, 4, 6, 8].forEach(value => options.append(optionButton(`${value}×`, zoom === value, () => setZoom(value))));
        } else if (tool === 'text') {
          optionLabel('Font');
          const fonts = element('select', 'paint-font-select');
          fonts.setAttribute('aria-label', 'Text font');
          ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia'].forEach(name => {
            const option = element('option', '', name);
            option.value = name;
            option.selected = name === fontFamily;
            fonts.append(option);
          });
          fonts.addEventListener('change', () => {
            fontFamily = fonts.value;
            positionTextBox();
            if (textBox) textBox.focus();
          });
          const size = element('input', 'paint-font-size');
          size.type = 'number';
          size.min = '6';
          size.max = '144';
          size.value = String(fontSize);
          size.setAttribute('aria-label', 'Text size in pixels');
          size.addEventListener('change', () => {
            fontSize = clamp(Number(size.value) || 16, 6, 144);
            size.value = fontSize;
            positionTextBox();
            if (textBox) textBox.focus();
          });
          options.append(fonts, size);
          const emphasis = element('div', 'paint-brush-options');
          emphasis.append(optionButton('B', fontBold, () => {
            fontBold = !fontBold;
          }, 'Bold'), optionButton('I', fontItalic, () => {
            fontItalic = !fontItalic;
          }, 'Italic'));
          options.append(emphasis, optionButton('Opaque', textOpaque, () => {
            textOpaque = !textOpaque;
          }, 'Toggle an opaque text background'));
        } else if (['line', 'curve', 'rectangle', 'polygon', 'ellipse', 'rounded'].includes(tool)) {
          if (!['line', 'curve'].includes(tool)) {
            [['outline', '□', 'Outline only'], ['both', '▣', 'Outline with background fill'], ['filled', '■', 'Solid foreground fill']].forEach(([value, mark, title]) => options.append(optionButton(mark, shapeMode === value, () => {
              shapeMode = value;
            }, title)));
          }
          widthOptions([1, 2, 3, 5, 8], strokeWidth, value => {
            strokeWidth = value;
          });
        } else options.hidden = true;
      }
      function setTool(id) {
        if (id !== tool) finishPending();
        if (!['select', 'free-select'].includes(id)) deselect();
        if (!['picker', 'zoom', 'select', 'free-select'].includes(tool)) lastDrawTool = tool;
        tool = id;
        toolButtons.forEach((button, key) => {
          button.classList.toggle('is-selected', key === id);
          button.setAttribute('aria-pressed', String(key === id));
        });
        canvas.style.cursor = ['select', 'free-select'].includes(id) ? 'crosshair' : id === 'text' ? 'text' : id === 'zoom' ? 'zoom-in' : 'crosshair';
        rebuildOptions();
        info();
      }
      function updateColors() {
        frontColor.style.backgroundColor = fg;
        backColor.style.backgroundColor = bg;
        frontColor.title = `Foreground: ${fg}`;
        backColor.title = `Background: ${bg}`;
        customColor.value = fg;
        positionTextBox();
      }
      TOOLS.forEach(([id, name, help]) => {
        const button = element('button', 'paint-tool');
        button.type = 'button';
        button.innerHTML = toolIcon(id);
        button.title = name;
        button.setAttribute('aria-label', name);
        button.setAttribute('aria-pressed', String(id === tool));
        button.addEventListener('click', () => {
          setTool(id);
          root.focus();
        });
        button.addEventListener('mouseenter', () => info(help));
        button.addEventListener('mouseleave', () => info());
        toolGrid.append(button);
        toolButtons.set(id, button);
      });
      PALETTE.forEach(color => {
        const button = element('button', 'paint-swatch');
        button.type = 'button';
        button.title = `${color} — left: foreground; right: background`;
        button.setAttribute('aria-label', `Paint color ${color}`);
        const inside = element('span');
        inside.style.backgroundColor = color;
        button.append(inside);
        button.addEventListener('click', () => {
          fg = color;
          updateColors();
        });
        button.addEventListener('contextmenu', event => {
          event.preventDefault();
          bg = color;
          updateColors();
        });
        button.addEventListener('dblclick', () => {
          customColor.value = fg;
          customColor.click();
        });
        swatchGrid.append(button);
      });
      currentColors.addEventListener('click', () => {
        [fg, bg] = [bg, fg];
        updateColors();
      });
      customColor.addEventListener('input', () => {
        fg = customColor.value;
        updateColors();
      });
      function beginPointer(event) {
        if (busy || event.button > 2 || event.button === 1) return;
        event.preventDefault();
        root.focus();
        win.focus();
        if (active) finishActive();
        if (textBox) commitText();
        const p = point(event, true);
        const right = event.button === 2;
        const color = right ? bg : fg;
        if (tool === 'polygon') {
          if (event.detail > 1) {
            finishPolygon();
            return;
          }
          if (!polygon) polygon = {
            points: [p],
            hover: p,
            color,
            background: right ? fg : bg,
            width: strokeWidth,
            mode: shapeMode
          };else {
            const first = polygon.points[0];
            if (polygon.points.length > 2 && Math.hypot(first.x - p.x, first.y - p.y) < 6 / zoom) finishPolygon();else polygon.points.push(constrained(polygon.points[polygon.points.length - 1], p, false, event.shiftKey));
          }
          renderOverlay();
          return;
        }
        if (tool === 'fill') {
          deselect();
          if (floodFill(p.x, p.y, color)) remember();
          return;
        }
        if (tool === 'picker') {
          const picked = colorHex(ctx.getImageData(p.x, p.y, 1, 1).data);
          if (right) bg = picked;else fg = picked;
          updateColors();
          setTool(lastDrawTool);
          return;
        }
        if (tool === 'zoom') {
          zoomStep(right ? -1 : 1, p);
          return;
        }
        canvas.setPointerCapture(event.pointerId);
        const common = {
          pointerId: event.pointerId,
          start: p,
          end: p,
          last: p,
          right,
          tool,
          color,
          background: right ? fg : bg,
          width: strokeWidth,
          mode: shapeMode
        };
        if (tool === 'select' || tool === 'free-select') {
          if (selectionAt(p)) {
            const originalImage = selection.image;
            active = {
              ...common,
              kind: 'move',
              original: {
                x: selection.x,
                y: selection.y,
                image: originalImage
              },
              baseline: ctx.getImageData(0, 0, canvas.width, canvas.height),
              copy: event.ctrlKey || event.metaKey
            };
            selection.image = transparentCopy(selection.image);
            if (!active.copy) eraseSelection();
            selection.lifted = true;
            canvas.style.cursor = 'move';
          } else {
            selection = null;
            active = {
              ...common,
              kind: 'select',
              free: tool === 'free-select',
              points: [p]
            };
          }
        } else if (tool === 'text') active = {
          ...common,
          kind: 'text-box'
        };else if (tool === 'curve') {
          if (curve) {
            const control = curve.stage === 1 ? 'c1' : 'c2';
            curve[control] = p;
            active = {
              ...common,
              kind: 'curve-control',
              control
            };
          } else active = {
            ...common,
            kind: 'curve-line'
          };
        } else if (['line', 'rectangle', 'ellipse', 'rounded'].includes(tool)) active = {
          ...common,
          kind: 'shape'
        };else if (tool === 'pencil' && event.shiftKey) active = {
          ...common,
          tool: 'line',
          kind: 'pencil-line',
          width: 1
        };else if (tool === 'airbrush') {
          active = {
            ...common,
            kind: 'airbrush',
            width: spraySize
          };
          spray();
          sprayTimer = setInterval(spray, 35);
        } else {
          active = {
            ...common,
            kind: 'stroke',
            width: tool === 'pencil' ? 1 : tool === 'eraser' ? eraserSize : brushSize,
            color: tool === 'eraser' ? bg : color,
            brushShape
          };
          drawStroke(p, p, active);
        }
        renderOverlay();
      }
      function movePointer(event) {
        const p = point(event);
        if (statusCoords) statusCoords.textContent = `${p.x}, ${p.y} px`;
        if (polygon && !active) {
          polygon.hover = constrained(polygon.points[polygon.points.length - 1], p, false, event.shiftKey);
          renderOverlay();
        }
        if (!active) {
          if (tool === 'select' || tool === 'free-select') canvas.style.cursor = selectionAt(p) ? 'move' : 'crosshair';
          return;
        }
        if (event.pointerId !== active.pointerId) return;
        active.end = constrained(active.start, p, !['line', 'curve', 'pencil'].includes(tool), event.shiftKey && ['shape', 'pencil-line', 'curve-line', 'select'].includes(active.kind));
        if (active.kind === 'stroke') drawStroke(active.last, p, active);
        if (active.kind === 'move') {
          selection.x = active.original.x + p.x - active.start.x;
          selection.y = active.original.y + p.y - active.start.y;
        }
        if (active.kind === 'select' && active.free) active.points.push({
          x: clamp(p.x, 0, canvas.width),
          y: clamp(p.y, 0, canvas.height)
        });
        if (active.kind === 'curve-control') curve[active.control] = p;
        active.last = p;
        renderOverlay();
      }
      function finishActive(event) {
        if (!active || event && event.pointerId !== active.pointerId) return;
        stopSpray();
        const item = active;
        active = null;
        try {
          if (canvas.hasPointerCapture(item.pointerId)) canvas.releasePointerCapture(item.pointerId);
        } catch (_) {/* Pointer capture may already have ended. */}
        if (item.kind === 'stroke' || item.kind === 'airbrush') remember();
        if (item.kind === 'shape' || item.kind === 'pencil-line') {
          drawShape(ctx, item);
          remember();
        }
        if (item.kind === 'curve-line') {
          curve = {
            ...item,
            stage: 1,
            c1: null,
            c2: null
          };
          info('Now drag to make the first bend.');
        }
        if (item.kind === 'curve-control') {
          if (item.control === 'c1') {
            curve.stage = 2;
            info('Drag once more to make the second bend. Enter finishes the curve.');
          } else finishCurve();
        }
        if (item.kind === 'select') {
          if (item.free && item.points.length >= 3) {
            const xs = item.points.map(p => p.x);
            const ys = item.points.map(p => p.y);
            captureSelection({
              x: Math.min(...xs),
              y: Math.min(...ys),
              w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
              h: Math.max(1, Math.max(...ys) - Math.min(...ys))
            }, item.points);
          } else if (!item.free && (item.start.x !== item.end.x || item.start.y !== item.end.y)) captureSelection(normalizeRect(item.start, item.end));
        }
        if (item.kind === 'move') {
          selection.lifted = false;
          ctx.drawImage(selection.image, selection.x, selection.y);
          if (selection.x !== item.original.x || selection.y !== item.original.y || item.copy) remember();
          canvas.style.cursor = 'move';
        }
        if (item.kind === 'text-box') startText(normalizeRect(item.start, item.end));
        renderOverlay();
      }
      function cancelActive() {
        if (!active) return;
        stopSpray();
        const item = active;
        active = null;
        if (item.kind === 'move') {
          ctx.putImageData(item.baseline, 0, 0);
          selection.x = item.original.x;
          selection.y = item.original.y;
          selection.image = item.original.image;
          selection.lifted = false;
        } else if (item.kind === 'stroke' || item.kind === 'airbrush') {
          const entry = history[historyIndex];
          if (entry) ctx.putImageData(entry.pixels, 0, 0);
        } else if (item.kind === 'curve-control') curve[item.control] = null;
        try {
          if (canvas.hasPointerCapture(item.pointerId)) canvas.releasePointerCapture(item.pointerId);
        } catch (_) {/* No live pointer. */}
        renderOverlay();
      }
      canvas.addEventListener('pointerdown', beginPointer);
      canvas.addEventListener('pointermove', movePointer);
      canvas.addEventListener('pointerup', finishActive);
      canvas.addEventListener('pointercancel', cancelActive);
      canvas.addEventListener('lostpointercapture', () => {
        if (active) finishActive();
      });
      canvas.addEventListener('contextmenu', event => event.preventDefault());
      canvas.addEventListener('dblclick', event => {
        if (tool === 'polygon') {
          event.preventDefault();
          finishPolygon();
        }
      });
      canvas.addEventListener('pointerleave', () => {
        if (!active && statusCoords) statusCoords.textContent = '';
      });
      work.addEventListener('wheel', event => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        zoomStep(event.deltaY < 0 ? 1 : -1, point(event));
      }, {
        passive: false
      });
      work.addEventListener('pointerdown', event => {
        if (event.target === work || event.target === surface) {
          finishPending();
          deselect();
          root.focus();
        }
      });
      for (const direction of ['e', 's', 'se']) {
        const handle = element('div', `paint-resize-handle paint-resize-${direction}`);
        handle.title = 'Drag to resize the canvas';
        handle.setAttribute('aria-label', 'Resize canvas');
        let resize = null;
        handle.addEventListener('pointerdown', event => {
          if (event.button !== 0 || busy) return;
          event.preventDefault();
          event.stopPropagation();
          finishPending();
          root.focus();
          handle.setPointerCapture(event.pointerId);
          const ghost = element('div', 'paint-resize-ghost');
          surface.append(ghost);
          resize = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            w: canvas.width,
            h: canvas.height,
            newW: canvas.width,
            newH: canvas.height,
            ghost
          };
          ghost.style.width = `${resize.w * zoom}px`;
          ghost.style.height = `${resize.h * zoom}px`;
        });
        handle.addEventListener('pointermove', event => {
          if (!resize) return;
          resize.newW = direction.includes('e') ? clamp(Math.round(resize.w + (event.clientX - resize.x) / zoom), 1, MAX_SIDE) : resize.w;
          resize.newH = direction.includes('s') ? clamp(Math.round(resize.h + (event.clientY - resize.y) / zoom), 1, MAX_SIDE) : resize.h;
          resize.ghost.style.width = `${resize.newW * zoom}px`;
          resize.ghost.style.height = `${resize.newH * zoom}px`;
          info(`New canvas size: ${resize.newW} × ${resize.newH} pixels`);
        });
        const endResize = event => {
          if (!resize) return;
          const item = resize;
          resize = null;
          item.ghost.remove();
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          if (event.type !== 'pointercancel' && (item.w !== item.newW || item.h !== item.newH)) setSize(item.newW, item.newH);
          info();
        };
        handle.addEventListener('pointerup', endResize);
        handle.addEventListener('pointercancel', endResize);
        surface.append(handle);
      }
      async function errorDialog(message) {
        await sys.dialog({
          title: 'Paint',
          icon: 'error',
          message,
          buttons: [{
            label: 'OK',
            value: 'ok'
          }]
        });
      }
      function loadImage(source) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('This file is not a supported image, or the image could not be read.'));
          image.src = source;
        });
      }
      async function loadDocument(source, path = null, importedName = null) {
        busy = true;
        root.classList.add('paint-is-busy');
        try {
          const image = await loadImage(source);
          if (!validSize(image.naturalWidth, image.naturalHeight)) {
            await sizeError();
            return false;
          }
          if (closed) return false;
          selection = null;
          curve = null;
          polygon = null;
          removeTextBox();
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          paintBackground(ctx, canvas.width, canvas.height, '#ffffff');
          ctx.drawImage(image, 0, 0);
          filePath = path;
          documentName = path ? baseName(path) : importedName ? baseName(importedName).replace(/\.[^.]+$/, '') : 'Untitled';
          zoom = 1;
          fitSurface();
          savedId = null;
          remember(!!path, true);
          info();
          return true;
        } catch (error) {
          await errorDialog(error.message || 'The image could not be opened.');
          return false;
        } finally {
          busy = false;
          root.classList.remove('paint-is-busy');
        }
      }
      async function save(as = false) {
        if (busy) return false;
        finishPending();
        let path = filePath;
        if (!path || as || !/\.png$/i.test(path)) {
          path = await sys.fileDialog({
            mode: 'save',
            path: filePath ? filePath.replace(/[\\/][^\\/]+$/, '') : 'C:/My Documents',
            filename: `${documentName.replace(/\.[^.]+$/, '') || 'Untitled'}.png`,
            filter: '.png'
          });
          if (!path) return false;
          if (!/\.png$/i.test(path)) path += '.png';
        }
        try {
          const id = history[historyIndex]?.id;
          const data = canvas.toDataURL('image/png');
          await sys.vfs.write(path, data, {
            mime: 'image/png'
          });
          filePath = path;
          documentName = baseName(path);
          savedId = id;
          updateTitle();
          info(`Saved ${documentName}.`);
          return true;
        } catch (error) {
          await errorDialog(`The picture could not be saved. ${error.message || ''}`);
          return false;
        }
      }
      async function confirmDiscard() {
        finishPending();
        if (!dirty()) return true;
        const answer = await sys.dialog({
          title: 'Paint',
          icon: 'warning',
          message: `Save changes to ${documentName}?`,
          buttons: [{
            label: 'Yes',
            value: 'save'
          }, {
            label: 'No',
            value: 'discard'
          }, {
            label: 'Cancel',
            value: 'cancel'
          }]
        });
        if (answer === 'save') return save();
        return answer === 'discard';
      }
      async function newImage() {
        if (busy || !(await confirmDiscard())) return;
        selection = null;
        curve = null;
        polygon = null;
        removeTextBox();
        canvas.width = 480;
        canvas.height = 300;
        paintBackground(ctx, 480, 300, '#ffffff');
        filePath = null;
        documentName = 'Untitled';
        zoom = 1;
        fitSurface();
        remember(true, true);
        info();
      }
      async function openImage() {
        if (busy || !(await confirmDiscard())) return;
        const path = await sys.fileDialog({
          mode: 'open',
          path: filePath ? filePath.replace(/[\\/][^\\/]+$/, '') : 'C:/My Documents',
          filter: '.png,.jpg,.jpeg,.gif,.bmp,.webp'
        });
        if (!path) return;
        try {
          await loadDocument(await sys.vfs.read(path), path);
        } catch (error) {
          await errorDialog(`The file could not be opened. ${error.message || ''}`);
        }
      }
      async function copyTo() {
        finishPending();
        if (!selection) {
          info('Select an area to save first.');
          return;
        }
        const data = selection.image.toDataURL('image/png');
        let path = await sys.fileDialog({
          mode: 'save',
          path: 'C:/My Documents',
          filename: 'Selection.png',
          filter: '.png'
        });
        if (!path) return;
        if (!/\.png$/i.test(path)) path += '.png';
        try {
          await sys.vfs.write(path, data, {
            mime: 'image/png'
          });
          info(`Saved ${baseName(path)}.`);
        } catch (error) {
          await errorDialog(error.message || 'The selection could not be saved.');
        }
      }
      async function pasteFrom() {
        const path = await sys.fileDialog({
          mode: 'open',
          path: 'C:/My Documents',
          filter: '.png,.jpg,.jpeg,.gif,.bmp,.webp'
        });
        if (!path) return;
        try {
          const image = await loadImage(await sys.vfs.read(path));
          if (!validSize(image.naturalWidth, image.naturalHeight)) return sizeError();
          const copy = makeCanvas(image.naturalWidth, image.naturalHeight);
          copy.getContext('2d').drawImage(image, 0, 0);
          pasteImage(copy);
        } catch (error) {
          await errorDialog(error.message || 'The picture could not be pasted.');
        }
      }
      const fileInput = element('input', 'paint-hidden-file');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      root.append(fileInput);
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file || !(await confirmDiscard())) return;
        const reader = new FileReader();
        reader.onload = () => loadDocument(reader.result, null, file.name);
        reader.onerror = () => errorDialog('The selected file could not be read.');
        reader.readAsDataURL(file);
      });
      function exportPng() {
        finishPending();
        sys.download(canvas.toDataURL('image/png'), `${documentName.replace(/\.[^.]+$/, '') || 'Untitled'}.png`, 'image/png');
        info('The PNG download is ready.');
      }
      async function pasteEvent(event) {
        if (!win.el.contains(document.activeElement) || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
        const item = [...(event.clipboardData?.items || [])].find(value => value.type.startsWith('image/'));
        if (item) {
          event.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const image = await loadImage(reader.result);
              if (!validSize(image.naturalWidth, image.naturalHeight)) return sizeError();
              const copy = makeCanvas(image.naturalWidth, image.naturalHeight);
              copy.getContext('2d').drawImage(image, 0, 0);
              pasteImage(copy);
            } catch (error) {
              await errorDialog(error.message);
            }
          };
          reader.readAsDataURL(file);
        } else if (clipboard) {
          event.preventDefault();
          pasteClipboard();
        }
      }
      document.addEventListener('paste', pasteEvent);
      function keydown(event) {
        const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
        if (isInput) return;
        const key = event.key.toLowerCase();
        const command = event.ctrlKey || event.metaKey;
        if (command) {
          const shortcuts = {
            n: newImage,
            o: openImage,
            s: () => save(event.shiftKey),
            z: () => event.shiftKey ? redo() : undo(),
            y: redo,
            a: selectAll,
            c: copySelection,
            x: cutSelection,
            '+': () => zoomStep(1),
            '=': () => zoomStep(1),
            '-': () => zoomStep(-1),
            '0': () => setZoom(1)
          };
          if (key === 'v') {
            if (clipboard) {
              event.preventDefault();
              pasteClipboard();
            }
            return;
          }
          if (shortcuts[key]) {
            event.preventDefault();
            event.stopPropagation();
            shortcuts[key]();
          }
          return;
        }
        if (key === 'escape') {
          event.preventDefault();
          if (active) cancelActive();else if (curve || polygon) {
            curve = null;
            polygon = null;
            renderOverlay();
          } else deselect();
          info();
          return;
        }
        if (key === 'enter') {
          event.preventDefault();
          finishCurve();
          finishPolygon();
          return;
        }
        if (key === 'delete' || key === 'backspace') {
          if (selection) {
            event.preventDefault();
            deleteSelection();
          }
          return;
        }
        if (selection && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
          event.preventDefault();
          const amount = event.shiftKey ? 10 : 1;
          moveSelection(key === 'arrowleft' ? -amount : key === 'arrowright' ? amount : 0, key === 'arrowup' ? -amount : key === 'arrowdown' ? amount : 0);
          return;
        }
        const hotkeys = {
          p: 'pencil',
          b: 'brush',
          e: 'eraser',
          f: 'fill',
          i: 'picker',
          m: 'zoom',
          t: 'text',
          l: 'line',
          r: 'rectangle',
          s: 'select'
        };
        if (hotkeys[key]) {
          event.preventDefault();
          setTool(hotkeys[key]);
        }
      }
      win.el.addEventListener('keydown', keydown);
      const sep = {
        type: 'separator'
      };
      sys.menuBar(win, [{
        label: 'File',
        items: [{
          label: 'New',
          shortcut: 'Ctrl+N',
          action: newImage
        }, {
          label: 'Open...',
          shortcut: 'Ctrl+O',
          action: openImage
        }, {
          label: 'Save',
          shortcut: 'Ctrl+S',
          action: () => save()
        }, {
          label: 'Save As...',
          shortcut: 'Ctrl+Shift+S',
          action: () => save(true)
        }, sep, {
          label: 'Import From Computer...',
          action: () => fileInput.click()
        }, {
          label: 'Export PNG...',
          action: exportPng
        }, sep, {
          label: 'Exit',
          action: () => win.close()
        }]
      }, {
        label: 'Edit',
        items: [{
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: undo
        }, {
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          action: redo
        }, sep, {
          label: 'Cut',
          shortcut: 'Ctrl+X',
          action: cutSelection
        }, {
          label: 'Copy',
          shortcut: 'Ctrl+C',
          action: copySelection
        }, {
          label: 'Paste',
          shortcut: 'Ctrl+V',
          action: pasteClipboard
        }, {
          label: 'Clear Selection',
          shortcut: 'Del',
          action: deleteSelection
        }, {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          action: selectAll
        }, sep, {
          label: 'Copy To...',
          action: copyTo
        }, {
          label: 'Paste From...',
          action: pasteFrom
        }]
      }, {
        label: 'View',
        items: [{
          label: 'Tool Box',
          action: () => {
            toolbox.hidden = !toolbox.hidden;
          }
        }, {
          label: 'Color Box',
          action: () => {
            palette.hidden = !palette.hidden;
          }
        }, {
          label: 'Status Bar',
          action: () => {
            status.hidden = !status.hidden;
          }
        }, sep, {
          label: 'Normal Size',
          shortcut: 'Ctrl+0',
          action: () => setZoom(1)
        }, {
          label: 'Zoom In',
          shortcut: 'Ctrl++',
          action: () => zoomStep(1)
        }, {
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          action: () => zoomStep(-1)
        }, {
          label: 'Fit in Window',
          action: () => setZoom(Math.min(1, Math.max(0.25, (work.clientWidth - 24) / canvas.width), Math.max(0.25, (work.clientHeight - 24) / canvas.height)))
        }]
      }, {
        label: 'Image',
        items: [{
          label: 'Flip Horizontal',
          action: () => transform('horizontal')
        }, {
          label: 'Flip Vertical',
          action: () => transform('vertical')
        }, {
          label: 'Rotate 90° Clockwise',
          action: () => transform('right')
        }, {
          label: 'Rotate 90° Counterclockwise',
          action: () => transform('left')
        }, {
          label: 'Rotate 180°',
          action: () => transform('half')
        }, sep, {
          label: 'Resize Image...',
          action: () => resizeImage(true)
        }, {
          label: 'Attributes...',
          action: () => resizeImage(false)
        }, {
          label: 'Crop to Selection',
          action: cropSelection
        }, sep, {
          label: 'Invert Colors',
          action: invertColors
        }, {
          label: 'Clear Image',
          action: clearImage
        }]
      }, {
        label: 'Colors',
        items: [{
          label: 'Edit Colors...',
          action: () => {
            customColor.value = fg;
            customColor.click();
          }
        }, {
          label: 'Swap Foreground / Background',
          action: () => {
            [fg, bg] = [bg, fg];
            updateColors();
          }
        }]
      }, {
        label: 'Help',
        items: [{
          label: 'Help Topics',
          action: () => sys.dialog({
            title: 'Paint Help',
            icon: 'help',
            message: 'Choose a tool on the left, then draw on the white canvas. Click a color for the foreground; right-click a color for the background. Right-drag draws with the background color. Hold Shift for squares, circles, and constrained lines. Select an area to move, copy, crop, flip, or rotate it. For a curve, draw a line and then make two bends. For a polygon, click its corners and double-click to finish. Text is applied when you click outside the box or press Ctrl+Enter. Ctrl+Z undoes your last change. Save stores a PNG in My Documents; Export PNG downloads a copy.',
            buttons: [{
              label: 'OK',
              value: 'ok'
            }]
          })
        }, {
          label: 'About Paint',
          action: () => sys.dialog({
            title: 'About Paint',
            icon: 'paint',
            message: 'Paint\nA classic painting program for your desktop.\n\nCreate and edit pictures with sixteen drawing tools, selections, color fills, text, and image transformations.',
            buttons: [{
              label: 'OK',
              value: 'ok'
            }]
          })
        }]
      }]);
      win.body.append(root);
      const status = sys.statusBar(win, '');
      status.classList.add('paint-status');
      status.replaceChildren();
      statusText = element('span', 'paint-status-help');
      statusCoords = element('span', 'paint-status-coords');
      statusSize = element('span', 'paint-status-size');
      statusZoom = element('span', 'paint-status-zoom');
      status.append(statusText, statusCoords, statusSize, statusZoom);
      win.onBeforeClose = confirmDiscard;
      win.addCleanup(() => {
        closed = true;
        stopSpray();
        document.removeEventListener('paste', pasteEvent);
        win.el.removeEventListener('keydown', keydown);
        history = [];
        selection = null;
        active = null;
        removeTextBox();
      });
      paintBackground(ctx, 480, 300, '#ffffff');
      fitSurface();
      remember(true, true);
      updateColors();
      setTool('pencil');
      if (args.path) Promise.resolve().then(() => sys.vfs.read(args.path)).then(data => loadDocument(data, args.path)).catch(error => errorDialog(error.message || 'The picture could not be opened.'));else if (args.dataUrl || args.content) loadDocument(args.dataUrl || args.content);
      root.focus();
      return win;
    }
  });
}
