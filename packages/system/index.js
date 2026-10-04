/* Browser-backed Control Panel and system utilities. No external dependencies. */
const el = (tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const get = (sys, key, fallback) => sys.settings?.get(key, fallback) ?? fallback;
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const normalize = path => String(path || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '').toLowerCase();
const basename = path => String(path || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || String(path || '');
const entries = sys => [...(sys.vfs?.entries?.values?.() || [])];
const isDir = entry => ['directory', 'folder', 'dir'].includes(entry?.type);
const bytes = value => new Blob([typeof value === 'string' ? value : JSON.stringify(value ?? null)]).size;
const sizeText = count => count < 1024 ? `${count} bytes` : count < 1048576 ? `${(count / 1024).toFixed(1)} KB` : `${(count / 1048576).toFixed(2)} MB`;
const safeClockOffset = value => Number.isFinite(Number(value)) && Math.abs(Number(value)) < 8e15 ? Number(value) : 0;
const dateText = (sys, value) => {
  try {
    return new Date(value).toLocaleString(get(sys, 'locale', undefined), {
      hour12: !get(sys, 'clock24', false)
    });
  } catch {
    return new Date(value).toLocaleString();
  }
};
const tell = (sys, title, message, icon = 'info') => sys.dialog({
  title,
  message,
  icon,
  buttons: [{
    label: 'OK',
    value: 'ok'
  }]
});
const safely = (sys, action, title = 'Windows') => (...args) => Promise.resolve().then(() => action(...args)).catch(error => tell(sys, title, error?.message || String(error), 'error'));
const button = (sys, label, action, className = '') => {
  const node = el('button', `win-button sys-button ${className}`, label);
  node.type = 'button';
  node.addEventListener('click', safely(sys, action));
  return node;
};
const input = (type, value, label) => {
  const node = el('input', 'sys-input');
  node.type = type;
  node.value = value ?? '';
  if (label) node.setAttribute('aria-label', label);
  return node;
};
const select = (choices, value, label) => {
  const node = el('select', 'sys-input');
  choices.forEach(choice => {
    const [id, text] = Array.isArray(choice) ? choice : [choice, choice];
    const option = el('option', '', text);
    option.value = id;
    node.append(option);
  });
  node.value = value;
  if (label) node.setAttribute('aria-label', label);
  return node;
};
const row = (label, control) => {
  const node = el('label', 'property-row sys-field');
  node.append(el('span', 'sys-field-label', label), control);
  return node;
};
const check = (label, value, onChange) => {
  const node = el('label', 'sys-check');
  const control = input('checkbox', '', label);
  control.checked = !!value;
  control.addEventListener('change', () => onChange(control.checked));
  node.append(control, document.createTextNode(label));
  return node;
};
const group = (label, ...children) => {
  const node = el('fieldset', 'sys-group');
  node.append(el('legend', '', label), ...children);
  return node;
};
const note = text => el('p', 'sys-note', text);
const actions = (...children) => {
  const node = el('div', 'sys-actions');
  node.append(...children);
  return node;
};
const table = headings => {
  const outer = el('div', 'sys-table-wrap sunken');
  const node = el('table', 'sys-table');
  const head = el('thead');
  const tr = el('tr');
  headings.forEach(heading => tr.append(el('th', '', heading)));
  head.append(tr);
  const body = el('tbody');
  node.append(head, body);
  outer.append(node);
  return {
    outer,
    node,
    body
  };
};
const tableRow = values => {
  const node = el('tr');
  values.forEach(value => {
    const cell = el('td');
    value instanceof Node ? cell.append(value) : cell.textContent = value ?? '';
    node.append(cell);
  });
  return node;
};
const valueTable = pairs => {
  const t = table(['Property', 'Value']);
  pairs.forEach(pair => t.body.append(tableRow(pair)));
  return t.outer;
};
const listen = (win, target, type, fn, options) => {
  target.addEventListener(type, fn, options);
  win.addCleanup(() => target.removeEventListener(type, fn, options));
};
const every = (win, fn, delay = 1000) => {
  const timer = setInterval(fn, delay);
  win.addCleanup(() => clearInterval(timer));
  return timer;
};
const icon = (sys, name, size = 32) => {
  const node = el('span', 'sys-icon');
  node.innerHTML = sys.icon(name, size);
  return node;
};
const appList = sys => [...(sys.apps?.values?.() || [])].filter(app => app?.id && typeof app.open === 'function').sort((a, b) => a.title.localeCompare(b.title));
const knownApp = (sys, id) => sys.apps?.has(id);
function windowBase(sys, title, name = 'settings', width = 480, height = 440) {
  const win = sys.wm.create({
    title,
    icon: name,
    width,
    height,
    minWidth: 350,
    minHeight: 275
  });
  win.body.classList.add('sys-window-body');
  const root = el('div', 'sys-app');
  win.body.append(root);
  return {
    win,
    root
  };
}
function propertyWindow(sys, {
  title,
  icon: name = 'settings',
  width = 455,
  height = 465,
  initial = {},
  apply,
  tab = 0
}) {
  const {
    win,
    root
  } = windowBase(sys, title, name, width, height);
  root.classList.add('sys-properties');
  const tabs = el('div', 'property-tabs sys-tabs');
  tabs.setAttribute('role', 'tablist');
  const panels = el('div', 'sys-panels');
  const footer = el('div', 'property-footer sys-footer');
  const draft = copy(initial);
  let active = -1;
  let modified = false;
  let applying = false;
  const pages = [];
  const tabListeners = [];
  const applyButton = button(sys, 'Apply', () => commit());
  applyButton.disabled = true;
  const message = el('span', 'sys-property-message');
  async function commit() {
    if (applying) return false;
    applying = true;
    applyButton.disabled = true;
    try {
      if (apply && (await apply(draft)) === false) return false;
      if (!apply) for (const [key, value] of Object.entries(draft)) if (JSON.stringify(get(sys, key)) !== JSON.stringify(value)) sys.settings.set(key, copy(value));
      modified = false;
      message.textContent = 'Settings applied.';
      return true;
    } finally {
      applying = false;
      applyButton.disabled = !modified;
    }
  }
  function change(key, value) {
    draft[key] = value;
    modified = true;
    applyButton.disabled = false;
    message.textContent = '';
  }
  function show(index) {
    if (index < 0 || index >= pages.length) return;
    active = index;
    pages.forEach((page, i) => {
      page.panel.hidden = i !== index;
      page.button.classList.toggle('active', i === index);
      page.button.classList.toggle('is-active', i === index);
      page.button.setAttribute('aria-selected', String(i === index));
      page.button.tabIndex = i === index ? 0 : -1;
    });
    tabListeners.forEach(fn => fn(index));
  }
  function addTab(label, builder) {
    const index = pages.length;
    const panel = el('section', 'property-panel sys-property-panel');
    panel.setAttribute('role', 'tabpanel');
    const tabButton = el('button', 'sys-tab', label);
    tabButton.type = 'button';
    tabButton.setAttribute('role', 'tab');
    tabButton.addEventListener('click', () => show(index));
    tabButton.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + pages.length) % pages.length;
      show(next);
      pages[next].button.focus();
    });
    pages.push({
      label,
      panel,
      button: tabButton
    });
    tabs.append(tabButton);
    panels.append(panel);
    builder?.(panel, draft, change);
    show(typeof tab === 'string' ? Math.max(0, pages.findIndex(page => page.label.toLowerCase() === tab.toLowerCase())) : Math.min(tab, pages.length - 1));
    return panel;
  }
  footer.append(message, button(sys, 'OK', async () => {
    if (!modified || (await commit())) win.close();
  }), button(sys, 'Cancel', () => win.close()), applyButton);
  root.append(tabs, panels, footer);
  return {
    win,
    root,
    draft,
    change,
    addTab,
    show,
    onTab: fn => tabListeners.push(fn),
    commit,
    footer,
    message,
    applyButton,
    get active() {
      return active;
    }
  };
}
function formDialog(sys, title, fields, accept = 'OK', message) {
  return new Promise(resolve => {
    const {
      win,
      root
    } = windowBase(sys, title, 'settings', 410, Math.min(530, 175 + fields.length * 48));
    root.classList.add('sys-form-dialog');
    const form = el('form');
    const controls = {};
    if (message) form.append(note(message));
    fields.forEach(field => {
      let control;
      if (field.type === 'select') control = select(field.options, field.value, field.label);else if (field.type === 'textarea') {
        control = el('textarea', 'sys-input sys-value-editor');
        control.value = field.value ?? '';
      } else control = input(field.type || 'text', field.value, field.label);
      if (field.required) control.required = true;
      if (field.readonly) control.readOnly = true;
      if (field.min !== undefined) control.min = field.min;
      if (field.max !== undefined) control.max = field.max;
      controls[field.name] = control;
      form.append(row(field.label, control));
    });
    let done = false;
    function finish(value) {
      if (done) return;
      done = true;
      win.onBeforeClose = null;
      win.close();
      resolve(value);
    }
    form.append(actions(button(sys, accept, () => form.requestSubmit()), button(sys, 'Cancel', () => finish(null))));
    form.addEventListener('submit', event => {
      event.preventDefault();
      finish(Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value])));
    });
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    });
    win.onBeforeClose = () => {
      if (!done) {
        done = true;
        resolve(null);
      }
      return true;
    };
    root.append(form);
    requestAnimationFrame(() => Object.values(controls)[0]?.focus());
  });
}
function monitor(sys, win, {
  saver = false
} = {}) {
  const frame = el('div', 'property-monitor sys-monitor');
  const screen = el('div', 'monitor-screen sys-monitor-screen');
  const canvas = el('canvas', 'sys-monitor-canvas');
  canvas.width = 220;
  canvas.height = 130;
  canvas.setAttribute('aria-label', saver ? 'Screen saver preview' : 'Desktop background preview');
  screen.append(canvas);
  if (!saver) {
    const miniature = el('div', 'sys-mini-taskbar', 'Start');
    screen.append(miniature);
  }
  frame.append(screen, el('div', 'sys-monitor-led'));
  const stand = el('div', 'sys-monitor-stand');
  const outer = el('div', 'sys-monitor-wrap');
  outer.append(frame, stand);
  let renderer = null;
  let ready = Promise.resolve();
  try {
    if (sys.renderer?.constructor && sys.renderer.constructor !== Object) {
      renderer = new sys.renderer.constructor(canvas);
      ready = renderer.init('canvas2d').catch(() => {
        renderer = null;
      });
    }
  } catch {
    renderer = null;
  }
  win.addCleanup(() => renderer?.dispose?.());
  return {
    node: outer,
    canvas,
    async wallpaper(settings) {
      await ready;
      if (renderer) await renderer.setWallpaper(settings);else {
        canvas.style.backgroundColor = settings.color || '#008080';
        canvas.style.backgroundImage = settings.image ? `url("${String(settings.image).replace(/"/g, '%22')}")` : '';
        canvas.style.backgroundSize = settings.fit === 'contain' ? 'contain' : 'cover';
      }
    },
    async saver(name) {
      await ready;
      renderer?.setScreensaver?.(name);
    },
    pause(value) {
      ready.then(() => renderer?.setIdle?.(value));
    }
  };
}
function openDisplay(sys, args = {}) {
  const defaults = {
    wallpaperColor: '#008080',
    wallpaperPattern: 'none',
    wallpaperImage: null,
    wallpaperFit: 'cover',
    screensaver: 'none',
    screensaverMinutes: 5,
    graphicsBackend: 'auto',
    theme: 'standard',
    highcontrast: false,
    largeFonts: false
  };
  const initial = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, get(sys, key, value)]));
  const p = propertyWindow(sys, {
    title: 'Display Properties',
    icon: 'display',
    width: 475,
    height: 545,
    initial,
    tab: args.tab || 0
  });
  const backgroundPreview = monitor(sys, p.win);
  const saverPreview = monitor(sys, p.win, {
    saver: true
  });
  const refreshBackground = () => backgroundPreview.wallpaper({
    color: p.draft.wallpaperColor,
    pattern: p.draft.wallpaperPattern,
    image: p.draft.wallpaperImage,
    fit: p.draft.wallpaperFit
  });
  p.addTab('Background', (panel, draft, change) => {
    panel.append(backgroundPreview.node);
    const patterns = select([['none', '(None)'], ['tiles', 'Tiles'], ['waves', 'Waves'], ['clouds', 'Clouds'], ['sandstone', 'Sandstone'], ['circuit', 'Circuit'], ['stars', 'Stars']], draft.wallpaperPattern, 'Wallpaper pattern');
    patterns.size = 4;
    patterns.addEventListener('change', () => {
      change('wallpaperPattern', patterns.value);
      change('wallpaperImage', null);
      imageName.textContent = 'Built-in pattern';
      refreshBackground();
    });
    const color = input('color', draft.wallpaperColor, 'Desktop color');
    color.addEventListener('input', () => {
      change('wallpaperColor', color.value);
      refreshBackground();
    });
    const fit = select([['cover', 'Fill'], ['contain', 'Fit'], ['stretch', 'Stretch'], ['center', 'Center'], ['tile', 'Tile']], draft.wallpaperFit, 'Picture display');
    fit.addEventListener('change', () => {
      change('wallpaperFit', fit.value);
      refreshBackground();
    });
    const imageName = el('span', 'sys-muted', draft.wallpaperImage ? 'Custom picture selected' : 'Built-in pattern');
    const fileInput = input('file');
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    fileInput.addEventListener('change', safely(sys, async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) return tell(sys, 'Display', 'Choose a wallpaper image smaller than 8 MB.');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      change('wallpaperImage', data);
      imageName.textContent = file.name;
      refreshBackground();
    }));
    const browse = button(sys, 'Browse...', async () => {
      const path = await sys.fileDialog({
        mode: 'open',
        path: 'C:/My Documents',
        filter: '.png,.jpg,.jpeg,.webp,.gif,.bmp'
      });
      if (!path) return;
      const data = await sys.vfs.read(path);
      if (!String(data).startsWith('data:image/')) return tell(sys, 'Display', 'Choose an image file.');
      change('wallpaperImage', data);
      imageName.textContent = basename(path);
      refreshBackground();
    });
    const left = el('div', 'sys-grow');
    left.append(el('div', 'sys-control-label', 'Wallpaper:'), patterns);
    const right = el('div', 'sys-wallpaper-options');
    right.append(row('Color:', color), row('Display:', fit), browse, button(sys, 'Import...', () => fileInput.click()), button(sys, 'Remove Picture', () => {
      change('wallpaperImage', null);
      imageName.textContent = 'Built-in pattern';
      refreshBackground();
    }));
    const layout = el('div', 'sys-columns');
    layout.append(left, right);
    panel.append(layout, imageName, fileInput);
    refreshBackground();
  });
  p.addTab('Screen Saver', (panel, draft, change) => {
    panel.append(saverPreview.node);
    const saver = select([['none', '(None)'], ['starfield', 'Starfield'], ['pipes', '3D Pipes'], ['mystify', 'Mystify']], draft.screensaver, 'Screen saver');
    saver.addEventListener('change', () => {
      change('screensaver', saver.value);
      saverPreview.saver(saver.value);
    });
    const wait = input('number', draft.screensaverMinutes, 'Screen saver wait in minutes');
    wait.min = 1;
    wait.max = 120;
    wait.addEventListener('change', () => {
      wait.value = Math.max(1, Math.min(120, Number(wait.value) || 5));
      change('screensaverMinutes', Number(wait.value));
    });
    panel.append(group('Screen saver', row('Name:', saver), row('Wait (minutes):', wait), actions(button(sys, 'Preview', () => {
      if (draft.screensaver !== 'none') sys.startScreensaver(draft.screensaver);else tell(sys, 'Screen Saver', 'Select a screen saver before previewing.');
    }))), note('The screen saver runs inside this desktop. Move the mouse or press a key to return.'));
    saverPreview.saver(draft.screensaver);
  });
  p.addTab('Appearance', (panel, draft, change) => {
    const preview = el('div', 'sys-appearance-preview');
    const inactive = el('div', 'sys-sample-inactive', 'Inactive Window');
    const active = el('div', 'sys-sample-active', 'Active Window');
    const sample = el('div', 'sys-sample-body');
    sample.append(el('span', '', 'Window Text'), el('span', 'sys-sample-selection', 'Selected Item'), el('span', 'sys-sample-button', 'Message Text'));
    preview.append(inactive, active, sample);
    const schemes = select([['standard', 'Windows Standard'], ['desert', 'Desert'], ['marine', 'Marine'], ['plum', 'Plum'], ['highcontrast', 'High Contrast']], draft.theme, 'Color scheme');
    const colors = {
      standard: ['#c0c0c0', '#000080', '#ffffff'],
      desert: ['#d6c4a1', '#6e5535', '#ffffff'],
      marine: ['#aac7ce', '#174957', '#ffffff'],
      plum: ['#c9b8ce', '#593566', '#ffffff'],
      highcontrast: ['#000000', '#ffff00', '#000000']
    };
    function previewTheme() {
      const values = colors[draft.theme] || colors.standard;
      preview.style.backgroundColor = values[0];
      active.style.background = values[1];
      active.style.color = values[2];
      sample.style.fontSize = draft.largeFonts ? '16px' : '12px';
      sample.style.background = draft.highcontrast ? '#000' : '#fff';
      sample.style.color = draft.highcontrast ? '#fff' : '#000';
    }
    schemes.addEventListener('change', () => {
      change('theme', schemes.value);
      change('highcontrast', schemes.value === 'highcontrast');
      contrast.querySelector('input').checked = draft.highcontrast;
      previewTheme();
    });
    const contrast = check('Use high contrast', draft.highcontrast, value => {
      change('highcontrast', value);
      if (value) {
        change('theme', 'highcontrast');
        schemes.value = 'highcontrast';
      } else if (draft.theme === 'highcontrast') {
        change('theme', 'standard');
        schemes.value = 'standard';
      }
      previewTheme();
    });
    panel.append(preview, row('Scheme:', schemes), contrast, check('Use larger interface text', draft.largeFonts, value => {
      change('largeFonts', value);
      previewTheme();
    }), note('These settings change the windows, menus, and controls in this desktop.'));
    previewTheme();
  });
  p.addTab('Settings', (panel, draft, change) => {
    const backend = select([['auto', 'Automatic (recommended)'], ['webgpu', 'Prefer WebGPU'], ['webgl2', 'Prefer WebGL 2'], ['canvas2d', 'Canvas 2D']], draft.graphicsBackend, 'Graphics renderer');
    backend.addEventListener('change', () => change('graphicsBackend', backend.value));
    const stats = el('div');
    const update = () => {
      const value = sys.renderer?.stats || {};
      stats.replaceChildren(valueTable([['Active renderer', value.backend || 'Not initialized'], ['Render surface', `${value.width || 0} × ${value.height || 0} pixels`], ['Browser viewport', `${innerWidth} × ${innerHeight} CSS pixels`], ['Pixel ratio', `${globalThis.devicePixelRatio || 1}`], ['CPU frame submission', `${Number(value.frameTime || 0).toFixed(2)} ms`], ['Graphics adapter', value.adapter || 'Not reported'], ...(value.fallbackReason ? [['Fallback reason', value.fallbackReason]] : [])]));
    };
    panel.append(row('Renderer:', backend), stats, note('The browser controls display resolution and color depth. Preferred GPU renderers fall back to a supported backend when needed.'));
    update();
    every(p.win, update, 1500);
  });
  p.onTab(index => {
    backgroundPreview.pause(index !== 0);
    saverPreview.pause(index !== 1);
  });
  p.show(typeof args.tab === 'string' ? Math.max(0, ['background', 'screensaver', 'appearance', 'settings'].indexOf(args.tab.toLowerCase().replace(/\s/g, ''))) : args.tab || 0);
  return p.win;
}
function openDateTime(sys) {
  const p = propertyWindow(sys, {
    title: 'Date/Time Properties',
    icon: 'datetime',
    width: 465,
    height: 415,
    initial: {
      clockOffset: get(sys, 'clockOffset', 0),
      clock24: get(sys, 'clock24', false)
    }
  });
  p.addTab('Date & Time', (panel, draft, change) => {
    const adjusted = () => new Date(Date.now() + safeClockOffset(draft.clockOffset));
    const date = input('date', '', 'Desktop date');
    const time = input('time', '', 'Desktop time');
    time.step = 1;
    function refreshInputs() {
      const now = adjusted();
      const pad = n => String(n).padStart(2, '0');
      date.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      time.value = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
    function setClock() {
      const chosen = new Date(`${date.value}T${time.value}`);
      if (!Number.isNaN(chosen.getTime())) change('clockOffset', chosen.getTime() - Date.now());
    }
    date.addEventListener('change', setClock);
    time.addEventListener('change', setClock);
    const face = el('div', 'sys-clock-face');
    for (let number = 1; number <= 12; number++) {
      const mark = el('span', 'sys-clock-number', number);
      const angle = number / 12 * Math.PI * 2;
      mark.style.left = `${50 + Math.sin(angle) * 40}%`;
      mark.style.top = `${50 - Math.cos(angle) * 40}%`;
      face.append(mark);
    }
    const hour = el('span', 'sys-clock-hand sys-clock-hour');
    const minute = el('span', 'sys-clock-hand sys-clock-minute');
    const second = el('span', 'sys-clock-hand sys-clock-second');
    face.append(hour, minute, second, el('span', 'sys-clock-pin'));
    const digital = el('div', 'sys-digital-clock');
    function tick() {
      const now = adjusted();
      hour.style.transform = `rotate(${(now.getHours() % 12 + now.getMinutes() / 60) * 30}deg)`;
      minute.style.transform = `rotate(${(now.getMinutes() + now.getSeconds() / 60) * 6}deg)`;
      second.style.transform = `rotate(${now.getSeconds() * 6}deg)`;
      digital.textContent = now.toLocaleTimeString(undefined, {
        hour12: !draft.clock24
      });
    }
    const clocks = el('div', 'sys-clock-column');
    clocks.append(face, digital);
    const controls = el('div', 'sys-grow');
    controls.append(row('Date:', date), row('Time:', time), check('Use a 24-hour clock', draft.clock24, value => {
      change('clock24', value);
      tick();
    }), button(sys, 'Use Actual Time', () => {
      change('clockOffset', 0);
      refreshInputs();
      tick();
    }));
    const layout = el('div', 'sys-columns');
    layout.append(controls, clocks);
    panel.append(layout, note('This sets the desktop clock. It does not change your computer’s system clock.'));
    refreshInputs();
    tick();
    every(p.win, tick, 1000);
  });
  p.addTab('Time Zone', panel => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Not reported';
    panel.append(icon(sys, 'world', 48), group('Browser time zone', el('strong', '', timezone)), note('The desktop uses the time zone reported by your browser, including its daylight-saving rules. Change the host operating system’s time zone to use a different zone.'));
  });
  return p.win;
}
function systemFacts(sys) {
  const stats = sys.renderer?.stats || {};
  const files = entries(sys);
  return [['Desktop', 'Windows 98 — browser edition'], ['Applications', appList(sys).length], ['Open windows', sys.wm.list().length], ['Virtual files', files.filter(entry => !isDir(entry)).length], ['Virtual folders', files.filter(isDir).length], ['Recycle Bin items', sys.vfs.recycle?.length || 0], ['Browser platform', navigator.platform || 'Not reported'], ['Browser language', navigator.language || 'Not reported'], ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Not reported'], ['Browser viewport', `${innerWidth} × ${innerHeight} CSS pixels`], ['Renderer', stats.backend || 'Not initialized'], ['Graphics adapter', stats.adapter || 'Not reported'], ['Renderer fallback reason', stats.fallbackReason || 'None reported'], ['CPU frame submission', `${Number(stats.frameTime || 0).toFixed(2)} ms`], ['Frames rendered', stats.frames || 0], ['Logical processors reported', navigator.hardwareConcurrency || 'Not reported'], ['Device memory estimate', navigator.deviceMemory ? `${navigator.deviceMemory} GB (browser estimate)` : 'Not reported'], ['Page uptime', `${Math.floor(performance.now() / 60000)} minutes`], ['Network status', navigator.onLine ? 'Browser reports online' : 'Browser reports offline'], ['Browser user agent', navigator.userAgent || 'Not reported']];
}
function openSystem(sys) {
  const p = propertyWindow(sys, {
    title: 'System Properties',
    icon: 'system',
    width: 480,
    height: 460
  });
  p.applyButton.hidden = true;
  p.addTab('General', panel => {
    const heading = el('div', 'sys-product-heading');
    heading.append(icon(sys, 'computer', 48), el('div', '', 'Microsoft Windows 98\nBrowser Edition'));
    panel.append(heading);
    panel.append(group('System', note('A complete desktop environment running in your browser. Files and settings are stored locally for this site.')), valueTable(systemFacts(sys).slice(1, 6)), actions(button(sys, 'System Information...', () => sys.open('sysinfo'))));
  });
  p.addTab('Device Manager', panel => {
    panel.append(note('These are browser capabilities available to this desktop. Host hardware drivers are managed by your operating system.'), valueTable([['Graphics', sys.renderer?.stats?.backend || 'Initializing'], ['Web Audio', globalThis.AudioContext || globalThis.webkitAudioContext ? 'Available' : 'Unavailable'], ['Clipboard writing', navigator.clipboard?.writeText ? 'Available with browser permission' : 'Limited to browser copy commands'], ['Game controllers', navigator.getGamepads ? 'Gamepad API available' : 'Unavailable'], ['Local file storage', globalThis.indexedDB ? 'IndexedDB available' : 'IndexedDB unavailable'], ['Printing', typeof globalThis.print === 'function' ? 'Browser print dialog' : 'Unavailable']]));
  });
  p.addTab('Performance', panel => {
    panel.append(note('Process CPU use, host RAM usage, and physical disk health are not exposed to this application.'), valueTable(systemFacts(sys).slice(10, 17)), actions(button(sys, 'Task Manager', () => sys.open('taskmanager')), button(sys, 'Disk Cleanup', () => sys.open('diskcleanup'))));
  });
  return p.win;
}
function openSystemInfo(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Microsoft System Information', 'sysinfo', 620, 465);
  const content = el('div', 'sys-fill');
  function refresh() {
    content.replaceChildren(valueTable(systemFacts(sys)));
  }
  root.append(actions(button(sys, 'Refresh', refresh), button(sys, 'Export Report...', async () => {
    const text = `Windows 98 Desktop — System Information\n${new Date().toISOString()}\n\n` + systemFacts(sys).map(([key, value]) => `${key}: ${value}`).join('\n');
    const path = await sys.fileDialog({
      mode: 'save',
      path: 'C:/My Documents',
      filename: 'System Information.txt',
      filter: '.txt'
    });
    if (path) {
      await sys.vfs.write(path, text, {
        mime: 'text/plain'
      });
      await tell(sys, 'System Information', `Saved ${basename(path)}.`);
    }
  })), content, note('Values are reported by the browser and this desktop. They are not a host hardware inventory.'));
  refresh();
  return win;
}
function openTaskManager(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Windows Task Manager', 'taskmanager', 540, 410);
  root.classList.add('sys-taskmanager');
  const t = table(['Task', 'Status']);
  let selected = null;
  const status = el('div', 'sys-status');
  const switchButton = button(sys, 'Switch To', () => {
    const target = sys.wm.list().find(item => item.id === selected);
    if (target) sys.wm.focus(target);
  });
  const endButton = button(sys, 'End Task', async () => {
    const target = sys.wm.list().find(item => item.id === selected);
    if (target) await sys.wm.close(target);
    refresh();
  });
  function refresh() {
    const windows = sys.wm.list();
    if (!windows.some(item => item.id === selected)) selected = null;
    t.body.replaceChildren();
    windows.forEach(item => {
      const caption = el('span', 'sys-task-caption');
      caption.append(icon(sys, item.icon || 'application', 16), document.createTextNode(item.title || item.appId || 'Untitled'));
      const tr = tableRow([caption, item.minimized ? 'Minimized' : 'Running']);
      tr.tabIndex = 0;
      tr.classList.toggle('selected', item.id === selected);
      const choose = () => {
        selected = item.id;
        refresh();
      };
      tr.addEventListener('click', choose);
      tr.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose();
        }
      });
      tr.addEventListener('dblclick', () => sys.wm.focus(item));
      t.body.append(tr);
    });
    switchButton.disabled = endButton.disabled = !selected;
    const stats = sys.renderer?.stats || {};
    status.textContent = `${windows.length} windows   |   ${stats.backend || 'Renderer initializing'}   |   CPU submission: ${Number(stats.frameTime || 0).toFixed(2)} ms`;
  }
  root.append(note('Select a window to switch to it or close it. End Task keeps the application’s save prompts.'), t.outer, actions(endButton, switchButton, button(sys, 'New Task...', async () => {
    const list = appList(sys);
    const result = await formDialog(sys, 'Create New Task', [{
      name: 'app',
      label: 'Open:',
      type: 'select',
      value: list[0]?.id,
      options: list.map(app => [app.id, app.title])
    }], 'Run');
    if (result?.app) sys.open(result.app);
  })), status);
  refresh();
  every(win, refresh, 1000);
  return win;
}
function settingsCategory(key) {
  if (/^(wallpaper|screensaver|graphics|pointer)/i.test(key)) return 'Desktop';
  if (/^(theme|highcontrast|largeFonts)/i.test(key)) return 'Appearance';
  if (/^(clock|locale|date)/i.test(key)) return 'Date and Time';
  if (/^(systemSounds|volume|muted|sound)/i.test(key)) return 'Sound';
  if (/^(homepage|browser|internet)/i.test(key)) return 'Internet';
  if (/^(singleClick|showHidden|folder|explorer)/i.test(key)) return 'Explorer';
  if (/^(reducedMotion|caret|keyboard|accessibility)/i.test(key)) return 'Accessibility';
  if (/^scheduled/i.test(key)) return 'Scheduled Tasks';
  if (key.includes('.')) return 'Applications';
  return 'Other';
}
const valueType = value => value === null ? 'Null' : Array.isArray(value) || typeof value === 'object' ? 'JSON' : typeof value === 'boolean' ? 'Boolean' : typeof value === 'number' ? 'Number' : 'String';
const valueDescription = value => typeof value === 'string' ? value : JSON.stringify(value);
function deleteSetting(sys, key) {
  delete sys.settings.values[key];
  localStorage.setItem('win98-settings', JSON.stringify(sys.settings.values));
  sys.settings.dispatchEvent(new CustomEvent('change', {
    detail: {
      key,
      value: undefined
    }
  }));
}
function openRegistry(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Registry Editor', 'registry', 660, 460);
  const categories = ['All Settings', 'Desktop', 'Appearance', 'Date and Time', 'Sound', 'Internet', 'Explorer', 'Accessibility', 'Scheduled Tasks', 'Applications', 'Other'];
  let branch = 'All Settings';
  let selected = null;
  const tree = el('div', 'sys-registry-tree sunken');
  tree.append(el('div', 'sys-registry-root', '▾ HKEY_CURRENT_USER'));
  const t = table(['Name', 'Type', 'Data']);
  const location = el('div', 'sys-status');
  const branchButtons = [];
  categories.forEach(category => {
    const b = button(sys, category, () => {
      branch = category;
      selected = null;
      refresh();
    }, 'sys-tree-item');
    branchButtons.push([category, b]);
    tree.append(b);
  });
  async function edit(create = false) {
    if (!create && !selected) return;
    const old = selected;
    const value = create ? '' : sys.settings.values[old];
    const result = await formDialog(sys, create ? 'Create Setting' : 'Edit Setting', [{
      name: 'key',
      label: 'Name:',
      value: create ? '' : old,
      required: true,
      readonly: !create
    }, {
      name: 'type',
      label: 'Type:',
      type: 'select',
      value: valueType(value),
      options: ['String', 'Number', 'Boolean', 'JSON', 'Null']
    }, {
      name: 'value',
      label: 'Value:',
      type: 'textarea',
      value: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }], 'OK', 'These values are the desktop’s actual preferences. Changes take effect immediately.');
    if (!result) return;
    const key = result.key.trim();
    if (!key || ['__proto__', 'prototype', 'constructor'].includes(key)) return tell(sys, 'Registry Editor', 'Choose a valid setting name.');
    let next;
    if (result.type === 'String') next = result.value;
    if (result.type === 'Number') {
      next = Number(result.value);
      if (!result.value.trim() || !Number.isFinite(next)) return tell(sys, 'Registry Editor', 'Enter a finite number.');
    }
    if (result.type === 'Boolean') {
      if (!/^(true|false)$/i.test(result.value.trim())) return tell(sys, 'Registry Editor', 'Enter true or false for a Boolean value.');
      next = result.value.trim().toLowerCase() === 'true';
    }
    if (result.type === 'JSON') {
      try {
        next = JSON.parse(result.value);
      } catch (error) {
        return tell(sys, 'Registry Editor', `Invalid JSON: ${error.message}`);
      }
    }
    if (result.type === 'Null') next = null;
    if (create && Object.prototype.hasOwnProperty.call(sys.settings.values, key)) {
      const answer = await sys.dialog({
        title: 'Registry Editor',
        message: `Replace the existing setting “${key}”?`,
        icon: 'warning',
        buttons: [{
          label: 'Replace',
          value: 'replace'
        }, {
          label: 'Cancel',
          value: 'cancel'
        }]
      });
      if (answer !== 'replace') return;
    }
    sys.settings.set(key, next);
    selected = key;
    refresh();
  }
  async function remove() {
    if (!selected) return;
    const key = selected;
    const answer = await sys.dialog({
      title: 'Confirm Value Delete',
      message: `Delete the setting “${key}”? The desktop will use its default if one is defined.`,
      icon: 'warning',
      buttons: [{
        label: 'Yes',
        value: 'yes'
      }, {
        label: 'No',
        value: 'no'
      }]
    });
    if (answer === 'yes') {
      deleteSetting(sys, key);
      selected = null;
      refresh();
    }
  }
  async function exportSettings() {
    const values = Object.fromEntries(Object.entries(sys.settings.values).filter(([key]) => branch === 'All Settings' || settingsCategory(key) === branch));
    const text = JSON.stringify({
      format: 'win98-desktop-settings',
      branch: `HKEY_CURRENT_USER\\${branch}`,
      exported: new Date().toISOString(),
      values
    }, null, 2);
    const path = await sys.fileDialog({
      mode: 'save',
      path: 'C:/My Documents',
      filename: 'Desktop Settings.json',
      filter: '.json'
    });
    if (path) {
      await sys.vfs.write(path, text, {
        mime: 'application/json'
      });
      await tell(sys, 'Registry Editor', `Saved ${basename(path)}.`);
    }
  }
  const editButton = button(sys, 'Modify...', () => edit());
  const deleteButton = button(sys, 'Delete', remove);
  function refresh() {
    const values = Object.entries(sys.settings.values || {}).filter(([key]) => branch === 'All Settings' || settingsCategory(key) === branch).sort(([a], [b]) => a.localeCompare(b));
    if (!values.some(([key]) => key === selected)) selected = null;
    t.body.replaceChildren();
    values.forEach(([key, value]) => {
      const text = valueDescription(value) ?? '';
      const tr = tableRow([key, valueType(value), text.length > 160 ? `${text.slice(0, 160)}…` : text]);
      tr.tabIndex = 0;
      tr.classList.toggle('selected', key === selected);
      tr.title = key;
      tr.addEventListener('click', () => {
        selected = key;
        refresh();
      });
      tr.addEventListener('dblclick', () => {
        selected = key;
        safely(sys, () => edit())();
      });
      tr.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          selected = key;
          safely(sys, () => edit())();
        } else if (event.key === 'Delete') {
          selected = key;
          safely(sys, remove)();
        }
      });
      t.body.append(tr);
    });
    branchButtons.forEach(([category, b]) => b.classList.toggle('selected', category === branch));
    editButton.disabled = deleteButton.disabled = !selected;
    location.textContent = `HKEY_CURRENT_USER\\${branch} — ${values.length} values`;
  }
  const menuNode = sys.menuBar(win, [{
    label: 'Registry',
    items: [{
      label: 'Export Registry File...',
      action: safely(sys, exportSettings)
    }, {
      type: 'separator'
    }, {
      label: 'Exit',
      action: () => win.close()
    }]
  }, {
    label: 'Edit',
    items: [{
      label: 'New Value...',
      action: safely(sys, () => edit(true))
    }, {
      label: 'Modify...',
      action: safely(sys, () => edit())
    }, {
      label: 'Delete',
      action: safely(sys, remove)
    }]
  }, {
    label: 'View',
    items: [{
      label: 'Refresh',
      action: refresh
    }]
  }]);
  if (menuNode?.parentNode === win.body) win.body.insertBefore(menuNode, root);
  const layout = el('div', 'sys-registry-layout');
  layout.append(tree, t.outer);
  root.append(actions(button(sys, 'New...', () => edit(true)), editButton, deleteButton, button(sys, 'Export...', exportSettings)), layout, location);
  const unsubscribe = sys.settings.subscribe?.(refresh);
  if (typeof unsubscribe === 'function') win.addCleanup(unsubscribe);
  refresh();
  return win;
}
function progressBar() {
  const node = el('div', 'sys-progress sunken');
  node.setAttribute('role', 'progressbar');
  node.setAttribute('aria-valuemin', '0');
  node.setAttribute('aria-valuemax', '100');
  const fill = el('div', 'sys-progress-fill');
  node.append(fill);
  return {
    node,
    set(value) {
      const amount = Math.max(0, Math.min(100, value));
      fill.style.width = `${amount}%`;
      node.setAttribute('aria-valuenow', String(Math.round(amount)));
    }
  };
}
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
function openScanDisk(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'ScanDisk', 'scandisk', 525, 450);
  const bar = progressBar();
  const output = el('textarea', 'sys-disk-log sys-input');
  output.readOnly = true;
  output.setAttribute('aria-label', 'Scan results');
  const status = el('div', 'sys-status', 'Ready to check the local C: drive.');
  let scanning = false;
  let cancel = false;
  let report = '';
  const start = button(sys, 'Start', scan);
  const stop = button(sys, 'Stop', () => {
    cancel = true;
  });
  stop.disabled = true;
  win.addCleanup(() => {
    cancel = true;
  });
  async function scan() {
    if (scanning) return;
    scanning = true;
    cancel = false;
    start.disabled = true;
    stop.disabled = false;
    bar.set(0);
    output.value = '';
    const records = [...sys.vfs.entries.entries()];
    const paths = new Map(records.map(([, entry]) => [normalize(entry.path), entry]));
    const found = new Set();
    const issues = [];
    let checked = 0;
    function issue(path, message) {
      issues.push(`${path || '(unnamed entry)'}: ${message}`);
    }
    try {
      for (const [key, entry] of records) {
        if (cancel) break;
        const path = entry?.path;
        const normalized = normalize(path);
        if (!path || typeof path !== 'string') issue(path, 'Missing path.');
        if (normalize(key) !== normalized) issue(path, 'The storage key does not match the entry path.');
        if (found.has(normalized)) issue(path, 'Duplicate path after case normalization.');
        found.add(normalized);
        if (!['file', 'directory'].includes(entry?.type)) issue(path, `Unrecognized entry type: ${entry?.type}.`);
        if (path && !/^[a-z]:\/?$/i.test(String(path))) {
          const parent = normalized.replace(/\/[^/]+$/, '');
          if (parent && parent !== normalized) {
            if (!paths.has(parent)) issue(path, `Parent folder is missing: ${parent}.`);else if (!isDir(paths.get(parent))) issue(path, 'The parent path is a file, not a folder.');
          }
        }
        if (entry?.type === 'file') {
          try {
            const data = sys.vfs.read(path);
            if (typeof data !== 'string') issue(path, 'The file contents are not stored as a string.');
          } catch (error) {
            issue(path, `Cannot read the file: ${error.message || error}.`);
          }
          if (typeof entry.content !== 'string') issue(path, 'The stored file content is missing or has the wrong type.');
        }
        if (entry?.readonly !== undefined && typeof entry.readonly !== 'boolean') issue(path, 'The read-only attribute is not a Boolean.');
        if (entry?.hidden !== undefined && typeof entry.hidden !== 'boolean') issue(path, 'The hidden attribute is not a Boolean.');
        checked++;
        bar.set(records.length ? checked / records.length * 100 : 100);
        status.textContent = `Checking ${checked} of ${records.length} entries: ${path || '(unnamed)'}`;
        if (checked % 16 === 0) {
          output.value = issues.join('\n') || 'No inconsistencies found so far.';
          await nextFrame();
        }
      }
      const summary = `${cancel ? 'Scan stopped' : 'Scan complete'}: ${checked} entries checked; ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} found.`;
      report = `ScanDisk — Local Virtual Disk\n${new Date().toISOString()}\n\n${summary}\n\n${issues.length ? issues.join('\n') : 'The checked entries have consistent paths, parent folders, types, readable contents, and file attributes.'}\n\nThis is a read-only check of this desktop’s file records. Physical storage health is not exposed by the browser.`;
      output.value = report;
      status.textContent = summary;
      if (!cancel) bar.set(100);
    } finally {
      scanning = false;
      start.disabled = false;
      stop.disabled = true;
    }
  }
  root.append(note('ScanDisk checks the real file records in this desktop. It checks paths, parent folders, entry types, contents, and attributes without changing files.'), group('Drive', el('strong', '', 'C: — Local virtual disk')), bar.node, output, actions(start, stop, button(sys, 'Save Report...', async () => {
    if (!report) return tell(sys, 'ScanDisk', 'Run a scan first.');
    const path = await sys.fileDialog({
      mode: 'save',
      path: 'C:/My Documents',
      filename: 'ScanDisk Report.txt',
      filter: '.txt'
    });
    if (path) await sys.vfs.write(path, report, {
      mime: 'text/plain'
    });
  })), status);
  return win;
}
function openDefrag(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Disk Defragmenter', 'defrag', 480, 380);
  const bar = progressBar();
  const map = el('div', 'sys-disk-blocks sunken');
  const status = el('div', 'sys-status');
  const summary = el('div', 'sys-note');
  let running = false;
  let cancel = false;
  const optimize = button(sys, 'Optimize', run);
  const stop = button(sys, 'Stop', () => {
    cancel = true;
  });
  stop.disabled = true;
  win.addCleanup(() => {
    cancel = true;
  });
  function analyze() {
    const records = entries(sys);
    summary.textContent = `${records.length} entries in the local virtual disk. The blocks below represent stored records, not physical sectors.`;
    map.replaceChildren();
    const count = Math.min(150, Math.max(1, records.length));
    for (let i = 0; i < count; i++) map.append(el('span', 'sys-disk-block'));
    status.textContent = 'Ready. Optimize serializes current records and flushes them to browser storage.';
    bar.set(0);
  }
  async function run() {
    if (running) return;
    running = true;
    cancel = false;
    optimize.disabled = true;
    stop.disabled = false;
    analyze();
    const records = entries(sys);
    let total = 0;
    let processed = 0;
    try {
      for (const entry of records) {
        if (cancel) {
          status.textContent = 'Stopped before the final storage flush.';
          return;
        }
        total += bytes(JSON.stringify(entry));
        processed++;
        const ratio = records.length ? processed / records.length : 1;
        bar.set(ratio * 90);
        [...map.children].forEach((block, index) => block.classList.toggle('done', index < ratio * map.children.length));
        status.textContent = `Serializing ${processed} of ${records.length} entries...`;
        if (processed % 12 === 0) await nextFrame();
      }
      stop.disabled = true;
      status.textContent = 'Saving current file records to browser storage...';
      await nextFrame();
      await sys.vfs.flush();
      bar.set(100);
      status.textContent = `Complete. Serialized ${records.length} entries (${sizeText(total)}) and flushed the local disk.`;
    } finally {
      running = false;
      optimize.disabled = false;
      stop.disabled = true;
    }
  }
  root.append(el('strong', 'sys-section-heading', 'Optimize local disk'), note('This desktop uses browser storage. Physical defragmentation is managed by your operating system; this tool serializes the current virtual files and writes them to persistent storage.'), summary, map, bar.node, actions(button(sys, 'Analyze', () => {
    if (!running) analyze();
  }), optimize, stop), status);
  analyze();
  return win;
}
function openDiskCleanup(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Disk Cleanup for C:', 'diskcleanup', 570, 450);
  const t = table(['Delete', 'Item', 'Location', 'Stored data']);
  const status = el('div', 'sys-status');
  let candidates = [];
  const selected = new Set();
  const clean = button(sys, 'Clean Up', cleanup);
  function refresh() {
    selected.clear();
    candidates = [...(sys.vfs.recycle || []).map((entry, index) => ({
      key: `recycle-${index}`,
      kind: 'recycle',
      entry,
      path: entry.originalPath || entry.path || entry.entry?.path || `Deleted item ${index + 1}`,
      size: bytes(entry)
    })), ...entries(sys).filter(entry => !isDir(entry) && /^c:\/windows\/temp\//i.test(String(entry.path).replace(/\\/g, '/'))).map(entry => ({
      key: `temp-${entry.path}`,
      kind: 'temp',
      entry,
      path: entry.path,
      size: bytes(entry.content || '')
    }))];
    t.body.replaceChildren();
    for (const item of candidates) {
      const toggle = input('checkbox', '', `Delete ${basename(item.path)}`);
      item.toggle = toggle;
      toggle.addEventListener('change', () => {
        toggle.checked ? selected.add(item.key) : selected.delete(item.key);
        update();
      });
      t.body.append(tableRow([toggle, basename(item.path), item.kind === 'recycle' ? 'Recycle Bin' : 'Windows\\Temp', sizeText(item.size)]));
    }
    if (!candidates.length) t.body.append(tableRow(['', 'No deleted items or temporary files found.', '', '']));
    update();
  }
  function update() {
    const size = candidates.filter(item => selected.has(item.key)).reduce((sum, item) => sum + item.size, 0);
    status.textContent = `${selected.size} of ${candidates.length} items selected — ${sizeText(size)} of stored data`;
    clean.disabled = !selected.size;
  }
  async function cleanup() {
    const chosen = candidates.filter(item => selected.has(item.key));
    if (!chosen.length) return;
    const answer = await sys.dialog({
      title: 'Disk Cleanup',
      icon: 'warning',
      message: `Permanently delete these ${chosen.length} selected items from the desktop’s local disk?\n\n${chosen.slice(0, 8).map(item => basename(item.path)).join('\n')}${chosen.length > 8 ? '\n…' : ''}\n\nThese items will no longer be available in the Recycle Bin.`,
      buttons: [{
        label: 'Delete Items',
        value: 'delete'
      }, {
        label: 'Cancel',
        value: 'cancel'
      }]
    });
    if (answer !== 'delete') return;
    clean.disabled = true;
    const errors = [];
    let removed = 0;
    for (const item of chosen) {
      try {
        if (item.kind === 'recycle') {
          const index = sys.vfs.recycle.indexOf(item.entry);
          if (index >= 0) {
            sys.vfs.recycle.splice(index, 1);
            removed++;
          }
        } else {
          await sys.vfs.delete(item.path, {
            permanent: true
          });
          removed++;
        }
      } catch (error) {
        errors.push(`${basename(item.path)}: ${error.message || error}`);
      }
    }
    sys.vfs.emit?.();
    await sys.vfs.flush();
    refresh();
    status.textContent = `Deleted ${removed} items.${errors.length ? ` ${errors.length} items could not be deleted.` : ''}`;
    if (errors.length) await tell(sys, 'Disk Cleanup', errors.join('\n'), 'warning');
  }
  root.append(note('Choose the deleted items and files in C:\\Windows\\Temp that you want to remove. Other documents are left alone.'), t.outer, actions(button(sys, 'Select All', () => {
    candidates.forEach(item => {
      selected.add(item.key);
      item.toggle.checked = true;
    });
    update();
  }), button(sys, 'Select None', () => {
    selected.clear();
    candidates.forEach(item => {
      item.toggle.checked = false;
    });
    update();
  }), button(sys, 'Refresh', refresh), clean), status);
  refresh();
  return win;
}
function scheduledJobs(sys) {
  const value = get(sys, 'scheduledTasks', []);
  return Array.isArray(value) ? copy(value).filter(job => job && typeof job === 'object' && typeof job.id === 'string') : [];
}
function setScheduledJobs(sys, jobs) {
  sys.settings.set('scheduledTasks', jobs);
}
function installScheduler(sys) {
  if (sys.__systemScheduler) return;
  let checking = false;
  async function checkJobs() {
    if (checking) return;
    checking = true;
    try {
      const jobs = scheduledJobs(sys);
      const now = Date.now() + safeClockOffset(get(sys, 'clockOffset', 0));
      const due = [];
      for (const job of jobs) {
        const target = new Date(job.time).getTime();
        if (!job.enabled || !Number.isFinite(target) || target > now || !knownApp(sys, job.appId)) continue;
        job.lastRun = new Date(now).toISOString();
        job.lastError = null;
        if (job.repeat === 'daily') {
          const next = new Date(target);
          let attempts = 0;
          do {
            next.setDate(next.getDate() + 1);
            attempts++;
          } while (next.getTime() <= now && attempts < 37000);
          job.time = next.toISOString();
        } else job.enabled = false;
        due.push(job);
      }
      if (due.length) setScheduledJobs(sys, jobs);
      for (const job of due) {
        try {
          await sys.open(job.appId);
        } catch (error) {
          const current = scheduledJobs(sys);
          const entry = current.find(item => item.id === job.id);
          if (entry) {
            entry.lastError = error.message || String(error);
            setScheduledJobs(sys, current);
          }
        }
      }
    } finally {
      checking = false;
    }
  }
  const timer = setInterval(checkJobs, 1000);
  sys.__systemScheduler = {
    timer,
    check: checkJobs,
    dispose: () => {
      clearInterval(timer);
      delete sys.__systemScheduler;
    }
  };
}
function openScheduled(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Scheduled Tasks', 'scheduled', 625, 435);
  const t = table(['Task', 'Next Run', 'Schedule', 'Status']);
  const status = el('div', 'sys-status');
  let selected = null;
  const run = button(sys, 'Run Now', () => {
    const job = scheduledJobs(sys).find(item => item.id === selected);
    if (job && knownApp(sys, job.appId)) sys.open(job.appId);
  });
  const toggle = button(sys, 'Enable / Disable', () => {
    const jobs = scheduledJobs(sys);
    const job = jobs.find(item => item.id === selected);
    if (job) {
      job.enabled = !job.enabled;
      setScheduledJobs(sys, jobs);
      refresh();
    }
  });
  const remove = button(sys, 'Delete', () => {
    setScheduledJobs(sys, scheduledJobs(sys).filter(item => item.id !== selected));
    selected = null;
    refresh();
  });
  function refresh() {
    const jobs = scheduledJobs(sys);
    if (!jobs.some(item => item.id === selected)) selected = null;
    t.body.replaceChildren();
    for (const job of jobs) {
      const app = sys.apps.get(job.appId);
      const tr = tableRow([job.name || app?.title || job.appId, job.enabled ? dateText(sys, job.time) : '—', job.repeat === 'daily' ? 'Daily' : 'Once', job.lastError ? `Error: ${job.lastError}` : !app ? 'Application unavailable' : job.enabled ? 'Ready' : job.lastRun ? 'Completed' : 'Disabled']);
      tr.tabIndex = 0;
      tr.classList.toggle('selected', selected === job.id);
      tr.addEventListener('click', () => {
        selected = job.id;
        refresh();
      });
      tr.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selected = job.id;
          refresh();
        }
      });
      t.body.append(tr);
    }
    toggle.disabled = remove.disabled = !selected;
    const job = jobs.find(item => item.id === selected);
    run.disabled = !job || !knownApp(sys, job.appId);
    if (job) toggle.textContent = job.enabled ? 'Disable' : 'Enable';
    status.textContent = job?.lastRun ? `Last run: ${dateText(sys, job.lastRun)}` : `${jobs.length} scheduled ${jobs.length === 1 ? 'task' : 'tasks'}`;
  }
  async function add() {
    const list = appList(sys).filter(app => app.id !== 'scheduled');
    const now = new Date(Date.now() + safeClockOffset(get(sys, 'clockOffset', 0)) + 60000);
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const result = await formDialog(sys, 'Add Scheduled Task', [{
      name: 'name',
      label: 'Task name:',
      value: '',
      required: true
    }, {
      name: 'appId',
      label: 'Application:',
      type: 'select',
      value: list[0]?.id,
      options: list.map(app => [app.id, app.title])
    }, {
      name: 'time',
      label: 'Run at:',
      type: 'datetime-local',
      value: local,
      required: true
    }, {
      name: 'repeat',
      label: 'Schedule:',
      type: 'select',
      value: 'once',
      options: [['once', 'One time'], ['daily', 'Every day']]
    }], 'Finish', 'Times use the desktop clock and the browser’s time zone.');
    if (!result) return;
    const time = new Date(result.time);
    if (!Number.isFinite(time.getTime())) return tell(sys, 'Scheduled Tasks', 'Choose a valid date and time.');
    const job = {
      id: globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: result.name.trim(),
      appId: result.appId,
      time: time.toISOString(),
      repeat: result.repeat,
      enabled: true,
      lastRun: null
    };
    if (!knownApp(sys, job.appId)) return tell(sys, 'Scheduled Tasks', 'Choose an available application.');
    setScheduledJobs(sys, [...scheduledJobs(sys), job]);
    selected = job.id;
    refresh();
  }
  root.append(note('Tasks open desktop applications while this page is running. Browsers can delay background timers. Missed tasks run when the desktop resumes; scheduled actions do not run after the page is closed.'), t.outer, actions(button(sys, 'Add Scheduled Task...', add), run, toggle, remove), status);
  const unsubscribe = sys.settings.subscribe?.(refresh);
  if (typeof unsubscribe === 'function') win.addCleanup(unsubscribe);
  refresh();
  every(win, refresh, 5000);
  return win;
}
function installPreferenceStyles(sys) {
  if (sys.__systemPreferenceStyles) return;
  const style = el('style');
  style.id = 'win98-system-preference-styles';
  document.head.append(style);
  function update() {
    const scheme = get(sys, 'pointer', 'default');
    let cursor = '';
    if (scheme === 'crosshair') cursor = 'crosshair';
    if (scheme === 'large') {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M2 2v31l8-8 7 16 7-3-7-15h12Z" fill="white" stroke="black" stroke-width="2"/></svg>';
      cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, default`;
    }
    const color = get(sys, 'caretColor', '#000000');
    const validColor = /^#[a-f\d]{6}$/i.test(color) ? color : '#000000';
    style.textContent = `${cursor ? `body,body button,body a,body [role="button"],body .desktop-icon,body .title-bar,body .taskbar{cursor:${cursor}}` : ''}\nbody input,body textarea,body [contenteditable="true"]{caret-color:${validColor}}\n${get(sys, 'reducedMotion', false) ? 'body *,body *::before,body *::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}' : ''}`;
  }
  const unsubscribe = sys.settings.subscribe?.(update);
  sys.__systemPreferenceStyles = {
    update,
    dispose() {
      if (typeof unsubscribe === 'function') unsubscribe();
      style.remove();
      delete sys.__systemPreferenceStyles;
    }
  };
  update();
}
function openMouse(sys) {
  const p = propertyWindow(sys, {
    title: 'Mouse Properties',
    icon: 'mouse',
    width: 435,
    height: 435,
    initial: {
      pointer: get(sys, 'pointer', 'default')
    }
  });
  p.addTab('Buttons', panel => {
    let clicks = 0;
    let rightClicks = 0;
    let opened = false;
    const target = el('button', 'sys-mouse-test');
    target.type = 'button';
    target.setAttribute('aria-label', 'Mouse button and double-click test');
    const result = el('div', 'sys-status', 'Click or double-click the folder to test your mouse.');
    function redraw() {
      target.innerHTML = sys.icon(opened ? 'folderopen' : 'folder', 48);
    }
    target.addEventListener('click', () => {
      clicks++;
      result.textContent = `Primary clicks: ${clicks}    Secondary clicks: ${rightClicks}`;
    });
    target.addEventListener('dblclick', () => {
      opened = !opened;
      redraw();
      result.textContent = `Double-click detected. Folder ${opened ? 'opened' : 'closed'}.`;
    });
    target.addEventListener('contextmenu', event => {
      event.preventDefault();
      rightClicks++;
      result.textContent = `Primary clicks: ${clicks}    Secondary clicks: ${rightClicks}`;
    });
    redraw();
    panel.append(group('Button test', target, result), note('Button assignment, pointer speed, and double-click timing are controlled by your host operating system. This test reports the mouse events received by the browser.'));
  });
  p.addTab('Pointers', (panel, draft, change) => {
    const scheme = select([['default', 'Windows Standard'], ['large', 'Large Pointer'], ['crosshair', 'Crosshair']], draft.pointer, 'Pointer scheme');
    const preview = el('div', 'sys-pointer-preview', 'Move the pointer into this box to preview it.');
    function update() {
      preview.style.cursor = scheme.value === 'crosshair' ? 'crosshair' : scheme.value === 'large' ? 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2736%27 height=%2744%27%3E%3Cpath d=%27M2 2v31l8-8 7 16 7-3-7-15h12Z%27 fill=%27white%27 stroke=%27black%27 stroke-width=%272%27/%3E%3C/svg%3E") 2 2, default' : 'default';
    }
    scheme.addEventListener('change', () => {
      change('pointer', scheme.value);
      update();
    });
    panel.append(row('Scheme:', scheme), preview, note('The selected pointer is used for desktop controls. Drawing and text-editing tools keep their own contextual cursors.'));
    update();
  });
  return p.win;
}
function openKeyboard(sys) {
  const p = propertyWindow(sys, {
    title: 'Keyboard Properties',
    icon: 'keyboard',
    width: 470,
    height: 405,
    initial: {
      caretColor: get(sys, 'caretColor', '#000000')
    }
  });
  p.addTab('Keyboard Test', panel => {
    const test = el('textarea', 'sys-input sys-keyboard-test');
    test.placeholder = 'Click here and type to test your keyboard.';
    test.setAttribute('aria-label', 'Keyboard test');
    const values = el('div', 'sys-key-values');
    let count = 0;
    test.addEventListener('keydown', event => {
      count++;
      values.replaceChildren(valueTable([['Key', event.key === ' ' ? 'Space' : event.key], ['Physical key code', event.code || 'Not reported'], ['Key repeat', event.repeat ? 'Repeating' : 'Initial press'], ['Caps Lock', event.getModifierState('CapsLock') ? 'On' : 'Off'], ['Modifiers', [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta'].filter(Boolean).join(' + ') || 'None'], ['Key events received', count]]));
    });
    panel.append(test, values, actions(button(sys, 'Clear Test', () => {
      test.value = '';
      values.replaceChildren();
      count = 0;
      test.focus();
    })), note('The browser receives the keyboard layout and repeat timing selected in your host operating system.'));
    values.append(note('Key information appears here while you type.'));
  });
  p.addTab('Text Cursor', (panel, draft, change) => {
    const color = input('color', draft.caretColor, 'Text cursor color');
    const sample = input('text', 'Click here to preview the text cursor.', 'Text cursor preview');
    sample.style.caretColor = draft.caretColor;
    color.addEventListener('input', () => {
      change('caretColor', color.value);
      sample.style.caretColor = color.value;
    });
    panel.append(row('Cursor color:', color), sample, note('This color applies to editable text fields in the desktop. Cursor blink timing follows the browser and operating system.'));
  });
  return p.win;
}
function soundControls(sys, p, panel) {
  const draft = p.draft;
  const volume = input('range', Math.round(Number(draft.volume ?? 0.7) * (Number(draft.volume) <= 1 ? 100 : 1)), 'System sound volume');
  volume.min = 0;
  volume.max = 100;
  volume.step = 1;
  const value = el('span', 'sys-volume-value', `${volume.value}%`);
  volume.addEventListener('input', () => {
    p.change('volume', Number(volume.value) / 100);
    value.textContent = `${volume.value}%`;
  });
  const line = el('div', 'sys-volume-row');
  line.append(el('span', '', 'Low'), volume, el('span', '', 'High'), value);
  panel.append(check('Enable system sounds', draft.systemSounds, checked => p.change('systemSounds', checked)), group('Volume', line, check('Mute all desktop audio', draft.muted, checked => p.change('muted', checked))));
}
function openSounds(sys) {
  const p = propertyWindow(sys, {
    title: 'Sounds Properties',
    icon: 'sounds',
    width: 450,
    height: 415,
    initial: {
      systemSounds: get(sys, 'systemSounds', true),
      volume: get(sys, 'volume', 0.7),
      muted: get(sys, 'muted', false)
    }
  });
  p.addTab('Sounds', panel => {
    soundControls(sys, p, panel);
    const names = Array.isArray(sys.sound?.names) ? sys.sound.names : ['startup', 'shutdown', 'error', 'notify'];
    const event = select(names.map(name => [name, String(name).replace(/^./, letter => letter.toUpperCase())]), names[0], 'Sound event');
    panel.append(group('Events', row('Sound:', event), actions(button(sys, 'Play', async () => {
      await p.commit();
      if (get(sys, 'muted', false) || !get(sys, 'systemSounds', true)) return tell(sys, 'Sounds', 'Unmute the desktop and enable system sounds to hear a preview.');
      await sys.sound.play(event.value);
    }))), note('Sounds are generated or played by this desktop. Your browser and host volume controls also affect the output.'));
  });
  return p.win;
}
function openPrograms(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Add/Remove Programs Properties', 'programs', 545, 430);
  const t = table(['Application', 'Identifier']);
  let selected = null;
  const description = el('div', 'sys-program-description');
  const launch = button(sys, 'Open', () => {
    if (selected) sys.open(selected);
  });
  const details = button(sys, 'Properties', () => {
    const app = sys.apps.get(selected);
    if (app) tell(sys, app.title, `${app.title}\nApplication identifier: ${app.id}\n\n${app.description || 'Included with this desktop and available in the current session.'}\n\nApplication modules are part of the website. Removing them requires updating the desktop package; this panel does not pretend to uninstall them.`, app.icon || 'application');
  });
  function refresh() {
    const list = appList(sys);
    if (!list.some(app => app.id === selected)) selected = null;
    t.body.replaceChildren();
    list.forEach(app => {
      const title = el('span', 'sys-task-caption');
      title.append(icon(sys, app.icon || 'application', 16), document.createTextNode(app.title));
      const tr = tableRow([title, app.id]);
      tr.classList.toggle('selected', selected === app.id);
      tr.tabIndex = 0;
      tr.addEventListener('click', () => {
        selected = app.id;
        refresh();
      });
      tr.addEventListener('dblclick', () => sys.open(app.id));
      tr.addEventListener('keydown', event => {
        if (event.key === 'Enter') sys.open(app.id);
      });
      t.body.append(tr);
    });
    launch.disabled = details.disabled = !selected;
    description.textContent = `${list.length} registered applications. Select an application to open it or view its package information.`;
  }
  root.append(note('The following programs are available in this desktop.'), t.outer, description, actions(button(sys, 'Refresh', refresh), details, launch));
  refresh();
  return win;
}
function openInternetOptions(sys) {
  const p = propertyWindow(sys, {
    title: 'Internet Properties',
    icon: 'internetoptions',
    width: 470,
    height: 430,
    initial: {
      homepage: get(sys, 'homepage', 'about:home')
    },
    apply: draft => {
      const value = String(draft.homepage).trim();
      if (!/^(https?:\/\/|about:)/i.test(value)) {
        tell(sys, 'Internet Properties', 'Enter an http://, https://, or about: home page.');
        return false;
      }
      sys.settings.set('homepage', value);
    }
  });
  p.addTab('General', (panel, draft, change) => {
    const home = input('text', draft.homepage, 'Home page address');
    home.addEventListener('input', () => change('homepage', home.value));
    panel.append(group('Home page', note('Choose the page opened by the desktop web browser’s Home command.'), row('Address:', home), actions(button(sys, 'Use Default', () => {
      home.value = 'about:home';
      change('homepage', home.value);
    }), button(sys, 'Use Blank', () => {
      home.value = 'about:blank';
      change('homepage', home.value);
    }), button(sys, 'Open Home Page', () => sys.open('browser', {
      url: home.value
    })))), note('Internet access and downloads are handled by the browser running this desktop.'));
  });
  p.addTab('Security', panel => {
    panel.append(icon(sys, 'internetoptions', 48), group('Browser security', note('Website permissions, certificates, cookies, and network security are controlled by your browser. This desktop cannot lower those protections.')), note('Some external websites refuse to appear inside another page. Use your browser’s normal tab or window for those sites.'));
  });
  p.addTab('Connections', panel => {
    panel.append(valueTable([['Browser status', navigator.onLine ? 'Online' : 'Offline'], ['Current site', location.hostname || 'Local page'], ['Connection security', location.protocol === 'https:' ? 'HTTPS' : location.protocol.replace(':', '').toUpperCase()]]), note('Proxy servers, VPNs, and dial-up connections are configured in your host operating system.'), actions(button(sys, 'Network Properties...', () => sys.open('network'))));
  });
  return p.win;
}
function openNetwork(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Network Properties', 'network', 485, 395);
  const facts = el('div');
  const status = el('div', 'sys-status');
  function refresh() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    facts.replaceChildren(valueTable([['Connection status', navigator.onLine ? 'Browser reports online' : 'Browser reports offline'], ['Desktop origin', location.origin], ['Transport', location.protocol], ['Connection type estimate', connection?.effectiveType || 'Not reported'], ['Downlink estimate', typeof connection?.downlink === 'number' ? `${connection.downlink} Mbps (browser estimate)` : 'Not reported'], ['Round-trip estimate', typeof connection?.rtt === 'number' ? `${connection.rtt} ms (browser estimate)` : 'Not reported'], ['Data saver', connection?.saveData ? 'Requested' : 'Not requested']]));
    status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }
  root.append(facts, note('Online status describes the browser’s connection state; it does not guarantee that a particular website is reachable. IP addresses, network adapters, DNS, and host network configuration are not exposed here.'), actions(button(sys, 'Refresh', refresh), button(sys, 'Open Web Browser', () => sys.open('browser'))), status);
  listen(win, globalThis, 'online', refresh);
  listen(win, globalThis, 'offline', refresh);
  if (navigator.connection?.addEventListener) listen(win, navigator.connection, 'change', refresh);
  refresh();
  return win;
}
function printTestPage(sys) {
  const frame = el('iframe', 'sys-print-frame');
  frame.title = 'Printer Test Page';
  document.body.append(frame);
  const documentContent = frame.contentDocument;
  documentContent.open();
  documentContent.write('<!doctype html><html><head><title>Windows 98 Printer Test Page</title><style>body{font:14px Arial,sans-serif;margin:22mm;color:#000;background:#fff}h1{font-size:26px;border-bottom:3px solid #000;padding-bottom:12px}.bars{display:flex;height:35px;margin:30px 0}.bars span{flex:1}</style></head><body><h1>Windows 98 Printer Test Page</h1><p>This page was sent to your browser’s print dialog by the desktop.</p><p>If you can read this text, the document was rendered successfully.</p><div class="bars"><span style="background:#000"></span><span style="background:#808080"></span><span style="background:#f00"></span><span style="background:#0f0"></span><span style="background:#00f"></span><span style="background:#0ff"></span><span style="background:#f0f"></span><span style="background:#ff0"></span></div><p>ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789</p><p>Printing is completed by the printer or PDF destination selected in your browser.</p></body></html>');
  documentContent.close();
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  frame.contentWindow.addEventListener('afterprint', cleanup, {
    once: true
  });
  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) {
      frame.remove();
      tell(sys, 'Printers', error.message, 'error');
    }
  }, 150);
  setTimeout(() => frame.remove(), 120000);
}
function openPrinters(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Printers', 'printers', 450, 320);
  const item = el('div', 'sys-printer-card');
  item.append(icon(sys, 'printers', 48), el('strong', '', 'Browser Print Dialog'));
  root.append(item, note('Choose a printer or Save as PDF in your browser’s print dialog. Installed printers, drivers, and print queues are managed by your operating system.'), group('Test your printer', note('Open a test document containing text and color bars.'), actions(button(sys, 'Print Test Page', () => printTestPage(sys)))));
  return win;
}
function openRegional(sys) {
  const p = propertyWindow(sys, {
    title: 'Regional Settings Properties',
    icon: 'regional',
    width: 460,
    height: 420,
    initial: {
      locale: get(sys, 'locale', navigator.language || 'en-US'),
      clock24: get(sys, 'clock24', false)
    }
  });
  p.addTab('Regional Settings', (panel, draft, change) => {
    const locales = select([['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['de-DE', 'German (Germany)'], ['fr-FR', 'French (France)'], ['es-ES', 'Spanish (Spain)'], ['it-IT', 'Italian (Italy)'], ['pt-BR', 'Portuguese (Brazil)'], ['ja-JP', 'Japanese (Japan)'], ['ko-KR', 'Korean (Korea)'], ['zh-CN', 'Chinese (China)'], ['hi-IN', 'Hindi (India)']], draft.locale, 'Regional format');
    if (!locales.value) {
      const custom = el('option', '', draft.locale);
      custom.value = draft.locale;
      locales.append(custom);
      locales.value = draft.locale;
    }
    const sample = el('div');
    function refresh() {
      const date = new Date(Date.now() + Number(get(sys, 'clockOffset', 0)));
      try {
        sample.replaceChildren(valueTable([['Number', new Intl.NumberFormat(draft.locale).format(1234567.89)], ['Date', new Intl.DateTimeFormat(draft.locale, {
          dateStyle: 'full'
        }).format(date)], ['Time', new Intl.DateTimeFormat(draft.locale, {
          timeStyle: 'medium',
          hour12: !draft.clock24
        }).format(date)]]));
      } catch {
        sample.textContent = 'The selected regional format is not available in this browser.';
      }
    }
    locales.addEventListener('change', () => {
      change('locale', locales.value);
      refresh();
    });
    panel.append(row('Format:', locales), check('Use a 24-hour clock', draft.clock24, value => {
      change('clock24', value);
      refresh();
    }), group('Examples', sample), note('Regional formatting is used by the system utilities. This does not install a keyboard layout or change the host operating system’s language.'));
    refresh();
  });
  return p.win;
}
function openAccessibility(sys) {
  const p = propertyWindow(sys, {
    title: 'Accessibility Properties',
    icon: 'accessibility',
    width: 460,
    height: 420,
    initial: {
      highcontrast: get(sys, 'highcontrast', false),
      largeFonts: get(sys, 'largeFonts', false),
      reducedMotion: get(sys, 'reducedMotion', false),
      theme: get(sys, 'theme', 'standard')
    }
  });
  p.addTab('Display', (panel, draft, change) => {
    panel.append(icon(sys, 'accessibility', 48), check('Use high contrast', draft.highcontrast, value => {
      change('highcontrast', value);
      change('theme', value ? 'highcontrast' : draft.theme === 'highcontrast' ? 'standard' : draft.theme);
    }), check('Use larger interface text', draft.largeFonts, value => change('largeFonts', value)), check('Reduce interface animations and transitions', draft.reducedMotion, value => change('reducedMotion', value)), note('High contrast and larger text affect the desktop interface. Reduced motion disables CSS animations and transitions; screen savers can be turned off in Display Properties.'), actions(button(sys, 'Display Properties...', () => sys.open('display'))));
  });
  p.addTab('Keyboard & Mouse', panel => {
    panel.append(note('The desktop supports keyboard navigation with Tab, Shift+Tab, Enter, and arrow keys in supported controls. Application menus list their keyboard shortcuts.'), group('Input testing', actions(button(sys, 'Keyboard Test...', () => sys.open('keyboard')), button(sys, 'Mouse Properties...', () => sys.open('mouse')))), note('Sticky Keys, Filter Keys, screen-reader configuration, and operating-system pointer control remain in your host accessibility settings.'));
  });
  return p.win;
}
function openFolderOptions(sys) {
  const p = propertyWindow(sys, {
    title: 'Folder Options',
    icon: 'folderoptions',
    width: 465,
    height: 410,
    initial: {
      singleClick: get(sys, 'singleClick', false),
      showHidden: get(sys, 'showHidden', false)
    }
  });
  p.addTab('General', (panel, draft, change) => {
    const groupName = `folder-click-${p.win.id}`;
    for (const [value, text] of [[true, 'Single-click to open an item'], [false, 'Double-click to open an item']]) {
      const label = el('label', 'sys-check');
      const radio = input('radio', String(value), text);
      radio.name = groupName;
      radio.checked = draft.singleClick === value;
      radio.addEventListener('change', () => {
        if (radio.checked) change('singleClick', value);
      });
      label.append(radio, document.createTextNode(text));
      panel.append(label);
    }
    panel.append(note('Choose how file and folder items open in Explorer. These settings apply to the desktop’s file manager.'), actions(button(sys, 'Open My Documents', () => sys.open('explorer', {
      path: 'C:/My Documents'
    }))));
  });
  p.addTab('View', (panel, draft, change) => {
    panel.append(group('Hidden files', check('Show hidden files and folders', draft.showHidden, value => change('showHidden', value))), note('Hidden is a file attribute in the local virtual disk. Showing a hidden file does not change its read-only protection.'));
  });
  p.addTab('File Types', panel => {
    const counts = new Map();
    entries(sys).filter(entry => !isDir(entry)).forEach(entry => {
      const ext = /\.[^.]+$/.exec(entry.name || basename(entry.path))?.[0].toLowerCase() || '(No extension)';
      const key = `${ext}\n${entry.mime || 'Unspecified'}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const t = table(['Extension', 'Content type', 'Files']);
    [...counts].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, count]) => {
      const [extension, mime] = key.split('\n');
      t.body.append(tableRow([extension, mime, count]));
    });
    panel.append(note('File types currently present on the local disk:'), t.outer);
  });
  return p.win;
}
function openPasswords(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Passwords Properties', 'passwords', 445, 325);
  root.append(icon(sys, 'passwords', 48), group('Desktop session', note('This desktop does not maintain a host user account or an operating-system password. Use your computer’s sign-in and browser profile controls to protect access to your device and saved browser data.')));
  if (typeof sys.lock === 'function') root.append(actions(button(sys, 'Lock Desktop', () => sys.lock())), note('The desktop lock stays inside this page and does not replace your computer’s secure lock screen.'));else root.append(note('A secure host lock screen cannot be invoked or replaced by this page.'));
  return win;
}
const FONT_CHOICES = [['"MS Sans Serif",Tahoma,Arial,sans-serif', 'MS Sans Serif'], ['Arial,sans-serif', 'Arial'], ['"Times New Roman",serif', 'Times New Roman'], ['"Courier New",monospace', 'Courier New'], ['Verdana,sans-serif', 'Verdana'], ['Georgia,serif', 'Georgia'], ['Tahoma,sans-serif', 'Tahoma']];
function openFonts(sys, importedFonts) {
  const {
    win,
    root
  } = windowBase(sys, 'Fonts', 'fonts', 570, 455);
  const layout = el('div', 'sys-columns sys-fill');
  const list = el('div', 'sys-font-list sunken');
  const detail = el('div', 'sys-grow sys-font-detail');
  let selected = FONT_CHOICES[0][0];
  const sampleInput = input('text', 'The quick brown fox jumps over the lazy dog.', 'Font sample text');
  const size = input('number', 28, 'Font preview size');
  size.min = 8;
  size.max = 100;
  const preview = el('div', 'sys-font-preview');
  const name = el('strong', 'sys-section-heading');
  function draw() {
    const choice = [...FONT_CHOICES, ...importedFonts.map(font => [font.family, font.name])].find(item => item[0] === selected);
    name.textContent = choice?.[1] || selected;
    preview.style.fontFamily = selected;
    preview.style.fontSize = `${Math.max(8, Math.min(100, Number(size.value) || 28))}px`;
    preview.textContent = `${sampleInput.value}\n\nABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 !?&@#$%`;
  }
  function refreshList() {
    list.replaceChildren();
    [...FONT_CHOICES, ...importedFonts.map(font => [font.family, font.name])].forEach(([family, label]) => {
      const item = button(sys, label, () => {
        selected = family;
        refreshList();
        draw();
      }, 'sys-font-item');
      item.classList.toggle('selected', family === selected);
      list.append(item);
    });
    draw();
  }
  sampleInput.addEventListener('input', draw);
  size.addEventListener('input', draw);
  const upload = input('file');
  upload.accept = '.woff,.woff2,.ttf,.otf';
  upload.hidden = true;
  const importButton = button(sys, 'Import Font...', () => upload.click());
  importButton.disabled = typeof FontFace === 'undefined';
  upload.addEventListener('change', safely(sys, async () => {
    const file = upload.files?.[0];
    upload.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return tell(sys, 'Fonts', 'Choose a font file smaller than 8 MB.');
    const family = `DesktopImportedFont${Date.now()}${importedFonts.length}`;
    const face = new FontFace(family, await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    importedFonts.push({
      family,
      name: file.name,
      face
    });
    selected = family;
    refreshList();
  }));
  detail.append(name, row('Size:', size), sampleInput, preview);
  layout.append(list, detail);
  root.append(layout, note('Fonts are rendered by the browser, which may substitute a missing font. Imported fonts are available for this browser session; they are not installed on your computer.'), actions(importButton, button(sys, 'Character Map...', () => sys.open('character'))), upload);
  refreshList();
  return win;
}
function openCharacterMap(sys, importedFonts) {
  const {
    win,
    root
  } = windowBase(sys, 'Character Map', 'character', 570, 495);
  const fonts = select([...FONT_CHOICES, ...importedFonts.map(font => [font.family, font.name])], FONT_CHOICES[0][0], 'Character font');
  const ranges = [['latin', 'Basic Latin', 0x20, 0x7e], ['latin1', 'Latin-1 Supplement', 0xa0, 0xff], ['greek', 'Greek', 0x370, 0x3ff], ['arrows', 'Arrows', 0x2190, 0x21ff], ['boxes', 'Box Drawing', 0x2500, 0x257f], ['symbols', 'Symbols', 0x2600, 0x26ff]];
  const range = select(ranges.map(item => [item[0], item[1]]), 'latin', 'Character range');
  const grid = el('div', 'sys-character-grid sunken');
  const chosen = el('div', 'sys-character-large', 'A');
  const code = el('div', 'sys-character-code', 'U+0041');
  const text = input('text', '', 'Characters to copy');
  const status = el('div', 'sys-status', 'Select a character, then add it to the text below.');
  let character = 'A';
  function choose(value) {
    character = value;
    chosen.textContent = value;
    code.textContent = `U+${value.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  (decimal ${value.codePointAt(0)})`;
    [...grid.children].forEach(item => item.classList.toggle('selected', item.textContent === value));
  }
  function add() {
    text.value += character;
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
  }
  function draw() {
    grid.replaceChildren();
    const entry = ranges.find(item => item[0] === range.value) || ranges[0];
    grid.style.fontFamily = fonts.value;
    chosen.style.fontFamily = fonts.value;
    text.style.fontFamily = fonts.value;
    for (let value = entry[2]; value <= entry[3]; value++) {
      const glyph = String.fromCodePoint(value);
      const b = el('button', 'sys-character-cell', glyph);
      b.type = 'button';
      b.title = `U+${value.toString(16).toUpperCase().padStart(4, '0')}`;
      b.setAttribute('aria-label', `${b.title} ${glyph}`);
      b.addEventListener('click', () => choose(glyph));
      b.addEventListener('dblclick', add);
      grid.append(b);
    }
    choose(character);
  }
  fonts.addEventListener('change', draw);
  range.addEventListener('change', draw);
  const preview = el('div', 'sys-character-selection');
  preview.append(chosen, code, button(sys, 'Select', add));
  const copyButton = button(sys, 'Copy', async () => {
    if (!text.value) return;
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text.value);
        copied = true;
      } catch {/* Try the browser copy command next. */}
    }
    if (!copied) {
      text.focus();
      text.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
    }
    status.textContent = copied ? 'Characters copied to the clipboard.' : 'Select the text and use your browser’s Copy command.';
  });
  root.append(row('Font:', fonts), row('Character set:', range), grid, preview, row('Characters to copy:', text), actions(button(sys, 'Clear', () => {
    text.value = '';
  }), copyButton), status);
  draw();
  return win;
}
function openPower(sys) {
  const p = propertyWindow(sys, {
    title: 'Power Management Properties',
    icon: 'power',
    width: 465,
    height: 430,
    initial: {
      screensaverMinutes: get(sys, 'screensaverMinutes', 5)
    }
  });
  p.addTab('Power Schemes', (panel, draft, change) => {
    const timeout = input('number', draft.screensaverMinutes, 'Screen saver wait');
    timeout.min = 1;
    timeout.max = 120;
    timeout.addEventListener('change', () => {
      timeout.value = Math.max(1, Math.min(120, Number(timeout.value) || 5));
      change('screensaverMinutes', Number(timeout.value));
    });
    panel.append(group('Desktop idle behavior', row('Screen saver (min):', timeout), actions(button(sys, 'Screen Saver...', () => sys.open('display', {
      tab: 'Screen Saver'
    })), button(sys, 'Start Now', () => {
      const saver = get(sys, 'screensaver', 'none');
      if (saver === 'none') tell(sys, 'Power Management', 'Choose a screen saver in Display Properties first.');else sys.startScreensaver(saver);
    }))), note('Monitor sleep, standby, and disk power settings are controlled by your host operating system. This page cannot power off your hardware.'));
    if (navigator.wakeLock?.request) {
      let lock = null;
      const status = el('div', 'sys-muted', 'No screen wake lock requested.');
      const wake = button(sys, 'Keep Screen Awake', async () => {
        if (lock) {
          await lock.release();
          lock = null;
          wake.textContent = 'Keep Screen Awake';
          status.textContent = 'Screen wake lock released.';
          return;
        }
        lock = await navigator.wakeLock.request('screen');
        wake.textContent = 'Release Wake Lock';
        status.textContent = 'The browser is holding a screen wake lock while permitted.';
        lock.addEventListener('release', () => {
          lock = null;
          wake.textContent = 'Keep Screen Awake';
          status.textContent = 'Screen wake lock released by the browser.';
        });
      });
      p.win.addCleanup(() => lock?.release());
      panel.append(actions(wake), status);
    }
  });
  p.addTab('Power Meter', panel => {
    const display = el('div');
    panel.append(display, note('Battery readings are shown only when the browser exposes the Battery Status API.'));
    if (!navigator.getBattery) {
      display.append(valueTable([['Battery', 'Not exposed by this browser']]));
      return;
    }
    let closed = false;
    p.win.addCleanup(() => {
      closed = true;
    });
    navigator.getBattery().then(battery => {
      if (closed) return;
      const refresh = () => display.replaceChildren(valueTable([['Battery level', `${Math.round(battery.level * 100)}%`], ['Power source', battery.charging ? 'Charging / external power' : 'Battery'], ['Time to full charge', Number.isFinite(battery.chargingTime) ? `${Math.ceil(battery.chargingTime / 60)} minutes` : 'Not reported'], ['Estimated time remaining', Number.isFinite(battery.dischargingTime) ? `${Math.ceil(battery.dischargingTime / 60)} minutes` : 'Not reported']]));
      ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach(event => listen(p.win, battery, event, refresh));
      refresh();
    }).catch(error => {
      if (!closed) display.textContent = `Battery information is unavailable: ${error.message}`;
    });
  });
  return p.win;
}
function openGameControllers(sys) {
  const {
    win,
    root
  } = windowBase(sys, 'Game Controllers', 'gamecontrollers', 540, 445);
  const devices = el('div', 'sys-gamepad-devices sys-fill');
  const status = el('div', 'sys-status');
  function refresh() {
    devices.replaceChildren();
    let pads = [];
    try {
      pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    } catch (error) {
      status.textContent = `Gamepad access unavailable: ${error.message}`;
      return;
    }
    if (!navigator.getGamepads) {
      devices.append(note('The Gamepad API is not available in this browser.'));
      status.textContent = 'No browser game controller interface.';
      return;
    }
    if (!pads.length) devices.append(note('No game controller is currently exposed by the browser. Connect a controller and press one of its buttons.'));
    for (const pad of pads) {
      const card = group(pad.id || `Controller ${pad.index + 1}`);
      card.append(el('div', 'sys-muted', `Index ${pad.index} · ${pad.connected ? 'Connected' : 'Disconnected'} · Mapping: ${pad.mapping || 'device-specific'}`));
      const buttons = el('div', 'sys-gamepad-buttons');
      pad.buttons.forEach((value, index) => {
        const b = el('span', `sys-gamepad-button${value.pressed ? ' pressed' : ''}`, index + 1);
        b.title = `Button ${index + 1}: ${value.value.toFixed(3)}`;
        buttons.append(b);
      });
      card.append(buttons);
      pad.axes.forEach((value, index) => {
        const outer = el('div', 'sys-gamepad-axis');
        const track = el('div', 'sys-axis-track');
        const dot = el('span', 'sys-axis-dot');
        dot.style.left = `${(Math.max(-1, Math.min(1, value)) + 1) * 50}%`;
        track.append(dot);
        outer.append(el('span', '', `Axis ${index + 1}`), track, el('span', 'sys-axis-value', value.toFixed(3)));
        card.append(outer);
      });
      devices.append(card);
    }
    status.textContent = `${pads.length} ${pads.length === 1 ? 'controller' : 'controllers'} reported by the browser. Live button and axis readings.`;
  }
  root.append(note('Test real gamepad inputs below. Device pairing, drivers, and calibration remain in your operating system.'), devices, actions(button(sys, 'Refresh', refresh)), status);
  refresh();
  every(win, refresh, 200);
  listen(win, globalThis, 'gamepadconnected', refresh);
  listen(win, globalThis, 'gamepaddisconnected', refresh);
  return win;
}
function openMultimedia(sys) {
  const p = propertyWindow(sys, {
    title: 'Multimedia Properties',
    icon: 'multimedia',
    width: 485,
    height: 430
  });
  p.applyButton.hidden = true;
  p.addTab('Audio', panel => {
    const audio = document.createElement('audio');
    panel.append(group('Playback', valueTable([['Web Audio', globalThis.AudioContext || globalThis.webkitAudioContext ? 'Available' : 'Unavailable'], ['MP3', audio.canPlayType('audio/mpeg') || 'Not reported'], ['WAV', audio.canPlayType('audio/wav') || 'Not reported'], ['Ogg Vorbis', audio.canPlayType('audio/ogg; codecs="vorbis"') || 'Not reported']])), actions(button(sys, 'Volume Control...', () => sys.open('volume')), button(sys, 'Sound Recorder...', () => sys.open('soundrecorder')), button(sys, 'Media Player...', () => sys.open('mediaplayer'))), note('Desktop volume is separate from the browser tab, output device, and operating-system volume.'));
  });
  p.addTab('Video', panel => {
    const video = document.createElement('video');
    panel.append(valueTable([['MP4 / H.264', video.canPlayType('video/mp4; codecs="avc1.42E01E"') || 'Not reported'], ['WebM / VP8', video.canPlayType('video/webm; codecs="vp8"') || 'Not reported'], ['WebM / VP9', video.canPlayType('video/webm; codecs="vp9"') || 'Not reported']]), note('The browser reports whether it can probably or possibly play each format. File encoding and browser support determine actual playback.'), actions(button(sys, 'Open Media Player', () => sys.open('mediaplayer'))));
  });
  p.addTab('Devices', panel => {
    const result = el('div');
    const query = button(sys, 'List Browser Devices', async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return tell(sys, 'Multimedia', 'Media device enumeration is unavailable in this browser.');
      const devices = await navigator.mediaDevices.enumerateDevices();
      const t = table(['Device', 'Type']);
      devices.forEach((device, index) => t.body.append(tableRow([device.label || `Device ${index + 1} (name hidden until permission is granted)`, device.kind])));
      result.replaceChildren(t.outer);
      if (!devices.length) result.append(note('No media devices were exposed.'));
    });
    panel.append(note('List audio and video devices exposed by the browser. This does not turn on the microphone or camera; names may remain hidden until you grant access in an application.'), actions(query), result);
  });
  return p.win;
}
export function registerSystem(sys) {
  const importedFonts = [];
  const applications = [['display', 'Display Properties', 'display', args => openDisplay(sys, args)], ['datetime', 'Date/Time Properties', 'datetime', () => openDateTime(sys)], ['system', 'System Properties', 'system', () => openSystem(sys)], ['sysinfo', 'System Information', 'sysinfo', () => openSystemInfo(sys)], ['mouse', 'Mouse Properties', 'mouse', () => openMouse(sys)], ['keyboard', 'Keyboard Properties', 'keyboard', () => openKeyboard(sys)], ['sounds', 'Sounds Properties', 'sounds', () => openSounds(sys)], ['programs', 'Add/Remove Programs', 'programs', () => openPrograms(sys)], ['internetoptions', 'Internet Properties', 'internetoptions', () => openInternetOptions(sys)], ['network', 'Network Properties', 'network', () => openNetwork(sys)], ['printers', 'Printers', 'printers', () => openPrinters(sys)], ['regional', 'Regional Settings', 'regional', () => openRegional(sys)], ['accessibility', 'Accessibility Properties', 'accessibility', () => openAccessibility(sys)], ['fonts', 'Fonts', 'fonts', () => openFonts(sys, importedFonts)], ['power', 'Power Management', 'power', () => openPower(sys)], ['scheduled', 'Scheduled Tasks', 'scheduled', () => openScheduled(sys)], ['gamecontrollers', 'Game Controllers', 'gamecontrollers', () => openGameControllers(sys)], ['passwords', 'Passwords Properties', 'passwords', () => openPasswords(sys)], ['multimedia', 'Multimedia Properties', 'multimedia', () => openMultimedia(sys)], ['folderoptions', 'Folder Options', 'folderoptions', () => openFolderOptions(sys)], ['registry', 'Registry Editor', 'registry', () => openRegistry(sys)], ['taskmanager', 'Windows Task Manager', 'taskmanager', () => openTaskManager(sys)], ['scandisk', 'ScanDisk', 'scandisk', () => openScanDisk(sys)], ['defrag', 'Disk Defragmenter', 'defrag', () => openDefrag(sys)], ['diskcleanup', 'Disk Cleanup', 'diskcleanup', () => openDiskCleanup(sys)], ['character', 'Character Map', 'character', () => openCharacterMap(sys, importedFonts)]];
  applications.forEach(([id, title, name, open]) => sys.registerApp({
    id,
    title,
    icon: name,
    open: (args = {}) => open(args)
  }));
  installPreferenceStyles(sys);
  installScheduler(sys);
  return {
    dispose() {
      sys.__systemScheduler?.dispose();
      sys.__systemPreferenceStyles?.dispose();
      importedFonts.forEach(font => document.fonts.delete(font.face));
    }
  };
}
