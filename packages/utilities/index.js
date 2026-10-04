/* Dependency-free local accessories; hardware access always starts with a user action. */
const E = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, action, cls = '') => {
  const node = E('button', `win-button utility-button ${cls}`, label);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
};
const item = (label, action, shortcut) => ({
  label,
  action,
  ...(shortcut ? {
    shortcut
  } : {})
});
const separator = {
  type: 'separator'
};
const basename = path => String(path || '').split(/[\\/]/).pop() || 'Untitled';
const escapeHTML = text => String(text || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[ch]);
const clamp = (number, min, max) => Math.min(max, Math.max(min, Number(number) || 0));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export function registerUtilities(sys) {
  const get = (key, fallback) => {
    try {
      return sys.settings.get(key, fallback);
    } catch {
      return fallback;
    }
  };
  const set = (key, value) => {
    try {
      sys.settings.set(key, value);
    } catch {/* retain session state */}
  };
  const tell = (title, message) => sys.dialog({
    title,
    message,
    icon: 'info',
    buttons: [{
      label: 'OK',
      value: 'ok'
    }]
  });
  const winFor = (options, cls) => {
    const win = sys.wm.create(options);
    win.body.classList.add('utility-app', cls);
    return win;
  };
  const status = (win, text) => {
    const node = sys.statusBar(win, text);
    node.classList.add('utility-status');
    return node;
  };
  const listen = (win, target, name, fn) => {
    if (!target?.addEventListener) return;
    target.addEventListener(name, fn);
    win.addCleanup(() => target.removeEventListener(name, fn));
  };
  const icon = (name, size = 16) => {
    const span = E('span', 'utility-icon');
    span.innerHTML = sys.icon(name, size);
    return span;
  };
  const pick = (accept, callback) => {
    const input = E('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      if (input.files?.[0]) Promise.resolve(callback(input.files[0])).catch(error => tell('Open File', error.message || 'The file could not be opened.'));
    });
    input.click();
  };
  const dataURL = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    reader.readAsDataURL(blob);
  });
  function imaging(args = {}) {
    const win = winFor({
      title: 'Imaging',
      icon: 'imaging',
      width: 700,
      height: 515,
      minWidth: 390,
      minHeight: 290,
      resizable: true
    }, 'utility-imaging');
    let source = null,
      sourceURL = null,
      name = 'Untitled',
      rotation = 0,
      mirrored = false,
      zoom = 1,
      fit = true,
      disposed = false,
      loadGeneration = 0;
    const toolbar = E('div', 'toolbar utility-toolbar');
    const open = button('Open...', () => openSaved());
    open.prepend(icon('folder'));
    const imported = button('Import...', () => importImage());
    const smaller = button('−', () => setZoom(zoom / 1.25));
    smaller.title = 'Zoom out';
    smaller.setAttribute('aria-label', 'Zoom out');
    const larger = button('+', () => setZoom(zoom * 1.25));
    larger.title = 'Zoom in';
    larger.setAttribute('aria-label', 'Zoom in');
    const zoomSelect = E('select', 'sunken');
    zoomSelect.setAttribute('aria-label', 'Image zoom');
    [['Fit', 'fit'], ['25%', '.25'], ['50%', '.5'], ['100%', '1'], ['150%', '1.5'], ['200%', '2'], ['400%', '4']].forEach(([label, value]) => {
      const option = E('option', '', label);
      option.value = value;
      zoomSelect.append(option);
    });
    zoomSelect.addEventListener('change', () => zoomSelect.value === 'fit' ? fitImage() : setZoom(Number(zoomSelect.value)));
    const rotateLeft = button('↶', () => rotate(-1));
    rotateLeft.title = 'Rotate left 90°';
    rotateLeft.setAttribute('aria-label', 'Rotate left');
    const rotateRight = button('↷', () => rotate(1));
    rotateRight.title = 'Rotate right 90°';
    rotateRight.setAttribute('aria-label', 'Rotate right');
    const exportButton = button('Export PNG...', exportImage);
    const printButton = button('Print...', printImage);
    printButton.prepend(icon('printer'));
    toolbar.append(open, imported, E('span', 'utility-divider'), smaller, zoomSelect, larger, E('span', 'utility-divider'), rotateLeft, rotateRight, exportButton, printButton);
    const viewport = E('div', 'utility-image-viewport sunken');
    const stage = E('div', 'utility-image-stage');
    const canvas = E('canvas', 'utility-image-canvas');
    canvas.hidden = true;
    const empty = E('div', 'utility-image-empty');
    empty.append(icon('imaging', 32), E('strong', '', 'Imaging'), E('span', '', 'Open a saved image or import a picture from your computer.'), button('Import a Picture...', importImage));
    stage.append(canvas, empty);
    viewport.append(stage);
    win.body.append(toolbar, viewport);
    const bar = status(win, 'No image loaded');
    const imageControls = [smaller, larger, zoomSelect, rotateLeft, rotateRight, exportButton, printButton];
    const raster = type => /^image\/(png|jpeg|jpg|gif|bmp|x-ms-bmp|webp|avif)$/i.test(type);
    async function importImage() {
      pick('image/png,image/jpeg,image/gif,image/bmp,image/webp,image/avif,.bmp', async file => {
        if (file.type && !raster(file.type)) return tell('Imaging', 'Imaging opens PNG, JPEG, GIF, BMP, WebP, and AVIF pictures. Import a raster image in one of these formats.');
        if (file.size > 64 * 1024 * 1024) return tell('Imaging', 'This picture is too large to open here. Choose a file smaller than 64 MB.');
        const url = URL.createObjectURL(file);
        await loadImage(url, file.name, true);
      });
    }
    async function openSaved(path) {
      path = path || (await sys.fileDialog({
        mode: 'open',
        path: 'C:/My Documents',
        filter: '.png,.jpg,.jpeg,.gif,.bmp,.webp,.avif'
      }));
      if (!path) return;
      const content = sys.vfs.read(path);
      const match = typeof content === 'string' && /^data:([^;,]+)[;,]/i.exec(content);
      if (!match || !raster(match[1])) return tell('Imaging', 'This file does not contain a supported saved raster image. Use Import to open a picture from your computer.');
      await loadImage(content, basename(path), false);
    }
    async function loadImage(url, filename, ownsURL) {
      const generation = ++loadGeneration;
      bar.textContent = `Opening ${filename}...`;
      const image = new Image();
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('This image could not be decoded. Its format may not be supported by this browser.'));
          image.src = url;
        });
        if (disposed || generation !== loadGeneration) {
          if (ownsURL) URL.revokeObjectURL(url);
          return;
        }
        if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('This picture exceeds the 40-megapixel canvas limit. Open a smaller copy.');
        if (sourceURL?.startsWith('blob:')) URL.revokeObjectURL(sourceURL);
        sourceURL = ownsURL ? url : null;
        source = image;
        name = filename;
        rotation = 0;
        mirrored = false;
        fit = true;
        win.setTitle(`${name} - Imaging`);
        canvas.hidden = false;
        empty.hidden = true;
        render();
      } catch (error) {
        if (ownsURL) URL.revokeObjectURL(url);
        if (!disposed && generation === loadGeneration) {
          bar.textContent = 'Unable to open image';
          await tell('Imaging', error.message);
        }
      }
    }
    function render() {
      if (!source) {
        update();
        return;
      }
      const quarter = rotation % 2 !== 0;
      canvas.width = quarter ? source.naturalHeight : source.naturalWidth;
      canvas.height = quarter ? source.naturalWidth : source.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        tell('Imaging', 'A 2D image canvas is unavailable in this browser.');
        return;
      }
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(rotation * Math.PI / 2);
      context.scale(mirrored ? -1 : 1, 1);
      context.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2);
      context.restore();
      applyZoom();
    }
    function update() {
      imageControls.forEach(node => {
        node.disabled = !source;
      });
      if (source) bar.textContent = `${name}  •  ${canvas.width} × ${canvas.height} pixels  •  ${Math.round(zoom * 100)}%${fit ? ' (Fit)' : ''}${rotation ? `  •  ${rotation * 90}°` : ''}`;
    }
    function applyZoom() {
      if (!source) return;
      if (fit) zoom = Math.min(1, Math.max(0.01, (viewport.clientWidth - 28) / canvas.width), Math.max(0.01, (viewport.clientHeight - 28) / canvas.height));
      canvas.style.width = `${Math.max(1, Math.round(canvas.width * zoom))}px`;
      canvas.style.height = `${Math.max(1, Math.round(canvas.height * zoom))}px`;
      zoomSelect.value = fit ? 'fit' : String(zoom);
      if (!fit && !zoomSelect.value) {
        let custom = [...zoomSelect.options].find(option => option.dataset.custom);
        if (!custom) {
          custom = E('option');
          custom.dataset.custom = 'yes';
          zoomSelect.append(custom);
        }
        custom.textContent = `${Math.round(zoom * 100)}%`;
        custom.value = String(zoom);
        zoomSelect.value = String(zoom);
      }
      update();
    }
    function setZoom(value) {
      if (!source) return;
      fit = false;
      zoom = clamp(value, .05, 8);
      applyZoom();
    }
    function fitImage() {
      fit = true;
      applyZoom();
    }
    function rotate(direction) {
      if (!source) return;
      rotation = (rotation + direction + 4) % 4;
      render();
    }
    async function saveImage() {
      if (!source) return tell('Imaging', 'Open an image before saving a copy.');
      const path = await sys.fileDialog({
        mode: 'save',
        path: 'C:/My Documents',
        filename: `${name.replace(/\.[^.]+$/, '')}.png`,
        filter: '.png'
      });
      if (!path) return;
      try {
        sys.vfs.write(path, canvas.toDataURL('image/png'), {
          mime: 'image/png'
        });
        bar.textContent = `Saved ${basename(path)}`;
      } catch (error) {
        tell('Imaging', `Unable to save this image: ${error.message}`);
      }
    }
    function exportImage() {
      if (!source) return tell('Imaging', 'Open an image before exporting.');
      try {
        canvas.toBlob(blob => {
          if (blob) sys.download(blob, `${name.replace(/\.[^.]+$/, '')}.png`, 'image/png');else tell('Imaging', 'This image could not be exported.');
        }, 'image/png');
      } catch (error) {
        tell('Imaging', error.message);
      }
    }
    function printImage() {
      if (!source) return tell('Imaging', 'Open an image before printing.');
      try {
        const content = `<html><head><title>${escapeHTML(name)}</title><style>body{margin:20px;text-align:center}img{max-width:100%;max-height:95vh;object-fit:contain}</style></head><body><img alt="${escapeHTML(name)}" src="${canvas.toDataURL('image/png')}"></body></html>`;
        sys.printHTML(content, name);
      } catch (error) {
        tell('Imaging', `Unable to print this image: ${error.message}`);
      }
    }
    sys.menuBar(win, [{
      label: 'File',
      items: [item('Open Saved Image...', () => openSaved(), 'Ctrl+O'), item('Import Picture...', importImage), separator, item('Save PNG Copy...', saveImage), item('Export PNG...', exportImage), item('Print...', printImage, 'Ctrl+P'), separator, item('Exit', () => win.close())]
    }, {
      label: 'Edit',
      items: [item('Rotate Left', () => rotate(-1)), item('Rotate Right', () => rotate(1)), item('Flip Horizontal', () => {
        if (source) {
          mirrored = !mirrored;
          render();
        }
      }), item('Reset Orientation', () => {
        rotation = 0;
        mirrored = false;
        render();
      })]
    }, {
      label: 'View',
      items: [item('Fit in Window', fitImage), item('Actual Size', () => setZoom(1)), item('Zoom In', () => setZoom(zoom * 1.25)), item('Zoom Out', () => setZoom(zoom / 1.25))]
    }, {
      label: 'Help',
      items: [item('About Imaging', () => tell('Imaging', 'View local raster pictures, zoom, rotate, flip, print, and save PNG copies. Animated images are rendered as a still frame. Pictures are decoded locally; this viewer does not retrieve remote images.'))]
    }]);
    listen(win, win.el, 'keydown', event => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'o') {
          event.preventDefault();
          openSaved();
        }
        if (event.key.toLowerCase() === 'p') {
          event.preventDefault();
          printImage();
        }
      }
    });
    if (globalThis.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (fit) applyZoom();
      });
      observer.observe(viewport);
      win.addCleanup(() => observer.disconnect());
    }
    win.addCleanup(() => {
      disposed = true;
      loadGeneration++;
      if (sourceURL?.startsWith('blob:')) URL.revokeObjectURL(sourceURL);
    });
    update();
    if (args.path) openSaved(args.path);
    return win;
  }
  const clipboardText = () => typeof sys.textClipboard === 'string' ? sys.textClipboard : String(sys.textClipboard?.text || '');
  function writeLocalClipboard(text) {
    sys.textClipboard = String(text);
    sys.events?.dispatchEvent(new CustomEvent('clipboardchange', {
      detail: {
        text: sys.textClipboard
      }
    }));
  }
  function clipboard() {
    const win = winFor({
      title: 'Clipboard Viewer',
      icon: 'clipboard',
      width: 570,
      height: 405,
      minWidth: 355,
      minHeight: 260,
      resizable: true
    }, 'utility-clipboard');
    const toolbar = E('div', 'toolbar utility-toolbar');
    const read = button('Read Clipboard', readSystem);
    read.prepend(icon('clipboard'));
    const copy = button('Copy to Clipboard', copySystem);
    const clear = button('Clear Local', () => {
      text.value = '';
      writeLocalClipboard('');
      update('Local clipboard cleared');
    });
    toolbar.append(read, copy, E('span', 'utility-divider'), clear);
    const caption = E('div', 'utility-clipboard-caption', 'Text — shared desktop clipboard');
    const text = E('textarea', 'sunken utility-clipboard-text');
    text.setAttribute('aria-label', 'Local clipboard text');
    text.spellcheck = false;
    text.value = clipboardText();
    text.wrap = 'soft';
    const note = E('div', 'utility-hardware-note', 'Read Clipboard and Copy to Clipboard access your browser clipboard when clicked. Editing here updates the desktop’s local text clipboard.');
    win.body.append(toolbar, caption, text, note);
    const bar = status(win, '');
    function update(message) {
      bar.textContent = message || `${text.value.length} character${text.value.length === 1 ? '' : 's'}  •  Local text`;
    }
    async function readSystem() {
      if (!navigator.clipboard?.readText) return tell('Clipboard Viewer', 'Reading the system clipboard is unavailable in this browser or browsing context. You can paste text directly into the local clipboard area.');
      try {
        const value = await navigator.clipboard.readText();
        text.value = value;
        writeLocalClipboard(value);
        update(`Read ${value.length} characters from the system clipboard`);
      } catch (error) {
        tell('Clipboard Viewer', `The system clipboard could not be read. Your browser may require permission.\n\n${error.message || error.name}`);
      }
    }
    async function copySystem() {
      writeLocalClipboard(text.value);
      if (!navigator.clipboard?.writeText) return tell('Clipboard Viewer', 'The local clipboard has been updated. System clipboard writing is unavailable here; select the text and use your browser’s Copy command.');
      try {
        await navigator.clipboard.writeText(text.value);
        update(`Copied ${text.value.length} characters to the system clipboard`);
      } catch (error) {
        tell('Clipboard Viewer', `The local clipboard was updated, but the system clipboard could not be written.\n\n${error.message || error.name}`);
      }
    }
    async function saveText() {
      const path = await sys.fileDialog({
        mode: 'save',
        path: 'C:/My Documents',
        filename: 'Clipboard.txt',
        filter: '.txt'
      });
      if (!path) return;
      try {
        sys.vfs.write(path, text.value, {
          mime: 'text/plain'
        });
        update(`Saved ${basename(path)}`);
      } catch (error) {
        tell('Clipboard Viewer', error.message);
      }
    }
    text.addEventListener('input', () => {
      writeLocalClipboard(text.value);
      update();
    });
    listen(win, sys.events, 'clipboardchange', () => {
      const value = clipboardText();
      if (text.value !== value) text.value = value;
      update();
    });
    sys.menuBar(win, [{
      label: 'File',
      items: [item('Save Text As...', saveText), item('Export Text...', () => sys.download(text.value, 'Clipboard.txt', 'text/plain;charset=utf-8')), item('Print...', () => sys.printHTML(`<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHTML(text.value)}</pre>`, 'Clipboard')), separator, item('Exit', () => win.close())]
    }, {
      label: 'Edit',
      items: [item('Read System Clipboard', readSystem), item('Copy to System Clipboard', copySystem), item('Clear Local Clipboard', () => {
        text.value = '';
        writeLocalClipboard('');
        update();
      }), separator, item('Select All', () => {
        text.focus();
        text.select();
      }, 'Ctrl+A')]
    }, {
      label: 'View',
      items: [item('Word Wrap', () => {
        text.wrap = text.wrap === 'soft' ? 'off' : 'soft';
      }), item('Refresh Local Clipboard', () => {
        text.value = clipboardText();
        update();
      })]
    }, {
      label: 'Help',
      items: [item('About Clipboard Viewer', () => tell('Clipboard Viewer', 'Displays and edits this desktop’s shared text clipboard. System clipboard access happens only when you choose Read Clipboard or Copy to Clipboard. Local text is held for this desktop session.'))]
    }]);
    update();
    return win;
  }
  let speedDials = get('dialer.speedDials', []);
  if (!Array.isArray(speedDials)) speedDials = [];
  const dialerEvents = new EventTarget();
  function dialer() {
    const win = winFor({
      title: 'Phone Dialer',
      icon: 'dialer',
      width: 440,
      height: 470,
      minWidth: 400,
      minHeight: 430,
      resizable: false
    }, 'utility-dialer');
    let toneContext = null,
      sequence = 0,
      disposed = false;
    const activeTones = new Set();
    const root = E('div', 'utility-dialer-content');
    const numberLabel = E('label', 'utility-phone-label', 'Number to dial:');
    const number = E('input', 'sunken utility-phone-number');
    number.type = 'tel';
    number.value = String(get('dialer.lastNumber', ''));
    number.maxLength = 100;
    number.setAttribute('aria-label', 'Phone number');
    numberLabel.append(number);
    const main = E('div', 'utility-dialer-main');
    const keypad = E('div', 'utility-keypad');
    const speedGroup = E('fieldset', 'utility-speed-group');
    speedGroup.append(E('legend', '', 'Speed Dial'));
    const speedList = E('div', 'utility-speed-list');
    speedGroup.append(speedList);
    const frequencies = {
      '1': [697, 1209],
      '2': [697, 1336],
      '3': [697, 1477],
      '4': [770, 1209],
      '5': [770, 1336],
      '6': [770, 1477],
      '7': [852, 1209],
      '8': [852, 1336],
      '9': [852, 1477],
      '*': [941, 1209],
      '0': [941, 1336],
      '#': [941, 1477]
    };
    [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']].forEach(([digit, letters]) => {
      const key = button('', () => {
        number.value += digit;
        playTone(digit);
      });
      key.append(E('strong', '', digit), E('span', '', letters || '\u00a0'));
      key.setAttribute('aria-label', `Dial tone ${digit}`);
      keypad.append(key);
    });
    main.append(keypad, speedGroup);
    const actions = E('div', 'utility-dialer-actions');
    const dial = button('Dial with Phone App...', handoff);
    const tones = button('Play DTMF', playSequence);
    const stop = button('Stop Tones', stopTones);
    const clear = button('Clear', () => {
      stopTones();
      number.value = '';
      number.focus();
    });
    actions.append(dial, tones, stop, clear);
    const note = E('div', 'utility-hardware-note', 'DTMF tones play through desktop audio. Dial with Phone App opens your configured telephone application; this desktop does not place calls itself.');
    root.append(numberLabel, main, actions, note);
    win.body.append(root);
    const bar = status(win, 'Ready');
    const level = () => get('muted', false) ? 0 : clamp(get('volume', 70), 0, 100) / 100 * .14;
    async function ensureAudio() {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) {
        bar.textContent = 'DTMF playback is unavailable in this browser';
        return null;
      }
      if (!toneContext) toneContext = new Context();
      if (toneContext.state === 'suspended') await toneContext.resume();
      return toneContext;
    }
    async function playTone(digit, duration = .16) {
      if (!frequencies[digit]) return;
      try {
        const context = await ensureAudio();
        if (!context || disposed) return false;
        const gain = context.createGain(),
          pair = frequencies[digit].map(frequency => {
            const oscillator = context.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            oscillator.connect(gain);
            return oscillator;
          });
        gain.connect(context.destination);
        const now = context.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(level(), now + .008);
        gain.gain.setValueAtTime(level(), now + duration - .015);
        gain.gain.linearRampToValueAtTime(0, now + duration);
        const tone = {
          pair,
          gain
        };
        activeTones.add(tone);
        pair[0].onended = () => {
          activeTones.delete(tone);
          pair.forEach(osc => osc.disconnect());
          gain.disconnect();
        };
        pair.forEach(osc => {
          osc.start(now);
          osc.stop(now + duration + .005);
        });
        return true;
      } catch (error) {
        if (!disposed) bar.textContent = `Tone playback failed: ${error.message || error.name}`;
        return false;
      }
    }
    function stopTones() {
      sequence++;
      for (const tone of activeTones) {
        tone.pair.forEach(osc => {
          try {
            osc.stop();
          } catch {/* already ended */}
        });
      }
      activeTones.clear();
      tones.disabled = false;
      bar.textContent = 'Tones stopped';
    }
    async function playSequence() {
      const digits = number.value.replace(/[^0-9*#]/g, '');
      if (!digits) return tell('Phone Dialer', 'Enter a number or choose a speed-dial entry before playing tones.');
      stopTones();
      const token = sequence;
      tones.disabled = true;
      bar.textContent = 'Playing DTMF sequence...';
      for (const digit of digits) {
        if (token !== sequence || disposed) return;
        if (!(await playTone(digit))) {
          tones.disabled = false;
          return;
        }
        await delay(215);
      }
      if (token === sequence && !disposed) {
        tones.disabled = false;
        bar.textContent = 'DTMF sequence complete';
      }
    }
    function handoff() {
      const target = number.value.replace(/[^0-9+*#,;]/g, '');
      if (!/[0-9]/.test(target)) return tell('Phone Dialer', 'Enter a telephone number first.');
      set('dialer.lastNumber', number.value);
      const link = E('a');
      link.href = `tel:${encodeURIComponent(target)}`;
      link.click();
      bar.textContent = 'Requested your configured phone app • Call handling occurs there';
    }
    function speedSetup() {
      const dialog = winFor({
        title: 'Speed Dial Setup',
        icon: 'dialer',
        width: 430,
        height: 364,
        minWidth: 400,
        minHeight: 330,
        resizable: false
      }, 'utility-speed-editor');
      const form = E('div', 'utility-speed-form');
      const headings = E('div', 'utility-speed-row');
      headings.append(E('span', '', '#'), E('strong', '', 'Name'), E('strong', '', 'Number'));
      form.append(headings);
      const fields = [];
      for (let index = 0; index < 8; index++) {
        const row = E('div', 'utility-speed-row'),
          name = E('input', 'sunken'),
          value = E('input', 'sunken');
        name.value = speedDials[index]?.name || '';
        name.maxLength = 40;
        value.value = speedDials[index]?.number || '';
        value.maxLength = 100;
        value.type = 'tel';
        name.setAttribute('aria-label', `Speed dial ${index + 1} name`);
        value.setAttribute('aria-label', `Speed dial ${index + 1} number`);
        row.append(E('span', '', String(index + 1)), name, value);
        fields.push({
          name,
          value
        });
        form.append(row);
      }
      const actions = E('div', 'utility-dialog-actions');
      actions.append(button('OK', () => {
        speedDials = fields.map(({
          name,
          value
        }) => ({
          name: name.value.trim(),
          number: value.value.trim()
        }));
        set('dialer.speedDials', speedDials);
        dialerEvents.dispatchEvent(new Event('change'));
        dialog.close();
      }), button('Cancel', () => dialog.close()));
      dialog.body.append(form, actions);
      return dialog;
    }
    function renderSpeeds() {
      speedList.replaceChildren();
      for (let index = 0; index < 8; index++) {
        const entry = speedDials[index];
        const b = button(`${index + 1}. ${entry?.name || entry?.number || '(empty)'}`, () => {
          const current = speedDials[index];
          if (!current?.number) speedSetup();else {
            number.value = current.number;
            number.focus();
            bar.textContent = current.name || 'Speed dial number selected';
          }
        });
        b.title = entry?.number || 'Set up speed dial';
        speedList.append(b);
      }
    }
    number.addEventListener('keydown', event => {
      if (frequencies[event.key] && !event.ctrlKey && !event.metaKey) playTone(event.key);
      if (event.key === 'Enter') handoff();
    });
    listen(win, dialerEvents, 'change', renderSpeeds);
    listen(win, sys.events, 'volumechange', () => {
      for (const tone of activeTones) tone.gain.gain.setTargetAtTime(level(), toneContext.currentTime, .005);
    });
    sys.menuBar(win, [{
      label: 'File',
      items: [item('Dial with Phone App...', handoff), item('Play DTMF Sequence', playSequence), item('Stop Tones', stopTones), separator, item('Exit', () => win.close())]
    }, {
      label: 'Edit',
      items: [item('Speed Dial Setup...', speedSetup), item('Redial Number', () => {
        number.value = String(get('dialer.lastNumber', ''));
        number.focus();
      }), item('Clear Number', () => {
        number.value = '';
        number.focus();
      })]
    }, {
      label: 'View',
      items: [item('Volume Control', () => sys.open('volume'))]
    }, {
      label: 'Help',
      items: [item('About Phone Dialer', () => tell('Phone Dialer', 'Produces standard dual-tone multi-frequency (DTMF) sounds using Web Audio. Speed-dial entries are saved locally. Dial with Phone App hands the selected number to a configured telephone application. A modem is not emulated.'))]
    }]);
    win.addCleanup(() => {
      disposed = true;
      stopTones();
      toneContext?.close().catch(() => {});
    });
    renderSpeeds();
    return win;
  }
  function hyperterminal() {
    const win = winFor({
      title: 'HyperTerminal',
      icon: 'hyperterminal',
      width: 725,
      height: 480,
      minWidth: 465,
      minHeight: 315,
      resizable: true
    }, 'utility-terminal');
    let connection = null,
      port = null,
      reader = null,
      writer = null,
      readTask = null,
      disconnectTask = null,
      connecting = false,
      sending = false,
      disposed = false,
      log = '';
    const toolbar = E('div', 'toolbar utility-toolbar');
    const mode = E('select', 'sunken');
    mode.setAttribute('aria-label', 'Connection type');
    [['Local Loopback', 'loopback'], ['Serial Device', 'serial']].forEach(([label, value]) => {
      const option = E('option', '', label);
      option.value = value;
      mode.append(option);
    });
    const baud = E('select', 'sunken');
    baud.setAttribute('aria-label', 'Serial baud rate');
    [9600, 19200, 38400, 57600, 115200].forEach(rate => {
      const option = E('option', '', `${rate} baud`);
      option.value = String(rate);
      baud.append(option);
    });
    baud.value = String(get('terminal.baud', 9600));
    const connectButton = button('Connect', connect);
    const disconnectButton = button('Disconnect', () => disconnect(true));
    const clear = button('Clear', () => {
      log = '';
      renderLog();
    });
    const exportButton = button('Export Log...', exportLog);
    toolbar.append(mode, baud, connectButton, disconnectButton, E('span', 'utility-divider'), clear, exportButton);
    const screen = E('pre', 'sunken utility-terminal-screen');
    screen.tabIndex = 0;
    screen.setAttribute('aria-label', 'Terminal output');
    screen.setAttribute('aria-live', 'polite');
    const sendRow = E('div', 'utility-terminal-send');
    const entry = E('input', 'sunken');
    entry.type = 'text';
    entry.placeholder = 'Type text to send';
    entry.setAttribute('aria-label', 'Text to send');
    const sendButton = button('Send', () => sendLine());
    sendRow.append(entry, sendButton);
    const options = E('div', 'utility-terminal-options');
    const newlineLabel = E('label'),
      newline = E('input');
    newline.type = 'checkbox';
    newline.checked = true;
    newlineLabel.append(newline, E('span', '', 'Append CR+LF'));
    const echoLabel = E('label'),
      localEcho = E('input');
    localEcho.type = 'checkbox';
    localEcho.checked = true;
    echoLabel.append(localEcho, E('span', '', 'Local echo (serial)'));
    options.append(newlineLabel, echoLabel, E('span', '', 'UTF-8 • 8 data bits • No parity • 1 stop bit'));
    const note = E('div', 'utility-hardware-note', 'Local Loopback echoes text within this window. Serial Device uses your browser’s device picker on Connect; no remote network session is simulated.');
    win.body.append(toolbar, screen, sendRow, options, note);
    const bar = status(win, 'Disconnected');
    const append = text => {
      log += String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
      if (log.length > 2000000) log = '[Earlier output trimmed — log limit 2,000,000 characters]\n' + log.slice(-1900000);
      renderLog();
    };
    const banner = text => append(`\n[${text}]\n`);
    function renderLog() {
      screen.textContent = log;
      screen.scrollTop = screen.scrollHeight;
    }
    function update() {
      connectButton.disabled = !!connection || connecting || !!disconnectTask;
      disconnectButton.disabled = !connection;
      mode.disabled = !!connection || connecting || !!disconnectTask;
      baud.disabled = mode.value !== 'serial' || !!connection || connecting;
      sendButton.disabled = !connection || sending;
      entry.disabled = !connection;
      localEcho.disabled = connection === 'loopback';
      bar.textContent = connecting ? 'Connecting...' : connection === 'serial' ? `Connected to serial device • ${baud.value} baud • 8-N-1` : connection === 'loopback' ? 'Connected to local loopback • No remote connection' : 'Disconnected';
    }
    async function connect() {
      if (connection || connecting || disconnectTask) return;
      if (mode.value === 'loopback') {
        connection = 'loopback';
        banner('Local loopback connected. Sent text is returned locally.');
        update();
        entry.focus();
        return;
      }
      if (!navigator.serial?.requestPort) {
        await tell('HyperTerminal', 'Web Serial is unavailable in this browser or browsing context. Choose Local Loopback to test text entry. Serial connections require a browser with Web Serial support and an attached serial device.');
        return;
      }
      connecting = true;
      update();
      try {
        const picked = await navigator.serial.requestPort();
        if (disposed) return;
        await picked.open({
          baudRate: Number(baud.value) || 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: 'none',
          bufferSize: 4096
        });
        if (disposed) {
          await picked.close().catch(() => {});
          return;
        }
        port = picked;
        if (!port.readable || !port.writable) throw new Error('The selected device does not expose readable and writable serial streams.');
        writer = port.writable.getWriter();
        connection = 'serial';
        set('terminal.baud', Number(baud.value));
        banner(`Serial device connected at ${baud.value} baud (8-N-1, UTF-8 plain text).`);
        readTask = readLoop();
        entry.focus();
      } catch (error) {
        if (port && !connection) {
          try {
            await port.close();
          } catch {/* partially opened device */}
          port = null;
        }
        if (!disposed) {
          banner(error.name === 'NotFoundError' ? 'Device selection canceled.' : `Connection failed: ${error.message || error.name}`);
          if (error.name !== 'NotFoundError') await tell('HyperTerminal', `The serial connection could not be opened.\n\n${error.message || error.name}`);
        }
      } finally {
        connecting = false;
        if (!disposed) update();
      }
    }
    async function readLoop() {
      const decoder = new TextDecoder();
      const activePort = port;
      try {
        reader = activePort.readable.getReader();
        while (connection === 'serial' && !disposed) {
          const {
            value,
            done
          } = await reader.read();
          if (done) break;
          if (value) append(decoder.decode(value, {
            stream: true
          }));
        }
        const tail = decoder.decode();
        if (tail) append(tail);
      } catch (error) {
        if (connection === 'serial' && !disposed) banner(`Serial read stopped: ${error.message || error.name}`);
      } finally {
        try {
          reader?.releaseLock();
        } catch {/* stream already detached */}
        reader = null;
        if (connection === 'serial') {
          banner('Serial input ended.');
          void disconnect(false);
        }
      }
    }
    function disconnect(announce = true) {
      if (disconnectTask) return disconnectTask;
      const oldConnection = connection;
      connection = null;
      disconnectTask = (async () => {
        await Promise.resolve();
        try {
          if (reader) await reader.cancel().catch(() => {});
          if (readTask) await readTask.catch(() => {});
          readTask = null;
          if (writer) {
            try {
              await writer.abort();
            } catch {/* device may be disconnected */}
            try {
              writer.releaseLock();
            } catch {/* lock already released */}
            writer = null;
          }
          if (port) {
            try {
              await port.close();
            } catch {/* device may be physically detached */}
            port = null;
          }
          if (announce && oldConnection) banner('Disconnected.');
        } finally {
          disconnectTask = null;
          if (!disposed) update();
        }
      })();
      update();
      return disconnectTask;
    }
    async function sendText(value, addNewline = false) {
      if (!connection) return tell('HyperTerminal', 'Connect to Local Loopback or a serial device before sending text.');
      if (sending) return;
      const text = String(value) + (addNewline ? '\r\n' : '');
      sending = true;
      update();
      try {
        if (connection === 'loopback') append(text);else {
          const output = writer;
          if (!output) throw new Error('The serial connection is no longer writable.');
          await output.write(new TextEncoder().encode(text));
          if (localEcho.checked) append(text);
        }
      } catch (error) {
        banner(`Send failed: ${error.message || error.name}`);
      } finally {
        sending = false;
        if (!disposed) update();
      }
    }
    async function sendLine() {
      if (!connection || sending) return;
      const value = entry.value;
      entry.value = '';
      await sendText(value, newline.checked);
      entry.focus();
    }
    async function saveLog() {
      const path = await sys.fileDialog({
        mode: 'save',
        path: 'C:/My Documents',
        filename: 'HyperTerminal.txt',
        filter: '.txt'
      });
      if (!path) return;
      try {
        sys.vfs.write(path, log, {
          mime: 'text/plain'
        });
        bar.textContent = `Saved ${basename(path)}`;
      } catch (error) {
        tell('HyperTerminal', error.message);
      }
    }
    function exportLog() {
      sys.download(log, 'HyperTerminal.txt', 'text/plain;charset=utf-8');
    }
    function sendFile() {
      if (!connection) return tell('HyperTerminal', 'Connect before sending a text file.');
      pick('text/plain,.txt,.log,.csv', async file => {
        if (file.size > 1024 * 1024) return tell('HyperTerminal', 'Choose a text file smaller than 1 MB.');
        await sendText(await file.text());
      });
    }
    entry.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendLine();
      }
    });
    mode.addEventListener('change', update);
    listen(win, navigator.serial, 'disconnect', event => {
      if (port && (event.target === port || event.port === port)) {
        banner('Serial device disconnected.');
        void disconnect(false);
      }
    });
    sys.menuBar(win, [{
      label: 'File',
      items: [item('Save Log As...', saveLog), item('Export Log...', exportLog), separator, item('Exit', () => win.close())]
    }, {
      label: 'Edit',
      items: [item('Copy Log to Local Clipboard', () => {
        writeLocalClipboard(log);
        bar.textContent = 'Log copied to the desktop clipboard';
      }), item('Paste Local Clipboard into Input', () => {
        entry.value = clipboardText();
        entry.focus();
      }), item('Clear Screen and Log', () => {
        log = '';
        renderLog();
      })]
    }, {
      label: 'Call',
      items: [item('Connect', connect), item('Disconnect', () => disconnect(true))]
    }, {
      label: 'Transfer',
      items: [item('Send Text File...', sendFile)]
    }, {
      label: 'View',
      items: [item('Black Background', () => screen.classList.toggle('utility-terminal-dark')), item('Word Wrap', () => screen.classList.toggle('utility-terminal-nowrap'))]
    }, {
      label: 'Help',
      items: [item('About HyperTerminal', () => tell('HyperTerminal', 'A local loopback and serial text terminal. Local Loopback returns your text in this window. Serial Device opens a device you choose through Web Serial.\n\nSerial settings: UTF-8 plain text, 8 data bits, no parity, 1 stop bit, no hardware flow control. ANSI escape sequences are removed from the displayed log. This application does not emulate a modem or connect to a remote network host.'))]
    }]);
    win.addCleanup(() => {
      disposed = true;
      void disconnect(false);
    });
    append('HyperTerminal\nChoose a connection type, then click Connect.\n');
    update();
    return win;
  }
  [{
    id: 'imaging',
    title: 'Imaging',
    icon: 'imaging',
    open: imaging
  }, {
    id: 'clipboard',
    title: 'Clipboard Viewer',
    icon: 'clipboard',
    open: clipboard
  }, {
    id: 'dialer',
    title: 'Phone Dialer',
    icon: 'dialer',
    open: dialer
  }, {
    id: 'hyperterminal',
    title: 'HyperTerminal',
    icon: 'hyperterminal',
    open: hyperterminal
  }].forEach(app => sys.registerApp(app));
}
