import { VirtualFileSystem, Settings, normalizePath, basename, escapeHTML } from './packages/core/index.js';
import { WindowManager } from './packages/window-manager/index.js';
import { MenuManager, icon, installDialogs, fileIcon } from './packages/ui/index.js';
import { installShell } from './packages/shell/index.js';
import { registerExplorer } from './packages/explorer/index.js';
import { registerBrowser } from './packages/browser/index.js';
import { DesktopRenderer } from './packages/graphics/index.js';
const sys = {
  apps: new Map(),
  events: new EventTarget(),
  settings: new Settings(),
  vfs: new VirtualFileSystem(),
  icon,
  clipboard: null,
  textClipboard: '',
  errors: [],
  started: Date.now()
};
window.win98 = sys;
sys.registerApp = app => {
  if (!app?.id || typeof app.open !== 'function') throw new TypeError('Applications must have an id and open function.');
  sys.apps.set(app.id, app);
};
sys.wm = new WindowManager(document.querySelector('#windows'), document.querySelector('#task-buttons'), sys);
sys.menus = new MenuManager(sys);
sys.contextMenu = (items, x, y, options) => sys.menus.open(items, x, y, options);
sys.menuBar = (win, menus) => sys.menus.bar(win, menus);
installDialogs(sys);
sys.notify = message => {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4200);
};
sys.download = async (content, name = 'Download.txt', mime = 'text/plain') => {
  let url,
    temporary = false;
  if (typeof content === 'string' && content.startsWith('data:')) url = content;else if (typeof content === 'string' && content.startsWith('blob:')) url = content;else {
    url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], {
      type: mime
    }));
    temporary = true;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[\\/]/g, '_');
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  if (temporary) setTimeout(() => URL.revokeObjectURL(url), 30000);
};
sys.printHTML = (html, title = 'Document') => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px';
  frame.title = 'Print ' + title;
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write('<!doctype html><html><head><title>' + escapeHTML(title) + '</title><style>body{font:14px Arial;padding:24px}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{padding:5px;border:1px solid #888}</style></head><body>' + html + '</body></html>');
  doc.close();
  const clean = () => setTimeout(() => frame.remove(), 500);
  frame.contentWindow.addEventListener('afterprint', clean, {
    once: true
  });
  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      frame.remove();
    }
  }, 150);
  setTimeout(() => frame.remove(), 120000);
};
const singletons = new Set(['control', 'display', 'datetime', 'system', 'sysinfo', 'mouse', 'keyboard', 'sounds', 'programs', 'internetoptions', 'network', 'printers', 'regional', 'accessibility', 'fonts', 'power', 'scheduled', 'gamecontrollers', 'passwords', 'multimedia', 'folderoptions', 'registry', 'taskmanager', 'scandisk', 'defrag', 'diskcleanup', 'character', 'welcome', 'taskbarproperties', 'about', 'volume']);
sys.open = async (id, args = {}) => {
  const aliases = {
    iexplore: 'internet',
    ie: 'internet',
    calc: 'calculator',
    mspaint: 'paint',
    winmine: 'minesweeper',
    sol: 'solitaire',
    mshearts: 'hearts',
    cmd: 'command',
    dos: 'command',
    regedit: 'registry',
    controlpanel: 'control',
    winver: 'about',
    sndvol32: 'volume',
    sndrec32: 'soundrecorder',
    mplayer: 'mediaplayer',
    mplayer2: 'mediaplayer',
    charmap: 'character',
    clipbrd: 'clipboard',
    hypertrm: 'hyperterminal',
    kodakimg: 'imaging',
    wangimg: 'imaging',
    explore: 'explorer'
  };
  id = aliases[id] || id;
  const app = sys.apps.get(id);
  if (!app) {
    await sys.dialog({
      title: 'Windows',
      icon: 'error',
      message: 'Cannot find the program “' + id + '”. Check the name and try again.'
    });
    return null;
  }
  if (singletons.has(id)) {
    const current = sys.wm.list().find(w => w.appId === id && !w.closed);
    if (current) {
      sys.wm.focus(current);
      return current;
    }
  }
  try {
    sys.launchingApp = id;
    const result = app.open(args || {});
    sys.launchingApp = null;
    const win = await result;
    if (win?.el) {
      win.appId = id;
      win.el.dataset.app = id;
    }
    return win;
  } catch (error) {
    sys.launchingApp = null;
    sys.errors.push({
      app: id,
      message: error.message
    });
    console.error('Application error', id, error);
    await sys.dialog({
      title: app.title || 'Windows',
      message: error.message,
      icon: 'error'
    });
    return null;
  }
};
sys.openPath = async input => {
  const path = normalizePath(input),
    entry = sys.vfs.stat(path);
  if (!entry) {
    await sys.dialog({
      title: 'Windows',
      message: 'Cannot find ' + path + '. The file may have been moved or deleted.',
      icon: 'error'
    });
    return;
  }
  if (entry.type === 'directory') return sys.open('explorer', {
    path
  });
  const ext = entry.name.split('.').pop().toLowerCase();
  sys.settings.set('recentFiles', [path, ...sys.settings.get('recentFiles', []).filter(p => p !== path)].slice(0, 12));
  if (ext === 'lnk') {
    try {
      return sys.execute(JSON.parse(entry.content).target);
    } catch {
      return sys.dialog({
        title: 'Shortcut',
        message: 'This shortcut is invalid.',
        icon: 'error'
      });
    }
  }
  if (ext === 'url') {
    const match = entry.content.match(/^URL=(.*)$/im);
    if (match) return sys.open('internet', {
      url: match[1]
    });
  }
  if (['exe', 'com', 'dll', 'drv', 'vxd', 'msi'].includes(ext)) {
    return sys.dialog({
      title: 'Windows',
      icon: 'warning',
      message: '“' + entry.name + '” is a native executable or system file. This browser desktop does not emulate an x86 CPU or the Windows binary APIs.\n\nOpen Help → Compatibility for the supported runtime features.'
    });
  }
  if (entry.mime?.startsWith('image/') || ['png', 'bmp', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return sys.open('paint', {
    path
  });
  if (entry.mime?.startsWith('audio/') || entry.mime?.startsWith('video/') || ['wav', 'mp3', 'ogg', 'mp4', 'webm', 'm4a', 'flac'].includes(ext)) return sys.open('mediaplayer', {
    path
  });
  if (['html', 'htm'].includes(ext) || entry.mime === 'text/html') return sys.open('internet', {
    path
  });
  if (['rtf', 'wri'].includes(ext)) return sys.open('wordpad', {
    path
  });
  return sys.open('notepad', {
    path
  });
};
sys.execute = async command => {
  const input = String(command || '').trim();
  if (!input) return;
  if (/^https?:\/\//i.test(input) || input.startsWith('about:')) return sys.open('internet', {
    url: input
  });
  const unquoted = input.replace(/^"(.*)"$/, '$1');
  if (sys.vfs.exists(unquoted)) return sys.openPath(unquoted);
  const match = input.match(/^(?:"([^"]+)"|(\S+))(?:\s+(.*))?$/);
  if (!match) return;
  let name = (match[1] || match[2]).replace(/\.exe$/i, '').toLowerCase(),
    arg = (match[3] || '').replace(/^"(.*)"$/, '$1');
  if (name === 'control' && arg) {
    const panels = {
      'desk.cpl': 'display',
      'timedate.cpl': 'datetime',
      'main.cpl': 'mouse',
      'sysdm.cpl': 'system',
      'inetcpl.cpl': 'internetoptions',
      'mmsys.cpl': 'multimedia',
      'appwiz.cpl': 'programs',
      'intl.cpl': 'regional'
    };
    return sys.open(panels[arg.toLowerCase()] || 'control');
  }
  if (name === 'explorer') return sys.open('explorer', {
    path: arg || 'computer'
  });
  if (name === 'start') return sys.execute(arg);
  if (name === 'help') return sys.open('help');
  if (name === 'shutdown') return sys.shutdown();
  if (name === 'command' || name === 'cmd') {
    const run = arg.replace(/^\/c\s+/i, '');
    return sys.open('command', {
      command: run || undefined
    });
  }
  return sys.open(name, arg ? {
    path: arg
  } : {});
};
sys.restoreBackup = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    let contents;
    try {
      contents = await file.text();
      const data = JSON.parse(contents);
      if (data.format !== 'win98-volume') throw new Error('This is not a Windows 98 volume backup.');
    } catch (error) {
      sys.dialog({
        title: 'Restore Disk Backup',
        message: error.message,
        icon: 'error'
      });
      return;
    }
    const yes = await sys.dialog({
      title: 'Restore Disk Backup',
      message: 'Replace the virtual disk with “' + file.name + '”? Your current virtual files will be replaced. Export a backup first if you want to keep them.',
      icon: 'warning',
      buttons: [{
        label: 'Restore',
        value: 'restore'
      }, {
        label: 'Cancel',
        value: 'cancel'
      }]
    });
    if (yes !== 'restore') return;
    for (const win of [...sys.wm.list()]) if (win.onBeforeClose && !(await sys.wm.close(win))) return;
    try {
      sys.vfs.import(contents);
      await sys.vfs.flush();
      sys.notify('The disk backup has been restored.');
    } catch (error) {
      sys.dialog({
        title: 'Restore Disk Backup',
        message: error.message,
        icon: 'error'
      });
    }
  };
  input.click();
};
sys.sound = {
  context: null,
  play(name = 'notify') {
    if (!sys.settings.get('systemSounds', true) || sys.settings.get('muted', false)) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context ||= new Context();
      const ctx = this.context;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const notes = name === 'startup' ? [523.25, 659.25, 783.99, 1046.5] : name === 'shutdown' ? [783.99, 659.25, 523.25] : name === 'error' ? [220, 185] : [784];
      const now = ctx.currentTime,
        volume = Number(sys.settings.get('volume', 70)) / 100;
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0, now + i * .1);
        gain.gain.linearRampToValueAtTime(volume * .045, now + i * .1 + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, now + i * .1 + .5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * .1);
        osc.stop(now + i * .1 + .6);
      });
    } catch {}
  }
};
const themes = {
  standard: {
    surface: '#c0c0c0',
    navy: '#000080',
    end: '#1084d0',
    text: '#000'
  },
  desert: {
    surface: '#d5ccbb',
    navy: '#806040',
    end: '#d2b88b',
    text: '#000'
  },
  marine: {
    surface: '#b8c8c8',
    navy: '#004850',
    end: '#2b989f',
    text: '#000'
  },
  plum: {
    surface: '#c8becb',
    navy: '#580060',
    end: '#a96ab0',
    text: '#000'
  },
  highcontrast: {
    surface: '#000',
    navy: '#800080',
    end: '#800080',
    text: '#fff'
  }
};
function applyPreferences() {
  const t = themes[sys.settings.get('highcontrast', false) ? 'highcontrast' : sys.settings.get('theme', 'standard')] || themes.standard;
  for (const [k, v] of Object.entries({
    surface: t.surface,
    navy: t.navy,
    'title-end': t.end,
    text: t.text,
    'ui-font-size': sys.settings.get('largeFonts', false) ? '13px' : '11px'
  })) document.documentElement.style.setProperty('--' + k, v);
  document.documentElement.style.setProperty('--desktop', sys.settings.get('wallpaperColor', '#008080'));
  document.querySelector('#tray-clock').hidden = !sys.settings.get('showClock', true);
  document.querySelector('#quick-launch').hidden = !sys.settings.get('quickLaunch', true);
  document.body.style.cursor = sys.settings.get('pointer', 'default');
  sys.renderer?.setWallpaper({
    color: sys.settings.get('wallpaperColor', '#008080'),
    pattern: sys.settings.get('wallpaperPattern', 'none'),
    image: sys.settings.get('wallpaperImage', null),
    fit: sys.settings.get('wallpaperFit', 'cover')
  });
}
sys.renderer = new DesktopRenderer(document.querySelector('#wallpaper'), {
  onBackendChange: (backend, stats) => {
    document.body.dataset.graphics = backend;
    sys.events.dispatchEvent(new CustomEvent('graphicschange', {
      detail: stats
    }));
  }
});
let preferenceTimer;
sys.settings.subscribe(({
  key
}) => {
  if (key === 'graphicsBackend') sys.renderer.init(sys.settings.get('graphicsBackend', 'auto')).then(applyPreferences);else if (['theme', 'highcontrast', 'largeFonts', 'pointer', 'wallpaperColor', 'wallpaperPattern', 'wallpaperImage', 'wallpaperFit', 'showClock', 'quickLaunch'].includes(key)) {
    clearTimeout(preferenceTimer);
    preferenceTimer = setTimeout(applyPreferences, 30);
  }
  if (key === 'showHidden') sys.refreshDesktop?.();
});
sys.startScreensaver = async (name = sys.settings.get('screensaver', 'starfield')) => {
  if (name === 'none' || document.querySelector('.screensaver-overlay')) return;
  const layer = document.createElement('div');
  layer.className = 'screensaver-overlay';
  const canvas = document.createElement('canvas');
  layer.append(canvas);
  document.body.append(layer);
  const renderer = new DesktopRenderer(canvas);
  await renderer.init(sys.settings.get('graphicsBackend', 'auto'));
  renderer.setScreensaver(name);
  sys.renderer.setPaused(true);
  const started = performance.now();
  let dismissed = false;
  const end = e => {
    if (performance.now() - started < 300 && e?.type !== 'keydown') return;
    if (dismissed) return;
    dismissed = true;
    renderer.dispose();
    layer.remove();
    sys.renderer.setPaused(false);
    document.removeEventListener('keydown', end, true);
  };
  layer.addEventListener('pointerdown', end);
  layer.addEventListener('pointermove', end);
  document.addEventListener('keydown', end, true);
  layer.tabIndex = 0;
  layer.focus();
};
let lastActivity = performance.now();
for (const type of ['pointerdown', 'pointermove', 'keydown']) document.addEventListener(type, () => lastActivity = performance.now(), {
  passive: true
});
setInterval(() => {
  const name = sys.settings.get('screensaver', 'none'),
    minutes = Number(sys.settings.get('screensaverMinutes', 5));
  if (name !== 'none' && minutes > 0 && performance.now() - lastActivity > minutes * 60000 && !document.hidden) {
    lastActivity = performance.now();
    sys.startScreensaver(name);
  }
}, 15000);
window.addEventListener('error', e => {
  sys.errors.push({
    message: e.message
  });
});
window.addEventListener('unhandledrejection', e => {
  sys.errors.push({
    message: String(e.reason?.message || e.reason)
  });
  console.error(e.reason);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sys.vfs.flush().catch(() => {});
});
sys.vfs.addEventListener('storageerror', () => sys.notify('The local disk could not be saved. Export a backup before closing this desktop.'));
async function boot() {
  await sys.vfs.init();
  registerExplorer(sys);
  registerBrowser(sys);
  installShell(sys);
  const modules = [['accessories', 'registerAccessories'], ['paint', 'registerPaint'], ['games', 'registerGames'], ['media', 'registerMedia'], ['system', 'registerSystem'], ['utilities', 'registerUtilities']];
  const results = await Promise.allSettled(modules.map(async ([name, method]) => {
    const m = await import('./packages/' + name + '/index.js');
    m[method](sys);
  }));
  for (let i = 0; i < results.length; i++) if (results[i].status === 'rejected') {
    sys.errors.push({
      module: modules[i][0],
      message: String(results[i].reason)
    });
    console.error('Package load failed', modules[i][0], results[i].reason);
  }
  await sys.renderer.init(sys.settings.get('graphicsBackend', 'auto'));
  applyPreferences();
  document.querySelector('#startup').remove();
  document.body.dataset.ready = 'true';
  if (sys.settings.get('showWelcome', true)) sys.open('welcome');
  for (const id of sys.settings.get('startupApps', [])) if (sys.apps.has(id)) sys.open(id);
  if (sys.vfs.lastError) sys.notify('Local storage is unavailable. Export your documents before closing this session.');
  installWebMCP();
}
function installWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const abort = new AbortController();
  const schema = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };
  const add = tool => {
    try {
      Promise.resolve(context.registerTool(tool, {
        signal: abort.signal
      })).catch(e => console.warn('WebMCP registration unavailable', e));
    } catch (e) {
      console.warn(e);
    }
  };
  add({
    name: 'list_desktop_apps',
    title: 'List desktop applications',
    description: 'List installed Windows 98 desktop application IDs and titles.',
    inputSchema: schema,
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    },
    execute: () => [...sys.apps.values()].map(({
      id,
      title
    }) => ({
      id,
      title
    }))
  });
  add({
    name: 'open_desktop_app',
    title: 'Open a desktop application',
    description: 'Open an installed application in the Windows 98 desktop.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false
    },
    execute: async input => {
      if (!input || typeof input.id !== 'string' || !sys.apps.has(input.id)) throw new Error('Unknown application ID.');
      const win = await sys.open(input.id);
      return {
        opened: !!win,
        id: win?.id || null,
        title: win?.title || null
      };
    }
  });
  add({
    name: 'list_desktop_files',
    title: 'List virtual files',
    description: 'List files and folders in a path on the device-local virtual disk.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true
    },
    execute: input => {
      if (typeof input?.path !== 'string' || sys.vfs.stat(input.path)?.type !== 'directory') throw new Error('Folder does not exist.');
      return sys.vfs.list(input.path).map(({
        path,
        name,
        type,
        size
      }) => ({
        path,
        name,
        type,
        size
      }));
    }
  });
  window.addEventListener('pagehide', () => abort.abort(), {
    once: true
  });
}
boot().catch(error => {
  console.error(error);
  const startup = document.querySelector('#startup');
  startup.innerHTML = '<div style="font:13px Arial;max-width:450px;line-height:1.6"><h2>Windows could not start</h2><p></p><button class="win-button">Try Again</button></div>';
  startup.querySelector('p').textContent = error.message;
  startup.querySelector('button').onclick = () => location.reload();
});
