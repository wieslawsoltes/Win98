import { escapeHTML as h, normalizePath, basename, formatBytes } from '@win98/core';
import { fileIcon } from '@win98/ui';
export function installShell(sys) {
  const start = document.querySelector('#start-button'),
    desktop = document.querySelector('#desktop'),
    iconLayer = document.querySelector('#desktop-icons');
  let startOpen = false,
    desktopSelected = new Set(),
    lastClick = null;
  const baseIcons = [{
    name: 'My Computer',
    icon: 'computer',
    id: 'explorer',
    args: {
      path: 'computer'
    }
  }, {
    name: 'My Documents',
    icon: 'documents',
    id: 'explorer',
    args: {
      path: 'C:/My Documents'
    }
  }, {
    name: 'Network Neighborhood',
    icon: 'network',
    id: 'explorer',
    args: {
      path: 'network'
    }
  }, {
    name: 'Recycle Bin',
    icon: 'recycle',
    id: 'recycle'
  }, {
    name: 'Internet Explorer',
    icon: 'ie',
    id: 'internet',
    shortcut: true
  }, {
    name: 'Outlook Express',
    icon: 'outlook',
    id: 'outlook',
    shortcut: true
  }, {
    name: 'Connect to the Internet',
    icon: 'network',
    id: 'internet',
    shortcut: true
  }];
  const programItem = (id, title, ic) => ({
    label: title || sys.apps.get(id)?.title || id,
    icon: ic || sys.apps.get(id)?.icon || 'windows',
    action: () => sys.open(id)
  });
  const programMenu = () => [{
    label: 'Accessories',
    icon: 'folder',
    items: [{
      label: 'Accessibility',
      icon: 'folder',
      items: [programItem('accessibility', 'Accessibility Options'), programItem('character', 'Character Map', 'wordpad')]
    }, {
      label: 'Entertainment',
      icon: 'folder',
      items: [programItem('cdplayer', 'CD Player', 'cd'), programItem('mediaplayer', 'Windows Media Player', 'mediaplayer'), programItem('soundrecorder', 'Sound Recorder', 'soundrecorder'), programItem('volume', 'Volume Control', 'volume')]
    }, {
      label: 'Games',
      icon: 'folder',
      items: [programItem('freecell', 'FreeCell', 'freecell'), programItem('hearts', 'Hearts', 'hearts'), programItem('minesweeper', 'Minesweeper', 'minesweeper'), programItem('solitaire', 'Solitaire', 'solitaire')]
    }, {
      label: 'System Tools',
      icon: 'folder',
      items: [programItem('diskcleanup', 'Disk Cleanup', 'drive'), programItem('defrag', 'Disk Defragmenter', 'drive'), programItem('scandisk', 'ScanDisk', 'drive'), programItem('sysinfo', 'System Information', 'computer'), programItem('scheduled', 'Scheduled Tasks', 'task')]
    }, {
      type: 'separator'
    }, {
      label: 'Communications',
      icon: 'folder',
      items: [programItem('dialer', 'Phone Dialer', 'volume'), programItem('hyperterminal', 'HyperTerminal', 'command')]
    }, programItem('clipboard', 'Clipboard Viewer', 'file'), programItem('imaging', 'Imaging', 'paint'), programItem('calculator', 'Calculator', 'calculator'), programItem('notepad', 'Notepad', 'notepad'), programItem('paint', 'Paint', 'paint'), programItem('wordpad', 'WordPad', 'wordpad')]
  }, {
    label: 'StartUp',
    icon: 'folder',
    items: () => {
      const ids = sys.settings.get('startupApps', []);
      return ids.length ? ids.map(id => programItem(id)) : [{
        label: '(Empty)',
        disabled: true
      }];
    }
  }, {
    type: 'separator'
  }, programItem('internet', 'Internet Explorer', 'ie'), programItem('outlook', 'Outlook Express', 'outlook'), programItem('command', 'MS-DOS Prompt', 'command'), {
    label: 'Windows Explorer',
    icon: 'folder',
    action: () => sys.open('explorer', {
      path: 'C:/',
      tree: true
    })
  }];
  function toggleStart() {
    if (startOpen) {
      sys.menus.close();
      return;
    }
    const menu = [{
      label: 'Windows Update',
      icon: 'windows',
      action: () => sys.open('help', {
        topic: 'compatibility'
      })
    }, {
      type: 'separator'
    }, {
      label: 'Programs',
      icon: 'folder',
      items: programMenu
    }, {
      label: 'Favorites',
      icon: 'folder',
      items: () => [programItem('internet', 'Internet Home', 'ie'), {
        label: 'My Documents',
        icon: 'documents',
        action: () => sys.open('explorer', {
          path: 'C:/My Documents'
        })
      }, ...sys.settings.get('browserFavorites', []).map(f => ({
        label: f.title || f.url,
        icon: 'ie',
        action: () => sys.open('internet', {
          url: f.url
        })
      }))]
    }, {
      label: 'Documents',
      icon: 'documents',
      items: () => {
        const recent = sys.settings.get('recentFiles', []).filter(p => sys.vfs.exists(p));
        return recent.length ? recent.map(p => ({
          label: basename(p),
          icon: fileIcon(sys.vfs.stat(p)),
          action: () => sys.openPath(p)
        })) : [{
          label: '(Empty)',
          disabled: true
        }];
      }
    }, {
      label: 'Settings',
      icon: 'control',
      items: [programItem('control', 'Control Panel', 'control'), programItem('printers', 'Printers', 'printers'), programItem('taskbarproperties', 'Taskbar & Start Menu...', 'task'), programItem('folderoptions', 'Folder Options...', 'folder')]
    }, {
      label: 'Find',
      icon: 'find',
      items: [programItem('find', 'Files or Folders...', 'find'), programItem('network', 'Computer...', 'computer'), {
        label: 'On the Internet...',
        icon: 'ie',
        action: () => sys.open('internet', {
          url: 'about:search'
        })
      }]
    }, {
      label: 'Help',
      icon: 'help',
      action: () => sys.open('help')
    }, {
      label: 'Run...',
      icon: 'run',
      action: () => sys.open('run')
    }, {
      type: 'separator'
    }, {
      label: 'Log Off...',
      icon: 'windows',
      action: () => sys.lock()
    }, {
      label: 'Shut Down...',
      icon: 'shutdown',
      action: () => sys.shutdown()
    }];
    const panel = sys.contextMenu(menu, 2, innerHeight - 28, {
      start: true
    });
    startOpen = true;
    start.classList.add('pressed');
    start.setAttribute('aria-expanded', 'true');
    sys.menus.closeCallbacks.push(() => {
      startOpen = false;
      start.classList.remove('pressed');
      start.setAttribute('aria-expanded', 'false');
    });
    return panel;
  }
  start.onclick = toggleStart;
  document.querySelector('#start-icon').innerHTML = sys.icon('windows', 22);
  const quick = document.querySelector('#quick-launch');
  for (const [title, ic, action] of [['Show Desktop', 'windows', () => sys.wm.showDesktop()], ['Launch Internet Explorer', 'ie', () => sys.open('internet')], ['Launch Outlook Express', 'outlook', () => sys.open('outlook')]]) {
    const b = document.createElement('button');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = sys.icon(ic, 16);
    b.onclick = action;
    quick.append(b);
  }
  const volume = document.querySelector('#tray-volume');
  volume.innerHTML = sys.icon('volume', 16);
  volume.onclick = () => sys.open('volume');
  const network = document.querySelector('#tray-network');
  network.innerHTML = sys.icon('network', 16);
  network.onclick = () => sys.open('network');
  const clock = document.querySelector('#tray-clock');
  const updateClock = () => {
    const now = new Date(Date.now() + Number(sys.settings.get('clockOffset', 0)));
    clock.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: !sys.settings.get('clock24', false)
    });
    clock.title = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  clock.ondblclick = () => sys.open('datetime');
  clock.onclick = () => {
    if (matchMedia('(pointer: coarse)').matches) sys.open('datetime');
  };
  updateClock();
  setInterval(updateClock, 1000);
  const positions = sys.settings.get('desktopPositions', {});
  function allDesktopIcons() {
    return [...baseIcons.map(e => e.name === 'Recycle Bin' ? {
      ...e,
      icon: sys.vfs.recycle.length ? 'recyclefull' : 'recycle'
    } : e), ...sys.vfs.list('C:/Windows/Desktop').filter(e => !e.hidden || sys.settings.get('showHidden', false)).map(e => ({
      name: e.name,
      icon: fileIcon(e),
      path: e.path
    }))];
  }
  function refreshDesktop() {
    const items = allDesktopIcons();
    iconLayer.replaceChildren();
    const rows = Math.max(1, Math.floor((desktop.clientHeight - 10) / 76));
    items.forEach((item, index) => {
      const b = document.createElement('button');
      b.className = 'desktop-icon';
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', item.name);
      b.dataset.name = item.name;
      b.innerHTML = sys.icon(item.icon, 32) + (item.shortcut ? '<span class="shortcut">↗</span>' : '') + `<span class="desktop-label">${h(item.name)}</span>`;
      const pos = positions[item.name] || {
        x: Math.floor(index / rows) * 80 + 3,
        y: index % rows * 76 + 5
      };
      b.style.left = Math.min(pos.x, desktop.clientWidth - 76) + 'px';
      b.style.top = Math.min(pos.y, desktop.clientHeight - 68) + 'px';
      b.classList.toggle('selected', desktopSelected.has(item.name));
      const launch = () => item.path ? sys.openPath(item.path) : sys.open(item.id, item.args);
      b.onclick = e => {
        if (b.dataset.dragged === '1') {
          b.dataset.dragged = '0';
          return;
        }
        if (!e.ctrlKey && !e.metaKey) desktopSelected.clear();
        desktopSelected.add(item.name);
        iconLayer.querySelectorAll('.desktop-icon').forEach(el => el.classList.toggle('selected', desktopSelected.has(el.dataset.name)));
        if (sys.settings.get('singleClick', false)) {
          launch();
          return;
        }
        const now = performance.now();
        if (lastClick?.name === item.name && now - lastClick.time < Number(sys.settings.get('doubleClickSpeed', 500))) {
          lastClick = null;
          launch();
        } else lastClick = {
          name: item.name,
          time: now
        };
      };
      b.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          launch();
        }
        if (e.key === 'Delete' && item.path) {
          sys.vfs.delete(item.path);
        }
      };
      b.oncontextmenu = e => {
        e.preventDefault();
        e.stopPropagation();
        desktopSelected = new Set([item.name]);
        refreshDesktop();
        sys.contextMenu([{
          label: 'Open',
          bold: true,
          action: launch
        }, ...(item.path ? [{
          label: 'Rename',
          action: async () => {
            const name = await sys.prompt({
              title: 'Rename',
              message: 'New name:',
              value: item.name
            });
            if (name) sys.vfs.move(item.path, 'C:/Windows/Desktop/' + name);
          }
        }, {
          label: 'Delete',
          action: () => sys.vfs.delete(item.path)
        }] : []), {
          type: 'separator'
        }, {
          label: 'Properties',
          action: () => item.path ? sys.open('properties', {
            path: item.path
          }) : sys.open(item.id === 'explorer' && item.args.path === 'computer' ? 'system' : item.name === 'Recycle Bin' ? 'recycle' : 'display')
        }], e.clientX, e.clientY);
      };
      b.onpointerdown = e => {
        if (e.button !== 0) return;
        const sx = e.clientX,
          sy = e.clientY,
          ox = parseInt(b.style.left),
          oy = parseInt(b.style.top),
          pid = e.pointerId;
        let moved = false;
        b.setPointerCapture(pid);
        const move = e => {
          if (e.pointerId !== pid) return;
          const dx = e.clientX - sx,
            dy = e.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < 5) return;
          moved = true;
          b.style.left = Math.round(Math.max(0, Math.min(desktop.clientWidth - 78, ox + dx))) + 'px';
          b.style.top = Math.round(Math.max(0, Math.min(desktop.clientHeight - 68, oy + dy))) + 'px';
        };
        const up = () => {
          b.removeEventListener('pointermove', move);
          b.removeEventListener('pointerup', up);
          b.removeEventListener('pointercancel', up);
          if (moved) {
            positions[item.name] = {
              x: parseInt(b.style.left),
              y: parseInt(b.style.top)
            };
            sys.settings.set('desktopPositions', positions);
            b.dataset.dragged = '1';
          }
        };
        b.addEventListener('pointermove', move);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
      };
      iconLayer.append(b);
    });
  }
  sys.refreshDesktop = refreshDesktop;
  refreshDesktop();
  sys.vfs.addEventListener('change', refreshDesktop);
  window.addEventListener('resize', refreshDesktop);
  function arrangeIcons() {
    for (const k of Object.keys(positions)) delete positions[k];
    sys.settings.set('desktopPositions', positions);
    refreshDesktop();
  }
  const desktopMenu = () => [{
    label: 'Active Desktop',
    items: [{
      label: 'Customize My Desktop...',
      action: () => sys.open('display')
    }, {
      label: 'View as Web Page',
      checked: sys.settings.get('activeDesktop', false),
      action: () => {
        sys.settings.set('activeDesktop', !sys.settings.get('activeDesktop', false));
        sys.open('display');
      }
    }]
  }, {
    label: 'Arrange Icons',
    items: [{
      label: 'by Name',
      action: arrangeIcons
    }, {
      label: 'Auto Arrange',
      checked: sys.settings.get('autoArrange', false),
      action: () => {
        sys.settings.set('autoArrange', !sys.settings.get('autoArrange', false));
        arrangeIcons();
      }
    }]
  }, {
    label: 'Line Up Icons',
    action: arrangeIcons
  }, {
    label: 'Refresh',
    action: refreshDesktop
  }, {
    type: 'separator'
  }, {
    label: 'Paste',
    disabled: !sys.clipboard?.paths?.length,
    action: () => {
      for (const p of sys.clipboard.paths) sys.vfs[sys.clipboard.mode === 'cut' ? 'move' : 'copy'](p, 'C:/Windows/Desktop/' + basename(p));
      if (sys.clipboard.mode === 'cut') sys.clipboard = null;
    }
  }, {
    type: 'separator'
  }, {
    label: 'New',
    items: [{
      label: 'Folder',
      icon: 'folder',
      action: async () => {
        const n = await sys.prompt({
          title: 'New Folder',
          message: 'Name:',
          value: 'New Folder'
        });
        if (n) sys.vfs.mkdir('C:/Windows/Desktop/' + n);
      }
    }, {
      label: 'Text Document',
      icon: 'notepad',
      action: async () => {
        const n = await sys.prompt({
          title: 'New Text Document',
          message: 'Name:',
          value: 'New Text Document.txt'
        });
        if (n) sys.vfs.write('C:/Windows/Desktop/' + n, '');
      }
    }, {
      label: 'Shortcut',
      icon: 'windows',
      action: async () => {
        const target = await sys.prompt({
          title: 'Create Shortcut',
          message: 'Type a program name or a file path:',
          value: 'notepad'
        });
        if (!target) return;
        const name = await sys.prompt({
          title: 'Select a Title for the Program',
          message: 'Name:',
          value: target
        });
        if (name) sys.vfs.write('C:/Windows/Desktop/' + name + '.lnk', JSON.stringify({
          target
        }), {
          mime: 'application/x-win98-shortcut'
        });
      }
    }]
  }, {
    type: 'separator'
  }, {
    label: 'Properties',
    action: () => sys.open('display')
  }];
  desktop.addEventListener('contextmenu', e => {
    if (e.target.closest('.window,.desktop-icon')) return;
    e.preventDefault();
    sys.contextMenu(desktopMenu(), e.clientX, e.clientY);
  });
  desktop.addEventListener('pointerdown', e => {
    if (e.target.closest('.window,.desktop-icon') || e.button !== 0) return;
    desktopSelected.clear();
    iconLayer.querySelectorAll('.selected').forEach(n => n.classList.remove('selected'));
    const box = document.querySelector('#selection-box'),
      sx = e.clientX,
      sy = e.clientY;
    const move = e => {
      const x = Math.min(sx, e.clientX),
        y = Math.min(sy, e.clientY),
        w = Math.abs(e.clientX - sx),
        h = Math.abs(e.clientY - sy);
      box.hidden = false;
      Object.assign(box.style, {
        left: x + 'px',
        top: y + 'px',
        width: w + 'px',
        height: h + 'px'
      });
      for (const el of iconLayer.children) {
        const r = el.getBoundingClientRect(),
          inside = r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
        el.classList.toggle('selected', inside);
        if (inside) desktopSelected.add(el.dataset.name);else desktopSelected.delete(el.dataset.name);
      }
    };
    const up = () => {
      box.hidden = true;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, {
      once: true
    });
  });
  document.querySelector('#taskbar').oncontextmenu = e => {
    if (e.target.closest('.task-button')) return;
    e.preventDefault();
    sys.contextMenu([{
      label: 'Toolbars',
      items: [{
        label: 'Quick Launch',
        checked: !quick.hidden,
        action: () => {
          quick.hidden = !quick.hidden;
          sys.settings.set('quickLaunch', !quick.hidden);
        }
      }]
    }, {
      type: 'separator'
    }, {
      label: 'Cascade Windows',
      action: () => sys.wm.arrange('cascade')
    }, {
      label: 'Tile Windows Horizontally',
      action: () => sys.wm.arrange('horizontal')
    }, {
      label: 'Tile Windows Vertically',
      action: () => sys.wm.arrange('vertical')
    }, {
      label: 'Minimize All Windows',
      action: () => sys.wm.showDesktop()
    }, {
      type: 'separator'
    }, {
      label: 'Task Manager...',
      action: () => sys.open('taskmanager')
    }, {
      label: 'Properties',
      action: () => sys.open('taskbarproperties')
    }], e.clientX, e.clientY);
  };
  quick.hidden = !sys.settings.get('quickLaunch', true);
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Escape') {
      e.preventDefault();
      toggleStart();
    } else if (e.altKey && e.key === 'F4') {
      e.preventDefault();
      sys.wm.activeWindow?.close();
    } else if (e.key === 'F6' || e.altKey && e.key === 'Tab') {
      e.preventDefault();
      const windows = sys.wm.list().filter(w => !w.modal);
      if (windows.length) {
        const i = windows.indexOf(sys.wm.activeWindow);
        sys.wm.focus(windows[(i + 1) % windows.length]);
      }
    } else if (e.metaKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      sys.wm.showDesktop();
    } else if (e.metaKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      sys.open('run');
    } else if (e.ctrlKey && e.shiftKey && e.key === 'Escape' || e.ctrlKey && e.altKey && e.key === 'Delete') {
      e.preventDefault();
      sys.open('taskmanager');
    } else if (e.key === 'F1') {
      e.preventDefault();
      sys.open('help');
    }
  });
  sys.registerApp({
    id: 'run',
    title: 'Run',
    icon: 'run',
    open: () => runDialog(sys)
  });
  sys.registerApp({
    id: 'welcome',
    title: 'Welcome to Windows 98',
    icon: 'windows',
    open: () => welcome(sys)
  });
  sys.registerApp({
    id: 'about',
    title: 'About Windows 98',
    icon: 'windows',
    open: () => about(sys)
  });
  sys.registerApp({
    id: 'taskbarproperties',
    title: 'Taskbar Properties',
    icon: 'task',
    open: () => taskbarProperties(sys)
  });
  sys.lock = () => {
    if (document.querySelector('.lock-screen')) return;
    const overlay = document.createElement('div');
    overlay.className = 'startup lock-screen';
    overlay.style.zIndex = '180000';
    overlay.innerHTML = '<div class="window active" style="position:relative;width:390px;height:190px;pointer-events:auto"><div class="titlebar">Welcome to Windows</div><div class="dialog-body" style="flex:1"><div class="dialog-message">' + sys.icon('windows', 32) + '<p>Click OK to return to your desktop.<br><br>This screen keeps your session open. Website access is managed by your browser account.</p></div><div class="dialog-buttons"><button class="win-button">OK</button></div></div></div>';
    overlay.querySelector('button').onclick = () => {
      overlay.remove();
      sys.wm.activeWindow?.focus();
    };
    document.body.append(overlay);
    overlay.querySelector('button').focus();
  };
  sys.shutdown = async () => {
    const win = sys.wm.create({
      title: 'Shut Down Windows',
      icon: 'windows',
      width: 410,
      height: 246,
      modal: true,
      resizable: false
    });
    win.body.classList.add('dialog-body');
    win.body.innerHTML = `<div class="dialog-message">${sys.icon('shutdown', 32)}<div>What do you want the computer to do?<div style="margin-top:16px;display:flex;flex-direction:column;gap:10px"><label><input type="radio" name="shutdown-action" value="shutdown" checked>Shut down</label><label><input type="radio" name="shutdown-action" value="restart">Restart</label><label><input type="radio" name="shutdown-action" value="dos">Restart in MS-DOS mode</label></div></div></div><div class="dialog-buttons"><button class="win-button">OK</button><button class="win-button">Cancel</button><button class="win-button">Help</button></div>`;
    const buttons = win.body.querySelectorAll('.dialog-buttons button');
    buttons[1].onclick = () => win.close();
    buttons[2].onclick = () => sys.open('help', {
      topic: 'desktop'
    });
    buttons[0].onclick = async () => {
      const mode = win.body.querySelector('input:checked').value;
      await sys.wm.close(win, {
        force: true
      });
      for (const w of [...sys.wm.list()].reverse()) if (!(await sys.wm.close(w))) return;
      try {
        await sys.vfs.flush();
      } catch (e) {
        await sys.dialog({
          title: 'Windows',
          message: 'The local disk could not be saved. Export a backup before shutting down.\n\n' + e.message,
          icon: 'error'
        });
        return;
      }
      if (mode === 'restart') {
        location.reload();
        return;
      }
      if (mode === 'dos') {
        sys.open('command');
        return;
      }
      sys.sound.play('shutdown');
      const screen = document.createElement('div');
      screen.className = 'shutdown-screen';
      screen.innerHTML = '<div>It is now safe to turn off<br>your computer.</div><button class="win-button">Restart Windows</button>';
      screen.querySelector('button').onclick = () => location.reload();
      document.body.append(screen);
    };
  };
  return {
    toggleStart,
    refreshDesktop
  };
}
function runDialog(sys) {
  const win = sys.wm.create({
    title: 'Run',
    icon: 'run',
    width: 400,
    height: 190,
    resizable: false
  });
  win.body.className += ' dialog-body';
  win.body.innerHTML = `<div class="dialog-message">${sys.icon('run', 32)}<p>Type the name of a program, folder, or document, and Windows will open it for you.</p></div><div class="property-row" style="margin:0"><label style="min-width:30px">Open:</label><input class="sunken" list="run-history" aria-label="Open"><datalist id="run-history"></datalist></div><div class="dialog-buttons" style="justify-content:flex-end"><button class="win-button">OK</button><button class="win-button">Cancel</button><button class="win-button">Browse...</button></div>`;
  const input = win.body.querySelector('input');
  for (const value of sys.settings.get('runHistory', [])) {
    const option = document.createElement('option');
    option.value = value;
    win.body.querySelector('datalist').append(option);
  }
  const run = async () => {
    const text = input.value.trim();
    if (!text) return;
    sys.settings.set('runHistory', [text, ...sys.settings.get('runHistory', []).filter(t => t !== text)].slice(0, 15));
    await sys.execute(text);
    win.close();
  };
  const buttons = win.body.querySelectorAll('.dialog-buttons button');
  buttons[0].onclick = run;
  buttons[1].onclick = () => win.close();
  buttons[2].onclick = async () => {
    const path = await sys.fileDialog({
      mode: 'open',
      path: 'C:/'
    });
    if (path) input.value = path;
  };
  input.onkeydown = e => {
    if (e.key === 'Enter') run();
    if (e.key === 'Escape') win.close();
  };
  queueMicrotask(() => input.focus());
  return win;
}
function welcome(sys) {
  const win = sys.wm.create({
    title: 'Welcome to Windows 98',
    icon: 'windows',
    width: 628,
    height: 406,
    resizable: false
  });
  win.body.innerHTML = `<div class="welcome-content"><aside class="welcome-brand">${sys.icon('windows', 32)}<div class="microsoft">Microsoft</div><div class="wordmark">Windows<span>98</span></div><div class="edition">SECOND EDITION</div></aside><section class="welcome-main"><h1>Welcome to Windows 98</h1><p>Discover what your computer can do.<br>Click a topic to get started.</p><button class="welcome-action" data-app="help">${sys.icon('help', 32)}<span><strong>Discover Windows 98</strong><span>A quick tour of your new desktop.</span></span></button><button class="welcome-action" data-app="internet">${sys.icon('ie', 32)}<span><strong>Connect to the Internet</strong><span>Explore the Web with Internet Explorer.</span></span></button><button class="welcome-action" data-app="display">${sys.icon('display', 32)}<span><strong>Customize your desktop</strong><span>Choose a background and a screen saver.</span></span></button><button class="welcome-action" data-app="explorer">${sys.icon('documents', 32)}<span><strong>Explore your computer</strong><span>Open your files and discover the accessories.</span></span></button></section></div><div class="welcome-footer"><label><input type="checkbox" ${sys.settings.get('showWelcome', true) ? 'checked' : ''}>Show this screen each time Windows 98 starts.</label><button class="win-button">Close</button></div>`;
  win.body.querySelectorAll('[data-app]').forEach(b => b.onclick = () => sys.open(b.dataset.app, b.dataset.app === 'explorer' ? {
    path: 'computer'
  } : {}));
  win.body.querySelector('input').onchange = e => sys.settings.set('showWelcome', e.target.checked);
  win.body.querySelector('.welcome-footer button').onclick = () => win.close();
  return win;
}
function about(sys) {
  const win = sys.wm.create({
    title: 'About Windows 98',
    icon: 'windows',
    width: 435,
    height: 299,
    resizable: false
  });
  win.body.className += ' plain-app';
  win.body.innerHTML = `<div style="display:flex;align-items:center;gap:18px;padding:8px">${sys.icon('windows', 48)}<div style="font-family:Arial"><div style="font-size:16px;font-style:italic">Microsoft</div><div style="font-size:32px;letter-spacing:-1px"><b>Windows</b> 98</div></div></div><hr><div style="padding:0 12px;line-height:17px">Windows 98 Second Edition desktop recreation<br>Browser edition · Version 1.0.0<br><br>Built with HTML, JavaScript, and WebGPU.<br>Independent implementation. Windows is a Microsoft trademark.<br><br><span id="about-renderer"></span></div><div class="dialog-buttons" style="justify-content:flex-end;margin-top:auto"><button class="win-button">OK</button></div>`;
  win.body.querySelector('#about-renderer').textContent = 'Graphics: ' + (sys.renderer?.stats.backend || 'initializing') + '  ·  ' + sys.apps.size + ' applications';
  win.body.querySelector('button').onclick = () => win.close();
  return win;
}
function taskbarProperties(sys) {
  const win = sys.wm.create({
    title: 'Taskbar Properties',
    icon: 'task',
    width: 365,
    height: 310,
    resizable: false
  });
  win.body.innerHTML = '<div class="property-tabs"><button class="selected">Taskbar Options</button><button>Start Menu Programs</button></div><div class="property-panel"></div><div class="property-footer"><button class="win-button">OK</button><button class="win-button">Cancel</button><button class="win-button">Apply</button></div>';
  const panel = win.body.querySelector('.property-panel');
  let tab = 0;
  const draw = () => {
    if (tab === 0) panel.innerHTML = '<div class="raised" style="height:27px;margin:8px 0 26px;padding:5px"><b>▦ Start</b>　|　Window　　　　12:00 PM</div><label style="display:block;margin:13px 0"><input data-setting="quickLaunch" type="checkbox" ' + (sys.settings.get('quickLaunch', true) ? 'checked' : '') + '>Show Quick Launch</label><label style="display:block;margin:13px 0"><input data-setting="showClock" type="checkbox" ' + (sys.settings.get('showClock', true) ? 'checked' : '') + '>Show clock</label><label style="display:block;margin:13px 0"><input data-setting="showWelcome" type="checkbox" ' + (sys.settings.get('showWelcome', true) ? 'checked' : '') + '>Show Welcome to Windows at startup</label>';else {
      panel.innerHTML = '<p style="line-height:17px">You can clear the documents that appear in the Documents menu.</p><button class="win-button">Clear</button><hr><p>Choose a program to run when Windows starts:</p><select style="width:100%"><option value="">None</option></select>';
      const select = panel.querySelector('select');
      for (const app of sys.apps.values()) if (['notepad', 'paint', 'internet', 'explorer', 'calculator'].includes(app.id)) select.add(new Option(app.title, app.id));
      select.value = sys.settings.get('startupApps', [])[0] || '';
      panel.querySelector('button').onclick = () => {
        sys.settings.set('recentFiles', []);
        sys.notify('The Documents menu has been cleared.');
      };
    }
  };
  const tabs = win.body.querySelectorAll('.property-tabs button');
  tabs.forEach((b, i) => b.onclick = () => {
    tab = i;
    tabs.forEach((n, j) => n.classList.toggle('selected', i === j));
    draw();
  });
  const apply = () => {
    if (!tab) {
      panel.querySelectorAll('[data-setting]').forEach(e => sys.settings.set(e.dataset.setting, e.checked));
      document.querySelector('#quick-launch').hidden = !sys.settings.get('quickLaunch', true);
      document.querySelector('#tray-clock').hidden = !sys.settings.get('showClock', true);
    } else {
      const val = panel.querySelector('select').value;
      sys.settings.set('startupApps', val ? [val] : []);
    }
  };
  const buttons = win.body.querySelectorAll('.property-footer button');
  buttons[0].onclick = () => {
    apply();
    win.close();
  };
  buttons[1].onclick = () => win.close();
  buttons[2].onclick = apply;
  draw();
  return win;
}
