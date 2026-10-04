import { escapeHTML as h, normalizePath, parentPath, basename, formatBytes } from '@win98/core';
import { fileIcon } from '@win98/ui';
const applets = [['Display', 'display', 'display'], ['Mouse', 'mouse', 'mouse'], ['Keyboard', 'keyboard', 'keyboard'], ['Date/Time', 'clock', 'datetime'], ['Sounds', 'volume', 'sounds'], ['System', 'computer', 'system'], ['Add/Remove Programs', 'control', 'programs'], ['Internet Options', 'ie', 'internetoptions'], ['Network', 'network', 'network'], ['Printers', 'printers', 'printers'], ['Regional Settings', 'windows', 'regional'], ['Accessibility Options', 'control', 'accessibility'], ['Fonts', 'wordpad', 'fonts'], ['Power Management', 'shutdown', 'power'], ['Scheduled Tasks', 'task', 'scheduled'], ['Game Controllers', 'solitaire', 'gamecontrollers'], ['Passwords', 'control', 'passwords'], ['Multimedia', 'mediaplayer', 'multimedia']];
const specialNames = {
  computer: 'My Computer',
  control: 'Control Panel',
  recycle: 'Recycle Bin',
  network: 'Network Neighborhood'
};
export function registerExplorer(sys) {
  sys.registerApp({
    id: 'explorer',
    title: 'Windows Explorer',
    icon: 'computer',
    open: args => openExplorer(sys, args)
  });
  sys.registerApp({
    id: 'control',
    title: 'Control Panel',
    icon: 'control',
    open: () => openExplorer(sys, {
      path: 'control'
    })
  });
  sys.registerApp({
    id: 'recycle',
    title: 'Recycle Bin',
    icon: 'recycle',
    open: () => openExplorer(sys, {
      path: 'recycle'
    })
  });
  sys.registerApp({
    id: 'find',
    title: 'Find: All Files',
    icon: 'find',
    open: () => openFind(sys)
  });
  sys.registerApp({
    id: 'properties',
    title: 'Properties',
    icon: 'file',
    open: args => properties(sys, args.path)
  });
}
function openExplorer(sys, {
  path = 'computer',
  tree = false
} = {}) {
  let current = path,
    history = [path],
    historyIndex = 0,
    view = sys.settings.get('explorer.view', 'large'),
    showTree = tree,
    selected = new Set(),
    entries = [],
    sort = 'name',
    ascending = true;
  const win = sys.wm.create({
    title: specialNames[path] || basename(path),
    icon: path === 'control' ? 'control' : path === 'recycle' ? 'recycle' : path === 'computer' ? 'computer' : 'folder',
    width: 610,
    height: 423,
    minWidth: 330,
    minHeight: 250
  });
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar explorer-toolbar';
  toolbar.innerHTML = `<button class="nav-back" data-action="back" title="Back">${arrow('left')}<span>Back</span></button><button data-action="forward" title="Forward">${arrow('right')}</button><button data-action="up" title="Up one level">${sys.icon('folder', 22)}<span>Up</span></button><span class="toolbar-separator"></span><button data-action="cut" title="Cut">${smallIcon('cut')}<span>Cut</span></button><button data-action="copy" title="Copy">${smallIcon('copy')}<span>Copy</span></button><button data-action="paste" title="Paste">${smallIcon('paste')}<span>Paste</span></button><span class="toolbar-separator"></span><button data-action="delete" title="Delete">${smallIcon('delete')}<span>Delete</span></button><button data-action="properties" title="Properties">${sys.icon('file', 22)}<span>Properties</span></button><span class="toolbar-separator"></span><button data-action="views" title="Views">${smallIcon('views')}<span>Views ▾</span></button>`;
  const address = document.createElement('div');
  address.className = 'explorer-address';
  address.innerHTML = '<label>Address</label><input class="sunken" aria-label="Address"><button class="win-button">Go</button>';
  const content = document.createElement('div');
  content.className = 'explorer-content';
  const side = document.createElement('aside'),
    files = document.createElement('div');
  files.className = 'explorer-files';
  files.tabIndex = 0;
  files.setAttribute('role', 'listbox');
  files.setAttribute('aria-label', 'Files');
  files.setAttribute('aria-multiselectable', 'true');
  content.append(side, files);
  win.body.append(toolbar, address, content);
  const status = sys.statusBar(win, '');
  const addressInput = address.querySelector('input');
  const isVirtual = () => Object.hasOwn(specialNames, current);
  const currentFolder = () => isVirtual() ? 'C:/My Documents' : current;
  const activeEntries = () => entries.filter(e => selected.has(e.path));
  function selectEntry(e, {
    add = false,
    range = false
  } = {}) {
    if (!add && !range) selected.clear();
    if (add && selected.has(e.path)) selected.delete(e.path);else selected.add(e.path);
    refreshSelection();
  }
  function refreshSelection() {
    for (const el of files.querySelectorAll('.file-item')) {
      const yes = selected.has(el.dataset.path);
      el.classList.toggle('selected', yes);
      el.setAttribute('aria-selected', yes);
    }
    status.textContent = selected.size ? `${selected.size} object(s) selected${activeEntries().some(e => e.size) ? '    ' + formatBytes(activeEntries().reduce((s, e) => s + (e.size || 0), 0)) : ''}` : `${entries.length} object(s)${current === 'computer' ? '    Your computer' : current === 'recycle' ? '    ' + sys.vfs.recycle.length + ' deleted item(s)' : ''}`;
    for (const a of ['cut', 'copy', 'delete', 'properties']) toolbar.querySelector(`[data-action="${a}"]`).disabled = !selected.size;
    toolbar.querySelector('[data-action="paste"]').disabled = !sys.clipboard?.paths?.length || isVirtual();
  }
  function getEntries() {
    if (current === 'computer') return [{
      name: '3½ Floppy (A:)',
      path: '@floppy',
      type: 'drive',
      icon: 'drive'
    }, {
      name: '(C:)',
      path: 'C:/',
      type: 'directory',
      icon: 'drive'
    }, {
      name: 'CD-ROM (D:)',
      path: 'D:/',
      type: 'directory',
      icon: 'cd'
    }, {
      name: 'Control Panel',
      path: 'control',
      type: 'special',
      icon: 'control'
    }, {
      name: 'Printers',
      path: '@printers',
      type: 'special',
      icon: 'printers'
    }, {
      name: 'Scheduled Tasks',
      path: '@scheduled',
      type: 'special',
      icon: 'task'
    }, {
      name: 'My Documents',
      path: 'C:/My Documents',
      type: 'directory',
      icon: 'documents'
    }];
    if (current === 'control') return applets.map(([name, icon, id]) => ({
      name,
      icon,
      path: '@' + id,
      type: 'applet'
    }));
    if (current === 'recycle') return sys.vfs.recycle.map(r => ({
      ...r.entries[0],
      path: 'recycled:' + r.id,
      recycleId: r.id,
      original: r.path,
      icon: fileIcon(r.entries[0])
    }));
    if (current === 'network') return [{
      name: 'Entire Network',
      path: '@network',
      icon: 'network',
      type: 'special'
    }, {
      name: 'Local Computer',
      path: 'computer',
      icon: 'computer',
      type: 'special'
    }];
    return sys.vfs.list(current).filter(e => !e.hidden || sys.settings.get('showHidden', false));
  }
  function refresh() {
    entries = getEntries();
    if (!['computer', 'control', 'network'].includes(current)) entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      let d = sort === 'size' ? (a.size || 0) - (b.size || 0) : sort === 'modified' ? (a.modified || 0) - (b.modified || 0) : a.name.localeCompare(b.name, undefined, {
        numeric: true
      });
      return ascending ? d : -d;
    });
    selected = new Set([...selected].filter(p => entries.some(e => e.path === p)));
    win.setTitle(specialNames[current] || basename(current));
    addressInput.value = specialNames[current] || current.replaceAll('/', '\\');
    toolbar.querySelector('[data-action="back"]').disabled = historyIndex === 0;
    toolbar.querySelector('[data-action="forward"]').disabled = historyIndex === history.length - 1;
    toolbar.querySelector('[data-action="up"]').disabled = current === 'computer';
    files.className = 'explorer-files view-' + view + (current === 'control' ? ' control-files' : '');
    files.replaceChildren();
    side.className = showTree ? 'explorer-tree' : 'explorer-web';
    side.replaceChildren();
    if (showTree) {
      for (const [label, p, ic, indent] of [['Desktop', 'computer', 'windows', 0], ['My Computer', 'computer', 'computer', 0], ['(C:)', 'C:/', 'drive', 12], ['My Documents', 'C:/My Documents', 'documents', 24], ['Windows', 'C:/Windows', 'folder', 24], ['Program Files', 'C:/Program Files', 'folder', 24], ['Control Panel', 'control', 'control', 12], ['Recycle Bin', 'recycle', 'recycle', 0]]) {
        const b = document.createElement('button');
        b.className = 'tree-row' + (p === current ? ' selected' : '');
        b.style.paddingLeft = indent + 'px';
        b.innerHTML = sys.icon(ic, 16) + h(label);
        b.onclick = () => navigate(p);
        side.append(b);
      }
    } else {
      side.innerHTML = sys.icon(current === 'control' ? 'control' : current === 'recycle' ? 'recycle' : current === 'computer' ? 'computer' : 'folder', 32) + `<h2>${h(specialNames[current] || basename(current))}</h2><div class="web-rule"></div><p>${current === 'computer' ? 'Select an item to view its description.' : current === 'control' ? 'Use the settings in Control Panel to personalize your computer.' : current === 'recycle' ? 'To put an item back in its original location, select it, and then click Restore.' : 'Select an item to view its description.'}</p>`;
      if (current === 'computer') {
        side.innerHTML += '<p>See also:</p>';
        const b = document.createElement('button');
        b.className = 'web-link';
        b.textContent = 'My Documents';
        b.onclick = () => navigate('C:/My Documents');
        side.append(b);
      }
      if (current === 'recycle') {
        for (const [label, fn] of [['Restore selected items', restore], ['Empty Recycle Bin', emptyRecycle]]) {
          const b = document.createElement('button');
          b.className = 'web-link';
          b.textContent = label;
          b.onclick = fn;
          side.append(b);
        }
      }
    }
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'explorer-empty';
      empty.textContent = current === 'recycle' ? 'The Recycle Bin is empty.' : current === 'D:/' ? 'There is no disc in drive D:. Import files to use this virtual drive.' : 'This folder is empty.';
      files.append(empty);
    }
    for (const e of entries) {
      const item = document.createElement('button');
      item.className = 'file-item';
      item.dataset.path = e.path;
      item.setAttribute('role', 'option');
      item.draggable = current !== 'recycle';
      item.innerHTML = sys.icon(e.icon || fileIcon(e), view === 'large' ? 32 : 16) + `<span class="file-name">${h(e.name)}</span>`;
      if (view === 'list') {
        item.innerHTML += `<span class="file-meta">${e.type === 'directory' ? 'File Folder' : e.size ? formatBytes(e.size) : e.type === 'applet' ? 'Control Panel' : ''}</span><span class="file-meta">${e.modified ? new Date(e.modified).toLocaleDateString() : ''}</span>`;
      }
      item.onclick = ev => {
        selectEntry(e, {
          add: ev.ctrlKey || ev.metaKey,
          range: ev.shiftKey
        });
        if (sys.settings.get('singleClick', false) && !ev.ctrlKey && !ev.shiftKey) openEntry(e);
      };
      item.ondblclick = () => {
        if (!sys.settings.get('singleClick', false)) openEntry(e);
      };
      item.oncontextmenu = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!selected.has(e.path)) selectEntry(e);
        sys.contextMenu(itemMenu(e), ev.clientX, ev.clientY);
      };
      item.ondragstart = ev => {
        if (!selected.has(e.path)) selectEntry(e);
        ev.dataTransfer.setData('application/x-win98-paths', JSON.stringify([...selected]));
        ev.dataTransfer.effectAllowed = 'copyMove';
      };
      if (e.type === 'directory') {
        item.ondragover = ev => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        item.ondrop = ev => drop(ev, e.path);
      }
      files.append(item);
    }
    refreshSelection();
  }
  function navigate(p, record = true) {
    if (p.startsWith('@')) {
      sys.open(p.slice(1));
      return;
    }
    if (!Object.hasOwn(specialNames, p)) {
      p = normalizePath(p);
      if (!sys.vfs.exists(p)) {
        sys.dialog({
          title: 'Windows Explorer',
          message: 'Cannot find ' + p + '. Check the name and try again.',
          icon: 'error'
        });
        return;
      }
      if (sys.vfs.stat(p).type !== 'directory') {
        sys.openPath(p);
        return;
      }
    }
    current = p;
    selected.clear();
    if (record) {
      history = history.slice(0, historyIndex + 1);
      history.push(p);
      historyIndex++;
    }
    refresh();
  }
  function openEntry(e) {
    if (current === 'recycle') {
      properties(sys, e.original, e);
      return;
    }
    if (e.path === '@floppy') {
      sys.dialog({
        title: '3½ Floppy (A:)',
        message: 'No disk is inserted in drive A:. To use files from your device, choose File → Import Files.',
        icon: 'warning'
      });
      return;
    }
    if (e.path.startsWith('@')) sys.open(e.path.slice(1));else if (Object.hasOwn(specialNames, e.path) || e.type === 'directory') navigate(e.path);else sys.openPath(e.path);
  }
  async function newFolder() {
    if (isVirtual()) return;
    const name = await sys.prompt({
      title: 'New Folder',
      message: 'Name:',
      value: uniqueName('New Folder')
    });
    if (!name) return;
    try {
      sys.vfs.mkdir(current + '/' + name);
      selected = new Set([normalizePath(current + '/' + name)]);
      refresh();
    } catch (e) {
      sys.dialog({
        title: 'New Folder',
        message: e.message,
        icon: 'error'
      });
    }
  }
  function uniqueName(base) {
    let name = base,
      n = 2;
    while (sys.vfs.exists(currentFolder() + '/' + name)) name = base + ' (' + n++ + ')';
    return name;
  }
  async function newText() {
    if (isVirtual()) return;
    const name = await sys.prompt({
      title: 'New Text Document',
      message: 'Name:',
      value: uniqueName('New Text Document.txt')
    });
    if (!name) return;
    try {
      const path = normalizePath(current + '/' + name);
      if (sys.vfs.exists(path)) throw new Error('A file or folder with this name already exists. Choose a different name.');
      sys.vfs.write(path, '');
      selected = new Set([path]);
      refresh();
    } catch (e) {
      sys.dialog({
        title: 'New Text Document',
        message: e.message,
        icon: 'error'
      });
    }
  }
  async function rename() {
    const e = activeEntries()[0];
    if (!e || isVirtual()) return;
    const name = await sys.prompt({
      title: 'Rename',
      message: 'New name:',
      value: e.name
    });
    if (!name || name === e.name) return;
    try {
      sys.vfs.move(e.path, parentPath(e.path) + '/' + name);
      selected = new Set([normalizePath(parentPath(e.path) + '/' + name)]);
      refresh();
    } catch (e) {
      sys.dialog({
        title: 'Error Renaming File',
        message: e.message,
        icon: 'error'
      });
    }
  }
  function clipboard(mode) {
    if (isVirtual()) return;
    sys.clipboard = {
      paths: [...selected],
      mode
    };
    refreshSelection();
  }
  async function paste() {
    if (!sys.clipboard?.paths || isVirtual()) return;
    for (const p of sys.clipboard.paths) {
      let destination = current + '/' + basename(p);
      if (normalizePath(p).toLowerCase() === normalizePath(destination).toLowerCase()) {
        if (sys.clipboard.mode === 'cut') continue;
        destination = current + '/' + uniqueName('Copy of ' + basename(p));
      }
      try {
        if (sys.vfs.exists(destination)) {
          const answer = await sys.dialog({
            title: 'Confirm File Replace',
            message: basename(destination) + ' already exists. Replace it?',
            icon: 'question',
            buttons: [{
              label: 'Yes',
              value: 'yes'
            }, {
              label: 'No',
              value: 'no'
            }]
          });
          if (answer !== 'yes') continue;
        }
        sys.vfs[sys.clipboard.mode === 'cut' ? 'move' : 'copy'](p, destination, {
          overwrite: true
        });
      } catch (e) {
        await sys.dialog({
          title: 'Error Copying File',
          message: e.message,
          icon: 'error'
        });
      }
    }
    if (sys.clipboard.mode === 'cut') sys.clipboard = null;
    refresh();
  }
  async function remove() {
    if (!selected.size) return;
    if (current === 'recycle') {
      if ((await sys.dialog({
        title: 'Confirm File Delete',
        message: 'Permanently delete the selected items?',
        buttons: [{
          label: 'Yes',
          value: 'yes'
        }, {
          label: 'No',
          value: 'no'
        }],
        icon: 'question'
      })) !== 'yes') return;
      const ids = new Set(activeEntries().map(e => e.recycleId));
      sys.vfs.recycle = sys.vfs.recycle.filter(e => !ids.has(e.id));
      sys.vfs.emit();
      return;
    }
    if (isVirtual()) return;
    if ((await sys.dialog({
      title: 'Confirm File Delete',
      message: 'Are you sure you want to send ' + (selected.size === 1 ? '“' + activeEntries()[0]?.name + '”' : 'these ' + selected.size + ' items') + ' to the Recycle Bin?',
      icon: 'question',
      buttons: [{
        label: 'Yes',
        value: 'yes'
      }, {
        label: 'No',
        value: 'no'
      }]
    })) !== 'yes') return;
    for (const p of selected) {
      try {
        sys.vfs.delete(p);
      } catch (e) {
        await sys.dialog({
          title: 'Error Deleting File',
          message: e.message,
          icon: 'error'
        });
      }
    }
    selected.clear();
    refresh();
  }
  function restore() {
    for (const e of activeEntries()) try {
      sys.vfs.restore(e.recycleId);
    } catch (error) {
      sys.dialog({
        title: 'Restore',
        message: error.message,
        icon: 'error'
      });
    }
    refresh();
  }
  async function emptyRecycle() {
    if (!sys.vfs.recycle.length) return;
    if ((await sys.dialog({
      title: 'Confirm File Delete',
      message: 'Are you sure you want to permanently delete all items in the Recycle Bin?',
      icon: 'question',
      buttons: [{
        label: 'Yes',
        value: 'yes'
      }, {
        label: 'No',
        value: 'no'
      }]
    })) === 'yes') sys.vfs.emptyRecycleBin();
  }
  async function readExternalFile(file) {
    const binary = /^(image|audio|video)\//.test(file.type) || !/^text\//.test(file.type) && !/\.(txt|md|json|csv|ini|log|bat|css|js|html|htm|svg|rtf|eml)$/i.test(file.name);
    const content = binary ? await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
      reader.readAsDataURL(file);
    }) : await file.text();
    return {
      content,
      mime: file.type || (binary ? 'application/octet-stream' : 'text/plain')
    };
  }
  async function confirmReplace(path) {
    if (!sys.vfs.exists(path)) return true;
    return (await sys.dialog({
      title: 'Confirm File Replace',
      message: basename(path) + ' already exists. Replace it?',
      icon: 'question',
      buttons: [{
        label: 'Yes',
        value: 'yes'
      }, {
        label: 'No',
        value: 'no'
      }]
    })) === 'yes';
  }
  async function importOne(file, destination) {
    const data = await readExternalFile(file),
      path = normalizePath(destination + '/' + file.name);
    if (sys.vfs.stat(path)?.type === 'directory') throw new Error('A folder named ' + file.name + ' already exists.');
    if (!(await confirmReplace(path))) return false;
    sys.vfs.write(path, data.content, {
      mime: data.mime
    });
    return true;
  }
  function importFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      for (const file of input.files) {
        try {
          await importOne(file, currentFolder());
        } catch (e) {
          await sys.dialog({
            title: 'Import Files',
            message: e.message,
            icon: 'error'
          });
        }
      }
      await sys.vfs.flush().catch(e => sys.dialog({
        title: 'Local Disk',
        message: e.message,
        icon: 'error'
      }));
      refresh();
    };
    input.click();
  }
  async function drop(event, destination = currentFolder()) {
    event.preventDefault();
    event.stopPropagation();
    try {
      const data = event.dataTransfer.getData('application/x-win98-paths');
      if (data) {
        const paths = JSON.parse(data);
        for (const source of paths) {
          const p = normalizePath(source);
          let target = normalizePath(destination + '/' + basename(p));
          if (p.toLowerCase() === target.toLowerCase()) {
            if (!event.ctrlKey) continue;
            const base = 'Copy of ' + basename(p);
            let name = base,
              n = 2;
            while (sys.vfs.exists(destination + '/' + name)) name = base + ' (' + n++ + ')';
            target = normalizePath(destination + '/' + name);
          }
          if (!(await confirmReplace(target))) continue;
          sys.vfs[event.ctrlKey ? 'copy' : 'move'](p, target, {
            overwrite: true
          });
        }
      } else if (event.dataTransfer.files.length) {
        for (const file of event.dataTransfer.files) await importOne(file, destination);
      }
      await sys.vfs.flush();
      refresh();
    } catch (e) {
      sys.dialog({
        title: 'Move Files',
        message: e.message,
        icon: 'error'
      });
    }
  }
  const viewItems = () => ['large', 'small', 'list'].map(v => ({
    label: {
      large: 'Large Icons',
      small: 'Small Icons',
      list: 'Details'
    }[v],
    checked: view === v,
    action: () => {
      view = v;
      sys.settings.set('explorer.view', view);
      refresh();
    }
  }));
  const itemMenu = e => current === 'recycle' ? [{
    label: 'Restore',
    action: restore
  }, {
    label: 'Delete',
    action: remove
  }, {
    type: 'separator'
  }, {
    label: 'Properties',
    action: () => properties(sys, e.original, e)
  }] : [{
    label: 'Open',
    bold: true,
    action: () => openEntry(e)
  }, {
    type: 'separator'
  }, {
    label: 'Cut',
    shortcut: 'Ctrl+X',
    disabled: isVirtual(),
    action: () => clipboard('cut')
  }, {
    label: 'Copy',
    shortcut: 'Ctrl+C',
    disabled: isVirtual(),
    action: () => clipboard('copy')
  }, {
    label: 'Delete',
    shortcut: 'Del',
    disabled: isVirtual(),
    action: remove
  }, {
    label: 'Rename',
    shortcut: 'F2',
    disabled: isVirtual(),
    action: rename
  }, {
    type: 'separator'
  }, {
    label: 'Properties',
    action: () => properties(sys, e.path)
  }];
  const backgroundMenu = () => [{
    label: 'View',
    items: viewItems()
  }, {
    label: 'Arrange Icons',
    items: ['name', 'size', 'modified'].map(k => ({
      label: 'by ' + k,
      checked: sort === k,
      action: () => {
        sort = k;
        refresh();
      }
    }))
  }, {
    type: 'separator'
  }, {
    label: 'Refresh',
    shortcut: 'F5',
    action: refresh
  }, {
    label: 'Paste',
    shortcut: 'Ctrl+V',
    disabled: !sys.clipboard?.paths || isVirtual(),
    action: paste
  }, {
    type: 'separator'
  }, {
    label: 'New',
    disabled: isVirtual(),
    items: [{
      label: 'Folder',
      icon: 'folder',
      action: newFolder
    }, {
      label: 'Text Document',
      icon: 'notepad',
      action: newText
    }]
  }, {
    label: 'Properties',
    action: () => properties(sys, current)
  }];
  sys.menuBar(win, [{
    label: 'File',
    items: () => [{
      label: 'Open',
      disabled: !selected.size,
      action: () => activeEntries().forEach(openEntry)
    }, {
      label: 'New',
      disabled: isVirtual(),
      items: [{
        label: 'Folder',
        icon: 'folder',
        action: newFolder
      }, {
        label: 'Text Document',
        icon: 'notepad',
        action: newText
      }]
    }, {
      type: 'separator'
    }, {
      label: 'Import Files...',
      action: importFiles
    }, {
      label: 'Export Selected File...',
      disabled: !selected.size || isVirtual(),
      action: () => {
        for (const e of activeEntries()) if (e.type === 'file') sys.download(sys.vfs.read(e.path), e.name, e.mime);
      }
    }, {
      label: 'Back Up Disk...',
      action: () => sys.download(sys.vfs.export(), 'Windows98-backup.json', 'application/json')
    }, {
      label: 'Restore Disk Backup...',
      action: () => sys.restoreBackup()
    }, {
      type: 'separator'
    }, {
      label: 'Properties',
      disabled: !selected.size,
      action: () => properties(sys, activeEntries()[0]?.path)
    }, {
      label: 'Close',
      action: () => win.close()
    }]
  }, {
    label: 'Edit',
    items: () => [{
      label: 'Cut',
      shortcut: 'Ctrl+X',
      action: () => clipboard('cut'),
      disabled: !selected.size || isVirtual()
    }, {
      label: 'Copy',
      shortcut: 'Ctrl+C',
      action: () => clipboard('copy'),
      disabled: !selected.size || isVirtual()
    }, {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      action: paste,
      disabled: !sys.clipboard?.paths || isVirtual()
    }, {
      type: 'separator'
    }, {
      label: 'Select All',
      shortcut: 'Ctrl+A',
      action: () => {
        selected = new Set(entries.map(e => e.path));
        refreshSelection();
      }
    }, {
      label: 'Invert Selection',
      action: () => {
        selected = new Set(entries.filter(e => !selected.has(e.path)).map(e => e.path));
        refreshSelection();
      }
    }, {
      type: 'separator'
    }, {
      label: 'Rename',
      shortcut: 'F2',
      action: rename,
      disabled: isVirtual()
    }, {
      label: 'Delete',
      shortcut: 'Del',
      action: remove
    }, {
      ...(current === 'recycle' ? {
        label: 'Restore',
        action: restore
      } : {
        label: 'Empty Recycle Bin...',
        action: emptyRecycle
      })
    }]
  }, {
    label: 'View',
    items: () => [...viewItems(), {
      type: 'separator'
    }, {
      label: 'Explorer Bar',
      items: [{
        label: 'Folders',
        checked: showTree,
        action: () => {
          showTree = !showTree;
          refresh();
        }
      }]
    }, {
      label: 'Sort by',
      items: ['name', 'size', 'modified'].map(k => ({
        label: k,
        checked: k === sort,
        action: () => {
          sort = k;
          refresh();
        }
      }))
    }, {
      label: 'Refresh',
      shortcut: 'F5',
      action: refresh
    }, {
      label: 'Folder Options...',
      action: () => sys.open('folderoptions')
    }]
  }, {
    label: 'Go',
    items: () => [{
      label: 'Back',
      shortcut: 'Alt+Left',
      disabled: historyIndex === 0,
      action: () => {
        navigate(history[--historyIndex], false);
      }
    }, {
      label: 'Forward',
      disabled: historyIndex === history.length - 1,
      action: () => navigate(history[++historyIndex], false)
    }, {
      label: 'Up One Level',
      action: () => navigate(isVirtual() || current.length <= 3 ? 'computer' : parentPath(current))
    }, {
      type: 'separator'
    }, {
      label: 'My Computer',
      icon: 'computer',
      action: () => navigate('computer')
    }, {
      label: 'My Documents',
      icon: 'documents',
      action: () => navigate('C:/My Documents')
    }, {
      label: 'Control Panel',
      icon: 'control',
      action: () => navigate('control')
    }]
  }, {
    label: 'Favorites',
    items: () => [{
      label: 'Add to Favorites...',
      action: () => {
        const favorites = sys.settings.get('folderFavorites', []);
        if (!favorites.includes(current)) sys.settings.set('folderFavorites', [...favorites, current]);
      }
    }, {
      type: 'separator'
    }, ...sys.settings.get('folderFavorites', ['C:/My Documents']).map(p => ({
      label: basename(p),
      icon: 'folder',
      action: () => navigate(p)
    }))]
  }, {
    label: 'Help',
    items: [{
      label: 'Help Topics',
      action: () => sys.open('help', {
        topic: 'files'
      })
    }, {
      type: 'separator'
    }, {
      label: 'About Windows 98',
      action: () => sys.open('about')
    }]
  }]);
  const actions = {
    back: () => {
      if (historyIndex > 0) navigate(history[--historyIndex], false);
    },
    forward: () => {
      if (historyIndex < history.length - 1) navigate(history[++historyIndex], false);
    },
    up: () => navigate(isVirtual() || current.length <= 3 ? 'computer' : parentPath(current)),
    cut: () => clipboard('cut'),
    copy: () => clipboard('copy'),
    paste,
    delete: remove,
    properties: () => properties(sys, activeEntries()[0]?.path || current),
    views: e => {
      const r = e.currentTarget.getBoundingClientRect();
      sys.contextMenu(viewItems(), r.left, r.bottom);
    }
  };
  toolbar.querySelectorAll('button').forEach(b => b.onclick = actions[b.dataset.action]);
  address.querySelector('button').onclick = () => navigate(addressInput.value);
  addressInput.onkeydown = e => {
    if (e.key === 'Enter') navigate(addressInput.value);
  };
  files.oncontextmenu = e => {
    e.preventDefault();
    sys.contextMenu(backgroundMenu(), e.clientX, e.clientY);
  };
  files.onpointerdown = e => {
    if (e.target === files) {
      selected.clear();
      refreshSelection();
    }
  };
  files.ondragover = e => e.preventDefault();
  files.ondrop = e => drop(e);
  win.el.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && ['a', 'c', 'x', 'v'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'a') {
        selected = new Set(entries.map(e => e.path));
        refreshSelection();
      } else if (e.key.toLowerCase() === 'v') paste();else clipboard(e.key.toLowerCase() === 'x' ? 'cut' : 'copy');
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      remove();
    }
    if (e.key === 'F2') {
      e.preventDefault();
      rename();
    }
    if (e.key === 'F5') {
      e.preventDefault();
      refresh();
    }
    if (e.key === 'Enter') activeEntries().forEach(openEntry);
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      actions.back();
    }
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      actions.up();
    }
  });
  const unwatch = sys.settings.subscribe(({
    key
  }) => {
    if (key === 'showHidden') refresh();
  });
  win.addCleanup(unwatch);
  sys.vfs.addEventListener('change', refresh);
  win.addCleanup(() => sys.vfs.removeEventListener('change', refresh));
  refresh();
  return win;
}
function properties(sys, path, entryOverride) {
  if (!path) return;
  const entry = entryOverride || sys.vfs.stat(path);
  if (!entry) {
    if (path === 'computer') return sys.open('system');
    return sys.dialog({
      title: 'Properties',
      message: 'Select a file or folder to view its properties.'
    });
  }
  const win = sys.wm.create({
    title: entry.name + ' Properties',
    icon: entry.icon || fileIcon(entry),
    width: 366,
    height: 348,
    resizable: false
  });
  win.body.innerHTML = '<div class="property-tabs"><button class="selected">General</button></div><div class="property-panel"></div><div class="property-footer"><button class="win-button">OK</button></div>';
  const panel = win.body.querySelector('.property-panel');
  panel.innerHTML = `<div class="property-row">${sys.icon(entry.icon || fileIcon(entry), 32)}<strong>${h(entry.name)}</strong></div><hr><dl class="property-summary"><dt>Type:</dt><dd>${entry.type === 'directory' ? 'File Folder' : h(entry.mime || 'File')}</dd><dt>Location:</dt><dd>${h(parentPath(path).replaceAll('/', '\\'))}</dd><dt>Size:</dt><dd>${formatBytes(entry.size || 0)}</dd><dt>Created:</dt><dd>${new Date(entry.created || Date.now()).toLocaleString()}</dd><dt>Modified:</dt><dd>${new Date(entry.modified || Date.now()).toLocaleString()}</dd></dl><hr><div class="property-row"><label>Attributes:</label><label><input type="checkbox" ${entry.readonly ? 'checked' : ''}>Read-only</label><label><input type="checkbox" ${entry.hidden ? 'checked' : ''}>Hidden</label></div>`;
  win.body.querySelector('.property-footer button').onclick = () => {
    const original = sys.vfs.entries.get(normalizePath(path).toLowerCase());
    if (original) {
      const checks = panel.querySelectorAll('input');
      original.readonly = checks[0].checked;
      original.hidden = checks[1].checked;
      sys.vfs.emit();
    }
    win.close();
  };
  return win;
}
function openFind(sys) {
  const win = sys.wm.create({
    title: 'Find: All Files',
    icon: 'find',
    width: 610,
    height: 360
  });
  win.body.innerHTML = '<div class="property-tabs"><button class="selected">Name & Location</button></div><div class="search-layout"><div class="search-form"><label>Named:<input class="sunken" aria-label="Named"></label><label>Containing text:<input class="sunken" aria-label="Containing text"></label><label>Look in:<select><option>C:/</option><option>C:/My Documents</option><option>C:/Windows</option></select></label><label><input type="checkbox" checked>Include subfolders</label><button class="win-button">Find Now</button></div><div class="search-results sunken"></div></div>';
  const status = sys.statusBar(win, 'Enter a file name, or part of a file name, then click Find Now.');
  const form = win.body.querySelector('.search-form'),
    results = win.body.querySelector('.search-results');
  const search = () => {
    const [name, text] = [...form.querySelectorAll('input')].map(e => e.value),
      path = form.querySelector('select').value,
      recursive = form.querySelector('[type=checkbox]').checked;
    const pattern = name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.');
    let regex;
    try {
      regex = new RegExp(name.includes('*') || name.includes('?') ? '^' + pattern + '$' : pattern, 'i');
    } catch {
      regex = /$^/;
    }
    const found = [...sys.vfs.entries.values()].filter(e => e.path.startsWith(path) && (recursive || parentPath(e.path) === path) && regex.test(e.name) && (!text || (e.content || '').toLowerCase().includes(text.toLowerCase())));
    results.replaceChildren();
    for (const entry of found) {
      const b = document.createElement('button');
      b.className = 'search-result';
      b.innerHTML = sys.icon(fileIcon(entry), 16) + `<span>${h(entry.name)}<small style="display:block;color:gray">${h(parentPath(entry.path))}</small></span>`;
      b.ondblclick = () => sys.openPath(entry.path);
      b.onclick = () => {
        results.querySelectorAll('button').forEach(n => n.classList.remove('selected'));
        b.classList.add('selected');
      };
      b.oncontextmenu = e => {
        e.preventDefault();
        sys.contextMenu([{
          label: 'Open',
          action: () => sys.openPath(entry.path)
        }, {
          label: 'Open Containing Folder',
          action: () => sys.open('explorer', {
            path: parentPath(entry.path)
          })
        }, {
          label: 'Properties',
          action: () => properties(sys, entry.path)
        }], e.clientX, e.clientY);
      };
      results.append(b);
    }
    status.textContent = found.length + ' file(s) found';
  };
  form.querySelector('button').onclick = search;
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter') search();
  });
  sys.menuBar(win, [{
    label: 'File',
    items: [{
      label: 'Close',
      action: () => win.close()
    }]
  }, {
    label: 'Help',
    items: [{
      label: 'Help Topics',
      action: () => sys.open('help', {
        topic: 'files'
      })
    }]
  }]);
  return win;
}
function arrow(direction) {
  return `<svg class="system-icon" width="22" height="22" viewBox="0 0 22 22" shape-rendering="crispEdges" aria-hidden="true"><path d="${direction === 'left' ? 'M3 11l8-7v4h9v6h-9v4z' : 'M19 11l-8-7v4H2v6h9v4z'}" fill="#008000" stroke="#000"/><path d="${direction === 'left' ? 'M4 11l6-5' : 'M18 11l-6-5'}" stroke="#80ff80"/></svg>`;
}
function smallIcon(name) {
  const paths = {
    cut: '<path d="m4 3 14 16M18 3 4 19" stroke="#444" stroke-width="2"/><circle cx="5" cy="17" r="3" fill="none" stroke="#00a" stroke-width="2"/><circle cx="17" cy="17" r="3" fill="none" stroke="#00a" stroke-width="2"/>',
    copy: '<path fill="#fff" stroke="#000" d="M3 1h12v15H3zM8 6h12v15H8z"/><path stroke="#000080" d="M11 10h6m-6 3h6m-6 3h6"/>',
    paste: '<path fill="#aa8000" stroke="#000" d="M3 2h15v18H3z"/><path fill="#fff" stroke="#000" d="M7 6h14v16H7z"/><path fill="#c0c0c0" stroke="#000" d="M6 1h8v4H6z"/><path stroke="#000080" d="M10 10h8m-8 3h8m-8 3h8"/>',
    delete: '<path stroke="#800000" stroke-width="5" d="m5 4 13 14M18 4 5 18"/><path stroke="#ff4040" stroke-width="2" d="m4 3 13 14M17 3 4 17"/>',
    views: '<path fill="#fff" stroke="#000" d="M1 2h21v18H1z"/><path fill="#000080" d="M3 4h4v4H3zm6 0h4v4H9zm6 0h4v4h-4zM3 11h4v4H3zm6 0h4v4H9zm6 0h4v4h-4z"/>'
  };
  return `<svg class="system-icon" width="22" height="22" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${paths[name]}</svg>`;
}
