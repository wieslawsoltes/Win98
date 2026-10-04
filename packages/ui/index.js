import { iconData } from './icons.js';
import { escapeHTML, normalizePath, parentPath, basename } from '@win98/core';
const iconNames = {
  computer: 'my-computer',
  documents: 'my-documents',
  network: 'network',
  recycle: 'recycle-bin',
  recyclefull: 'recycle-bin-full',
  ie: 'internet-explorer',
  folder: 'folder',
  notepad: 'notepad',
  wordpad: 'notepad',
  paint: 'paint',
  calculator: 'calculator',
  solitaire: 'solitaire',
  freecell: 'solitaire',
  hearts: 'solitaire',
  minesweeper: 'minesweeper',
  control: 'control-panel',
  display: 'my-computer',
  command: 'command',
  drive: 'drive',
  cd: 'cd',
  mediaplayer: 'media',
  soundrecorder: 'sound',
  volume: 'sound',
  outlook: 'mail',
  addressbook: 'addressbook',
  help: 'help',
  run: 'run',
  find: 'find',
  printers: 'printer',
  settings: 'control-panel',
  windows: 'windows',
  file: 'file',
  shutdown: 'shutdown',
  task: 'task',
  keyboard: 'keyboard',
  mouse: 'mouse',
  clock: 'clock',
  registry: 'registry'
};
const svgIcons = {
  command: '<path fill="#000" stroke="#808080" d="M1 2h30v26H1z"/><path fill="#000080" d="M3 4h26v4H3z"/><path fill="none" stroke="#fff" stroke-width="2" d="m5 13 4 3-4 3m7 1h8"/>',
  drive: '<path fill="#808080" stroke="#000" d="m3 12 4-7h20l3 7v15H3z"/><path fill="#c0c0c0" stroke="#000" d="M2 13h28v12H2z"/><path stroke="#fff" d="M4 15h24"/><path stroke="#000" d="M5 21h15"/><path fill="#0f0" d="M25 20h2v2h-2z"/>',
  cd: '<circle cx="16" cy="16" r="13" fill="#c0c0c0" stroke="#000"/><path d="m16 16 10-8M16 16 6 24" stroke="#fff" stroke-width="6"/><path d="m16 16 6 11M16 16 10 5" stroke="#80ffff" stroke-width="4"/><circle cx="16" cy="16" r="4" fill="#808080" stroke="#fff"/><circle cx="16" cy="16" r="2" fill="#000"/>',
  media: '<path fill="#c0c0c0" stroke="#000" d="M2 3h28v25H2z"/><path fill="#fff" d="M4 5h24v18H4z"/><path fill="#000080" d="M4 5h24v4H4z"/><path fill="#008080" stroke="#000" d="m12 11 10 6-10 6z"/>',
  sound: '<path fill="#ffff00" stroke="#000" d="M3 12h6l9-8v24l-9-8H3z"/><path fill="none" stroke="#000" stroke-width="2" d="M22 11q6 5 0 10m4-14q9 9 0 18"/>',
  mail: '<path fill="#ffffcc" stroke="#000" d="M1 8h29v21H1z"/><path fill="#fff" stroke="#808080" d="m2 9 14 10L29 9m-27 19 10-11m17 11L20 17"/><path fill="#0080ff" stroke="#000" d="m22 1 8 4-4 6-8-3z"/>',
  addressbook: '<path fill="#008080" stroke="#000" d="M5 3h23v27H5z"/><path fill="#ffffcc" d="M8 5h18v23H8z"/><path stroke="#000" stroke-width="2" d="M3 8h6M3 14h6M3 20h6M3 26h6"/><circle cx="18" cy="12" r="4" fill="#ffcc99"/><path fill="#000080" d="M11 24v-4q7-8 13 0v4z"/>',
  help: '<path fill="#ffffcc" stroke="#000" d="M4 4h24v26H4z"/><path fill="#000080" d="M8 4h17v24H8z"/><text x="10" y="23" fill="#fff" font-family="Arial" font-weight="bold" font-size="23">?</text>',
  run: '<path fill="#c0c0c0" stroke="#000" d="M1 9h27v20H1z"/><path fill="#fff" d="M3 15h23v11H3z"/><path fill="#000080" d="M3 11h23v3H3z"/><path fill="#ffff00" stroke="#000" d="m18 1-7 15h7l-2 14L30 9h-8l5-8z"/>',
  find: '<path fill="#ffff00" stroke="#000" d="M1 8h13l3 3h13v17H1z"/><circle cx="13" cy="12" r="8" fill="#80ffff" stroke="#000" stroke-width="2"/><path stroke="#000" stroke-width="5" d="m19 18 9 11"/><path stroke="#fff" d="M8 9q0-3 5-3"/>',
  printer: '<path fill="#fff" stroke="#000" d="M8 1h17v16H8z"/><path fill="#808080" stroke="#000" d="M2 12h29v14H2z"/><path fill="#c0c0c0" d="M4 14h25v8H4z"/><path fill="#fff" stroke="#000" d="M8 21h17v10H8z"/><path stroke="#000" d="M11 25h11m-11 3h11"/>',
  file: '<path fill="#fff" stroke="#000" d="M7 1h14l6 6v24H7z"/><path fill="#c0c0c0" stroke="#000" d="M21 1v7h6"/><path stroke="#000080" d="M11 13h12m-12 4h12m-12 4h12m-12 4h8"/>',
  shutdown: '<path fill="#c0c0c0" stroke="#000" d="M3 2h25v22H3z"/><path fill="#000" d="M5 4h21v16H5z"/><path fill="#808080" stroke="#000" d="M11 24h11v4H11zM5 28h22v3H5z"/><path fill="#ff0" stroke="#f00" d="m16 5-5 8h5l-2 7 8-11h-6l3-4z"/>',
  task: '<path fill="#c0c0c0" stroke="#000" d="M3 3h27v26H3z"/><path fill="#000080" d="M5 5h23v5H5z"/><path fill="#fff" d="M5 12h23v15H5z"/><path stroke="#008000" stroke-width="2" d="m6 22 4-5 5 4 5-7 4 4 4-4"/>',
  keyboard: '<path fill="#c0c0c0" stroke="#000" d="m3 9 24-2 4 18-30 2z"/><path stroke="#000" stroke-width="2" stroke-dasharray="2 2" d="m6 13 18-1M5 18h21m-21 4h23"/>',
  mouse: '<path fill="none" stroke="#000" d="M16 11V5q9 3 12-4"/><path fill="#c0c0c0" stroke="#000" d="M7 17q1-11 9-9 9-1 10 12 0 11-10 11T7 17z"/><path stroke="#000" fill="none" d="M9 18h16M16 9v9"/>',
  clock: '<circle cx="16" cy="16" r="14" fill="#fff" stroke="#000" stroke-width="2"/><path stroke="#000" stroke-width="2" d="M16 5v3m0 16v3M5 16h3m16 0h3m-11-2V9m0 7h6"/><circle cx="16" cy="16" r="2"/>',
  registry: '<g stroke="#000"><path fill="#008080" d="m2 8 8-4 8 4v8l-8 4-8-4z"/><path fill="#00ffff" d="m14 3 8-3 8 3v8l-8 4-8-4z"/><path fill="#008080" d="m13 19 8-4 8 4v8l-8 4-8-4z"/></g>'
};
export function icon(name = 'file', size = 16) {
  const source = iconNames[name] || name;
  if (svgIcons[source]) return `<svg class="system-icon" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges">${svgIcons[source]}</svg>`;
  const native = size > 22 ? 32 : source === 'windows' && size > 16 ? 22 : 16;
  const valid = ['my-computer', 'my-documents', 'network', 'recycle-bin', 'recycle-bin-full', 'internet-explorer', 'folder', 'notepad', 'paint', 'calculator', 'solitaire', 'minesweeper', 'control-panel', 'windows'].includes(source) ? source : 'folder';
  return `<img class="system-icon" src="${iconData[`${valid}-${native}.png`]}" width="${size}" height="${size}" alt="" draggable="false">`;
}
export function fileIcon(entry) {
  if (entry.type === 'directory') return entry.path.length === 3 ? 'drive' : 'folder';
  const e = entry.name.split('.').pop().toLowerCase();
  return ['png', 'bmp', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e) ? 'paint' : ['html', 'htm', 'url'].includes(e) ? 'ie' : ['wav', 'mp3', 'ogg', 'mp4', 'webm', 'm4a'].includes(e) ? 'mediaplayer' : ['rtf', 'wri'].includes(e) ? 'wordpad' : ['txt', 'ini', 'log', 'bat', 'sys', 'json', 'md', 'csv', 'js', 'css'].includes(e) ? 'notepad' : 'file';
}
export class MenuManager {
  constructor(sys) {
    this.sys = sys;
    this.layer = document.querySelector('#menu-layer');
    this.panels = [];
    this.closeCallbacks = [];
    document.addEventListener('pointerdown', e => {
      if (!this.layer.contains(e.target) && !e.target.closest('.menu-bar,#start-button')) this.close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.panels.length) {
        e.preventDefault();
        this.close();
      }
    });
  }
  close(depth = 0) {
    while (this.panels.length > depth) this.panels.pop().remove();
    if (!depth) {
      for (const fn of this.closeCallbacks.splice(0)) fn();
      document.querySelectorAll('.menu-bar>button.open').forEach(e => e.classList.remove('open'));
    }
  }
  open(items, x, y, {
    depth = 0,
    start = false
  } = {}) {
    this.close(depth);
    items = typeof items === 'function' ? items() : items;
    const panel = document.createElement('div');
    panel.className = 'popup-menu' + (start ? ' start-menu' : '');
    panel.setAttribute('role', 'menu');
    if (start) {
      const rail = document.createElement('div');
      rail.className = 'start-rail';
      rail.innerHTML = '<span><b>Windows</b>98</span>';
      panel.append(rail);
    }
    const content = document.createElement('div');
    content.className = 'menu-items';
    panel.append(content);
    for (const item of items) {
      if (item.type === 'separator' || item.separator) {
        const sep = document.createElement('div');
        sep.className = 'menu-separator';
        content.append(sep);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'menu-item';
      b.setAttribute('role', 'menuitem');
      const disabled = typeof item.disabled === 'function' ? item.disabled() : item.disabled;
      b.disabled = !!disabled;
      if (item.bold) b.style.fontWeight = 'bold';
      const checked = typeof item.checked === 'function' ? item.checked() : item.checked;
      const sub = item.items || item.submenu;
      b.innerHTML = `<span class="menu-glyph">${item.icon ? icon(item.icon, start ? 32 : 16) : checked ? '✓' : ''}</span><span class="menu-label">${escapeHTML(item.label || '').replace(/&amp;(.)/g, '<u>$1</u>')}</span>${item.shortcut ? `<span class="menu-shortcut">${escapeHTML(item.shortcut)}</span>` : ''}${sub ? '<span class="menu-arrow">▸</span>' : ''}`;
      content.append(b);
      let timer;
      const show = () => {
        if (b.disabled) return;
        content.querySelectorAll('.menu-item.selected').forEach(e => e.classList.remove('selected'));
        b.classList.add('selected');
        if (sub) {
          const r = b.getBoundingClientRect();
          this.open(sub, r.right - 2, r.top - 3, {
            depth: depth + 1
          });
        } else this.close(depth + 1);
      };
      b.addEventListener('pointerenter', () => {
        clearTimeout(timer);
        timer = setTimeout(show, sub ? 150 : 0);
      });
      b.addEventListener('pointerleave', () => clearTimeout(timer));
      b.addEventListener('click', async () => {
        if (sub) {
          show();
          return;
        }
        this.close();
        try {
          await item.action?.();
        } catch (e) {
          this.sys.dialog({
            title: 'Windows',
            message: e.message,
            icon: 'error'
          });
        }
      });
      b.addEventListener('keydown', e => {
        const bs = [...content.querySelectorAll('button:not(:disabled)')],
          i = bs.indexOf(b);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
        }
        if (e.key === 'ArrowRight' && sub) {
          e.preventDefault();
          show();
          this.panels.at(-1)?.querySelector('button:not(:disabled)')?.focus();
        }
        if (e.key === 'ArrowLeft' && depth) {
          e.preventDefault();
          this.close(depth);
          this.panels.at(-1)?.querySelector('button.selected')?.focus();
        }
      });
    }
    this.layer.append(panel);
    this.panels.push(panel);
    const r = panel.getBoundingClientRect();
    x = Math.max(0, Math.min(x, innerWidth - r.width));
    y = Math.max(0, Math.min(y, innerHeight - 28 - r.height));
    panel.style.left = Math.round(x) + 'px';
    panel.style.top = Math.round(y) + 'px';
    return panel;
  }
  bar(win, menus) {
    const bar = document.createElement('nav');
    bar.className = 'menu-bar';
    bar.setAttribute('aria-label', win.title + ' menu');
    for (const menu of menus) {
      const b = document.createElement('button');
      b.innerHTML = escapeHTML(menu.label).replace(/&amp;(.)/g, '<u>$1</u>');
      const show = () => {
        const was = b.classList.contains('open');
        this.close();
        if (was) return;
        const r = b.getBoundingClientRect();
        this.open(menu.items, r.left, r.bottom);
        b.classList.add('open');
      };
      b.onclick = show;
      b.addEventListener('pointerenter', () => {
        if (bar.querySelector('.open') && !b.classList.contains('open')) show();
      });
      bar.append(b);
    }
    win.el.insertBefore(bar, win.body);
    return bar;
  }
}
export function installDialogs(sys) {
  sys.dialog = ({
    title = 'Windows',
    message = '',
    icon: kind = 'info',
    buttons = [{
      label: 'OK',
      value: 'ok'
    }]
  } = {}) => new Promise(resolve => {
    const win = sys.wm.create({
      title,
      icon: kind === 'error' ? 'windows' : kind,
      width: 410,
      height: 170,
      resizable: false,
      modal: true,
      taskbar: false
    });
    win.body.className += ' dialog-body';
    const row = document.createElement('div');
    row.className = 'dialog-message';
    const glyph = document.createElement('span');
    glyph.className = 'dialog-symbol ' + kind;
    glyph.textContent = kind === 'error' ? '×' : kind === 'warning' ? '!' : kind === 'question' ? '?' : 'i';
    const text = document.createElement('p');
    text.textContent = message;
    row.append(glyph, text);
    const footer = document.createElement('div');
    footer.className = 'dialog-buttons';
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
      sys.wm.close(win, {
        force: true
      });
    };
    for (const [i, b] of buttons.entries()) {
      const btn = document.createElement('button');
      btn.className = 'win-button';
      btn.textContent = b.label;
      btn.onclick = () => finish(b.value);
      footer.append(btn);
      if (i === 0) queueMicrotask(() => btn.focus());
    }
    win.body.append(row, footer);
    win.onBeforeClose = () => {
      finish(buttons.find(b => /cancel/i.test(b.label))?.value ?? null);
      return true;
    };
    win.el.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    });
    requestAnimationFrame(() => {
      win.rect.height = Math.min(sys.wm.bounds().height, Math.max(170, row.scrollHeight + 85));
      sys.wm.applyRect(win);
    });
  });
  sys.prompt = ({
    title = 'Windows',
    message = '',
    value = ''
  } = {}) => new Promise(resolve => {
    const win = sys.wm.create({
      title,
      icon: 'windows',
      width: 400,
      height: 154,
      resizable: false,
      modal: true,
      taskbar: false
    });
    win.body.className += ' dialog-body';
    const label = document.createElement('label');
    label.textContent = message;
    const input = document.createElement('input');
    input.className = 'sunken';
    input.value = value;
    label.append(input);
    const footer = document.createElement('div');
    footer.className = 'dialog-buttons';
    footer.innerHTML = '<button class="win-button">OK</button><button class="win-button">Cancel</button>';
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      resolve(v);
      sys.wm.close(win, {
        force: true
      });
    };
    footer.children[0].onclick = () => finish(input.value);
    footer.children[1].onclick = () => finish(null);
    win.onBeforeClose = () => {
      finish(null);
      return true;
    };
    win.body.append(label, footer);
    input.onkeydown = e => {
      if (e.key === 'Enter') finish(input.value);
      if (e.key === 'Escape') finish(null);
    };
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  });
  sys.fileDialog = ({
    mode = 'open',
    path = 'C:/My Documents',
    filename = '',
    filter = ''
  } = {}) => new Promise(resolve => {
    let current = sys.vfs.stat(path)?.type === 'directory' ? normalizePath(path) : parentPath(path),
      done = false;
    const win = sys.wm.create({
      title: mode === 'save' ? 'Save As' : 'Open',
      icon: 'folder',
      width: 530,
      height: 364,
      modal: true,
      taskbar: false
    });
    win.body.className += ' file-dialog';
    win.body.innerHTML = '<div class="file-location"><label>Look in:</label><select aria-label="Folder"></select><button class="win-button" title="Up one level">↑</button><button class="win-button" title="Create New Folder">New Folder</button></div><div class="file-dialog-list sunken" role="listbox"></div><div class="file-fields"><label>File name:</label><input class="sunken" aria-label="File name"><button class="win-button file-accept"></button><label>Files of type:</label><select aria-label="Files of type"><option></option></select><button class="win-button file-cancel">Cancel</button></div>';
    const location = win.body.querySelector('.file-location select'),
      list = win.body.querySelector('.file-dialog-list'),
      input = win.body.querySelector('input'),
      accept = win.body.querySelector('.file-accept');
    input.value = filename;
    accept.textContent = mode === 'save' ? 'Save' : 'Open';
    const fileTypes = win.body.querySelector('.file-fields select'),
      extensions = String(filter).split(',').map(e => e.trim().toLowerCase()).filter(e => /^\.[a-z0-9]+$/.test(e));
    fileTypes.replaceChildren();
    if (extensions.length) fileTypes.add(new Option(extensions.map(e => '*' + e).join('; '), 'filtered'));
    fileTypes.add(new Option('All Files (*.*)', 'all'));
    const finish = p => {
      if (done) return;
      done = true;
      resolve(p);
      sys.wm.close(win, {
        force: true
      });
    };
    const refresh = () => {
      location.replaceChildren();
      let paths = ['C:/', 'C:/My Documents', 'C:/Windows/Desktop'];
      if (!paths.includes(current)) paths.push(current);
      for (const p of paths) {
        const o = new Option(p, p);
        location.add(o);
      }
      location.value = current;
      list.replaceChildren();
      for (const e of sys.vfs.list(current)) {
        if (e.type === 'file' && fileTypes.value !== 'all' && extensions.length && !extensions.some(ext => e.name.toLowerCase().endsWith(ext))) continue;
        const b = document.createElement('button');
        b.className = 'file-dialog-item';
        b.innerHTML = sys.icon(e.type === 'directory' ? 'folder' : fileIcon(e), 16) + '<span></span>';
        b.querySelector('span').textContent = e.name;
        b.onclick = () => {
          list.querySelector('.selected')?.classList.remove('selected');
          b.classList.add('selected');
          if (e.type === 'file') input.value = e.name;
        };
        b.ondblclick = () => {
          if (e.type === 'directory') {
            current = e.path;
            refresh();
          } else {
            input.value = e.name;
            submit();
          }
        };
        list.append(b);
      }
    };
    const submit = async () => {
      if (!input.value.trim()) return;
      let p = normalizePath(/^[a-z]:/i.test(input.value) ? input.value : current + '/' + input.value.trim());
      if (mode === 'save' && !basename(p).includes('.') && extensions.length && fileTypes.value !== 'all') p += extensions[0];
      if (sys.vfs.stat(p)?.type === 'directory') {
        current = p;
        input.value = '';
        refresh();
        return;
      }
      if (mode === 'open' && !sys.vfs.exists(p)) {
        await sys.dialog({
          title: 'Open',
          message: 'This file does not exist. Please check the file name.',
          icon: 'warning'
        });
        return;
      }
      if (mode === 'save') {
        try {
          sys.vfs.validateName(p);
        } catch (e) {
          await sys.dialog({
            title: 'Save As',
            message: e.message,
            icon: 'warning'
          });
          return;
        }
        if (sys.vfs.exists(p) && (await sys.dialog({
          title: 'Save As',
          message: basename(p) + ' already exists. Do you want to replace it?',
          icon: 'question',
          buttons: [{
            label: 'Yes',
            value: 'yes'
          }, {
            label: 'No',
            value: 'no'
          }]
        })) !== 'yes') return;
      }
      finish(p);
    };
    fileTypes.onchange = refresh;
    location.onchange = () => {
      current = location.value;
      refresh();
    };
    win.body.querySelector('.file-location button').onclick = () => {
      current = parentPath(current);
      refresh();
    };
    win.body.querySelectorAll('.file-location button')[1].onclick = async () => {
      const name = await sys.prompt({
        title: 'New Folder',
        message: 'Name of the new folder:',
        value: 'New Folder'
      });
      if (name) {
        try {
          sys.vfs.mkdir(current + '/' + name);
          refresh();
        } catch (e) {
          sys.dialog({
            title: 'New Folder',
            message: e.message
          });
        }
      }
    };
    accept.onclick = submit;
    win.body.querySelector('.file-cancel').onclick = () => finish(null);
    win.onBeforeClose = () => {
      finish(null);
      return true;
    };
    input.onkeydown = e => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') finish(null);
    };
    refresh();
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  });
  sys.statusBar = (win, text = '') => {
    const bar = document.createElement('div');
    bar.className = 'statusbar';
    bar.textContent = text;
    win.el.append(bar);
    return bar;
  };
}
