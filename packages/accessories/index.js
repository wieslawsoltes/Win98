/* Windows 98 accessories. Browser ES module; no runtime dependencies. */

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const basename = path => String(path || '').replace(/\\/g, '/').split('/').pop() || 'Untitled';
const dirname = path => {
  const parent = String(path || '').replace(/\\/g, '/').replace(/\/[^/]*$/, '') || 'C:/';
  return /^[a-z]:$/i.test(parent) ? `${parent}/` : parent;
};
const element = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const listen = (win, target, type, fn, options) => {
  target.addEventListener(type, fn, options);
  win.addCleanup(() => target.removeEventListener(type, fn, options));
};
const setSetting = (sys, key, value) => sys.settings?.set(key, value);
const getSetting = (sys, key, fallback) => sys.settings?.get(key, fallback) ?? fallback;
const errorDialog = (sys, error, title = 'Windows') => sys.dialog({
  title,
  message: error?.message || String(error),
  icon: 'error',
  buttons: [{
    label: 'OK',
    value: 'ok'
  }]
});
const safeAction = (sys, fn, title) => (...args) => Promise.resolve().then(() => fn(...args)).catch(error => errorDialog(sys, error, title));
const menuAction = (sys, label, fn, shortcut) => ({
  label,
  action: safeAction(sys, fn),
  ...(shortcut ? {
    shortcut
  } : {})
});
const separator = () => ({
  type: 'separator'
});
function toolButton(label, title, action, className = '') {
  const button = element('button', `win-button acc-tool-button ${className}`, label);
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', action);
  return button;
}
function formDialog(sys, {
  title,
  width = 355,
  fields,
  acceptLabel = 'OK',
  message
}) {
  return new Promise(resolve => {
    const win = sys.wm.create({
      title,
      icon: 'settings',
      width,
      height: 260,
      minWidth: 300,
      minHeight: 180,
      modal: true,
      taskbar: false,
      resizable: false
    });
    win.el.classList.add('acc-dialog-window');
    win.body.classList.add('acc-app-body');
    const form = element('form', 'acc-form-dialog');
    if (message) form.append(element('p', 'acc-form-message', message));
    const controls = {};
    for (const field of fields) {
      const row = element('label', 'acc-form-row');
      row.append(element('span', '', field.label));
      let input;
      if (field.type === 'select') {
        input = element('select', 'acc-input');
        for (const option of field.options) {
          const value = typeof option === 'string' ? option : option.value;
          const caption = typeof option === 'string' ? option : option.label;
          const optionEl = element('option', '', caption);
          optionEl.value = value;
          input.append(optionEl);
        }
      } else {
        input = element('input', 'acc-input');
        input.type = field.type || 'text';
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        if (field.type === 'checkbox') input.checked = Boolean(field.value);
      }
      if (field.type !== 'checkbox') input.value = field.value ?? '';
      input.name = field.name;
      if (field.required) input.required = true;
      controls[field.name] = input;
      row.append(input);
      form.append(row);
    }
    const buttons = element('div', 'acc-dialog-buttons');
    const ok = toolButton(acceptLabel, acceptLabel, () => form.requestSubmit());
    const cancel = toolButton('Cancel', 'Cancel', () => done(null));
    buttons.append(ok, cancel);
    form.append(buttons);
    win.body.append(form);
    let finished = false;
    function done(value) {
      if (finished) return;
      finished = true;
      win.onBeforeClose = null;
      win.close();
      resolve(value);
    }
    win.onBeforeClose = () => {
      if (!finished) {
        finished = true;
        resolve(null);
      }
      return true;
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = {};
      for (const [name, input] of Object.entries(controls)) values[name] = input.type === 'checkbox' ? input.checked : input.value;
      done(values);
    });
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        done(null);
      }
    });
    requestAnimationFrame(() => {
      const first = Object.values(controls)[0];
      first?.focus();
      if (first?.type === 'text') first.select();
    });
  });
}
function printDocument(sys, title, html, css = '') {
  const frame = document.createElement('iframe');
  frame.className = 'acc-print-frame';
  frame.title = `Print ${title}`;
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${esc(title)}</title><style>body{font:12pt Arial,sans-serif;color:#000;background:#fff;margin:20mm}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11pt "Courier New",monospace}${css}</style></head><body>${html}</body></html>`);
  doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow.addEventListener('afterprint', cleanup, {
    once: true
  });
  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) {
      cleanup();
      errorDialog(sys, error, 'Print');
    }
  }, 120);
  setTimeout(() => frame.remove(), 120000);
}
async function confirmDocument(sys, dirty, name, save) {
  if (!dirty()) return true;
  const choice = await sys.dialog({
    title: name,
    icon: 'warning',
    message: `The text in ${name} has changed.\n\nDo you want to save the changes?`,
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
  if (choice === 'save') return Boolean(await save()) && !dirty();
  return choice === 'discard';
}
function createNotepad(sys, args = {}) {
  const win = sys.wm.create({
    title: 'Untitled - Notepad',
    icon: 'notepad',
    width: 660,
    height: 455,
    minWidth: 320,
    minHeight: 230
  });
  win.el.classList.add('acc-notepad');
  win.body.classList.add('acc-app-body');
  let path = null;
  let savedText = '';
  let lineEnding = '\r\n';
  const textForDisk = text => text.replace(/\r\n|\r|\n/g, lineEnding);
  let wrap = getSetting(sys, 'notepad.wrap', false);
  let lastFind = '';
  let findCase = false;
  let history = [{
    value: '',
    start: 0,
    end: 0
  }];
  let historyIndex = 0;
  let saveQueue = Promise.resolve(),
    documentEpoch = 0;
  const editor = element('textarea', 'acc-notepad-editor');
  editor.spellcheck = false;
  editor.setAttribute('aria-label', 'Notepad document');
  editor.wrap = wrap ? 'soft' : 'off';
  editor.style.fontFamily = getSetting(sys, 'notepad.font', 'Lucida Console, monospace');
  editor.style.fontSize = `${getSetting(sys, 'notepad.fontSize', 13)}px`;
  editor.style.fontWeight = getSetting(sys, 'notepad.fontBold', false) ? 'bold' : 'normal';
  editor.style.fontStyle = getSetting(sys, 'notepad.fontItalic', false) ? 'italic' : 'normal';
  let status;
  const dirty = () => editor.value !== savedText;
  const update = () => {
    win.setTitle(`${dirty() ? '*' : ''}${basename(path) || 'Untitled'} - Notepad`);
    if (status) {
      const before = editor.value.slice(0, editor.selectionStart);
      const lines = before.split('\n');
      status.textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}    ${editor.value.length.toLocaleString()} characters    ${wrap ? 'Word Wrap' : 'No Wrap'}`;
    }
  };
  const snapshot = () => {
    if (history[historyIndex]?.value !== editor.value) {
      history = history.slice(0, historyIndex + 1);
      history.push({
        value: editor.value,
        start: editor.selectionStart,
        end: editor.selectionEnd
      });
      if (history.length > 250) history.shift();
      historyIndex = history.length - 1;
    }
    update();
  };
  function setText(text, nextPath = null) {
    documentEpoch++;
    path = nextPath;
    lineEnding = String(text).match(/\r\n|\r|\n/)?.[0] || '\r\n';
    editor.value = text;
    // Textareas normalize CRLF/CR to LF. Dirty state and undo snapshots use
    // that normalized editing value; disk writes retain the file convention.
    savedText = editor.value;
    history = [{
      value: editor.value,
      start: 0,
      end: 0
    }];
    historyIndex = 0;
    editor.setSelectionRange(0, 0);
    update();
    editor.focus();
  }
  const changeSelection = text => {
    editor.focus();
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    snapshot();
  };
  function undo(redo = false) {
    const next = historyIndex + (redo ? 1 : -1);
    if (next < 0 || next >= history.length) return;
    historyIndex = next;
    const record = history[next];
    editor.value = record.value;
    editor.focus();
    editor.setSelectionRange(record.start, record.end);
    update();
  }
  function save(as = false) {
    const epoch = documentEpoch;
    const operation = saveQueue.then(async () => {
      if (epoch !== documentEpoch) return false;
      let target = path;
      if (as || !target) target = await sys.fileDialog({
        mode: 'save',
        path: dirname(path || 'C:/My Documents/Untitled.txt'),
        filename: path ? basename(path) : 'Untitled.txt',
        filter: '.txt'
      });
      if (!target || epoch !== documentEpoch) return false;
      const snapshot = editor.value;
      sys.vfs.write(target, textForDisk(snapshot), {
        mime: 'text/plain'
      });
      await sys.vfs.flush();
      if (epoch === documentEpoch) {
        path = target;
        savedText = snapshot;
        update();
      }
      return true;
    });
    saveQueue = operation.catch(() => {});
    return operation;
  }
  const guard = async () => {
    await saveQueue;
    return confirmDocument(sys, dirty, basename(path), save);
  };
  async function newDocument() {
    if (await guard()) setText('');
  }
  async function openDocument(givenPath) {
    if (!(await guard())) return;
    const target = givenPath || (await sys.fileDialog({
      mode: 'open',
      path: dirname(path || 'C:/My Documents/Untitled.txt'),
      filter: '.txt'
    }));
    if (!target) return;
    const text = sys.vfs.read(target);
    if (text === null || text === undefined) throw new Error(`Cannot open ${target}. The file does not exist.`);
    setText(String(text), target);
  }
  async function clipboard(command) {
    editor.focus();
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (command === 'paste') {
      let text;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = await sys.prompt({
          title: 'Paste',
          message: 'Paste the text you want to insert:',
          value: ''
        });
      }
      if (text !== null && text !== undefined) changeSelection(text);
    } else {
      if (!selected) return;
      let copied = false;
      try {
        await navigator.clipboard.writeText(selected);
        copied = true;
      } catch {
        copied = document.execCommand('copy');
      }
      if (!copied) {
        await sys.dialog({
          title: 'Clipboard',
          message: 'Use Ctrl+C to copy the selected text.',
          buttons: [{
            label: 'OK',
            value: 'ok'
          }]
        });
        return;
      }
      if (command === 'cut') changeSelection('');
    }
  }
  async function find(next = false, backward = false) {
    if (!next || !lastFind) {
      const result = await formDialog(sys, {
        title: 'Find',
        fields: [{
          name: 'text',
          label: 'Find what:',
          value: lastFind,
          required: true
        }, {
          name: 'matchCase',
          label: 'Match case',
          type: 'checkbox',
          value: findCase
        }],
        acceptLabel: 'Find Next'
      });
      if (!result) return;
      lastFind = result.text;
      findCase = result.matchCase;
    }
    if (!lastFind) return;
    const haystack = findCase ? editor.value : editor.value.toLocaleLowerCase();
    const needle = findCase ? lastFind : lastFind.toLocaleLowerCase();
    let index = backward ? haystack.lastIndexOf(needle, editor.selectionStart - 1) : haystack.indexOf(needle, editor.selectionEnd);
    if (index < 0) index = backward ? haystack.lastIndexOf(needle) : haystack.indexOf(needle);
    if (index < 0) {
      await sys.dialog({
        title: 'Notepad',
        message: `Cannot find "${lastFind}".`,
        buttons: [{
          label: 'OK',
          value: 'ok'
        }]
      });
      return;
    }
    editor.focus();
    editor.setSelectionRange(index, index + lastFind.length);
    const line = editor.value.slice(0, index).split('\n').length - 1;
    editor.scrollTop = Math.max(0, line * parseFloat(getComputedStyle(editor).lineHeight) - editor.clientHeight / 2);
    update();
  }
  async function replace() {
    const result = await formDialog(sys, {
      title: 'Replace',
      fields: [{
        name: 'find',
        label: 'Find what:',
        value: lastFind,
        required: true
      }, {
        name: 'replacement',
        label: 'Replace with:',
        value: ''
      }, {
        name: 'matchCase',
        label: 'Match case',
        type: 'checkbox',
        value: findCase
      }, {
        name: 'all',
        label: 'Replace all occurrences',
        type: 'checkbox',
        value: true
      }],
      acceptLabel: 'Replace'
    });
    if (!result) return;
    lastFind = result.find;
    findCase = result.matchCase;
    const pattern = new RegExp(result.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), result.all ? findCase ? 'g' : 'gi' : findCase ? '' : 'i');
    let count = 0;
    if (result.all) {
      editor.value = editor.value.replace(pattern, () => {
        count++;
        return result.replacement;
      });
      snapshot();
    } else {
      const source = editor.value.slice(editor.selectionStart);
      const match = pattern.exec(source) || pattern.exec(editor.value);
      if (match) {
        const fromStart = !pattern.exec(source);
        const start = match.index + (fromStart ? 0 : editor.selectionStart);
        editor.setSelectionRange(start, start + match[0].length);
        changeSelection(result.replacement);
        count = 1;
      }
    }
    if (!count) await sys.dialog({
      title: 'Replace',
      message: `Cannot find "${lastFind}".`,
      buttons: [{
        label: 'OK',
        value: 'ok'
      }]
    });else if (result.all) await sys.dialog({
      title: 'Replace',
      message: `Replaced ${count} occurrence${count === 1 ? '' : 's'}.`,
      buttons: [{
        label: 'OK',
        value: 'ok'
      }]
    });
    editor.focus();
    update();
  }
  async function font() {
    const result = await formDialog(sys, {
      title: 'Font',
      fields: [{
        name: 'family',
        label: 'Font:',
        type: 'select',
        value: getSetting(sys, 'notepad.font', 'Lucida Console, monospace'),
        options: [{
          label: 'Lucida Console',
          value: 'Lucida Console, monospace'
        }, {
          label: 'Courier New',
          value: 'Courier New, monospace'
        }, {
          label: 'Arial',
          value: 'Arial, sans-serif'
        }, {
          label: 'Times New Roman',
          value: 'Times New Roman, serif'
        }]
      }, {
        name: 'size',
        label: 'Size (pixels):',
        type: 'number',
        min: 8,
        max: 48,
        value: parseFloat(editor.style.fontSize)
      }, {
        name: 'bold',
        label: 'Bold',
        type: 'checkbox',
        value: editor.style.fontWeight === 'bold'
      }, {
        name: 'italic',
        label: 'Italic',
        type: 'checkbox',
        value: editor.style.fontStyle === 'italic'
      }]
    });
    if (!result) return;
    const size = Math.min(48, Math.max(8, Number(result.size) || 13));
    editor.style.fontFamily = result.family;
    editor.style.fontSize = `${size}px`;
    editor.style.fontWeight = result.bold ? 'bold' : 'normal';
    editor.style.fontStyle = result.italic ? 'italic' : 'normal';
    setSetting(sys, 'notepad.font', result.family);
    setSetting(sys, 'notepad.fontSize', size);
    setSetting(sys, 'notepad.fontBold', result.bold);
    setSetting(sys, 'notepad.fontItalic', result.italic);
    editor.focus();
  }
  function toggleWrap() {
    wrap = !wrap;
    editor.wrap = wrap ? 'soft' : 'off';
    setSetting(sys, 'notepad.wrap', wrap);
    update();
    editor.focus();
  }
  const action = fn => safeAction(sys, fn, 'Notepad');
  sys.menuBar(win, [{
    label: 'File',
    items: [menuAction(sys, 'New', newDocument, 'Ctrl+N'), menuAction(sys, 'Open…', () => openDocument(), 'Ctrl+O'), menuAction(sys, 'Save', () => save(), 'Ctrl+S'), menuAction(sys, 'Save As…', () => save(true), 'Ctrl+Shift+S'), separator(), menuAction(sys, 'Download a Copy', () => sys.download(textForDisk(editor.value), path ? basename(path) : 'Untitled.txt', 'text/plain')), menuAction(sys, 'Print…', () => printDocument(sys, basename(path), `<pre>${esc(editor.value)}</pre>`), 'Ctrl+P'), separator(), menuAction(sys, 'Exit', () => win.close())]
  }, {
    label: 'Edit',
    items: [menuAction(sys, 'Undo', () => undo(), 'Ctrl+Z'), menuAction(sys, 'Redo', () => undo(true), 'Ctrl+Y'), separator(), menuAction(sys, 'Cut', () => clipboard('cut'), 'Ctrl+X'), menuAction(sys, 'Copy', () => clipboard('copy'), 'Ctrl+C'), menuAction(sys, 'Paste', () => clipboard('paste'), 'Ctrl+V'), menuAction(sys, 'Delete', () => changeSelection(''), 'Del'), separator(), menuAction(sys, 'Find…', () => find(), 'Ctrl+F'), menuAction(sys, 'Find Next', () => find(true), 'F3'), menuAction(sys, 'Replace…', replace, 'Ctrl+H'), separator(), menuAction(sys, 'Select All', () => {
      editor.focus();
      editor.select();
      update();
    }, 'Ctrl+A'), menuAction(sys, 'Time/Date', () => changeSelection(`${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })} ${new Date().toLocaleDateString()}`), 'F5')]
  }, {
    label: 'Format',
    items: [menuAction(sys, 'Word Wrap', toggleWrap), menuAction(sys, 'Font…', font)]
  }, {
    label: 'Help',
    items: [menuAction(sys, 'About Notepad', () => sys.dialog({
      title: 'About Notepad',
      message: 'Notepad\nA simple text editor for Windows 98.\n\nFiles are saved on your virtual C: drive.',
      icon: 'notepad',
      buttons: [{
        label: 'OK',
        value: 'ok'
      }]
    }))]
  }]);
  win.body.append(editor);
  status = sys.statusBar(win, 'Ln 1, Col 1');
  editor.addEventListener('input', snapshot);
  for (const type of ['click', 'keyup', 'select']) editor.addEventListener(type, update);
  listen(win, win.el, 'keydown', event => {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const commands = ctrl ? {
      n: newDocument,
      o: () => openDocument(),
      s: () => save(event.shiftKey),
      p: () => printDocument(sys, basename(path), `<pre>${esc(editor.value)}</pre>`),
      f: () => find(),
      h: replace,
      z: () => undo(event.shiftKey),
      y: () => undo(true)
    } : {};
    if (commands[key]) {
      event.preventDefault();
      event.stopPropagation();
      action(commands[key])();
    } else if (event.key === 'F3') {
      event.preventDefault();
      action(() => find(true, event.shiftKey))();
    } else if (event.key === 'F5') {
      event.preventDefault();
      changeSelection(`${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })} ${new Date().toLocaleDateString()}`);
    } else if (event.key === 'Tab' && event.target === editor) {
      event.preventDefault();
      changeSelection('\t');
    }
  });
  win.onBeforeClose = async () => {
    try {
      return await guard();
    } catch (error) {
      await errorDialog(sys, error, 'Notepad');
      return false;
    }
  };
  if (args.path) action(() => openDocument(args.path))();else {
    setText(args.content || '');
    if (args.content) savedText = '';
    update();
  }
  requestAnimationFrame(() => editor.focus());
  return win;
}

/* Imported rich text is rebuilt from an allowlist. Active content, external
   resources, event handlers and document metadata never enter the editor. */
export function sanitizeRichText(source) {
  const parsed = new DOMParser().parseFromString(String(source), 'text/html');
  const allowedTags = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'FONT', 'PRE', 'CODE', 'SUB', 'SUP', 'HR', 'TABLE', 'TBODY', 'THEAD', 'TR', 'TD', 'TH']);
  const discardTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'TEMPLATE', 'NOSCRIPT']);
  const allowedStyles = new Set(['font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'color', 'background-color', 'margin-left', 'line-height']);
  const fragment = document.createDocumentFragment();
  function clean(node, target) {
    if (node.nodeType === 3) {
      target.append(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== 1 || discardTags.has(node.tagName)) return;
    if (!allowedTags.has(node.tagName)) {
      for (const child of node.childNodes) clean(child, target);
      return;
    }
    const out = document.createElement(node.tagName.toLowerCase());
    for (const property of allowedStyles) {
      const value = node.style.getPropertyValue(property);
      if (value && !/url\s*\(|expression|javascript:|@import|\\/i.test(value)) out.style.setProperty(property, value);
    }
    if (node.tagName === 'FONT') {
      for (const attribute of ['face', 'size', 'color']) {
        const value = node.getAttribute(attribute);
        if (value && /^[\w\s,#.()%-]+$/.test(value)) out.setAttribute(attribute, value);
      }
    }
    if (['P', 'DIV', 'TD', 'TH'].includes(node.tagName) && /^(left|center|right|justify)$/.test(node.getAttribute('align'))) out.setAttribute('align', node.getAttribute('align'));
    for (const child of node.childNodes) clean(child, out);
    target.append(out);
  }
  for (const node of parsed.body.childNodes) clean(node, fragment);
  const wrapper = document.createElement('div');
  wrapper.append(fragment);
  return wrapper.innerHTML;
}
function createWordPad(sys, args = {}) {
  const win = sys.wm.create({
    title: 'Document - WordPad',
    icon: 'wordpad',
    width: 760,
    height: 550,
    minWidth: 400,
    minHeight: 300
  });
  win.el.classList.add('acc-wordpad');
  win.body.classList.add('acc-app-body');
  let path = null,
    savedHTML = '',
    selection = null;
  let saveQueue = Promise.resolve(),
    documentEpoch = 0;
  const page = element('div', 'acc-wordpad-page');
  page.contentEditable = 'true';
  page.spellcheck = true;
  page.setAttribute('role', 'textbox');
  page.setAttribute('aria-label', 'WordPad document');
  page.setAttribute('aria-multiline', 'true');
  page.style.fontFamily = 'Arial, sans-serif';
  page.style.fontSize = '14px';
  let status;
  const dirty = () => page.innerHTML !== savedHTML;
  const update = () => {
    win.setTitle(`${dirty() ? '*' : ''}${path ? basename(path) : 'Document'} - WordPad`);
    const text = page.innerText || '';
    if (status) status.textContent = `${text.trim() ? text.trim().split(/\s+/).length.toLocaleString() : 0} words    ${text.length.toLocaleString()} characters    ${path || 'Rich Text Document'}`;
    updateFormatting();
  };
  function rememberSelection() {
    const current = window.getSelection();
    if (current?.rangeCount && page.contains(current.getRangeAt(0).commonAncestorContainer)) selection = current.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    page.focus();
    if (selection && page.contains(selection.commonAncestorContainer)) {
      const current = window.getSelection();
      current.removeAllRanges();
      current.addRange(selection);
    }
  }
  function command(name, value) {
    restoreSelection();
    document.execCommand(name, false, value);
    rememberSelection();
    update();
  }
  const serialize = () => `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(path ? basename(path) : 'Document')}</title></head><body>${sanitizeRichText(page.innerHTML)}</body></html>`;
  function setDocument(html, target = null) {
    documentEpoch++;
    path = target;
    page.innerHTML = html;
    savedHTML = page.innerHTML;
    selection = null;
    update();
    page.focus();
  }
  function save(as = false) {
    const epoch = documentEpoch;
    const operation = saveQueue.then(async () => {
      if (epoch !== documentEpoch) return false;
      let target = path;
      if (as || !target) target = await sys.fileDialog({
        mode: 'save',
        path: dirname(path || 'C:/My Documents/Document.html'),
        filename: path ? basename(path) : 'Document.html',
        filter: '.html,.txt'
      });
      if (!target || epoch !== documentEpoch) return false;
      const plain = /\.txt$/i.test(target),
        snapshot = page.innerHTML;
      sys.vfs.write(target, plain ? page.innerText : serialize(), {
        mime: plain ? 'text/plain' : 'text/html'
      });
      await sys.vfs.flush();
      if (epoch === documentEpoch) {
        path = target;
        savedHTML = snapshot;
        update();
      }
      return true;
    });
    saveQueue = operation.catch(() => {});
    return operation;
  }
  const guard = async () => {
    await saveQueue;
    return confirmDocument(sys, dirty, path ? basename(path) : 'Document', save);
  };
  async function newDocument() {
    if (await guard()) setDocument('');
  }
  async function openDocument(givenPath) {
    if (!(await guard())) return;
    const target = givenPath || (await sys.fileDialog({
      mode: 'open',
      path: dirname(path || 'C:/My Documents/Document.html'),
      filter: '.html,.htm,.txt'
    }));
    if (!target) return;
    const text = sys.vfs.read(target);
    if (text === null || text === undefined) throw new Error(`Cannot open ${target}. The file does not exist.`);
    const html = /\.html?$/i.test(target) || sys.vfs.stat(target)?.mime === 'text/html';
    setDocument(html ? sanitizeRichText(text) : `<div>${esc(text).replace(/\n/g, '<br>')}</div>`, target);
  }
  async function clipboard(name) {
    restoreSelection();
    if (name !== 'paste') {
      if (document.execCommand(name)) {
        update();
        return;
      }
      const text = window.getSelection()?.toString() || '';
      if (!text) return;
      await navigator.clipboard.writeText(text);
      if (name === 'cut') command('delete');
      return;
    }
    let value;
    try {
      value = await navigator.clipboard.readText();
    } catch {
      value = await sys.prompt({
        title: 'Paste',
        message: 'Paste the text you want to insert:',
        value: ''
      });
    }
    if (value !== null && value !== undefined) command('insertText', value);
  }
  async function findText() {
    rememberSelection();
    const needle = await sys.prompt({
      title: 'Find',
      message: 'Find what:',
      value: ''
    });
    if (!needle) return;
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let all = '',
      node;
    while (node = walker.nextNode()) {
      nodes.push({
        node,
        start: all.length
      });
      all += node.textContent;
    }
    let offset = 0;
    if (selection) {
      const prefix = document.createRange();
      prefix.selectNodeContents(page);
      prefix.setEnd(selection.endContainer, selection.endOffset);
      offset = prefix.toString().length;
    }
    let index = all.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase(), offset);
    if (index < 0) index = all.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
    if (index < 0) {
      await sys.dialog({
        title: 'WordPad',
        message: `Cannot find "${needle}".`,
        buttons: [{
          label: 'OK',
          value: 'ok'
        }]
      });
      return;
    }
    const start = nodes.find(item => index >= item.start && index < item.start + item.node.textContent.length);
    const end = nodes.find(item => index + needle.length > item.start && index + needle.length <= item.start + item.node.textContent.length);
    if (start && end) {
      const range = document.createRange();
      range.setStart(start.node, index - start.start);
      range.setEnd(end.node, index + needle.length - end.start);
      selection = range;
      restoreSelection();
      start.node.parentElement.scrollIntoView({
        block: 'nearest'
      });
    }
  }
  const action = fn => safeAction(sys, fn, 'WordPad');
  sys.menuBar(win, [{
    label: 'File',
    items: [menuAction(sys, 'New', newDocument, 'Ctrl+N'), menuAction(sys, 'Open…', () => openDocument(), 'Ctrl+O'), menuAction(sys, 'Save', () => save(), 'Ctrl+S'), menuAction(sys, 'Save As…', () => save(true), 'Ctrl+Shift+S'), separator(), menuAction(sys, 'Download a Copy', () => sys.download(serialize(), path ? basename(path).replace(/\.txt$/i, '.html') : 'Document.html', 'text/html')), menuAction(sys, 'Print…', () => printDocument(sys, path ? basename(path) : 'Document', sanitizeRichText(page.innerHTML)), 'Ctrl+P'), separator(), menuAction(sys, 'Exit', () => win.close())]
  }, {
    label: 'Edit',
    items: [menuAction(sys, 'Undo', () => command('undo'), 'Ctrl+Z'), menuAction(sys, 'Redo', () => command('redo'), 'Ctrl+Y'), separator(), menuAction(sys, 'Cut', () => clipboard('cut'), 'Ctrl+X'), menuAction(sys, 'Copy', () => clipboard('copy'), 'Ctrl+C'), menuAction(sys, 'Paste', () => clipboard('paste'), 'Ctrl+V'), separator(), menuAction(sys, 'Find…', findText, 'Ctrl+F'), menuAction(sys, 'Select All', () => command('selectAll'), 'Ctrl+A')]
  }, {
    label: 'View',
    items: [menuAction(sys, 'Toolbar', () => {
      toolbar.hidden = !toolbar.hidden;
    }), menuAction(sys, 'Format Bar', () => {
      formatbar.hidden = !formatbar.hidden;
    }), menuAction(sys, 'Ruler', () => {
      ruler.hidden = !ruler.hidden;
    })]
  }, {
    label: 'Insert',
    items: [menuAction(sys, 'Date and Time', () => command('insertText', new Date().toLocaleString())), menuAction(sys, 'Horizontal Line', () => command('insertHorizontalRule'))]
  }, {
    label: 'Format',
    items: [menuAction(sys, 'Bold', () => command('bold'), 'Ctrl+B'), menuAction(sys, 'Italic', () => command('italic'), 'Ctrl+I'), menuAction(sys, 'Underline', () => command('underline'), 'Ctrl+U'), separator(), menuAction(sys, 'Bullets', () => command('insertUnorderedList')), menuAction(sys, 'Numbering', () => command('insertOrderedList')), menuAction(sys, 'Increase Indent', () => command('indent')), menuAction(sys, 'Decrease Indent', () => command('outdent')), separator(), menuAction(sys, 'Align Left', () => command('justifyLeft'), 'Ctrl+L'), menuAction(sys, 'Center', () => command('justifyCenter'), 'Ctrl+E'), menuAction(sys, 'Align Right', () => command('justifyRight'), 'Ctrl+R'), menuAction(sys, 'Remove Formatting', () => command('removeFormat'))]
  }, {
    label: 'Help',
    items: [menuAction(sys, 'About WordPad', () => sys.dialog({
      title: 'About WordPad',
      icon: 'wordpad',
      message: 'WordPad\nCreate and edit formatted documents.\n\nDocuments save as HTML, or plain text when the filename ends in .txt.',
      buttons: [{
        label: 'OK',
        value: 'ok'
      }]
    }))]
  }]);
  const toolbar = element('div', 'toolbar acc-wordpad-toolbar');
  for (const [label, title, fn] of [['▯', 'New document', newDocument], ['📂', 'Open document', () => openDocument()], ['▣', 'Save document', () => save()], ['▤', 'Print document', () => printDocument(sys, path ? basename(path) : 'Document', sanitizeRichText(page.innerHTML))], ['✂', 'Cut', () => clipboard('cut')], ['▱', 'Copy', () => clipboard('copy')], ['▣', 'Paste', () => clipboard('paste')], ['↶', 'Undo', () => command('undo')], ['↷', 'Redo', () => command('redo')]]) toolbar.append(toolButton(label, title, action(fn)));
  const formatbar = element('div', 'toolbar acc-wordpad-formatbar');
  const fonts = element('select', 'acc-input acc-font-select');
  fonts.setAttribute('aria-label', 'Font');
  for (const family of ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Tahoma', 'Comic Sans MS']) {
    const option = element('option', '', family);
    option.value = family;
    fonts.append(option);
  }
  const sizes = element('select', 'acc-input acc-size-select');
  sizes.setAttribute('aria-label', 'Font size');
  for (const size of [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]) {
    const option = element('option', '', size);
    option.value = size;
    sizes.append(option);
  }
  sizes.value = '11';
  fonts.addEventListener('change', () => command('fontName', fonts.value));
  sizes.addEventListener('change', () => {
    restoreSelection();
    document.execCommand('fontSize', false, '7');
    for (const font of page.querySelectorAll('font[size="7"]')) {
      font.removeAttribute('size');
      font.style.fontSize = `${sizes.value}pt`;
    }
    rememberSelection();
    update();
  });
  formatbar.append(fonts, sizes);
  const formatButtons = new Map();
  for (const [label, title, name, className] of [['B', 'Bold', 'bold', 'acc-bold'], ['I', 'Italic', 'italic', 'acc-italic'], ['U', 'Underline', 'underline', 'acc-underline'], ['≡', 'Align left', 'justifyLeft', ''], ['☰', 'Center', 'justifyCenter', ''], ['≡', 'Align right', 'justifyRight', ''], ['• ≡', 'Bullets', 'insertUnorderedList', ''], ['1.', 'Numbering', 'insertOrderedList', '']]) {
    const button = toolButton(label, title, () => command(name), className);
    formatButtons.set(name, button);
    formatbar.append(button);
  }
  const color = element('input', 'acc-wordpad-color');
  color.type = 'color';
  color.value = '#000000';
  color.title = 'Text color';
  color.setAttribute('aria-label', 'Text color');
  color.addEventListener('input', () => command('foreColor', color.value));
  formatbar.append(color);
  function updateFormatting() {
    if (!window.getSelection()?.anchorNode || !page.contains(window.getSelection().anchorNode)) return;
    for (const [name, button] of formatButtons) {
      try {
        const active = document.queryCommandState(name);
        button.classList.toggle('acc-pressed', active);
        button.setAttribute('aria-pressed', String(active));
      } catch {/* Unsupported legacy command states do not prevent editing. */}
    }
    const value = String(document.queryCommandValue('fontName') || '').replace(/["']/g, '');
    if ([...fonts.options].some(option => option.value.toLowerCase() === value.toLowerCase())) fonts.value = [...fonts.options].find(option => option.value.toLowerCase() === value.toLowerCase()).value;
  }
  for (const bar of [toolbar, formatbar]) bar.addEventListener('mousedown', event => {
    rememberSelection();
    if (event.target.closest('button')) event.preventDefault();
  });
  const ruler = element('div', 'acc-wordpad-ruler');
  for (let i = 0; i <= 7; i++) ruler.append(element('span', '', i ? String(i) : ''));
  const scroll = element('div', 'acc-wordpad-scroll');
  scroll.append(page);
  win.body.append(toolbar, formatbar, ruler, scroll);
  status = sys.statusBar(win, 'Rich Text Document');
  page.addEventListener('input', update);
  page.addEventListener('keyup', () => {
    rememberSelection();
    update();
  });
  page.addEventListener('mouseup', () => {
    rememberSelection();
    update();
  });
  page.addEventListener('paste', event => {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain');
    if (html) command('insertHTML', sanitizeRichText(html));else if (text) command('insertText', text);
  });
  page.addEventListener('drop', event => {
    event.preventDefault();
    const text = event.dataTransfer?.getData('text/plain');
    if (text) command('insertText', text);
  });
  listen(win, win.el, 'keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const shortcuts = {
      n: newDocument,
      o: () => openDocument(),
      s: () => save(event.shiftKey),
      p: () => printDocument(sys, path ? basename(path) : 'Document', sanitizeRichText(page.innerHTML)),
      f: findText,
      b: () => command('bold'),
      i: () => command('italic'),
      u: () => command('underline'),
      l: () => command('justifyLeft'),
      e: () => command('justifyCenter'),
      r: () => command('justifyRight')
    };
    const fn = shortcuts[event.key.toLowerCase()];
    if (fn) {
      event.preventDefault();
      event.stopPropagation();
      action(fn)();
    }
  });
  win.onBeforeClose = async () => {
    try {
      return await guard();
    } catch (error) {
      await errorDialog(sys, error, 'WordPad');
      return false;
    }
  };
  if (args.path) action(() => openDocument(args.path))();else {
    setDocument(args.html ? sanitizeRichText(args.html) : args.content ? `<div>${esc(args.content).replace(/\n/g, '<br>')}</div>` : '');
    if (args.html || args.content) savedHTML = '';
    update();
  }
  requestAnimationFrame(() => page.focus());
  return win;
}
const operatorLabel = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  mod: 'mod',
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
  shift: 'Lsh'
};
export class CalculatorEngine {
  constructor() {
    this.memory = 0;
    this.angle = 'deg';
    this.inverse = false;
    this.hyperbolic = false;
    this.clear();
  }
  clear() {
    this.entry = '0';
    this.accumulator = null;
    this.operator = null;
    this.waiting = true;
    this.awaitingOperand = false;
    this.repeatOperator = null;
    this.repeatOperand = null;
    this.error = null;
    this.expression = '';
  }
  get value() {
    return Number(this.entry);
  }
  static format(value) {
    if (!Number.isFinite(value)) throw new Error(Number.isNaN(value) ? 'Invalid input for function' : 'Cannot divide by zero or overflow');
    if (Object.is(value, -0)) return '0';
    return String(Number(value.toPrecision(14)));
  }
  result(value, waiting = true) {
    this.entry = CalculatorEngine.format(value);
    this.waiting = waiting;
    this.awaitingOperand = false;
    this.error = null;
    return value;
  }
  digit(value) {
    if (this.error) this.clear();
    if (this.waiting) {
      this.entry = '0';
      this.waiting = false;
    }
    this.awaitingOperand = false;
    if (value === '.') {
      if (!this.entry.includes('.')) this.entry += '.';
      return;
    }
    if (this.entry.replace(/[-.]/g, '').length >= 15) return;
    this.entry = this.entry === '0' ? value : this.entry === '-0' ? `-${value}` : this.entry + value;
  }
  backspace() {
    if (this.error) {
      this.clear();
      return;
    }
    if (this.waiting) return;
    this.entry = this.entry.length > 1 ? this.entry.slice(0, -1) : '0';
    if (this.entry === '-') this.entry = '0';
  }
  clearEntry() {
    this.entry = '0';
    this.waiting = false;
    this.awaitingOperand = false;
    this.error = null;
  }
  sign() {
    if (!this.error) {
      this.entry = this.entry.startsWith('-') ? this.entry.slice(1) : `-${this.entry}`;
      this.waiting = false;
      this.awaitingOperand = false;
    }
  }
  static calculate(left, right, op) {
    switch (op) {
      case 'add':
        return left + right;
      case 'subtract':
        return left - right;
      case 'multiply':
        return left * right;
      case 'divide':
        if (right === 0) throw new Error('Cannot divide by zero');
        return left / right;
      case 'power':
        return left ** right;
      case 'mod':
        if (right === 0) throw new Error('Cannot divide by zero');
        return left % right;
      case 'and':
        return left & right;
      case 'or':
        return left | right;
      case 'xor':
        return left ^ right;
      case 'shift':
        return left << right;
      default:
        return right;
    }
  }
  binary(op) {
    if (this.error) return;
    if (this.operator && !this.awaitingOperand) this.result(CalculatorEngine.calculate(this.accumulator, this.value, this.operator));
    this.accumulator = this.value;
    this.operator = op;
    this.waiting = true;
    this.awaitingOperand = true;
    this.repeatOperator = null;
    this.repeatOperand = null;
    this.expression = `${CalculatorEngine.format(this.accumulator)} ${operatorLabel[op] || op}`;
  }
  equals() {
    if (this.error) return;
    if (this.operator) {
      const right = this.awaitingOperand ? this.accumulator : this.value;
      this.repeatOperator = this.operator;
      this.repeatOperand = right;
      this.expression = `${CalculatorEngine.format(this.accumulator)} ${operatorLabel[this.operator]} ${CalculatorEngine.format(right)} =`;
      this.result(CalculatorEngine.calculate(this.accumulator, right, this.operator));
      this.operator = null;
      this.accumulator = null;
    } else if (this.repeatOperator) {
      this.expression = `${this.entry} ${operatorLabel[this.repeatOperator]} ${CalculatorEngine.format(this.repeatOperand)} =`;
      this.result(CalculatorEngine.calculate(this.value, this.repeatOperand, this.repeatOperator));
    }
    this.waiting = true;
  }
  percent() {
    const value = this.operator === 'add' || this.operator === 'subtract' ? this.accumulator * this.value / 100 : this.value / 100;
    this.result(value);
  }
  unary(name) {
    const value = this.value;
    const unit = this.angle === 'deg' ? Math.PI / 180 : this.angle === 'grad' ? Math.PI / 200 : 1;
    let result;
    switch (name) {
      case 'sqrt':
        if (value < 0) throw new Error('Invalid input for function');
        result = Math.sqrt(value);
        break;
      case 'reciprocal':
        if (value === 0) throw new Error('Cannot divide by zero');
        result = 1 / value;
        break;
      case 'square':
        result = this.inverse ? Math.sqrt(value) : value * value;
        break;
      case 'cube':
        result = this.inverse ? Math.cbrt(value) : value ** 3;
        break;
      case 'log':
        result = this.inverse ? 10 ** value : Math.log10(value);
        break;
      case 'ln':
        result = this.inverse ? Math.exp(value) : Math.log(value);
        break;
      case 'exp':
        result = Math.exp(value);
        break;
      case 'tenPower':
        result = 10 ** value;
        break;
      case 'sin':
      case 'cos':
      case 'tan':
        {
          const method = `${this.inverse ? 'a' : ''}${name}${this.hyperbolic ? 'h' : ''}`;
          const input = this.hyperbolic || this.inverse ? value : value * unit;
          if (name === 'tan' && !this.hyperbolic && !this.inverse && Math.abs(Math.cos(input)) < 1e-14) throw new Error('Invalid input for function');
          result = Math[method](input);
          if (this.inverse && !this.hyperbolic) result /= unit;
          if (Math.abs(result) < 1e-14) result = 0;
          break;
        }
      case 'factorial':
        {
          if (value < 0 || !Number.isInteger(value)) throw new Error('Factorial requires a non-negative integer');
          if (value > 170) throw new Error('Overflow');
          result = 1;
          for (let i = 2; i <= value; i++) result *= i;
          break;
        }
      case 'integer':
        result = this.inverse ? value - Math.trunc(value) : Math.trunc(value);
        break;
      case 'not':
        result = ~Math.trunc(value);
        break;
      case 'pi':
        result = Math.PI;
        break;
      case 'dms':
        {
          const sign = Math.sign(value),
            abs = Math.abs(value),
            whole = Math.trunc(abs);
          if (this.inverse) {
            const minutes = Math.floor((abs - whole) * 100 + 1e-8),
              seconds = ((abs - whole) * 100 - minutes) * 100;
            result = sign * (whole + minutes / 60 + seconds / 3600);
          } else {
            const minutes = Math.floor((abs - whole) * 60),
              seconds = ((abs - whole) * 60 - minutes) * 60;
            result = sign * (whole + minutes / 100 + seconds / 10000);
          }
          break;
        }
      default:
        throw new Error(`Unknown function: ${name}`);
    }
    this.expression = `${name}(${this.entry})`;
    this.result(result);
  }
  memoryCommand(command) {
    if (command === 'mc') this.memory = 0;else if (command === 'mr') this.result(this.memory);else if (command === 'ms') this.memory = this.value;else if (command === 'mplus') this.memory += this.value;else if (command === 'mminus') this.memory -= this.value;
    if (!Number.isFinite(this.memory)) {
      this.memory = 0;
      throw new Error('Memory overflow');
    }
  }
  press(key) {
    try {
      if (/^[0-9.]$/.test(key)) this.digit(key);else if (Object.hasOwn(operatorLabel, key)) this.binary(key);else if (key === 'equals') this.equals();else if (key === 'clear') this.clear();else if (key === 'ce') this.clearEntry();else if (key === 'back') this.backspace();else if (key === 'sign') this.sign();else if (key === 'percent') this.percent();else if (['mc', 'mr', 'ms', 'mplus', 'mminus'].includes(key)) this.memoryCommand(key);else this.unary(key);
    } catch (error) {
      this.error = error.message;
      this.waiting = true;
    }
    return this.error || this.entry;
  }
}
function createCalculator(sys) {
  let scientific = getSetting(sys, 'calculator.scientific', false);
  const win = sys.wm.create({
    title: 'Calculator',
    icon: 'calculator',
    width: scientific ? 590 : 310,
    height: scientific ? 418 : 370,
    minWidth: 300,
    minHeight: 355
  });
  win.el.classList.add('acc-calculator');
  win.body.classList.add('acc-app-body');
  const engine = new CalculatorEngine();
  engine.angle = getSetting(sys, 'calculator.angle', 'deg');
  let root, expression, display, memoryFlag, sciPad;
  const stats = [];
  const statsLine = element('div', 'acc-calc-statline');
  function update() {
    display.value = engine.error || engine.entry;
    display.classList.toggle('acc-calc-error', Boolean(engine.error));
    expression.textContent = engine.expression || '\u00a0';
    memoryFlag.textContent = engine.memory !== 0 ? 'M' : '';
    statsLine.textContent = `Statistics: ${stats.length} value${stats.length === 1 ? '' : 's'}`;
  }
  function press(key) {
    engine.press(key);
    update();
  }
  function setMode(value) {
    scientific = value;
    sciPad.hidden = !value;
    root.classList.toggle('acc-calc-scientific', value);
    const area = sys.wm.bounds?.() || {
      width: window.innerWidth - 16,
      height: window.innerHeight - 30
    };
    const width = Math.min(value ? 590 : 310, area.width),
      height = Math.min(value ? 418 : 370, area.height);
    if (win.rect && sys.wm.applyRect) {
      if (win.maximized && win.restoreRect) win.restoreRect = {
        ...win.restoreRect,
        width,
        height
      };else {
        win.rect = {
          ...win.rect,
          width,
          height,
          x: Math.max(0, Math.min(win.rect.x, area.width - width)),
          y: Math.max(0, Math.min(win.rect.y, area.height - height))
        };
        sys.wm.applyRect(win);
      }
    } else {
      win.el.style.width = `${width}px`;
      win.el.style.height = `${height}px`;
    }
    setSetting(sys, 'calculator.scientific', value);
  }
  async function paste() {
    let value;
    try {
      value = await navigator.clipboard.readText();
    } catch {
      value = await sys.prompt({
        title: 'Calculator',
        message: 'Enter a number to paste:',
        value: ''
      });
    }
    if (value === null || value === undefined) return;
    const normalized = value.trim().replace(/,/g, '');
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(normalized)) throw new Error('The clipboard does not contain a valid number.');
    engine.result(Number(normalized), false);
    update();
  }
  async function copy() {
    display.focus();
    display.select();
    try {
      await navigator.clipboard.writeText(display.value);
    } catch {
      if (!document.execCommand('copy')) throw new Error('Select the calculator display and press Ctrl+C.');
    }
  }
  sys.menuBar(win, [{
    label: 'Edit',
    items: [menuAction(sys, 'Copy', copy, 'Ctrl+C'), menuAction(sys, 'Paste', paste, 'Ctrl+V')]
  }, {
    label: 'View',
    items: [menuAction(sys, 'Standard', () => setMode(false)), menuAction(sys, 'Scientific', () => setMode(true))]
  }, {
    label: 'Help',
    items: [menuAction(sys, 'Help Topics', () => sys.dialog({
      title: 'Calculator Help',
      message: 'Type numbers and use +, -, *, / and Enter.\nBackspace removes the last digit. Delete clears the current entry; Esc clears the calculation.\n\nScientific mode includes trigonometry, powers, logarithms, integer and bitwise functions, and statistics. Inv selects inverse functions; Hyp selects hyperbolic functions.\n\nStatistics: Dat stores the displayed value; Ave, Sum and σ calculate the mean, sum and population standard deviation. C.Data clears the list.\n\nBinary operations are applied in entry order, as on a desktop calculator.',
      buttons: [{
        label: 'OK',
        value: 'ok'
      }]
    })), menuAction(sys, 'About Calculator', () => sys.dialog({
      title: 'About Calculator',
      icon: 'calculator',
      message: 'Calculator\nStandard and Scientific modes\n\n15-digit entry · 14-digit result precision',
      buttons: [{
        label: 'OK',
        value: 'ok'
      }]
    }))]
  }]);
  root = element('div', 'acc-calc-content');
  expression = element('div', 'acc-calc-expression');
  display = element('input', 'sunken acc-calc-display');
  display.readOnly = true;
  display.value = '0';
  display.setAttribute('aria-label', 'Calculator display');
  display.setAttribute('aria-live', 'polite');
  const displayRow = element('div', 'acc-calc-display-row');
  memoryFlag = element('span', 'acc-calc-memory');
  displayRow.append(memoryFlag, display);
  root.append(expression, displayRow);
  const area = element('div', 'acc-calc-area');
  sciPad = element('div', 'acc-calc-science');
  const angleBar = element('div', 'acc-calc-angle');
  for (const [label, value] of [['Deg', 'deg'], ['Rad', 'rad'], ['Grad', 'grad']]) {
    const wrap = element('label');
    const radio = element('input');
    radio.type = 'radio';
    radio.name = `calc-angle-${win.id}`;
    radio.value = value;
    radio.checked = engine.angle === value;
    radio.addEventListener('change', () => {
      engine.angle = value;
      setSetting(sys, 'calculator.angle', value);
    });
    wrap.append(radio, document.createTextNode(label));
    angleBar.append(wrap);
  }
  sciPad.append(angleBar);
  const toggles = element('div', 'acc-calc-toggles');
  for (const [label, property] of [['Inv', 'inverse'], ['Hyp', 'hyperbolic']]) {
    const wrap = element('label');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      engine[property] = checkbox.checked;
    });
    wrap.append(checkbox, document.createTextNode(label));
    toggles.append(wrap);
  }
  sciPad.append(toggles);
  const scienceGrid = element('div', 'acc-calc-science-grid');
  for (const [label, key, title] of [['sin', 'sin', 'Sine; Inv: arcsine'], ['cos', 'cos', 'Cosine; Inv: arccosine'], ['tan', 'tan', 'Tangent; Inv: arctangent'], ['π', 'pi', 'Pi'], ['x²', 'square', 'Square; Inv: square root'], ['x³', 'cube', 'Cube; Inv: cube root'], ['xʸ', 'power', 'Raise x to the power y'], ['n!', 'factorial', 'Factorial'], ['log', 'log', 'Base 10 logarithm; Inv: 10 to the x'], ['ln', 'ln', 'Natural logarithm; Inv: exponential'], ['dms', 'dms', 'Degrees to degrees.minutesseconds; Inv: decimal degrees'], ['Int', 'integer', 'Integer part; Inv: fractional part'], ['Mod', 'mod', 'Remainder'], ['And', 'and', 'Bitwise AND (32-bit)'], ['Or', 'or', 'Bitwise OR (32-bit)'], ['Xor', 'xor', 'Bitwise exclusive OR (32-bit)'], ['Not', 'not', 'Bitwise NOT (32-bit)'], ['Lsh', 'shift', 'Left bit shift (32-bit)']]) scienceGrid.append(toolButton(label, title, () => press(key), 'acc-calc-key acc-calc-function'));
  sciPad.append(scienceGrid);
  const statsBar = element('div', 'acc-calc-stats');
  for (const [label, fn] of [['Dat', () => {
    if (!engine.error) stats.push(engine.value);
  }], ['Ave', () => {
    if (!stats.length) throw new Error('No statistical data');
    engine.result(stats.reduce((a, b) => a + b, 0) / stats.length);
  }], ['Sum', () => engine.result(stats.reduce((a, b) => a + b, 0))], ['σ', () => {
    if (!stats.length) throw new Error('No statistical data');
    const mean = stats.reduce((a, b) => a + b, 0) / stats.length;
    engine.result(Math.sqrt(stats.reduce((sum, n) => sum + (n - mean) ** 2, 0) / stats.length));
  }], ['C.Data', () => {
    stats.length = 0;
  }]]) statsBar.append(toolButton(label, label, () => {
    try {
      fn();
    } catch (error) {
      engine.error = error.message;
    }
    update();
  }, 'acc-calc-key'));
  sciPad.append(statsBar, statsLine);
  const standard = element('div', 'acc-calc-standard');
  const clears = element('div', 'acc-calc-clears');
  for (const [label, key] of [['Backspace', 'back'], ['CE', 'ce'], ['C', 'clear']]) clears.append(toolButton(label, label, () => press(key), 'acc-calc-key acc-calc-red'));
  standard.append(clears);
  const keypadRow = element('div', 'acc-calc-keypad-row');
  const memory = element('div', 'acc-calc-memory-keys');
  for (const [label, key, title] of [['MC', 'mc', 'Clear memory'], ['MR', 'mr', 'Recall memory'], ['MS', 'ms', 'Store in memory'], ['M+', 'mplus', 'Add to memory'], ['M−', 'mminus', 'Subtract from memory']]) memory.append(toolButton(label, title, () => press(key), 'acc-calc-key acc-calc-red'));
  const keypad = element('div', 'acc-calc-keypad');
  for (const [label, key] of [['7', '7'], ['8', '8'], ['9', '9'], ['/', 'divide'], ['sqrt', 'sqrt'], ['4', '4'], ['5', '5'], ['6', '6'], ['*', 'multiply'], ['%', 'percent'], ['1', '1'], ['2', '2'], ['3', '3'], ['−', 'subtract'], ['1/x', 'reciprocal'], ['0', '0'], ['+/−', 'sign'], ['.', '.'], ['+', 'add'], ['=', 'equals']]) keypad.append(toolButton(label, label, () => press(key), `acc-calc-key ${/^\d$/.test(key) ? 'acc-calc-digit' : 'acc-calc-red'}`));
  keypadRow.append(memory, keypad);
  standard.append(keypadRow);
  area.append(sciPad, standard);
  root.append(area);
  win.body.append(root);
  listen(win, win.el, 'keydown', event => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        safeAction(sys, copy, 'Calculator')();
      } else if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        safeAction(sys, paste, 'Calculator')();
      }
      return;
    }
    if (event.target.matches('input[type="radio"],input[type="checkbox"]') && [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const map = {
      '+': 'add',
      '-': 'subtract',
      '*': 'multiply',
      '/': 'divide',
      'Enter': 'equals',
      '=': 'equals',
      'Escape': 'clear',
      'Delete': 'ce',
      'Backspace': 'back',
      '%': 'percent',
      'F9': 'sign',
      '@': 'sqrt',
      ',': '.'
    };
    const key = /^[0-9.]$/.test(event.key) ? event.key : map[event.key];
    if (key) {
      event.preventDefault();
      event.stopPropagation();
      press(key);
    }
  });
  setMode(scientific);
  update();
  requestAnimationFrame(() => display.focus());
  return win;
}
export function parseDOSLine(input) {
  const tokens = [];
  let current = '',
    quoted = false,
    quote = '',
    present = false;
  const flush = () => {
    if (present) {
      tokens.push({
        type: 'word',
        value: current
      });
      current = '';
      present = false;
    }
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '^' && i + 1 < input.length) {
      current += input[++i];
      present = true;
      continue;
    }
    if (quoted) {
      if (char === quote) {
        quoted = false;
      } else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quoted = true;
      quote = char;
      present = true;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === '>' || char === '<' || char === '|') {
      flush();
      const value = char === '>' && input[i + 1] === '>' ? (i++, '>>') : char;
      tokens.push({
        type: value === '|' ? 'pipe' : 'redirect',
        value
      });
      continue;
    }
    current += char;
    present = true;
  }
  if (quoted) throw new Error('The quoted path is missing its closing quotation mark.');
  flush();
  return tokens;
}
const wildcardPattern = value => new RegExp(`^${value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
const dosPath = value => value.replace(/\//g, '\\');
const pad = (value, length) => String(value).padEnd(length, ' ');
export class VirtualDOS {
  constructor(sys, options = {}) {
    this.sys = sys;
    this.vfs = sys.vfs;
    this.cwd = 'C:/';
    this.env = {
      COMSPEC: 'C:\\WINDOWS\\COMMAND.COM',
      WINDIR: 'C:\\WINDOWS',
      PATH: 'C:\\WINDOWS;C:\\WINDOWS\\COMMAND',
      TEMP: 'C:\\WINDOWS\\TEMP',
      OS: 'Windows_98'
    };
    this.echoEnabled = true;
    this.onClear = options.onClear || (() => {});
    this.onExit = options.onExit || (() => {});
    this.attributes = new Map(Object.entries(getSetting(sys, 'command.attributes', {})));
    if (options.path) {
      const path = this.resolve(options.path);
      if (this.vfs.stat(path)?.type === 'directory') this.cwd = path;
    }
  }
  expand(value) {
    return value.replace(/%([^%]+)%/g, (match, key) => key.toUpperCase() === 'CD' ? dosPath(this.cwd) : this.env[key.toUpperCase()] ?? match);
  }
  resolve(value = '.') {
    value = this.expand(String(value)).replace(/\\/g, '/');
    let source;
    if (/^[a-z]:/i.test(value)) source = `${value[0].toUpperCase()}:/${value.slice(2).replace(/^\/+/, '')}`;else if (value.startsWith('/')) source = `${this.cwd.slice(0, 2)}${value}`;else source = `${this.cwd.replace(/\/$/, '')}/${value}`;
    const drive = source.slice(0, 2).toUpperCase(),
      parts = [];
    for (const segment of source.slice(2).split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') parts.pop();else parts.push(segment);
    }
    let path = `${drive}/`;
    for (const segment of parts) {
      let actual = segment;
      try {
        actual = this.vfs.list(path).find(entry => entry.name.toLocaleLowerCase() === segment.toLocaleLowerCase())?.name || segment;
      } catch {/* Missing segments remain usable for new paths. */}
      path = `${path.replace(/\/$/, '')}/${actual}`;
    }
    return path;
  }
  entries(value = '.', recursive = false) {
    const path = this.resolve(value),
      stat = this.vfs.stat(path);
    if (stat?.type === 'file') return [{
      ...stat,
      name: basename(path),
      path
    }];
    let parent = path,
      pattern = null;
    if (!stat && /[*?]/.test(basename(path))) {
      parent = dirname(path);
      pattern = wildcardPattern(basename(path) === '*.*' ? '*' : basename(path));
    }
    if (this.vfs.stat(parent)?.type !== 'directory') throw new Error('File not found.');
    const found = [];
    const walk = (directory, depth = 0) => {
      if (depth > 40 || found.length > 10000) throw new Error('Directory listing is too large.');
      for (const entry of this.vfs.list(directory)) {
        if (!pattern || pattern.test(entry.name)) found.push(entry);
        if (recursive && entry.type === 'directory') walk(entry.path, depth + 1);
      }
    };
    walk(parent);
    return found;
  }
  ensureDirectory(path) {
    if (this.vfs.stat(path)?.type !== 'directory') throw new Error(`The system cannot find the path specified: ${dosPath(path)}`);
  }
  async flush() {
    await this.vfs.flush();
  }
  async execute(line, input = '') {
    if (!line.trim()) return '';
    const tokens = parseDOSLine(line);
    const groups = [[]];
    for (const token of tokens) {
      if (token.type === 'pipe') groups.push([]);else groups.at(-1).push(token);
    }
    let output = input;
    for (const group of groups) {
      if (!group.length) throw new Error('The syntax of the command is incorrect.');
      const words = [];
      let target = null,
        append = false,
        source = null;
      for (let i = 0; i < group.length; i++) {
        const token = group[i];
        if (token.type === 'redirect') {
          const next = group[++i];
          if (!next || next.type !== 'word') throw new Error('A file name is required for redirection.');
          if (token.value === '<') source = this.resolve(next.value);else {
            target = this.resolve(next.value);
            append = token.value === '>>';
          }
        } else words.push(this.expand(token.value));
      }
      if (!words.length) throw new Error('A command is required.');
      if (source) {
        output = this.vfs.read(source);
        if (output === null || output === undefined) throw new Error('The input file does not exist.');
      }
      output = await this.command(words, output);
      if (target) {
        this.ensureDirectory(dirname(target));
        const old = append ? this.vfs.read(target) || '' : '';
        this.vfs.write(target, `${old}${output}${output && !output.endsWith('\n') ? '\r\n' : ''}`, {
          mime: 'text/plain'
        });
        await this.flush();
        output = '';
      }
    }
    return output;
  }
  async command(words, input = '') {
    let command = words.shift().toLowerCase();
    if (/^(cd|chdir)\.\.?$/.test(command)) {
      words.unshift(command.slice(command.startsWith('chdir') ? 5 : 2));
      command = 'cd';
    }
    if (/^(dir|cd|chdir)\//.test(command)) {
      const index = command.indexOf('/');
      words.unshift(command.slice(index));
      command = command.slice(0, index);
    }
    const switches = words.filter(word => /^\/[a-z?]/i.test(word));
    const args = words.filter(word => !/^\/[a-z?]/i.test(word));
    const flag = value => switches.some(word => word.toLowerCase() === value.toLowerCase());
    if (flag('/?')) return this.help(command);
    if (/^[a-z]:$/.test(command)) {
      const path = `${command[0].toUpperCase()}:/`;
      this.ensureDirectory(path);
      this.cwd = path;
      return '';
    }
    switch (command) {
      case 'help':
        return this.help(args[0]);
      case 'ver':
        return 'Microsoft Windows 98 [Version 4.10.1998]\nBrowser virtual filesystem command interpreter';
      case 'vol':
        return ' Volume in drive C is WINDOWS98\n Volume Serial Number is 1998-0615';
      case 'cls':
        this.onClear();
        return '';
      case 'exit':
        this.onExit();
        return '';
      case 'rem':
        return '';
      case 'cd':
      case 'chdir':
        {
          if (!args.length) return dosPath(this.cwd);
          const target = this.resolve(args.join(' '));
          this.ensureDirectory(target);
          this.cwd = target;
          return '';
        }
      case 'dir':
        {
          const target = args.join(' ') || '.';
          let entries = this.entries(target, flag('/s'));
          entries.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, undefined, {
            numeric: true
          }) : a.type === 'directory' ? -1 : 1);
          if (flag('/o:-n')) entries.reverse();
          if (flag('/o:d')) entries.sort((a, b) => new Date(a.modified || 0) - new Date(b.modified || 0));
          if (flag('/b')) return entries.map(entry => flag('/s') ? dosPath(entry.path) : entry.name).join('\n');
          const path = this.resolve(target);
          const lines = [' Volume in drive C is WINDOWS98', ' Volume Serial Number is 1998-0615', '', ` Directory of ${dosPath(this.vfs.stat(path)?.type === 'directory' ? path : dirname(path))}`, ''];
          let bytes = 0,
            files = 0,
            directories = 0;
          if (flag('/w')) {
            const names = entries.map(entry => entry.type === 'directory' ? `[${entry.name}]` : entry.name);
            for (let i = 0; i < names.length; i += 3) lines.push(names.slice(i, i + 3).map(name => pad(name, 25)).join(''));
          }
          for (const entry of entries) {
            const date = new Date(entry.modified || Date.now());
            const stamp = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}  ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            const size = entry.type === 'directory' ? '<DIR>' : entry.size ?? new TextEncoder().encode(entry.content || '').length;
            if (entry.type === 'directory') directories++;else {
              files++;
              bytes += Number(size);
            }
            if (!flag('/w')) lines.push(`${stamp}  ${String(size).padStart(12, ' ')}  ${flag('/s') ? dosPath(entry.path) : entry.name}`);
          }
          lines.push(`       ${files} File(s)  ${bytes.toLocaleString()} bytes`, `       ${directories} Dir(s)`);
          return lines.join('\n');
        }
      case 'md':
      case 'mkdir':
        {
          if (!args.length) throw new Error('Required parameter missing.');
          for (const arg of args) {
            const path = this.resolve(arg);
            if (this.vfs.exists(path)) throw new Error(`A file or directory named ${dosPath(path)} already exists.`);
            const parts = path.slice(3).split('/');
            let parent = path.slice(0, 3);
            for (const part of parts) {
              parent = `${parent.replace(/\/$/, '')}/${part}`;
              if (!this.vfs.exists(parent)) this.vfs.mkdir(parent);else this.ensureDirectory(parent);
            }
          }
          await this.flush();
          return '';
        }
      case 'rd':
      case 'rmdir':
        {
          if (!args.length) throw new Error('Required parameter missing.');
          for (const arg of args) {
            const path = this.resolve(arg);
            this.ensureDirectory(path);
            if (path.length <= 3 || this.cwd === path || this.cwd.startsWith(`${path}/`)) throw new Error('Cannot remove the current directory or the root directory.');
            if (this.vfs.list(path).length && !flag('/s')) throw new Error('The directory is not empty. Use RD /S to remove its contents.');
            // The volume deletes subtrees atomically and keeps one restorable
            // Recycle Bin group. Preflight protects every read-only descendant.
            this.vfs.delete(path);
          }
          await this.flush();
          return '';
        }
      case 'type':
        {
          if (!args.length) return input || 'Required parameter missing.';
          const results = [];
          for (const arg of args) {
            const matches = this.entries(arg).filter(entry => entry.type === 'file');
            if (!matches.length) throw new Error('File not found.');
            for (const entry of matches) results.push(String(this.vfs.read(entry.path) ?? ''));
          }
          return results.join('\n');
        }
      case 'echo.':
        return '\n';
      case 'echo':
        {
          const value = words.join(' ');
          if (!value) return `ECHO is ${this.echoEnabled ? 'on' : 'off'}.`;
          if (/^(on|off)$/i.test(value)) {
            this.echoEnabled = value.toLowerCase() === 'on';
            return '';
          }
          return value;
        }
      case 'copy':
      case 'move':
        {
          if (args.length < 1 || args.length > 2) throw new Error(`Syntax: ${command.toUpperCase()} source [destination]`);
          const sourcePath = this.resolve(args[0]),
            sourceStat = this.vfs.stat(sourcePath);
          const sources = command === 'move' && sourceStat?.type === 'directory' ? [{
            ...sourceStat,
            path: sourcePath,
            name: basename(sourcePath)
          }] : this.entries(args[0]).filter(entry => command === 'move' || entry.type === 'file');
          if (!sources.length) throw new Error('File not found.');
          let destination = this.resolve(args[1] || '.');
          const isDirectory = this.vfs.stat(destination)?.type === 'directory';
          if (sources.length > 1 && !isDirectory) throw new Error('The destination must be a directory when copying multiple files.');
          let count = 0;
          for (const source of sources) {
            const target = isDirectory ? `${destination.replace(/\/$/, '')}/${source.name}` : destination;
            if (source.path.toLocaleLowerCase() === target.toLocaleLowerCase()) throw new Error('The file cannot be copied onto itself.');
            if (target.startsWith(`${source.path}/`)) throw new Error('A directory cannot be moved inside itself.');
            this.ensureDirectory(dirname(target));
            if (command === 'move') this.vfs.move(source.path, target);else this.vfs.copy(source.path, target);
            if (command === 'move' && (this.cwd === source.path || this.cwd.startsWith(`${source.path}/`))) this.cwd = target + this.cwd.slice(source.path.length);
            count++;
          }
          await this.flush();
          return `        ${count} file(s) ${command === 'copy' ? 'copied' : 'moved'}.`;
        }
      case 'ren':
      case 'rename':
        {
          if (args.length !== 2) throw new Error('Syntax: REN oldname newname');
          const from = this.resolve(args[0]);
          if (!this.vfs.exists(from)) throw new Error('File not found.');
          if (/[\\/:]/.test(args[1])) throw new Error('The new name must not contain a path. Use MOVE to change directories.');
          const to = `${dirname(from).replace(/\/$/, '')}/${args[1]}`;
          if (this.vfs.exists(to) && to.toLocaleLowerCase() !== from.toLocaleLowerCase()) throw new Error('A file with that name already exists.');
          this.vfs.move(from, to);
          if (this.cwd === from || this.cwd.startsWith(`${from}/`)) this.cwd = to + this.cwd.slice(from.length);
          await this.flush();
          return '';
        }
      case 'del':
      case 'erase':
        {
          if (!args.length) throw new Error('Required parameter missing.');
          let count = 0;
          for (const arg of args) {
            for (const entry of this.entries(arg, flag('/s'))) {
              if (entry.type === 'directory') continue;
              if (Object.hasOwn(entry, 'readonly') ? entry.readonly : this.attributes.get(entry.path)?.includes('R')) throw new Error(`Access denied: ${entry.name} is read-only.`);
              this.vfs.delete(entry.path);
              count++;
            }
          }
          if (!count) return 'File not found.';
          await this.flush();
          return '';
        }
      case 'tree':
        {
          const target = this.resolve(args[0] || '.');
          this.ensureDirectory(target);
          const lines = ['Folder PATH listing', dosPath(target)];
          let count = 0;
          const walk = (directory, prefix = '', depth = 0) => {
            if (depth > 40 || count > 10000) throw new Error('Directory tree is too large.');
            const entries = this.vfs.list(directory).filter(entry => flag('/f') || entry.type === 'directory').sort((a, b) => a.name.localeCompare(b.name));
            entries.forEach((entry, index) => {
              const last = index === entries.length - 1;
              count++;
              lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}`);
              if (entry.type === 'directory') walk(entry.path, `${prefix}${last ? '    ' : '│   '}`, depth + 1);
            });
          };
          walk(target);
          return lines.join('\n');
        }
      case 'find':
        {
          if (!args.length) throw new Error('Syntax: FIND [/I] [/V] [/C] [/N] "string" [filename]');
          const needle = flag('/i') ? args[0].toLocaleLowerCase() : args[0];
          const sources = args.length > 1 ? args.slice(1).flatMap(arg => this.entries(arg).filter(entry => entry.type === 'file')).map(entry => ({
            name: entry.path,
            text: String(this.vfs.read(entry.path) || '')
          })) : [{
            name: '',
            text: input
          }];
          const output = [];
          for (const source of sources) {
            if (source.name) output.push(`---------- ${dosPath(source.name)}`);
            const matches = source.text.split(/\r?\n/).map((text, index) => ({
              text,
              index
            })).filter(({
              text
            }) => {
              const contains = (flag('/i') ? text.toLocaleLowerCase() : text).includes(needle);
              return flag('/v') ? !contains : contains;
            });
            output.push(flag('/c') ? String(matches.length) : matches.map(({
              text,
              index
            }) => flag('/n') ? `[${index + 1}]${text}` : text).join('\n'));
          }
          return output.join('\n');
        }
      case 'attrib':
        {
          const changes = args.filter(arg => /^[+-][rash]+$/i.test(arg)),
            targets = args.filter(arg => !/^[+-][rash]+$/i.test(arg));
          const entries = this.entries(targets[0] || '*', flag('/s')).filter(entry => flag('/d') || entry.type === 'file');
          if (!entries.length) return 'File not found.';
          for (const entry of entries) {
            const flags = new Set(this.attributes.get(entry.path) || (entry.type === 'file' ? 'A' : ''));
            const properties = {
              R: 'readonly',
              H: 'hidden',
              S: 'system',
              A: 'archive'
            };
            for (const [flag, property] of Object.entries(properties)) if (Object.hasOwn(entry, property)) {
              if (entry[property]) flags.add(flag);else flags.delete(flag);
            }
            for (const change of changes) for (const attribute of change.slice(1).toUpperCase()) {
              if (change[0] === '+') flags.add(attribute);else flags.delete(attribute);
            }
            this.attributes.set(entry.path, [...flags].join(''));
            if (changes.length && this.vfs.setAttributes) this.vfs.setAttributes(entry.path, Object.fromEntries(Object.entries(properties).map(([flag, property]) => [property, flags.has(flag)])));
          }
          setSetting(this.sys, 'command.attributes', Object.fromEntries(this.attributes));
          if (changes.length) await this.flush();
          return changes.length ? '' : entries.map(entry => `${pad(this.attributes.get(entry.path), 6)} ${dosPath(entry.path)}`).join('\n');
        }
      case 'date':
        return `The current date is: ${new Date().toLocaleDateString()}${args.length ? '\nThe browser clock is read-only.' : ''}`;
      case 'time':
        return `The current time is: ${new Date().toLocaleTimeString()}${args.length ? '\nThe browser clock is read-only.' : ''}`;
      case 'set':
        {
          if (!words.length) return Object.entries(this.env).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
          const value = words.join(' '),
            index = value.indexOf('=');
          if (index < 0) return Object.entries(this.env).filter(([key]) => key.startsWith(value.toUpperCase())).map(([key, value]) => `${key}=${value}`).join('\n') || 'Environment variable not defined.';
          const key = value.slice(0, index).toUpperCase();
          if (!key) throw new Error('Invalid environment variable name.');
          if (value.slice(index + 1)) this.env[key] = value.slice(index + 1);else delete this.env[key];
          return '';
        }
      case 'path':
        {
          if (!words.length) return `PATH=${this.env.PATH || ''}`;
          this.env.PATH = words.join(' ');
          return '';
        }
      case 'start':
        {
          if (!args.length) {
            this.sys.open('explorer', {
              path: this.cwd
            });
            return '';
          }
          const aliases = {
            notepad: 'notepad',
            wordpad: 'wordpad',
            calc: 'calculator',
            calculator: 'calculator',
            command: 'command',
            'cmd': 'command',
            explorer: 'explorer',
            mspaint: 'paint',
            paint: 'paint',
            sol: 'solitaire',
            solitaire: 'solitaire',
            winmine: 'minesweeper',
            minesweeper: 'minesweeper',
            'iexplore': 'internet'
          };
          const program = args[0].replace(/\.exe$/i, '').toLowerCase();
          if (aliases[program]) {
            this.sys.open(aliases[program], args[1] ? {
              path: this.resolve(args.slice(1).join(' '))
            } : {});
            return '';
          }
          const target = this.resolve(args.join(' '));
          if (!this.vfs.exists(target)) throw new Error('The system cannot find the file specified.');
          if (/\.(exe|com|bat|cmd)$/i.test(target)) throw new Error('Native executables and batch programs are not emulated. START opens the installed desktop apps and documents.');
          this.sys.openPath(target);
          return '';
        }
      case 'notepad':
      case 'wordpad':
      case 'calc':
      case 'calculator':
      case 'explorer':
      case 'mspaint':
        return this.command(['start', command, ...words], input);
      case 'more':
        return args.length ? this.command(['type', ...args], input) : input;
      default:
        throw new Error(`Bad command or file name: ${command}\nType HELP for available commands. Native DOS executables are not emulated.`);
    }
  }
  help(command) {
    const descriptions = {
      ATTRIB: 'ATTRIB [+R|-R] [+A|-A] [+S|-S] [+H|-H] [file] [/S] [/D]\nDisplays or changes virtual file attributes. +R protects files from changes and deletion.',
      CD: 'CD [path]\nCD .. moves to the parent directory. Quote paths containing spaces.',
      CLS: 'CLS\nClears the command window.',
      COPY: 'COPY source [destination]\nCopies virtual files. Wildcards are supported in the source.',
      DATE: 'DATE\nDisplays the current browser date. The system clock cannot be changed.',
      DEL: 'DEL filespec [/S]\nDeletes matching files from the virtual drive. /S includes subdirectories.',
      DIR: 'DIR [path or filespec] [/B] [/S] [/W] [/O:N] [/O:-N] [/O:D]\nLists files and folders. /B: names only; /S: include subdirectories; /W: wide listing.',
      ECHO: 'ECHO [ON|OFF|text]\nDisplays text. Use ECHO. for an empty line. ECHO text > file creates a file; >> appends.',
      EXIT: 'EXIT\nCloses the MS-DOS Prompt.',
      FIND: 'FIND [/I] [/V] [/C] [/N] "string" [file]\nFinds lines containing text. /I: ignore case; /V: nonmatching lines; /C: count; /N: line numbers.',
      HELP: 'HELP [command]\nDisplays help for an available command.',
      MD: 'MD path\nCreates a virtual directory, including missing parent directories.',
      MOVE: 'MOVE source destination\nMoves a virtual file or folder.',
      RD: 'RD path [/S]\nRemoves an empty directory. /S removes its complete contents.',
      REN: 'REN oldname newname\nRenames a file or directory in the same location.',
      SET: 'SET [name=[value]]\nDisplays, adds or removes command-session environment variables.',
      START: 'START [application or document]\nOpens an installed desktop application or virtual document. Native .EXE, .COM and batch files are not emulated.',
      TIME: 'TIME\nDisplays the current browser time. The system clock cannot be changed.',
      TREE: 'TREE [path] [/F]\nDisplays the folder tree. /F includes files.',
      TYPE: 'TYPE filename\nDisplays a text file.',
      VER: 'VER\nDisplays the virtual operating system version.',
      VOL: 'VOL\nDisplays the virtual volume label.',
      PATH: 'PATH [search path]\nDisplays or changes the command-session PATH.',
      MORE: 'MORE [filename]\nDisplays piped text or a file in the scrollable command window.'
    };
    const aliases = {
      CHDIR: 'CD',
      MKDIR: 'MD',
      RMDIR: 'RD',
      RENAME: 'REN',
      ERASE: 'DEL'
    };
    if (command) {
      const name = aliases[command.toUpperCase()] || command.toUpperCase();
      return descriptions[name] || `No help is available for ${command}.`;
    }
    return ['Available commands:', ...Object.entries(descriptions).map(([name, description]) => `${pad(name, 9)} ${description.split('\n')[1]}`), '', 'Use HELP command or command /? for details.', 'Quote paths with spaces: CD "C:\\My Documents"', 'Redirection: ECHO Hello > note.txt   TYPE note.txt >> all.txt', 'Pipes: DIR /B | FIND /I ".txt"', 'All file commands operate on the virtual C: drive.', 'Native DOS programs are not emulated.'].join('\n');
  }
}
function createCommand(sys, args = {}) {
  const win = sys.wm.create({
    title: 'MS-DOS Prompt',
    icon: 'command',
    width: 700,
    height: 435,
    minWidth: 380,
    minHeight: 240
  });
  win.el.classList.add('acc-command');
  win.body.classList.add('acc-app-body');
  const terminal = element('div', 'acc-dos-terminal');
  terminal.tabIndex = -1;
  terminal.setAttribute('aria-label', 'MS-DOS Prompt');
  const output = element('div', 'acc-dos-output');
  output.setAttribute('role', 'log');
  output.setAttribute('aria-live', 'polite');
  const row = element('form', 'acc-dos-input-row');
  const prompt = element('span', 'acc-dos-prompt');
  const input = element('input', 'acc-dos-input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Command');
  row.append(prompt, input);
  terminal.append(output, row);
  win.body.append(terminal);
  const history = getSetting(sys, 'command.history', []).slice(-100);
  let historyIndex = history.length,
    draft = '',
    running = false;
  const shell = new VirtualDOS(sys, {
    path: args.path,
    onClear: () => {
      output.replaceChildren();
    },
    onExit: () => win.close()
  });
  const updatePrompt = () => {
    prompt.textContent = `${dosPath(shell.cwd)}>`;
    win.setTitle(`MS-DOS Prompt - ${dosPath(shell.cwd)}`);
  };
  const write = (text, className = '') => {
    if (text !== '') output.append(element('div', `acc-dos-line ${className}`, text));
    while (output.childNodes.length > 500) output.firstChild.remove();
    terminal.scrollTop = terminal.scrollHeight;
  };
  async function execute(line) {
    if (running) return;
    running = true;
    input.disabled = true;
    write(`${prompt.textContent}${line}`, 'acc-dos-echo');
    input.value = '';
    if (line.trim()) {
      if (history.at(-1) !== line) history.push(line);
      if (history.length > 100) history.shift();
      historyIndex = history.length;
      setSetting(sys, 'command.history', history);
    }
    try {
      const result = await shell.execute(line);
      if (result) write(result);
    } catch (error) {
      write(error.message, 'acc-dos-error');
    } finally {
      running = false;
      input.disabled = false;
      updatePrompt();
      terminal.scrollTop = terminal.scrollHeight;
      if (win.el.isConnected) input.focus();
    }
  }
  row.addEventListener('submit', event => {
    event.preventDefault();
    execute(input.value);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (historyIndex === history.length) draft = input.value;
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] || '';
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = historyIndex === history.length ? draft : history[historyIndex];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.value = '';
    } else if (event.key === 'F3') {
      event.preventDefault();
      input.value = history.at(-1) || '';
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const before = input.value.slice(0, input.selectionStart);
      const match = before.match(/(?:^|\s)("[^"]*|[^\s"]*)$/);
      if (!match) return;
      const token = match[1].replace(/^"/, ''),
        slash = Math.max(token.lastIndexOf('\\'), token.lastIndexOf('/'));
      const parent = slash >= 0 ? token.slice(0, slash + 1) : '.',
        partial = slash >= 0 ? token.slice(slash + 1) : token;
      try {
        const matches = shell.vfs.list(shell.resolve(parent)).filter(entry => entry.name.toLocaleLowerCase().startsWith(partial.toLocaleLowerCase()));
        if (matches.length === 1) {
          const value = `${slash >= 0 ? token.slice(0, slash + 1) : ''}${matches[0].name}${matches[0].type === 'directory' ? '\\' : ''}`;
          const replacement = /\s/.test(value) ? `"${value}"` : value;
          const start = before.length - match[1].length;
          input.setRangeText(replacement, start, input.selectionStart, 'end');
        } else if (matches.length > 1) write(matches.map(entry => entry.name).join('    '));
      } catch {/* An incomplete or nonexistent path is left unchanged. */}
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      output.replaceChildren();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !window.getSelection()?.toString() && input.selectionStart === input.selectionEnd) {
      event.preventDefault();
      write(`${prompt.textContent}${input.value}^C`);
      input.value = '';
    }
  });
  terminal.addEventListener('click', event => {
    if (!window.getSelection()?.toString() && event.target !== input) input.focus();
  });
  write('Microsoft(R) Windows 98\n   (C)Copyright Microsoft Corp 1981-1998.\n\nType HELP for commands. Files live on the virtual C: drive.\n');
  updatePrompt();
  requestAnimationFrame(() => input.focus());
  if (args.command) execute(String(args.command));
  return win;
}
export function registerAccessories(sys) {
  sys.registerApp({
    id: 'notepad',
    title: 'Notepad',
    icon: 'notepad',
    open: (args = {}) => createNotepad(sys, args)
  });
  sys.registerApp({
    id: 'wordpad',
    title: 'WordPad',
    icon: 'wordpad',
    open: (args = {}) => createWordPad(sys, args)
  });
  sys.registerApp({
    id: 'calculator',
    title: 'Calculator',
    icon: 'calculator',
    open: () => createCalculator(sys)
  });
  sys.registerApp({
    id: 'command',
    title: 'MS-DOS Prompt',
    icon: 'command',
    open: (args = {}) => createCommand(sys, args)
  });
}
