import { escapeHTML } from '@win98/core';
/** Retained native DOM windows. Layout changes are committed once per pointer frame. */
export class WindowManager extends EventTarget {
  constructor(layer, taskbar, sys) {
    super();
    this.layer = layer;
    this.taskbar = taskbar;
    this.sys = sys;
    this.windows = new Map();
    this.active = null;
    this.z = 20;
    this.sequence = 0;
    this.hiddenWindows = [];
    window.addEventListener('resize', () => this.reflow());
  }
  get activeWindow() {
    return this.active;
  }
  getActive() {
    return this.active;
  }
  list() {
    return [...this.windows.values()];
  }
  create(options = {}) {
    const id = 'window-' + ++this.sequence,
      area = this.bounds(),
      minWidth = Math.min(options.minWidth || 210, area.width),
      minHeight = Math.min(options.minHeight || 130, area.height),
      width = Math.max(minWidth, Math.min(options.width || 500, area.width)),
      height = Math.max(minHeight, Math.min(options.height || 350, area.height));
    const cascade = this.windows.size % 8 * 22;
    const x = Math.max(0, Math.min(options.x ?? Math.max(90, (area.width - width) / 2) + cascade, area.width - width)),
      y = Math.max(0, Math.min(options.y ?? Math.max(32, (area.height - height) / 3) + cascade, area.height - height));
    const el = document.createElement('section');
    el.className = 'window';
    el.id = id;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', options.title || 'Window');
    el.tabIndex = -1;
    el.innerHTML = `<header class="titlebar"><button class="title-icon" aria-label="Window menu">${this.sys.icon(options.icon || 'windows', 16)}</button><span class="window-title">${escapeHTML(options.title || 'Window')}</span><div class="title-controls"><button class="title-button minimize" aria-label="Minimize"><i></i></button><button class="title-button maximize" aria-label="Maximize"><i></i></button><button class="title-button close" aria-label="Close"><i></i></button></div></header><div class="window-body"></div>`;
    const body = el.querySelector('.window-body');
    const cleanups = [];
    const win = {
      id,
      el,
      body,
      title: options.title || 'Window',
      icon: options.icon || 'windows',
      rect: {
        x,
        y,
        width,
        height
      },
      minWidth,
      minHeight,
      maximized: false,
      minimized: false,
      modal: !!options.modal,
      resizable: options.resizable !== false,
      appId: options.appId || this.sys.launchingApp || null,
      cleanups,
      onBeforeClose: null,
      closed: false,
      restoreRect: null,
      setTitle: title => {
        win.title = String(title);
        el.querySelector('.window-title').textContent = win.title;
        el.setAttribute('aria-label', win.title);
        win.task?.querySelector('span').replaceChildren(document.createTextNode(win.title));
        if (win.task) win.task.title = win.title;
      },
      close: () => this.close(win),
      focus: () => this.focus(win),
      minimize: () => this.minimize(win),
      maximize: () => this.maximize(win),
      addCleanup: fn => cleanups.push(fn)
    };
    this.windows.set(id, win);
    this.layer.append(el);
    this.applyRect(win);
    if (options.modal) {
      const scrim = document.createElement('div');
      scrim.className = 'modal-scrim';
      this.layer.insertBefore(scrim, el);
      win.scrim = scrim;
      el.setAttribute('aria-modal', 'true');
      scrim.addEventListener('pointerdown', () => this.focus(win));
    }
    if (options.taskbar !== false && !options.modal) {
      const task = document.createElement('button');
      task.className = 'task-button';
      task.innerHTML = this.sys.icon(win.icon, 16) + '<span></span>';
      task.querySelector('span').textContent = win.title;
      task.title = win.title;
      task.addEventListener('click', () => {
        this.active === win && !win.minimized ? this.minimize(win) : this.focus(win);
      });
      task.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.systemMenu(win, e.clientX, e.clientY);
      });
      this.taskbar.append(task);
      win.task = task;
    }
    el.addEventListener('pointerdown', () => this.focus(win), {
      capture: true
    });
    const title = el.querySelector('.titlebar');
    title.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button') || win.maximized) return;
      this.drag(win, e, 'move');
    });
    title.addEventListener('dblclick', e => {
      if (!e.target.closest('button') && win.resizable) this.maximize(win);
    });
    el.querySelector('.minimize').onclick = () => this.minimize(win);
    el.querySelector('.maximize').onclick = () => this.maximize(win);
    el.querySelector('.close').onclick = () => this.close(win);
    el.querySelector('.title-icon').onclick = e => {
      const r = title.getBoundingClientRect();
      this.systemMenu(win, r.left, r.bottom);
    };
    el.querySelector('.title-icon').ondblclick = () => this.close(win);
    if (!win.resizable) el.querySelector('.maximize').disabled = true;
    if (options.modal) {
      el.querySelector('.minimize').hidden = true;
      el.querySelector('.maximize').hidden = true;
    }
    if (win.resizable) for (const direction of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const handle = document.createElement('div');
      handle.className = 'resize-handle resize-' + direction;
      handle.addEventListener('pointerdown', e => {
        if (!win.maximized && e.button === 0) this.drag(win, e, direction);
      });
      el.append(handle);
    }
    el.addEventListener('keydown', e => {
      if (e.key === 'Tab' && win.modal) {
        const focusable = [...el.querySelectorAll('button:not(:disabled),input,textarea,select,a[href],[tabindex="0"]')].filter(n => n.offsetParent);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          last?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first?.focus();
          e.preventDefault();
        }
      }
    });
    this.focus(win);
    this.dispatchEvent(new Event('change'));
    return win;
  }
  bounds() {
    return {
      width: this.layer.clientWidth || window.innerWidth,
      height: this.layer.clientHeight || window.innerHeight - 28
    };
  }
  applyRect(win) {
    const r = win.rect;
    Object.assign(win.el.style, {
      left: Math.round(r.x) + 'px',
      top: Math.round(r.y) + 'px',
      width: Math.round(r.width) + 'px',
      height: Math.round(r.height) + 'px'
    });
  }
  drag(win, event, mode) {
    event.preventDefault();
    this.focus(win);
    const target = event.currentTarget,
      start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        ...win.rect
      },
      pointer = event.pointerId;
    target.setPointerCapture(pointer);
    let latest = null,
      frame = 0;
    const apply = () => {
      frame = 0;
      if (!latest) return;
      const dx = latest.clientX - start.pointerX,
        dy = latest.clientY - start.pointerY,
        area = this.bounds(),
        r = {
          ...win.rect
        };
      if (mode === 'move') {
        r.x = Math.max(80 - start.width, Math.min(area.width - 80, start.x + dx));
        r.y = Math.max(0, Math.min(area.height - 22, start.y + dy));
      } else {
        r.x = start.x;
        r.y = start.y;
        r.width = start.width;
        r.height = start.height;
        if (mode.includes('e')) r.width = Math.max(win.minWidth, start.width + dx);
        if (mode.includes('s')) r.height = Math.max(win.minHeight, start.height + dy);
        if (mode.includes('w')) {
          r.width = Math.max(win.minWidth, start.width - dx);
          r.x = start.x + start.width - r.width;
        }
        if (mode.includes('n')) {
          r.height = Math.max(win.minHeight, start.height - dy);
          r.y = start.y + start.height - r.height;
        }
        if (r.y < 0) {
          r.height += r.y;
          r.y = 0;
        }
      }
      win.rect = r;
      this.applyRect(win);
      win.el.dispatchEvent(new CustomEvent('windowresize'));
    };
    const move = e => {
      if (e.pointerId !== pointer) return;
      latest = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const end = e => {
      if (e.pointerId !== pointer) return;
      if (frame) cancelAnimationFrame(frame);
      if (latest) apply();
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      document.body.classList.remove('window-dragging');
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    document.body.classList.add('window-dragging');
  }
  focus(win) {
    if (typeof win === 'string') win = this.windows.get(win);
    if (!win || win.closed) return;
    const modal = this.list().filter(w => w.modal && !w.closed).at(-1);
    if (modal && win !== modal) win = modal;
    for (const w of this.windows.values()) {
      w.el.classList.toggle('active', w === win);
      w.task?.classList.toggle('active', w === win && !win.minimized);
    }
    win.minimized = false;
    win.el.hidden = false;
    win.el.style.zIndex = String(++this.z);
    if (win.scrim) win.scrim.style.zIndex = String(this.z - 1);
    this.active = win;
    win.task?.classList.add('active');
    if (!win.el.contains(document.activeElement)) win.el.focus({
      preventScroll: true
    });
    this.dispatchEvent(new Event('change'));
  }
  minimize(win) {
    if (win.modal || win.closed) return;
    win.minimized = true;
    win.el.hidden = true;
    win.task?.classList.remove('active');
    if (this.active === win) {
      this.active = null;
      const next = this.list().filter(w => !w.minimized).sort((a, b) => Number(a.el.style.zIndex) - Number(b.el.style.zIndex)).at(-1);
      if (next) this.focus(next);
    }
    this.dispatchEvent(new Event('change'));
  }
  maximize(win) {
    if (!win.resizable || win.closed) return;
    if (win.maximized) {
      win.rect = win.restoreRect;
      win.maximized = false;
    } else {
      win.restoreRect = {
        ...win.rect
      };
      const a = this.bounds();
      win.rect = {
        x: 0,
        y: 0,
        width: a.width,
        height: a.height
      };
      win.maximized = true;
    }
    win.el.classList.toggle('maximized', win.maximized);
    win.el.querySelector('.maximize').setAttribute('aria-label', win.maximized ? 'Restore' : 'Maximize');
    this.applyRect(win);
    this.focus(win);
    win.el.dispatchEvent(new CustomEvent('windowresize'));
  }
  async close(win, {
    force = false
  } = {}) {
    if (typeof win === 'string') win = this.windows.get(win);
    if (!win || win.closed || win.closing) return false;
    win.closing = true;
    try {
      if (!force && win.onBeforeClose && (await win.onBeforeClose()) === false) return false;
      win.closed = true;
      for (const fn of win.cleanups) try {
        fn();
      } catch (e) {
        console.error(e);
      }
      win.el.remove();
      win.task?.remove();
      win.scrim?.remove();
      this.windows.delete(win.id);
      if (this.active === win) {
        this.active = null;
        const next = this.list().filter(w => !w.minimized).sort((a, b) => Number(a.el.style.zIndex) - Number(b.el.style.zIndex)).at(-1);
        if (next) this.focus(next);
      }
      this.dispatchEvent(new Event('change'));
      return true;
    } finally {
      win.closing = false;
    }
  }
  systemMenu(win, x, y) {
    this.sys.contextMenu([{
      label: 'Restore',
      disabled: !win.maximized && !win.minimized,
      action: () => win.maximized ? this.maximize(win) : this.focus(win)
    }, {
      label: 'Move',
      disabled: win.maximized,
      action: () => {
        this.focus(win);
        this.sys.notify('Drag the title bar to move this window.');
      }
    }, {
      label: 'Size',
      disabled: !win.resizable || win.maximized,
      action: () => {
        this.focus(win);
        this.sys.notify('Drag a window edge or corner to resize.');
      }
    }, {
      label: 'Minimize',
      action: () => this.minimize(win)
    }, {
      label: 'Maximize',
      disabled: !win.resizable || win.maximized,
      action: () => this.maximize(win)
    }, {
      type: 'separator'
    }, {
      label: 'Close',
      shortcut: 'Alt+F4',
      bold: true,
      action: () => this.close(win)
    }], x, y);
  }
  showDesktop() {
    if (this.hiddenWindows.length) {
      for (const id of this.hiddenWindows) {
        const w = this.windows.get(id);
        if (w) this.focus(w);
      }
      this.hiddenWindows = [];
    } else {
      this.hiddenWindows = this.list().filter(w => !w.minimized && !w.modal).map(w => w.id);
      for (const id of this.hiddenWindows) this.minimize(this.windows.get(id));
    }
  }
  arrange(kind = 'cascade') {
    const list = this.list().filter(w => !w.modal && !w.minimized),
      a = this.bounds();
    list.forEach((w, i) => {
      w.maximized = false;
      w.el.classList.remove('maximized');
      if (kind === 'cascade') w.rect = {
        x: 30 + i * 24,
        y: 20 + i * 24,
        width: Math.min(640, a.width - 50),
        height: Math.min(440, a.height - 50)
      };else if (kind === 'vertical') w.rect = {
        x: i * a.width / list.length,
        y: 0,
        width: a.width / list.length,
        height: a.height
      };else w.rect = {
        x: 0,
        y: i * a.height / list.length,
        width: a.width,
        height: a.height / list.length
      };
      this.applyRect(w);
      w.el.dispatchEvent(new CustomEvent('windowresize'));
    });
  }
  reflow() {
    const a = this.bounds();
    for (const w of this.windows.values()) {
      if (w.maximized) w.rect = {
        x: 0,
        y: 0,
        width: a.width,
        height: a.height
      };else {
        w.rect.x = Math.min(w.rect.x, a.width - 80);
        w.rect.y = Math.min(w.rect.y, a.height - 25);
        w.rect.width = Math.min(w.rect.width, a.width);
        w.rect.height = Math.min(w.rect.height, a.height);
      }
      this.applyRect(w);
    }
  }
}
