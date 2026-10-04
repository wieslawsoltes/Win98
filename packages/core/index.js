/** Device-local case-insensitive volume, with serialized durable IndexedDB commits. */
export const VERSION = '1.0.0';
export function normalizePath(input = 'C:/') {
  let p = String(input).replaceAll('\\', '/').replace(/\/+/g, '/');
  if (!/^[a-z]:/i.test(p)) p = 'C:/' + p.replace(/^\//, '');
  const drive = p.slice(0, 2).toUpperCase(),
    parts = [];
  for (const part of p.slice(2).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();else parts.push(part);
  }
  return drive + '/' + parts.join('/');
}
export const parentPath = p => {
  p = normalizePath(p);
  const i = p.lastIndexOf('/');
  return i <= 2 ? p.slice(0, 3) : p.slice(0, i);
};
export const basename = p => normalizePath(p).split('/').pop() || normalizePath(p);
const key = p => normalizePath(p).toLowerCase();
export class VirtualFileSystem extends EventTarget {
  constructor() {
    super();
    this.entries = new Map();
    this.revision = 0;
    this.persistedRevision = 0;
    this.db = null;
    this.writeChain = Promise.resolve();
    this.lastError = null;
    this.recycle = [];
  }
  async init() {
    try {
      this.db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('windows98-local-machine', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('state');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const state = await new Promise((resolve, reject) => {
        const r = this.db.transaction('state').objectStore('state').get('volume');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      if (state?.entries) {
        for (const e of state.entries) this.entries.set(key(e.path), e);
        this.recycle = state.recycle || [];
      }
    } catch (e) {
      this.lastError = e;
    }
    if (!this.entries.size) this.seed();
    return this;
  }
  emit() {
    this.revision++;
    this.dispatchEvent(new Event('change'));
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush().catch(() => {}), 180);
  }
  async flush() {
    clearTimeout(this.saveTimer);
    if (!this.db) {
      if (this.lastError) throw new Error('Your browser could not open the local disk. Export your files before closing this session.');
      return;
    }
    const revision = this.revision,
      state = {
        entries: [...this.entries.values()].map(e => ({
          ...e
        })),
        recycle: structuredClone(this.recycle)
      };
    const job = () => new Promise((resolve, reject) => {
      const tx = this.db.transaction('state', 'readwrite');
      tx.objectStore('state').put(state, 'volume');
      tx.oncomplete = () => {
        this.persistedRevision = revision;
        this.lastError = null;
        resolve();
      };
      tx.onerror = () => {
        this.lastError = tx.error;
        this.dispatchEvent(new Event('storageerror'));
        reject(tx.error);
      };
      tx.onabort = () => reject(tx.error);
    });
    this.writeChain = this.writeChain.catch(() => {}).then(job);
    return this.writeChain;
  }
  exists(path) {
    return this.entries.has(key(path));
  }
  stat(path) {
    const e = this.entries.get(key(path));
    return e ? {
      ...e
    } : null;
  }
  read(path) {
    const e = this.entries.get(key(path));
    return !e || e.type === 'directory' ? null : e.content ?? '';
  }
  list(path = 'C:/') {
    path = key(path);
    return [...this.entries.values()].filter(e => key(e.path) !== path && key(parentPath(e.path)) === path).map(e => ({
      ...e
    })).sort((a, b) => (a.type === b.type ? 0 : a.type === 'directory' ? -1 : 1) || a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base'
    }));
  }
  validateName(path) {
    const n = basename(path);
    if (path.length > 3 && (!n || /[<>:"|?*\x00-\x1f]/.test(n) || /[. ]$/.test(n))) throw new Error('The file name cannot contain: \\ / : * ? " < > |');
  }
  mkdir(path, {
    recursive = false
  } = {}) {
    path = normalizePath(path);
    this.validateName(path);
    if (this.exists(path)) {
      if (this.stat(path).type !== 'directory') throw new Error('A file with that name already exists.');
      return this.stat(path);
    }
    if (path.length > 3) {
      const parent = parentPath(path);
      if (!this.exists(parent) && recursive) this.mkdir(parent, {
        recursive: true
      });
      if (this.stat(parent)?.type !== 'directory') throw new Error('The destination folder does not exist.');
    }
    const now = Date.now(),
      e = {
        path,
        name: basename(path),
        type: 'directory',
        created: now,
        modified: now,
        size: 0
      };
    this.entries.set(key(path), e);
    this.emit();
    return {
      ...e
    };
  }
  write(path, content, options = {}) {
    path = normalizePath(path);
    this.validateName(path);
    const parent = this.stat(parentPath(path));
    if (!parent || parent.type !== 'directory') throw new Error('The destination folder does not exist.');
    const old = this.stat(path);
    if (old?.type === 'directory') throw new Error('A folder has this name.');
    if (old?.readonly) throw new Error('Access denied: ' + old.name + ' is read-only.');
    const text = String(content ?? ''),
      now = Date.now(),
      e = {
        ...old,
        path,
        name: basename(path),
        type: 'file',
        content: text,
        mime: options.mime || old?.mime || 'text/plain',
        created: old?.created || now,
        modified: now,
        size: new TextEncoder().encode(text).length
      };
    this.entries.set(key(path), e);
    this.emit();
    return {
      ...e
    };
  }
  setAttributes(path, attributes = {}) {
    const original = this.entries.get(key(path));
    if (!original) throw new Error('The file or folder could not be found.');
    const next = {
      ...original
    };
    let changed = false;
    for (const name of ['readonly', 'hidden', 'system', 'archive']) if (Object.hasOwn(attributes, name)) {
      next[name] = !!attributes[name];
      if (next[name] !== original[name]) changed = true;
    }
    if (changed) {
      this.entries.set(key(path), next);
      this.emit();
    }
    return {
      ...next
    };
  }
  delete(path, {
    permanent = false
  } = {}) {
    path = normalizePath(path);
    if (path.length <= 3) throw new Error('The root of a disk cannot be deleted.');
    const target = key(path),
      entries = [...this.entries.values()].filter(e => key(e.path) === target || key(e.path).startsWith(target + '/'));
    if (!entries.length) throw new Error('The file or folder could not be found.');
    const protectedEntry = entries.find(e => e.readonly);
    if (protectedEntry) throw new Error('Access denied: ' + protectedEntry.name + ' is read-only.');
    if (!permanent) this.recycle.push({
      id: crypto.randomUUID(),
      path: this.stat(path).path,
      deleted: Date.now(),
      entries: structuredClone(entries)
    });
    for (const e of entries) this.entries.delete(key(e.path));
    this.emit();
  }
  copy(from, to, options = {}) {
    return this.transfer(from, to, {
      ...options,
      move: false
    });
  }
  transfer(from, to, {
    overwrite = false,
    move = false
  } = {}) {
    from = normalizePath(from);
    to = normalizePath(to);
    const root = this.stat(from);
    if (!root) throw new Error('The source file could not be found.');
    from = root.path;
    const fromKey = key(from),
      toKey = key(to),
      same = fromKey === toKey;
    if (same) {
      if (!move) throw new Error('Cannot copy an item into itself.');
      if (from === to) return {
        ...root
      };
    }
    if (from.length <= 3 || to.length <= 3) throw new Error('Disk roots cannot be copied, moved, or replaced. Use Back Up Disk to copy a volume.');
    this.validateName(to);
    if (!same && (toKey.startsWith(fromKey + '/') || fromKey.startsWith(toKey + '/'))) throw new Error('The source and destination folders overlap.');
    if (this.stat(parentPath(to))?.type !== 'directory') throw new Error('The destination folder does not exist.');
    const source = [...this.entries.values()].filter(e => key(e.path) === fromKey || key(e.path).startsWith(fromKey + '/'));
    if (move) {
      const protectedEntry = source.find(e => e.readonly);
      if (protectedEntry) throw new Error('Access denied: ' + protectedEntry.name + ' is read-only.');
    }
    const now = Date.now(),
      planned = [];
    for (const entry of source) {
      const path = to + entry.path.slice(from.length);
      this.validateName(path);
      const existing = this.stat(path);
      if (existing && !same) {
        if (!overwrite) throw new Error('The destination already exists.');
        if (existing.type !== entry.type) throw new Error('A file and a folder cannot replace one another: ' + existing.name);
        if (existing.readonly) throw new Error('Access denied: ' + existing.name + ' is read-only.');
      }
      planned.push({
        ...entry,
        path,
        name: basename(path),
        created: move ? entry.created : existing?.created || now,
        modified: entry.modified || now
      });
    }
    // Commit after every path and collision has passed validation. Existing
    // directories merge; unrelated destination children are preserved.
    const next = new Map(this.entries);
    if (move) for (const entry of source) next.delete(key(entry.path));
    for (const entry of planned) next.set(key(entry.path), entry);
    this.entries = next;
    this.emit();
    return this.stat(to);
  }
  move(from, to, options = {}) {
    return this.transfer(from, to, {
      ...options,
      move: true
    });
  }
  restore(id) {
    const group = this.recycle.find(e => e.id === id);
    if (!group) return;
    for (const e of group.entries) if (this.exists(e.path)) throw new Error('An item with the same name already exists. Rename it before restoring.');
    if (!this.exists(parentPath(group.path))) this.mkdir(parentPath(group.path), {
      recursive: true
    });
    for (const e of group.entries) this.entries.set(key(e.path), {
      ...e
    });
    this.recycle = this.recycle.filter(e => e.id !== id);
    this.emit();
  }
  emptyRecycleBin() {
    this.recycle = [];
    this.emit();
  }
  search(query, path = 'C:/') {
    const q = String(query).toLowerCase();
    return [...this.entries.values()].filter(e => key(e.path).startsWith(key(path)) && e.name.toLowerCase().includes(q)).map(e => ({
      ...e
    }));
  }
  export() {
    return JSON.stringify({
      format: 'win98-volume',
      version: 1,
      entries: [...this.entries.values()],
      recycle: this.recycle
    }, null, 2);
  }
  import(json) {
    const state = JSON.parse(json);
    if (!state || state.format !== 'win98-volume' || !Array.isArray(state.entries) || !state.entries.length || state.entries.length > 50000) throw new Error('This is not a Windows 98 desktop backup.');
    const cleanEntry = entry => {
      if (!entry || !['file', 'directory'].includes(entry.type) || typeof entry.path !== 'string' || entry.type === 'file' && typeof entry.content !== 'string') throw new Error('Invalid file entry in backup.');
      const path = normalizePath(entry.path);
      let segment = path.slice(0, 3);
      for (const part of path.slice(3).split('/').filter(Boolean)) {
        segment = segment.replace(/\/$/, '') + '/' + part;
        this.validateName(segment);
      }
      return {
        ...entry,
        path,
        name: basename(path)
      };
    };
    const map = new Map();
    for (const raw of state.entries) {
      const entry = cleanEntry(raw);
      if (map.has(key(entry.path))) throw new Error('Duplicate file entry in backup.');
      map.set(key(entry.path), entry);
    }
    if (map.get('c:/')?.type !== 'directory') throw new Error('The backup has no C: drive.');
    for (const entry of map.values()) if (entry.path.length > 3 && map.get(key(parentPath(entry.path)))?.type !== 'directory') throw new Error('The backup contains orphaned files.');
    if (state.recycle !== undefined && !Array.isArray(state.recycle)) throw new Error('Invalid Recycle Bin in backup.');
    const recycle = [],
      ids = new Set();
    let deletedEntries = 0;
    for (const group of state.recycle || []) {
      if (!group || typeof group.id !== 'string' || !group.id.trim() || ids.has(group.id) || typeof group.path !== 'string' || !Number.isFinite(group.deleted) || group.deleted < 0 || !Number.isFinite(new Date(group.deleted).getTime()) || !Array.isArray(group.entries) || !group.entries.length) throw new Error('Invalid Recycle Bin group in backup.');
      ids.add(group.id);
      deletedEntries += group.entries.length;
      if (deletedEntries > 50000) throw new Error('The backup contains too many deleted files.');
      const rootPath = normalizePath(group.path),
        rootKey = key(rootPath),
        deletedMap = new Map();
      if (rootPath.length <= 3) throw new Error('A disk root cannot be in the Recycle Bin.');
      for (const raw of group.entries) {
        const entry = cleanEntry(raw),
          entryKey = key(entry.path);
        if (deletedMap.has(entryKey)) throw new Error('Duplicate deleted file entry in backup.');
        if (entryKey !== rootKey && !entryKey.startsWith(rootKey + '/')) throw new Error('A deleted file is outside its Recycle Bin group.');
        deletedMap.set(entryKey, entry);
      }
      const root = deletedMap.get(rootKey);
      if (!root) throw new Error('A Recycle Bin group is missing its original item.');
      for (const entry of deletedMap.values()) if (key(entry.path) !== rootKey && deletedMap.get(key(parentPath(entry.path)))?.type !== 'directory') throw new Error('The Recycle Bin contains orphaned files.');
      // Groups may share a former path or conflict with a live item. Restore
      // already checks those collisions. Keep the original item first for Explorer.
      recycle.push({
        ...group,
        path: root.path,
        entries: [root, ...[...deletedMap.values()].filter(entry => key(entry.path) !== rootKey)]
      });
    }
    // Replace state only after the live volume and every deleted group validate.
    this.entries = map;
    this.recycle = recycle;
    this.emit();
  }
  seed() {
    for (const path of ['C:/', 'C:/Windows', 'C:/Windows/Desktop', 'C:/Windows/Start Menu', 'C:/Windows/Temp', 'C:/My Documents', 'C:/My Documents/My Pictures', 'C:/My Documents/My Music', 'C:/Program Files', 'C:/Program Files/Accessories', 'C:/Program Files/Internet Explorer', 'C:/Recycled', 'D:/']) this.mkdir(path, {
      recursive: true
    });
    this.write('C:/My Documents/Welcome.txt', 'Welcome to Windows 98\r\n=====================\r\n\r\nThis is your own Windows 98 desktop in the browser.\r\n\r\nDouble-click desktop icons to open them. Use the Start menu to find programs, change settings, and shut down.\r\n\r\nTry these things:\r\n  - Write a note in Notepad and save it to My Documents.\r\n  - Make a picture in Paint.\r\n  - Play Minesweeper, Solitaire, FreeCell, or Hearts.\r\n  - Change your wallpaper in Display Properties.\r\n  - Open an MS-DOS Prompt and type HELP.\r\n\r\nYour virtual C: drive is stored on this device. Use My Computer > File > Back Up Disk to keep a portable copy.\r\n\r\nFor supported features and native compatibility, open Help from the Start menu.\r\n');
    this.write('C:/My Documents/Read me first.txt', 'Windows 98 Desktop — browser edition\r\n\r\nKeyboard shortcuts\r\n  Alt+F4       Close active window\r\n  Alt+Tab      Switch windows (if the browser allows it)\r\n  Ctrl+Escape  Open Start\r\n  F2           Rename selected file / new game\r\n  F5           Refresh Explorer\r\n  Ctrl+S       Save document\r\n  Ctrl+O       Open document\r\n\r\nYour documents are device-local. Clearing this website\'s browser data removes the virtual disk. Export a backup from My Computer to preserve it.\r\n\r\nCompatibility\r\nThis is an independently implemented desktop environment, not an x86 emulator. It does not run original .exe, .com, .sys, or DOS games. Native hardware, Windows drivers, dial-up networking, and ActiveX are outside the browser runtime.\r\n');
    this.write('C:/Windows/win.ini', '[windows]\r\nload=\r\nrun=\r\nNullPort=None\r\n[Desktop]\r\nWallpaper=None\r\nTileWallpaper=0\r\n');
    this.write('C:/autoexec.bat', '@ECHO OFF\r\nPATH C:\\WINDOWS;C:\\WINDOWS\\COMMAND\r\nSET TEMP=C:\\WINDOWS\\TEMP\r\n');
    this.write('C:/config.sys', 'DOS=HIGH,UMB\r\nFILES=30\r\nBUFFERS=30\r\n');
    this.write('C:/My Documents/Shopping list.txt', 'Shopping list\r\n\r\n[ ] Floppy disks\r\n[ ] Printer paper\r\n[ ] A new mouse pad\r\n[ ] Coffee\r\n');
  }
}
export class Settings extends EventTarget {
  constructor() {
    super();
    try {
      this.values = JSON.parse(localStorage.getItem('win98-settings') || '{}');
    } catch {
      this.values = {};
    }
    if (!this.values || Array.isArray(this.values) || typeof this.values !== 'object') this.values = {};
  }
  get(key, fallback) {
    return Object.hasOwn(this.values, key) ? this.values[key] : fallback;
  }
  set(key, value) {
    Object.defineProperty(this.values, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
    try {
      localStorage.setItem('win98-settings', JSON.stringify(this.values));
    } catch {}
    this.dispatchEvent(new CustomEvent('change', {
      detail: {
        key,
        value
      }
    }));
    return value;
  }
  subscribe(fn) {
    const h = e => fn(e.detail);
    this.addEventListener('change', h);
    return () => this.removeEventListener('change', h);
  }
}
export function formatBytes(n) {
  return n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
}
export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}
