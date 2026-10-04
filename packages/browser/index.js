import { escapeHTML as h } from '@win98/core';
export function registerBrowser(sys) {
  sys.registerApp({
    id: 'internet',
    title: 'Internet Explorer',
    icon: 'ie',
    open: args => browser(sys, args)
  });
  sys.registerApp({
    id: 'help',
    title: 'Windows Help',
    icon: 'help',
    open: args => help(sys, args)
  });
}
function browser(sys, {
  url = sys.settings.get('homepage', 'about:home'),
  path
} = {}) {
  const win = sys.wm.create({
    title: 'Microsoft Internet Explorer',
    icon: 'ie',
    width: 780,
    height: 545,
    minWidth: 360,
    minHeight: 260
  });
  let history = [],
    index = -1,
    current = '',
    title = 'Microsoft Internet Explorer',
    stopped = false;
  win.body.innerHTML = '<div class="toolbar ie-toolbar"><button data-action="back">◀<span>Back</span></button><button data-action="forward">▶<span>Forward</span></button><button data-action="stop">▧<span>Stop</span></button><button data-action="refresh">' + sys.icon('ie', 22) + '<span>Refresh</span></button><button data-action="home">' + sys.icon('computer', 22) + '<span>Home</span></button><span class="toolbar-separator"></span><button data-action="search">' + sys.icon('find', 22) + '<span>Search</span></button><button data-action="favorites">' + sys.icon('folder', 22) + '<span>Favorites</span></button><button data-action="history">' + sys.icon('clock', 22) + '<span>History</span></button><span class="toolbar-separator"></span><button data-action="mail">' + sys.icon('outlook', 22) + '<span>Mail</span></button><button data-action="print">' + sys.icon('printers', 22) + '<span>Print</span></button></div><div class="ie-address"><label>Address</label><input class="sunken" aria-label="Address"><button class="win-button" style="min-width:40px">Go</button></div><div class="ie-content"></div>';
  const toolbar = win.body.querySelector('.toolbar'),
    address = win.body.querySelector('input'),
    content = win.body.querySelector('.ie-content'),
    status = sys.statusBar(win, 'Done');
  function normalize(s) {
    s = String(s).trim();
    if (!s) return 'about:blank';
    if (/^(about:|file:|[a-z]:[\\/])/i.test(s)) return s;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Internet Explorer supports http, https, local files, and about pages.');
    if (u.username || u.password) throw new Error('Please enter a URL without embedded credentials.');
    return u.href;
  }
  function localPage(html, pageTitle) {
    title = pageTitle;
    content.innerHTML = '<div class="ie-page">' + html + '</div>';
    content.querySelectorAll('[data-nav]').forEach(a => a.onclick = e => {
      e.preventDefault();
      navigate(a.dataset.nav);
    });
    content.querySelectorAll('[data-app]').forEach(a => a.onclick = e => {
      e.preventDefault();
      sys.open(a.dataset.app);
    });
    status.textContent = 'Done';
  }
  async function navigate(target, record = true) {
    let value;
    try {
      value = normalize(target);
    } catch (e) {
      sys.dialog({
        title: 'Internet Explorer',
        message: e.message,
        icon: 'error'
      });
      return;
    }
    stopped = false;
    current = value;
    address.value = value;
    if (record) {
      history = history.slice(0, index + 1);
      history.push(value);
      index++;
    }
    toolbar.querySelector('[data-action=back]').disabled = index <= 0;
    toolbar.querySelector('[data-action=forward]').disabled = index >= history.length - 1;
    content.replaceChildren();
    status.textContent = 'Opening page...';
    if (value === 'about:blank') localPage('', 'Blank Page');else if (value === 'about:home') localPage(`<div class="internet-head"><div style="font:13px Arial">Microsoft Internet Explorer</div><h1>Welcome to the Internet</h1></div><table width="100%" cellspacing="0" cellpadding="9"><tr valign="top"><td width="155" bgcolor="#eeeeee"><b>Explore</b><hr><p><a href="#" data-nav="about:guide">Internet Guide</a></p><p><a href="#" data-nav="about:search">Search the Web</a></p><p><a href="#" data-nav="about:favorites">My Favorites</a></p><p><a href="#" data-app="outlook">Read My Mail</a></p><hr><a href="#" data-app="help">Windows Help</a></td><td><h2 style="color:#000080;margin-top:0">Your window to the world.</h2><p>Type an address in the Address bar, and press Enter to visit a website.</p><p>Start exploring with these useful places:</p><ul><li><a href="#" data-nav="https://www.wikipedia.org">Wikipedia</a></li><li><a href="#" data-nav="https://www.archive.org">Internet Archive</a></li><li><a href="#" data-nav="https://www.webdesignmuseum.org">Web Design Museum</a></li></ul><h3 style="color:#000080">Getting started</h3><p>Use <b>Back</b> and <b>Forward</b> to revisit pages. Add your favorite websites to the Favorites menu.</p><p><a href="#" data-nav="about:guide">Learn about browsing in this desktop</a></p></td></tr></table><hr><small>Internet Explorer · Browser edition</small>`, 'Welcome to the Internet');else if (value === 'about:guide') localPage('<h1>Using Internet Explorer</h1><hr><h2>To visit a website</h2><p>Type a website address in the Address bar, then press Enter. External pages open in an embedded browser view.</p><p>Some websites do not allow themselves to be displayed inside another page. Use <b>Open in browser</b> above an external page to open those websites in your regular browser.</p><h2>To open a local document</h2><p>Choose File → Open Local File. HTML files on your virtual disk are displayed in an isolated document frame. Scripts in local files do not run.</p><h2>Favorites and history</h2><p>Use Favorites → Add to Favorites to save the current address. History records addresses visited in this window.</p><p>This browser uses the host browser engine. It does not emulate Trident, ActiveX, Java applets, plug-ins, or legacy Internet Explorer security behavior.</p><a href="#" data-nav="about:home">Back to the home page</a>', 'Internet Guide');else if (value === 'about:search') {
      localPage('<div class="internet-head"><h1>Search the Web</h1></div><h2>What would you like to find?</h2><form id="web-search"><input aria-label="Search the Web" style="width:72%;height:25px" class="sunken"><button class="win-button">Search</button></form><p>Search results are opened in your browser so all links work normally.</p>', 'Search the Web');
      content.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const q = content.querySelector('input').value.trim();
        if (q) window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener,noreferrer');
      };
    } else if (value === 'about:favorites') {
      const favorites = sys.settings.get('browserFavorites', []);
      localPage('<h1>My Favorites</h1><hr>' + (favorites.length ? '<ul>' + favorites.map(f => `<li><a href="#" data-nav="${h(f.url)}">${h(f.title)}</a></li>`).join('') + '</ul>' : '<p>There are no favorites yet. Open a page, then choose Favorites → Add to Favorites.</p>'), 'My Favorites');
    } else if (value === 'about:history') {
      localPage('<h1>History</h1><hr><ol>' + history.map(u => `<li><a href="#" data-nav="${h(u)}">${h(u)}</a></li>`).join('') + '</ol>', 'History');
    } else if (value.startsWith('about:')) localPage('<h1>The page cannot be displayed</h1><p>This internal page does not exist.</p><a href="#" data-nav="about:home">Return to Home</a>', 'Page unavailable');else if (/^(file:|[a-z]:[\\/])/i.test(value)) {
      const p = value.replace(/^file:\/*/i, '');
      const data = sys.vfs.read(p);
      if (data === null) {
        localPage('<h1>The page cannot be displayed</h1><p>The file could not be found on your virtual disk.</p>', 'File not found');
      } else {
        const frame = document.createElement('iframe');
        frame.title = 'Local HTML document';
        frame.setAttribute('sandbox', '');
        frame.srcdoc = data;
        content.append(frame);
        title = p.split(/[\\/]/).pop();
        status.textContent = 'Done   |   Local file (isolated document)';
      }
    } else {
      title = new URL(value).hostname;
      const banner = document.createElement('div');
      banner.className = 'ie-external-banner';
      banner.innerHTML = '<span>External websites may block embedded viewing.</span><a target="_blank" rel="noopener noreferrer">Open in browser</a>';
      banner.querySelector('a').href = value;
      const frame = document.createElement('iframe');
      frame.title = 'Website: ' + title;
      frame.setAttribute('sandbox', 'allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads');
      frame.referrerPolicy = 'no-referrer';
      frame.style.height = 'calc(100% - 30px)';
      frame.src = value;
      frame.onload = () => {
        if (!stopped) status.textContent = 'External website   |   ' + new URL(value).hostname;
      };
      content.append(banner, frame);
      status.textContent = 'External website   |   ' + new URL(value).hostname;
    }
    win.setTitle(title + ' - Microsoft Internet Explorer');
  }
  async function addFavorite() {
    const name = await sys.prompt({
      title: 'Add Favorite',
      message: 'Name:',
      value: title
    });
    if (!name) return;
    let list = sys.settings.get('browserFavorites', []);
    list = list.filter(f => f.url !== current);
    sys.settings.set('browserFavorites', [...list, {
      title: name,
      url: current
    }]);
  }
  async function organizeFavorites() {
    const list = sys.settings.get('browserFavorites', []);
    if (!list.length) {
      sys.dialog({
        title: 'Organize Favorites',
        message: 'You have not added any favorites yet.'
      });
      return;
    }
    const child = sys.wm.create({
      title: 'Organize Favorites',
      icon: 'folder',
      width: 430,
      height: 295
    });
    child.body.className += ' plain-app';
    const rows = document.createElement('div');
    rows.className = 'sunken';
    rows.style.cssText = 'background:white;overflow:auto;flex:1';
    let selected = -1;
    const refresh = () => {
      rows.replaceChildren();
      list.forEach((f, i) => {
        const b = document.createElement('button');
        b.className = 'search-result';
        b.innerHTML = sys.icon('ie', 16) + h(f.title);
        if (i === selected) b.style.cssText = 'background:#000080;color:white';
        b.onclick = () => {
          selected = i;
          refresh();
        };
        rows.append(b);
      });
    };
    const bar = document.createElement('div');
    bar.className = 'dialog-buttons';
    bar.innerHTML = '<button class="win-button">Rename</button><button class="win-button">Delete</button><button class="win-button">Close</button>';
    bar.children[0].onclick = async () => {
      if (selected < 0) return;
      const name = await sys.prompt({
        title: 'Rename Favorite',
        message: 'Name:',
        value: list[selected].title
      });
      if (name) {
        list[selected].title = name;
        sys.settings.set('browserFavorites', list);
        refresh();
      }
    };
    bar.children[1].onclick = () => {
      if (selected < 0) return;
      list.splice(selected, 1);
      selected = -1;
      sys.settings.set('browserFavorites', list);
      refresh();
    };
    bar.children[2].onclick = () => child.close();
    child.body.append(rows, bar);
    refresh();
  }
  const actions = {
    back: () => {
      if (index > 0) navigate(history[--index], false);
    },
    forward: () => {
      if (index < history.length - 1) navigate(history[++index], false);
    },
    stop: () => {
      stopped = true;
      content.querySelector('iframe')?.remove();
      status.textContent = 'Stopped';
    },
    refresh: () => navigate(current, false),
    home: () => navigate(sys.settings.get('homepage', 'about:home')),
    search: () => navigate('about:search'),
    favorites: () => navigate('about:favorites'),
    history: () => navigate('about:history'),
    mail: () => sys.open('outlook'),
    print: () => {
      const frame = content.querySelector('iframe');
      if (frame) {
        sys.dialog({
          title: 'Print',
          message: 'Use Open in browser to print an external page. For local documents, open the file in WordPad or Notepad to print it.'
        });
      } else {
        sys.printHTML(content.innerHTML, title);
      }
    }
  };
  toolbar.querySelectorAll('[data-action]').forEach(b => b.onclick = actions[b.dataset.action]);
  const go = () => navigate(address.value);
  win.body.querySelector('.ie-address button').onclick = go;
  address.onkeydown = e => {
    if (e.key === 'Enter') go();
  };
  sys.menuBar(win, [{
    label: 'File',
    items: [{
      label: 'New Window',
      shortcut: 'Ctrl+N',
      action: () => sys.open('internet', {
        url: current
      })
    }, {
      label: 'Open...',
      shortcut: 'Ctrl+O',
      action: async () => {
        const u = await sys.prompt({
          title: 'Open',
          message: 'Open:',
          value: current
        });
        if (u) navigate(u);
      }
    }, {
      label: 'Open Local File...',
      action: async () => {
        const p = await sys.fileDialog({
          mode: 'open',
          filter: '.html'
        });
        if (p) navigate(p);
      }
    }, {
      label: 'Save Page As...',
      action: async () => {
        const p = await sys.fileDialog({
          mode: 'save',
          filename: 'Web Page.html',
          filter: '.html'
        });
        if (p) {
          const page = content.querySelector('.ie-page');
          if (page) sys.vfs.write(p, '<!doctype html><title>' + h(title) + '</title>' + page.innerHTML, {
            mime: 'text/html'
          });else sys.dialog({
            title: 'Save Page',
            message: 'For an external website, use Open in browser and save the page from there.'
          });
        }
      }
    }, {
      type: 'separator'
    }, {
      label: 'Print...',
      shortcut: 'Ctrl+P',
      action: actions.print
    }, {
      type: 'separator'
    }, {
      label: 'Close',
      action: () => win.close()
    }]
  }, {
    label: 'Edit',
    items: [{
      label: 'Copy Address',
      action: async () => {
        await navigator.clipboard?.writeText(current).catch(() => {});
        sys.textClipboard = current;
      }
    }, {
      label: 'Select All',
      action: () => {
        const range = document.createRange();
        range.selectNodeContents(content);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
    }, {
      label: 'Find...',
      shortcut: 'Ctrl+F',
      action: async () => {
        const text = await sys.prompt({
          title: 'Find',
          message: 'Find what:'
        });
        if (text && !window.find(text, false, false, true)) sys.dialog({
          title: 'Find',
          message: 'The text was not found in the visible page.'
        });
      }
    }]
  }, {
    label: 'View',
    items: [{
      label: 'Stop',
      action: actions.stop
    }, {
      label: 'Refresh',
      shortcut: 'F5',
      action: actions.refresh
    }, {
      label: 'Text Size',
      items: ['Smaller', 'Medium', 'Larger'].map((label, i) => ({
        label,
        action: () => {
          const page = content.querySelector('.ie-page');
          if (page) page.style.fontSize = [13, 16, 19][i] + 'px';
        }
      }))
    }, {
      label: 'Source',
      action: () => {
        const page = content.querySelector('.ie-page');
        sys.open('notepad', {
          content: page ? page.innerHTML : 'External website source is protected by the browser origin policy. Open the page in your browser to inspect it.'
        });
      }
    }]
  }, {
    label: 'Go',
    items: [{
      label: 'Back',
      action: actions.back
    }, {
      label: 'Forward',
      action: actions.forward
    }, {
      label: 'Home Page',
      action: actions.home
    }, {
      label: 'History',
      action: actions.history
    }]
  }, {
    label: 'Favorites',
    items: () => [{
      label: 'Add to Favorites...',
      action: addFavorite
    }, {
      label: 'Organize Favorites...',
      action: organizeFavorites
    }, {
      type: 'separator'
    }, ...sys.settings.get('browserFavorites', []).map(f => ({
      label: f.title,
      icon: 'ie',
      action: () => navigate(f.url)
    }))]
  }, {
    label: 'Tools',
    items: [{
      label: 'Internet Options...',
      action: () => sys.open('internetoptions')
    }]
  }, {
    label: 'Help',
    items: [{
      label: 'Contents and Index',
      action: () => navigate('about:guide')
    }, {
      type: 'separator'
    }, {
      label: 'About Internet Explorer',
      action: () => sys.dialog({
        title: 'About Internet Explorer',
        icon: 'ie',
        message: 'Microsoft Internet Explorer — desktop recreation\n\nWeb pages use your host browser engine. Trident, ActiveX, and legacy plug-ins are not emulated.'
      })
    }]
  }]);
  win.el.addEventListener('keydown', e => {
    if (e.key === 'F5') {
      e.preventDefault();
      actions.refresh();
    }
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      actions.back();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      address.focus();
      address.select();
    }
  });
  navigate(path || url);
  return win;
}
const topics = {
  welcome: {
    label: 'Welcome to Windows 98',
    title: 'Welcome to Windows 98',
    html: '<p>Welcome to your classic desktop. Everything begins with the <b>Start</b> button at the bottom-left corner of the screen.</p><h2>Try your new computer</h2><ol><li>Double-click <b>My Computer</b> to explore your virtual drives.</li><li>Open <b>Start → Programs → Accessories → Notepad</b>. Write a note and save it in My Documents.</li><li>Open <b>Paint</b> to make a picture, or <b>Games</b> to play a hand of Solitaire.</li><li>Right-click the desktop and choose <b>Properties</b> to choose a background or screen saver.</li></ol><p>This is an independently implemented browser desktop. See <b>Compatibility</b> for the exact runtime boundary.</p>'
  },
  desktop: {
    label: 'Using the desktop',
    title: 'Your desktop',
    html: '<h2>Windows and the taskbar</h2><p>Drag a title bar to move a window. Drag its borders or corners to change its size. The three caption buttons minimize, maximize, and close a window. Double-click the title bar to maximize or restore.</p><p>Click a taskbar button to switch to that window; click the active button again to minimize it. Right-click the taskbar to cascade or tile the open windows.</p><h2>The Start menu</h2><p>Programs contains Accessories, Games, Entertainment, and System Tools. Settings opens the Control Panel. Documents contains recently opened files. Run opens a program or document by name.</p><h2>Shut down</h2><p>Choose Start → Shut Down. Open editors ask whether to save changed documents, and the virtual disk is saved before the desktop closes. Restart reloads this desktop. MS-DOS mode opens the local command interpreter.</p>'
  },
  files: {
    label: 'Files and folders',
    title: 'Working with files',
    html: '<p>My Computer contains a virtual C: drive. Your documents live in <b>C:\\My Documents</b>, and files placed in <b>C:\\Windows\\Desktop</b> appear on the desktop.</p><h2>File operations</h2><p>Explorer supports creating folders and text documents; copying, cutting, pasting, renaming and deleting; selecting multiple items; drag-and-drop; and sorting large icons, small icons, or a details list.</p><p>Deleted items move into the Recycle Bin. Open it to restore selected items or permanently empty the bin.</p><h2>Import, export and backups</h2><p>Choose <b>File → Import Files</b> to bring in files from your device. Dragging a file from your computer into a folder also imports it. Choose Export Selected File to download a copy.</p><p><b>File → Back Up Disk</b> downloads the complete virtual disk as JSON. Restore Disk Backup replaces the virtual disk after your confirmation. Keep a backup before clearing website data.</p><h2>Local storage</h2><p>The virtual volume uses IndexedDB on this device. Settings use browser storage. Files are not synchronized between devices and are not automatically uploaded. Private browsing or clearing site data can remove them.</p>'
  },
  accessories: {
    label: 'Accessories',
    title: 'Useful everyday applications',
    html: '<h2>Notepad and WordPad</h2><p>Notepad edits plain text. WordPad edits formatted documents with fonts, paragraphs, lists and colors. WordPad saves HTML or plain text; it does not provide binary .DOC/.RTF compatibility. Both support open, save, save as, print, find, and changed-document prompts.</p><h2>Paint</h2><p>Paint provides sixteen drawing tools, selections, colors, text, shapes, undo and redo, zoom, crop, resize, flip, rotate, and PNG saving. Right-click to draw with the background color. Import PNG, JPEG, GIF and other image formats supported by your browser.</p><h2>Calculator</h2><p>Choose Standard or Scientific mode. Enter numbers with the keyboard or buttons. Memory, percent, repeated equals, trigonometry, logarithms, powers and integer operations are supported.</p><h2>MS-DOS Prompt</h2><p>Type <b>HELP</b> for supported commands. Commands act on the same virtual files as Explorer. This interpreter does not execute x86 .EXE or .COM programs.</p>'
  },
  games: {
    label: 'Games',
    title: 'Games',
    html: '<h2>Minesweeper</h2><p>Left-click to uncover a square. Right-click to place a flag. The first reveal is safe. Click a revealed numbered square with the middle button, or use chording, to open neighbors when the adjacent flags match. Game contains difficulty and best-time settings.</p><h2>Solitaire</h2><p>Build alternating-color sequences in the tableau. Build the four foundations from Ace to King by suit. Draw from the stock; move a face-up card or sequence by dragging or selecting its destination. Double-click an exposed card to move it to an eligible foundation.</p><h2>FreeCell</h2><p>Use the four free cells to reorganize the tableau. Move cards onto alternating colors in descending rank, and move Aces upward through Kings into the suit foundations. Empty cells and columns determine how many cards can be moved together.</p><h2>Hearts</h2><p>Pass three cards when prompted. Follow the lead suit if possible. Avoid hearts and the queen of spades. Play against three computer opponents, with automatic hand scoring.</p>'
  },
  media: {
    label: 'Music and mail',
    title: 'Entertainment and communications',
    html: '<h2>Windows Media Player</h2><p>Import audio or open a saved audio file. Use playback, seeking, volume, playlist, shuffle, repeat, and the audio visualization. A short generated sample is included. Supported audio formats depend on your browser.</p><h2>Sound Recorder</h2><p>Click Record to ask for microphone access. Stop, play back, then save the recording to the virtual disk. The file format matches the format provided by the browser. Microphone access requires permission.</p><h2>Outlook Express and Address Book</h2><p>Mail is local to this desktop. Compose, save drafts, reply, forward, delete, and export messages as .eml. Address Book stores contacts and exports CSV. <b>Open in Mail App</b> hands a draft to your actual mail application; the desktop does not connect to SMTP or receive live email.</p>'
  },
  graphics: {
    label: 'Graphics and screen savers',
    title: 'Graphics',
    html: '<p>Display Properties controls wallpaper, color, themes, and screen savers. The desktop attempts <b>WebGPU</b>, falls back to <b>WebGL2</b>, then to <b>Canvas 2D</b>.</p><p>The renderer draws backgrounds, imported wallpaper images, a moving starfield, Mystify, and shaded 3D Pipes. Static wallpaper is drawn only when it changes or resizes. Animations stop while the page is hidden.</p><p>Window chrome, text, menus and controls are native HTML/CSS. Paint uses an editable Canvas 2D surface. The graphics package also exposes a GPU image-presentation API for reusable clients.</p><p>System Information shows the actual selected backend and surface size. Frame submission time measures CPU preparation and submission, not GPU execution time.</p>'
  },
  keyboard: {
    label: 'Keyboard shortcuts',
    title: 'Keyboard shortcuts',
    html: '<table><tr><th>Shortcut</th><th>Action</th></tr><tr><td>Ctrl+Escape</td><td>Open Start</td></tr><tr><td>Alt+F4</td><td>Close active window</td></tr><tr><td>F6</td><td>Switch to the next window</td></tr><tr><td>Alt+Tab</td><td>Switch windows when the host browser delivers the keys</td></tr><tr><td>Ctrl+Shift+Escape</td><td>Open Task Manager when delivered by the browser</td></tr><tr><td>F1</td><td>Open Help</td></tr><tr><td>F2</td><td>Rename a file or start a new game</td></tr><tr><td>Ctrl+S / Ctrl+O</td><td>Save / Open in editors</td></tr><tr><td>Ctrl+Z / Ctrl+Y</td><td>Undo / Redo in editors</td></tr><tr><td>Ctrl+C / X / V</td><td>Copy / Cut / Paste</td></tr><tr><td>Delete</td><td>Delete selected files or a Paint selection</td></tr><tr><td>F5</td><td>Refresh Explorer or Internet Explorer</td></tr></table><p>Host operating system and browser shortcuts can take priority over the desktop.</p>'
  },
  compatibility: {
    label: 'Compatibility',
    title: 'What this desktop implements',
    html: '<p>This is a browser recreation of the Windows 98 desktop and a collection of working applications. It is <b>not a complete Windows operating system or an x86 emulator</b>.</p><table><tr><th>Area</th><th>Implementation</th></tr><tr><td>Desktop and shell</td><td>Custom window manager, Start, taskbar, icons, menus, dialogs, local preferences</td></tr><tr><td>Files</td><td>Case-insensitive virtual disk, IndexedDB persistence, recycle, import/export, backup</td></tr><tr><td>Applications</td><td>Browser implementations of editors, Paint, calculator, games, media, mail and utilities</td></tr><tr><td>Graphics</td><td>WebGPU, WebGL2, Canvas 2D; native HTML/CSS window controls</td></tr><tr><td>Original binaries</td><td>Win32, Win16, DOS, drivers and original games are not executable</td></tr><tr><td>Hardware</td><td>No physical disk, CD, floppy, parallel-port, printer-driver or dial-up emulation</td></tr><tr><td>Networking</td><td>Host browser HTTP/HTTPS; no NetBIOS, SMB, raw sockets, ActiveX or legacy IE engine</td></tr><tr><td>System services</td><td>Local simulated machine settings; scheduled tasks run only while this page is open</td></tr></table><p>Classic fonts and icon assets are provided with source and attribution notices in the source package. Microsoft names identify the recreated historical interface; the project is independent.</p><p>Pixel equivalence to every Windows 98 screen has not been certified. Native-resolution bitmap fonts and icons, classic metrics and colors are used, with behavior adapted to a browser viewport.</p>'
  }
};
function help(sys, {
  topic = 'welcome'
} = {}) {
  const win = sys.wm.create({
    title: 'Windows Help',
    icon: 'help',
    width: 700,
    height: 490,
    minWidth: 360,
    minHeight: 260
  });
  win.body.innerHTML = '<div class="toolbar"><button data-action="back">◀ Back</button><button data-action="home">' + sys.icon('help', 16) + 'Home</button><button data-action="print">' + sys.icon('printers', 16) + 'Print</button></div><div class="help-layout"><nav class="help-topics" aria-label="Help topics"></nav><article class="help-page"></article></div>';
  const nav = win.body.querySelector('nav'),
    page = win.body.querySelector('article'),
    visited = [];
  let current = topic;
  const show = (id, record = true) => {
    if (!topics[id]) id = 'welcome';
    if (record && current !== id) visited.push(current);
    current = id;
    const t = topics[id];
    page.innerHTML = '<h1>' + h(t.title) + '</h1>' + t.html;
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b.dataset.topic === id));
    page.scrollTop = 0;
  };
  for (const [id, t] of Object.entries(topics)) {
    const b = document.createElement('button');
    b.dataset.topic = id;
    b.innerHTML = sys.icon('help', 16) + ' ' + h(t.label);
    b.onclick = () => show(id);
    nav.append(b);
  }
  win.body.querySelector('[data-action=back]').onclick = () => show(visited.pop() || 'welcome', false);
  win.body.querySelector('[data-action=home]').onclick = () => show('welcome');
  win.body.querySelector('[data-action=print]').onclick = () => sys.printHTML(page.innerHTML, topics[current].title);
  sys.menuBar(win, [{
    label: 'File',
    items: [{
      label: 'Print Topic...',
      action: () => sys.printHTML(page.innerHTML, topics[current].title)
    }, {
      label: 'Close',
      action: () => win.close()
    }]
  }, {
    label: 'Help',
    items: [{
      label: 'About Windows 98',
      action: () => sys.open('about')
    }]
  }]);
  show(topic, false);
  return win;
}
