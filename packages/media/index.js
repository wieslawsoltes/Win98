/* Local, dependency-free Windows 98 media and communications applications. */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
const uid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const time = n => {
  n = Math.max(0, Math.floor(Number(n) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
const basename = p => String(p || '').split(/[\\/]/).pop() || 'Untitled';
const E = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, action, cls = '') => {
  const b = E('button', `win-button media-button ${cls}`, label);
  b.type = 'button';
  if (action) b.addEventListener('click', action);
  return b;
};
const menu = (label, action, shortcut) => ({
  label,
  action,
  ...(shortcut ? {
    shortcut
  } : {})
});
const separator = {
  type: 'separator'
};
export function registerMedia(sys) {
  const localEvents = new EventTarget();
  const settings = {
    get(key, fallback) {
      try {
        return sys.settings.get(key, fallback);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        sys.settings.set(key, value);
      } catch {/* session data remains available */}
    }
  };
  const readArray = (key, fallback = []) => {
    const value = settings.get(key, fallback);
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };
  const notify = name => localEvents.dispatchEvent(new Event(name));
  const listen = (win, target, name, fn) => {
    target.addEventListener(name, fn);
    win.addCleanup(() => target.removeEventListener(name, fn));
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
  const confirm = async (title, message) => (await sys.dialog({
    title,
    message,
    icon: 'warning',
    buttons: [{
      label: 'Yes',
      value: 'yes'
    }, {
      label: 'No',
      value: 'no'
    }]
  })) === 'yes';
  const makeWin = (options, cls) => {
    const win = sys.wm.create(options);
    win.body.classList.add('media-app', cls);
    return win;
  };
  const icon = (name, size = 16) => {
    const span = E('span', 'media-icon');
    span.innerHTML = sys.icon(name, size);
    return span;
  };
  const status = (win, text) => {
    const node = sys.statusBar(win, text);
    node.classList.add('media-status');
    return node;
  };
  const field = (label, value = '', type = 'text') => {
    const wrap = E('label', 'media-field');
    const text = E('span', '', label);
    const input = E('input', 'sunken');
    input.type = type;
    input.value = value ?? '';
    wrap.append(text, input);
    return {
      wrap,
      input
    };
  };
  const fileData = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
  const pickFiles = (accept, multiple, callback) => {
    const input = E('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      if (files.length) Promise.resolve(callback(files)).catch(error => tell('Open', error.message || 'The file could not be opened.'));
    });
    input.click();
  };

  // A synthesized PCM fixture is an actual playable audio file, generated locally.
  function welcomeWave() {
    const sampleRate = 22050,
      seconds = 12,
      samples = sampleRate * seconds;
    const buffer = new ArrayBuffer(44 + samples * 2),
      view = new DataView(buffer);
    const ascii = (offset, str) => [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    ascii(0, 'RIFF');
    view.setUint32(4, buffer.byteLength - 8, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, samples * 2, true);
    const notes = [72, 76, 79, 83, 81, 79, 76, 74, 72, 76, 79, 84, 83, 79, 76, 72];
    const chords = [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]];
    const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate,
        step = Math.min(15, Math.floor(t / 0.75)),
        age = t % 0.75;
      const f = hz(notes[step]),
        envelope = Math.min(1, age / 0.025) * Math.exp(-age * 3.4);
      let value = (Math.sin(t * f * Math.PI * 2) + 0.3 * Math.sin(t * f * Math.PI * 4)) * envelope * 0.16;
      const chord = chords[Math.min(3, Math.floor(t / 3))];
      chord.forEach((n, j) => {
        value += Math.sin(t * hz(n) * Math.PI * 2 + j * 0.3) * 0.024;
      });
      const fade = Math.min(1, t / 0.2, (seconds - t) / 1.2);
      view.setInt16(44 + i * 2, clamp(value * fade, -1, 1) * 32767, true);
    }
    return new Blob([buffer], {
      type: 'audio/wav'
    });
  }
  const audio = new Audio();
  audio.preload = 'metadata';
  const engine = {
    audio,
    events: new EventTarget(),
    tracks: [],
    index: -1,
    context: null,
    analyser: null,
    masterGain: null,
    waveGain: null,
    pan: null,
    volume: clamp(settings.get('volume', 70), 0, 100),
    muted: !!settings.get('muted', false),
    wave: clamp(settings.get('waveVolume', 100), 0, 100),
    waveMuted: !!settings.get('waveMuted', false),
    mic: clamp(settings.get('microphoneVolume', 80), 0, 100),
    micMuted: !!settings.get('microphoneMuted', false),
    balance: clamp(settings.get('audioBalance', 0), -100, 100),
    repeat: false,
    shuffle: false,
    error: '',
    emit() {
      this.events.dispatchEvent(new Event('change'));
    },
    effectiveVolume() {
      return this.muted || this.waveMuted ? 0 : this.volume * this.wave / 10000;
    },
    applyVolume() {
      if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.volume / 100;
      if (this.waveGain) this.waveGain.gain.value = this.waveMuted ? 0 : this.wave / 100;
      audio.volume = this.waveGain ? 1 : this.effectiveVolume();
      if (this.pan) this.pan.pan.value = this.balance / 100;
      this.events.dispatchEvent(new Event('volume'));
      sys.events?.dispatchEvent(new CustomEvent('volumechange', {
        detail: {
          volume: this.volume,
          muted: this.muted,
          wave: this.wave,
          microphone: this.mic,
          balance: this.balance
        }
      }));
      this.emit();
    },
    setVolume(value) {
      this.volume = clamp(value, 0, 100);
      settings.set('volume', this.volume);
      this.applyVolume();
    },
    setMuted(value) {
      this.muted = !!value;
      settings.set('muted', this.muted);
      this.applyVolume();
    },
    setChannel(key, value) {
      const map = {
        wave: 'waveVolume',
        waveMuted: 'waveMuted',
        mic: 'microphoneVolume',
        micMuted: 'microphoneMuted',
        balance: 'audioBalance'
      };
      if (!(key in map)) return;
      this[key] = key.endsWith('Muted') ? !!value : clamp(value, key === 'balance' ? -100 : 0, 100);
      settings.set(map[key], this[key]);
      this.applyVolume();
    },
    async ensureContext() {
      if (!this.context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return null;
        try {
          this.context = sys.audio?.context || sys.audio?.ctx || new AudioContextClass();
          this.masterGain = sys.audio?.masterGain || this.context.createGain();
          if (!sys.audio?.masterGain) this.masterGain.connect(this.context.destination);
          this.waveGain = this.context.createGain();
          this.analyser = this.context.createAnalyser();
          this.analyser.fftSize = 256;
          const source = this.context.createMediaElementSource(audio);
          source.connect(this.analyser);
          this.analyser.connect(this.waveGain);
          if (this.context.createStereoPanner) {
            this.pan = this.context.createStereoPanner();
            this.waveGain.connect(this.pan);
            this.pan.connect(this.masterGain);
          } else this.waveGain.connect(this.masterGain);
          this.applyVolume();
        } catch {
          this.context = null;
          this.masterGain = null;
          this.waveGain = null;
          this.analyser = null;
        }
      }
      if (this.context?.state === 'suspended') await this.context.resume().catch(() => {});
      return this.context;
    },
    current() {
      return this.tracks[this.index] || null;
    },
    select(index, play = false) {
      if (!this.tracks[index]) return;
      this.index = index;
      this.error = '';
      const track = this.current();
      if (track.builtin && !track.url) track.url = URL.createObjectURL(welcomeWave());
      audio.src = track.url;
      audio.load();
      this.emit();
      if (play) this.play();
    },
    async play() {
      if (!this.current()) {
        await tell('Windows Media Player', 'Import an audio file or choose File > Load Sample Audio to start playback.');
        return;
      }
      try {
        await this.ensureContext();
        await audio.play();
        this.error = '';
        this.emit();
      } catch (error) {
        this.error = error.name === 'NotSupportedError' ? 'This audio format is not supported by your browser.' : error.message || 'Playback could not start.';
        this.emit();
        await tell('Audio playback', this.error);
      }
    },
    pause() {
      audio.pause();
      this.emit();
    },
    stop() {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {/* no seekable media */}
      this.emit();
    },
    seek(value) {
      if (Number.isFinite(audio.duration)) audio.currentTime = clamp(value, 0, audio.duration);
      this.emit();
    },
    next(direction = 1, play = !audio.paused) {
      if (!this.tracks.length) return;
      let next = (this.index + direction + this.tracks.length) % this.tracks.length;
      if (this.shuffle && this.tracks.length > 1) {
        do {
          next = Math.floor(Math.random() * this.tracks.length);
        } while (next === this.index);
      }
      this.select(next, play);
    },
    add(tracks) {
      const empty = !this.tracks.length;
      this.tracks.push(...tracks);
      if (empty) this.select(0);
      this.emit();
    },
    sample() {
      const existing = this.tracks.findIndex(track => track.builtin);
      if (existing >= 0) this.select(existing);else {
        this.tracks.push({
          id: uid(),
          title: 'Windows Welcome',
          artist: 'Locally synthesized sample',
          builtin: true,
          url: null,
          duration: 12,
          mime: 'audio/wav'
        });
        this.select(this.tracks.length - 1);
      }
    },
    async importFiles() {
      pickFiles('audio/*,.wav,.mp3,.ogg,.m4a,.flac,.aac,.webm', true, files => {
        const start = this.tracks.length;
        this.add(files.map(file => ({
          id: uid(),
          title: file.name,
          artist: 'Imported audio',
          url: URL.createObjectURL(file),
          mime: file.type,
          file
        })));
        this.select(start);
      });
    },
    async openSaved(path) {
      path = path || (await sys.fileDialog({
        mode: 'open',
        path: 'C:/My Documents',
        filter: '.wav,.mp3,.ogg,.m4a,.flac,.aac,.webm'
      }));
      if (!path) return;
      const content = sys.vfs.read(path);
      if (typeof content !== 'string' || !/^data:audio\//i.test(content)) {
        await tell('Open Audio', 'This file does not contain supported saved audio. Use Import Audio Files to open a file from your computer.');
        return;
      }
      this.add([{
        id: uid(),
        title: basename(path),
        artist: path,
        url: content,
        path,
        mime: content.slice(5, content.indexOf(';'))
      }]);
      this.select(this.tracks.length - 1);
    },
    remove(index) {
      const track = this.tracks[index];
      if (!track) return;
      const current = index === this.index;
      this.tracks.splice(index, 1);
      if (track.url?.startsWith('blob:')) URL.revokeObjectURL(track.url);
      if (!this.tracks.length) {
        this.stop();
        audio.removeAttribute('src');
        audio.load();
        this.index = -1;
      } else if (current) this.select(Math.min(index, this.tracks.length - 1));else if (index < this.index) this.index--;
      this.emit();
    },
    async exportCurrent() {
      const track = this.current();
      if (!track) return;
      if (track.builtin) sys.download(welcomeWave(), 'Windows Welcome.wav', 'audio/wav');else if (track.file) sys.download(track.file, track.title, track.mime || 'application/octet-stream');else if (track.path) {
        const value = sys.vfs.read(track.path);
        const bytes = dataURLBlob(value);
        if (bytes) sys.download(bytes, track.title, track.mime || 'audio/webm');
      }
    }
  };
  function dataURLBlob(value) {
    if (typeof value !== 'string' || !value.startsWith('data:')) return null;
    const comma = value.indexOf(',');
    if (comma < 0) return null;
    try {
      const header = value.slice(0, comma),
        body = value.slice(comma + 1),
        raw = header.includes(';base64') ? atob(body) : decodeURIComponent(body);
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      return new Blob([bytes], {
        type: header.slice(5).split(';')[0]
      });
    } catch {
      return null;
    }
  }
  for (const eventName of ['play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'waiting', 'canplay']) audio.addEventListener(eventName, () => {
    if (engine.current() && Number.isFinite(audio.duration)) engine.current().duration = audio.duration;
    engine.emit();
  });
  audio.addEventListener('error', () => {
    engine.error = 'This audio could not be decoded. Try a WAV, MP3, or another browser-supported format.';
    engine.emit();
  });
  audio.addEventListener('ended', () => {
    if (engine.repeat) engine.next(1, true);else if (engine.index < engine.tracks.length - 1) engine.next(1, true);else {
      engine.emit();
    }
  });
  engine.applyVolume();
  engine.sample();
  sys.mediaAudio = engine;
  function transport(win, compact = false) {
    const row = E('div', `media-transport ${compact ? 'media-transport-compact' : ''}`);
    const previous = button('▮◀', () => engine.next(-1));
    previous.title = 'Previous track';
    previous.setAttribute('aria-label', 'Previous track');
    const play = button('▶', () => engine.play(), 'media-play');
    play.title = 'Play';
    play.setAttribute('aria-label', 'Play');
    const pause = button('Ⅱ', () => engine.pause());
    pause.title = 'Pause';
    pause.setAttribute('aria-label', 'Pause');
    const stop = button('■', () => engine.stop());
    stop.title = 'Stop';
    stop.setAttribute('aria-label', 'Stop');
    const next = button('▶▮', () => engine.next(1));
    next.title = 'Next track';
    next.setAttribute('aria-label', 'Next track');
    row.append(previous, play, pause, stop, next);
    const update = () => {
      const exists = !!engine.current();
      [previous, play, pause, stop, next].forEach(b => {
        b.disabled = !exists;
      });
      play.classList.toggle('media-pressed', exists && !audio.paused);
      pause.classList.toggle('media-pressed', exists && audio.paused && audio.currentTime > 0);
    };
    listen(win, engine.events, 'change', update);
    update();
    return row;
  }
  function player(args = {}) {
    const win = makeWin({
      title: 'Windows Media Player',
      icon: 'mediaplayer',
      width: 540,
      height: 435,
      minWidth: 340,
      minHeight: 290,
      resizable: true
    }, 'media-player');
    let playlistVisible = true,
      selected = engine.index;
    const root = E('div', 'media-player-content');
    const screen = E('div', 'media-player-screen sunken');
    const canvas = E('canvas', 'media-spectrum');
    canvas.width = 480;
    canvas.height = 116;
    canvas.setAttribute('aria-hidden', 'true');
    const brand = E('div', 'media-player-brand');
    const logo = E('span', 'media-player-logo');
    logo.append(E('i'), E('i'), E('i'), E('i'));
    const branding = E('div');
    branding.append(E('div', 'media-brand-microsoft', 'Microsoft'), E('div', 'media-brand-name', 'Windows Media Player'));
    brand.append(logo, branding);
    screen.append(canvas, brand);
    const seekRow = E('div', 'media-seek-row');
    const seek = E('input', 'media-seek');
    seek.type = 'range';
    seek.min = '0';
    seek.max = '12';
    seek.step = '0.1';
    seek.value = '0';
    seek.setAttribute('aria-label', 'Playback position');
    seek.addEventListener('input', () => engine.seek(seek.value));
    const clock = E('span', 'media-clock', '0:00 / 0:12');
    seekRow.append(seek, clock);
    const controls = E('div', 'media-player-controls');
    controls.append(transport(win));
    const mute = button('♪', () => engine.setMuted(!engine.muted), 'media-mute');
    mute.setAttribute('aria-label', 'Mute');
    const volume = E('input', 'media-volume-inline');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.setAttribute('aria-label', 'Volume');
    volume.addEventListener('input', () => engine.setVolume(volume.value));
    controls.append(E('span', 'media-control-spacer'), mute, volume);
    const listBox = E('div', 'media-playlist sunken');
    const table = E('table', 'media-table');
    const head = E('thead'),
      heading = E('tr');
    ['Clip', 'Length'].forEach(t => heading.append(E('th', '', t)));
    head.append(heading);
    const rows = E('tbody');
    table.append(head, rows);
    listBox.append(table);
    const playlistActions = E('div', 'media-playlist-actions');
    playlistActions.append(button('Add...', () => engine.importFiles()), button('Remove', () => engine.remove(selected)), E('span', '', 'Local audio playlist'));
    root.append(screen, seekRow, controls, listBox, playlistActions);
    win.body.append(root);
    sys.menuBar(win, [{
      label: 'File',
      items: [menu('Import Audio Files...', () => engine.importFiles(), 'Ctrl+O'), menu('Open Saved Audio...', () => engine.openSaved()), menu('Load Sample Audio', () => engine.sample()), separator, menu('Export Current Audio...', () => engine.exportCurrent()), separator, menu('Properties', () => {
        const track = engine.current();
        tell('Media Properties', track ? `${track.title}\n\nSource: ${track.artist || 'Local audio'}\nLength: ${time(track.duration)}\nFormat: ${track.mime || 'Determined by browser'}` : 'No audio is loaded.');
      }), separator, menu('Exit', () => win.close())]
    }, {
      label: 'View',
      items: [menu('Playlist', () => {
        playlistVisible = !playlistVisible;
        listBox.hidden = !playlistVisible;
        playlistActions.hidden = !playlistVisible;
      }), menu('Volume Control', () => sys.open('volume'))]
    }, {
      label: 'Play',
      items: [menu('Play / Pause', () => audio.paused ? engine.play() : engine.pause(), 'Space'), menu('Stop', () => engine.stop()), separator, menu('Previous Clip', () => engine.next(-1)), menu('Next Clip', () => engine.next(1)), separator, menu('Repeat Playlist', () => {
        engine.repeat = !engine.repeat;
        update();
      }), menu('Shuffle', () => {
        engine.shuffle = !engine.shuffle;
        update();
      })]
    }, {
      label: 'Help',
      items: [menu('About Windows Media Player', () => tell('Windows Media Player', 'Windows Media Player — Classic Edition\n\nPlay audio files imported from your computer, saved recordings, or the locally synthesized Windows Welcome sample. Supported formats depend on your browser.'))]
    }]);
    const bar = status(win, 'Stopped');
    let listSignature = '';
    function update() {
      const track = engine.current(),
        duration = Number.isFinite(audio.duration) ? audio.duration : track?.duration || 0;
      seek.max = String(duration || 1);
      seek.value = String(audio.currentTime || 0);
      seek.disabled = !track || !Number.isFinite(audio.duration);
      clock.textContent = `${time(audio.currentTime)} / ${time(duration)}`;
      volume.value = String(engine.volume);
      mute.classList.toggle('media-pressed', engine.muted);
      mute.title = engine.muted ? 'Unmute' : 'Mute';
      bar.textContent = engine.error || `${!track ? 'No media loaded' : audio.ended ? 'Finished' : audio.paused ? audio.currentTime > 0 ? 'Paused' : 'Stopped' : 'Playing'}${track ? ` — ${track.title}` : ''}${engine.repeat ? '  • Repeat' : ''}${engine.shuffle ? '  • Shuffle' : ''}`;
      win.setTitle(track ? `${track.title} - Windows Media Player` : 'Windows Media Player');
      const signature = engine.tracks.map(t => `${t.id}:${t.duration || ''}`).join('|');
      if (listSignature !== signature) {
        listSignature = signature;
        rows.replaceChildren();
        engine.tracks.forEach((t, i) => {
          const row = E('tr');
          row.tabIndex = 0;
          row.dataset.index = String(i);
          row.append(E('td', '', `${i + 1}. ${t.title}`), E('td', '', t.duration ? time(t.duration) : '—'));
          row.addEventListener('click', () => {
            selected = i;
            update();
          });
          row.addEventListener('dblclick', () => engine.select(i, true));
          row.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              engine.select(i, true);
            }
          });
          rows.append(row);
        });
      }
      if (selected >= engine.tracks.length) selected = engine.index;
      [...rows.children].forEach((r, i) => {
        r.classList.toggle('selected', i === selected);
        r.classList.toggle('media-current-track', i === engine.index);
      });
      brand.classList.toggle('media-playing', !audio.paused);
    }
    listen(win, engine.events, 'change', update);
    listen(win, win.el, 'keydown', event => {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        audio.paused ? engine.play() : engine.pause();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        engine.importFiles();
      }
    });
    let frame;
    const context = canvas.getContext('2d'),
      frequencies = new Uint8Array(128);
    const draw = () => {
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (engine.analyser && !audio.paused) {
          engine.analyser.getByteFrequencyData(frequencies);
          for (let i = 0; i < 48; i++) {
            const height = frequencies[i * 2] / 255 * 92;
            context.fillStyle = i % 3 === 0 ? '#22bd82' : '#287fd0';
            context.fillRect(i * 10 + 1, 116 - height, 7, height);
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    win.addCleanup(() => cancelAnimationFrame(frame));
    update();
    if (args.path) engine.openSaved(args.path);
    return win;
  }
  function cdPlayer(args = {}) {
    const win = makeWin({
      title: 'CD Player',
      icon: 'cdplayer',
      width: 435,
      height: 308,
      minWidth: 380,
      minHeight: 280,
      resizable: false
    }, 'media-cd');
    sys.menuBar(win, [{
      label: 'Disc',
      items: [menu('Import Audio Files...', () => engine.importFiles()), menu('Open Saved Audio...', () => engine.openSaved()), menu('Load Sample Audio', () => engine.sample()), separator, menu('Clear Playlist', async () => {
        if (await confirm('CD Player', 'Clear the shared audio playlist? Your original files will remain on your computer.')) while (engine.tracks.length) engine.remove(0);
      }), separator, menu('Exit', () => win.close())]
    }, {
      label: 'View',
      items: [menu('Volume Control', () => sys.open('volume')), menu('Windows Media Player', () => sys.open('mediaplayer'))]
    }, {
      label: 'Options',
      items: [menu('Continuous Play', () => {
        engine.repeat = !engine.repeat;
        update();
      }), menu('Random Order', () => {
        engine.shuffle = !engine.shuffle;
        update();
      })]
    }, {
      label: 'Help',
      items: [menu('About CD Player', () => tell('CD Player', 'CD Player — Local Audio Edition\n\nBrowsers cannot access physical audio CD drives. This player uses the same imported audio playlist as Windows Media Player. Import audio files to play your own music.'))]
    }]);
    const root = E('div', 'media-cd-content');
    const displayRow = E('div', 'media-cd-display-row');
    const disc = E('div', 'media-disc-art');
    disc.append(E('span'));
    const display = E('div', 'media-cd-display sunken');
    const digits = E('div', 'media-cd-digits', '[01]  00:00');
    const state = E('div', 'media-cd-state', 'STOPPED');
    display.append(digits, state);
    displayRow.append(disc, display);
    root.append(displayRow);
    const artist = E('div', 'media-cd-field');
    artist.append(E('span', '', 'Artist:'));
    const artistValue = E('input', 'sunken');
    artistValue.readOnly = true;
    artist.append(artistValue);
    const titleRow = E('div', 'media-cd-field');
    titleRow.append(E('span', '', 'Title:'));
    const titleValue = E('input', 'sunken');
    titleValue.readOnly = true;
    titleRow.append(titleValue);
    const trackRow = E('label', 'media-cd-field');
    trackRow.append(E('span', '', 'Track:'));
    const trackSelect = E('select', 'sunken');
    trackSelect.setAttribute('aria-label', 'Audio track');
    trackSelect.addEventListener('change', () => engine.select(Number(trackSelect.value), !audio.paused));
    trackRow.append(trackSelect);
    const seek = E('input', 'media-cd-seek');
    seek.type = 'range';
    seek.min = '0';
    seek.step = '0.1';
    seek.setAttribute('aria-label', 'Playback position');
    seek.addEventListener('input', () => engine.seek(seek.value));
    const controls = transport(win, true);
    const mode = E('span', 'media-cd-mode');
    controls.append(mode);
    root.append(artist, titleRow, trackRow, seek, controls);
    win.body.append(root);
    const bar = status(win, 'Local audio • Physical CD drives unavailable');
    let signature = '';
    function update() {
      const track = engine.current();
      digits.textContent = `[${String(engine.index + 1).padStart(2, '0')}]  ${time(audio.currentTime).padStart(5, '0')}`;
      state.textContent = !track ? 'NO AUDIO LOADED' : audio.ended ? 'FINISHED' : audio.paused ? audio.currentTime > 0 ? 'PAUSED' : 'STOPPED' : 'PLAYING';
      artistValue.value = track?.artist || '';
      titleValue.value = track?.title || '';
      const newSignature = engine.tracks.map(t => t.id).join('|');
      if (signature !== newSignature) {
        signature = newSignature;
        trackSelect.replaceChildren();
        engine.tracks.forEach((t, i) => {
          const option = E('option', '', `${String(i + 1).padStart(2, '0')}  ${t.title}`);
          option.value = String(i);
          trackSelect.append(option);
        });
      }
      trackSelect.value = String(engine.index);
      trackSelect.disabled = !track;
      seek.max = String(Number.isFinite(audio.duration) ? audio.duration : track?.duration || 1);
      seek.value = String(audio.currentTime || 0);
      seek.disabled = !Number.isFinite(audio.duration);
      mode.textContent = `${engine.repeat ? 'REPEAT ' : ''}${engine.shuffle ? 'RANDOM' : ''}`;
      bar.textContent = engine.error || 'Local audio • Physical CD drives unavailable';
    }
    listen(win, engine.events, 'change', update);
    update();
    if (args.path) engine.openSaved(args.path);
    return win;
  }
  function volumeControl() {
    const win = makeWin({
      title: 'Volume Control',
      icon: 'volume',
      width: 354,
      height: 360,
      minWidth: 320,
      minHeight: 325,
      resizable: false
    }, 'media-mixer');
    sys.menuBar(win, [{
      label: 'Options',
      items: [menu('Properties', () => tell('Volume Control Properties', 'Playback: Volume Control adjusts all media playback and system sounds. Wave adjusts the shared audio players.\n\nRecording: Microphone adjusts new Sound Recorder recordings when Web Audio is available. Microphone changes do not request access to your microphone.')), menu('Restore Defaults', () => {
        engine.setVolume(70);
        engine.setMuted(false);
        engine.setChannel('wave', 100);
        engine.setChannel('waveMuted', false);
        engine.setChannel('mic', 80);
        engine.setChannel('micMuted', false);
        engine.setChannel('balance', 0);
      }), separator, menu('Exit', () => win.close())]
    }, {
      label: 'Help',
      items: [menu('About Volume Control', () => tell('Volume Control', 'Adjusts this desktop’s audio. Your computer’s hardware and operating system volume are controlled separately.'))]
    }]);
    const channels = E('div', 'media-mixer-channels');
    const controls = [];
    [{
      title: 'Volume Control',
      key: 'volume',
      mute: 'muted'
    }, {
      title: 'Wave',
      key: 'wave',
      mute: 'waveMuted'
    }, {
      title: 'Microphone',
      key: 'mic',
      mute: 'micMuted'
    }].forEach(channel => {
      const column = E('section', 'media-mixer-channel');
      column.append(E('div', 'media-mixer-title', channel.title));
      if (channel.key !== 'mic') {
        const balanceLabel = E('label', 'media-balance-label', 'Balance:');
        const balance = E('input', 'media-balance');
        balance.type = 'range';
        balance.min = '-100';
        balance.max = '100';
        balance.value = String(engine.balance);
        balance.setAttribute('aria-label', `${channel.title} balance`);
        balance.addEventListener('input', () => engine.setChannel('balance', balance.value));
        column.append(balanceLabel, E('div', 'media-balance-ends', 'L                 R'), balance);
        controls.push({
          node: balance,
          key: 'balance'
        });
      } else {
        column.append(E('div', 'media-mic-label', 'Recording\ninput level'));
      }
      column.append(E('div', 'media-level-label', 'Volume:'));
      const scale = E('div', 'media-slider-well');
      const ticks = E('div', 'media-slider-ticks');
      for (let i = 0; i < 9; i++) ticks.append(E('i'));
      const slider = E('input', 'media-vertical-slider');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.setAttribute('aria-label', `${channel.title} volume`);
      slider.addEventListener('input', () => channel.key === 'volume' ? engine.setVolume(slider.value) : engine.setChannel(channel.key, slider.value));
      scale.append(ticks, slider);
      column.append(scale);
      controls.push({
        node: slider,
        key: channel.key
      });
      const muteLabel = E('label', 'media-mute-label');
      const mute = E('input');
      mute.type = 'checkbox';
      mute.addEventListener('change', () => channel.mute === 'muted' ? engine.setMuted(mute.checked) : engine.setChannel(channel.mute, mute.checked));
      muteLabel.append(mute, E('span', '', channel.key === 'volume' ? 'Mute all' : 'Mute'));
      column.append(muteLabel);
      controls.push({
        node: mute,
        key: channel.mute
      });
      channels.append(column);
    });
    win.body.append(channels);
    status(win, 'Desktop audio mixer');
    const update = () => controls.forEach(({
      node,
      key
    }) => {
      if (node.type === 'checkbox') node.checked = engine[key];else node.value = String(engine[key]);
    });
    listen(win, engine.events, 'volume', update);
    update();
    return win;
  }
  function soundRecorder(args = {}) {
    const win = makeWin({
      title: 'Sound - Sound Recorder',
      icon: 'soundrecorder',
      width: 390,
      height: 294,
      minWidth: 350,
      minHeight: 265,
      resizable: false
    }, 'media-recorder');
    let recorder = null,
      stream = null,
      source = null,
      recordGain = null,
      analyser = null,
      destination = null,
      chunks = [],
      blob = null,
      blobURL = null,
      path = null,
      dirty = false,
      recording = false,
      preparing = false,
      startedAt = 0,
      recordedLength = 0,
      playbackVolume = 1;
    const playback = new Audio();
    playback.preload = 'metadata';
    const root = E('div', 'media-recorder-content');
    const screen = E('div', 'media-recorder-screen sunken');
    const canvas = E('canvas');
    canvas.width = 340;
    canvas.height = 65;
    canvas.setAttribute('aria-label', 'Recording waveform');
    screen.append(canvas);
    const counters = E('div', 'media-recorder-counters');
    const position = E('span', '', 'Position: 0.00 sec.');
    const length = E('span', '', 'Length: 0.00 sec.');
    counters.append(position, length);
    const seek = E('input', 'media-recorder-seek');
    seek.type = 'range';
    seek.min = '0';
    seek.step = '0.01';
    seek.setAttribute('aria-label', 'Recording position');
    seek.addEventListener('input', () => {
      if (blob && !recording) {
        try {
          playback.currentTime = Number(seek.value);
        } catch {/* media not yet seekable */}
        update();
      }
    });
    const controls = E('div', 'media-recorder-buttons');
    const first = button('◀◀', () => {
      playback.currentTime = 0;
      update();
    });
    first.setAttribute('aria-label', 'Seek to beginning');
    const last = button('▶▶', () => {
      playback.currentTime = getLength();
      update();
    });
    last.setAttribute('aria-label', 'Seek to end');
    const play = button('▶', async () => {
      try {
        await engine.ensureContext();
        if (playback.currentTime >= getLength() - 0.02) playback.currentTime = 0;
        await playback.play();
        update();
      } catch (error) {
        tell('Sound Recorder', error.message || 'This recording cannot be played in this browser.');
      }
    });
    play.setAttribute('aria-label', 'Play recording');
    const stop = button('■', () => {
      if (recording) stopRecording();else {
        playback.pause();
        update();
      }
    });
    stop.setAttribute('aria-label', 'Stop');
    const record = button('●', startRecording, 'media-record-button');
    record.setAttribute('aria-label', 'Record from microphone');
    controls.append(first, last, play, stop, record);
    root.append(screen, counters, seek, controls);
    win.body.append(root);
    const bar = status(win, 'Ready — click Record to use your microphone');
    const getLength = () => Number.isFinite(playback.duration) ? playback.duration : recordedLength;
    const extension = () => blob?.type.includes('ogg') ? 'ogg' : blob?.type.includes('wav') ? 'wav' : blob?.type.includes('mp4') ? 'm4a' : 'webm';
    function syncVolume() {
      playback.volume = clamp(engine.effectiveVolume() * playbackVolume, 0, 1);
      if (recordGain) recordGain.gain.value = engine.micMuted ? 0 : engine.mic / 100;
    }
    function stopTracks() {
      stream?.getTracks().forEach(track => track.stop());
      destination?.stream.getTracks().forEach(track => track.stop());
      source?.disconnect();
      recordGain?.disconnect();
      analyser?.disconnect();
      stream = null;
      source = null;
      recordGain = null;
      analyser = null;
      destination = null;
    }
    function attachBlob(next, name = 'Sound', seconds = 0, changed = true) {
      if (blobURL) URL.revokeObjectURL(blobURL);
      blob = next;
      blobURL = URL.createObjectURL(next);
      playback.src = blobURL;
      recordedLength = seconds;
      dirty = changed;
      win.setTitle(`${name} - Sound Recorder`);
      update();
    }
    async function startRecording() {
      if (preparing || recording) return;
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
        await tell('Sound Recorder', 'Microphone recording is not available in this browser or browsing context. You can still import and play an audio file.');
        return;
      }
      if (dirty && !(await confirm('Sound Recorder', 'Replace the current unsaved recording?'))) return;
      preparing = true;
      playback.pause();
      bar.textContent = 'Waiting for microphone permission...';
      update();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        if (!win.el.isConnected) {
          stopTracks();
          preparing = false;
          return;
        }
        const context = await engine.ensureContext();
        let input = stream;
        if (context) {
          source = context.createMediaStreamSource(stream);
          recordGain = context.createGain();
          analyser = context.createAnalyser();
          analyser.fftSize = 512;
          destination = context.createMediaStreamDestination();
          source.connect(recordGain);
          recordGain.connect(analyser);
          recordGain.connect(destination);
          input = destination.stream;
          syncVolume();
        }
        const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported?.(type));
        recorder = mimeType ? new MediaRecorder(input, {
          mimeType
        }) : new MediaRecorder(input);
        chunks = [];
        recorder.addEventListener('dataavailable', event => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener('stop', () => {
          const type = recorder?.mimeType || chunks[0]?.type || 'audio/webm';
          const next = new Blob(chunks, {
            type
          });
          recording = false;
          stopTracks();
          if (next.size) {
            path = null;
            attachBlob(next, 'Sound', recordedLength);
            bar.textContent = `Recorded ${recordedLength.toFixed(2)} seconds • ${extension().toUpperCase()} audio`;
          } else {
            bar.textContent = 'No audio data was recorded.';
          }
          recorder = null;
          update();
        });
        recorder.addEventListener('error', event => {
          bar.textContent = event.error?.message || 'Recording failed.';
          recording = false;
          stopTracks();
          update();
        });
        recorder.start(250);
        startedAt = performance.now();
        recordedLength = 0;
        recording = true;
        bar.textContent = 'Recording from microphone...';
      } catch (error) {
        stopTracks();
        bar.textContent = 'Recording did not start.';
        await tell('Sound Recorder', error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access in your browser and click Record again.' : error.name === 'NotFoundError' ? 'No microphone was found. Connect a microphone and try again.' : `Unable to record: ${error.message || error.name}`);
      } finally {
        preparing = false;
        update();
      }
    }
    function stopRecording() {
      if (recorder?.state === 'recording') {
        recordedLength = (performance.now() - startedAt) / 1000;
        recorder.stop();
      }
    }
    async function save(asNew = false) {
      if (recording || preparing) {
        await tell('Sound Recorder', 'Stop recording before saving the audio.');
        return false;
      }
      if (!blob) {
        await tell('Sound Recorder', 'Record or open audio before saving.');
        return false;
      }
      const target = !asNew && path ? path : await sys.fileDialog({
        mode: 'save',
        path: 'C:/My Documents',
        filename: path ? basename(path) : `Recording.${extension()}`,
        filter: `.${extension()}`
      });
      if (!target) return false;
      try {
        const content = await fileData(blob);
        sys.vfs.write(target, content, {
          mime: blob.type
        });
        path = target;
        dirty = false;
        win.setTitle(`${basename(path)} - Sound Recorder`);
        bar.textContent = `Saved ${basename(path)}`;
        return true;
      } catch (error) {
        await tell('Sound Recorder', `The recording could not be saved. ${error.message || ''}`);
        return false;
      }
    }
    async function openSaved(savedPath) {
      if (recording || preparing) return;
      if (dirty && !(await confirm('Sound Recorder', 'Discard the current unsaved recording?'))) return;
      const target = savedPath || (await sys.fileDialog({
        mode: 'open',
        path: 'C:/My Documents',
        filter: '.wav,.mp3,.ogg,.webm,.m4a'
      }));
      if (!target) return;
      const data = sys.vfs.read(target);
      const next = dataURLBlob(data);
      if (!next || !next.type.startsWith('audio/')) return tell('Sound Recorder', 'The selected file does not contain saved audio.');
      path = target;
      attachBlob(next, basename(path), 0, false);
      bar.textContent = 'Ready';
    }
    async function newRecording() {
      if (recording || preparing) return;
      if (dirty && !(await confirm('Sound Recorder', 'Discard the current unsaved recording?'))) return;
      playback.pause();
      playback.removeAttribute('src');
      playback.load();
      if (blobURL) URL.revokeObjectURL(blobURL);
      blobURL = null;
      blob = null;
      path = null;
      dirty = false;
      recordedLength = 0;
      win.setTitle('Sound - Sound Recorder');
      bar.textContent = 'Ready — click Record to use your microphone';
      update();
    }
    sys.menuBar(win, [{
      label: 'File',
      items: [menu('New', newRecording), menu('Open Saved Audio...', () => openSaved()), menu('Import Audio File...', () => {
        if (recording || preparing) return;
        pickFiles('audio/*,.wav,.mp3,.ogg,.webm', false, async files => {
          if (dirty && !(await confirm('Sound Recorder', 'Discard the current unsaved recording?'))) return;
          path = null;
          attachBlob(files[0], files[0].name, 0, true);
          bar.textContent = 'Imported audio';
        });
      }), separator, menu('Save', () => save()), menu('Save As...', () => save(true)), menu('Export Audio File...', () => {
        if (blob) sys.download(blob, path ? basename(path) : `Recording.${extension()}`, blob.type);else tell('Sound Recorder', 'Record or open audio before exporting.');
      }), separator, menu('Exit', () => win.close())]
    }, {
      label: 'Edit',
      items: [menu('Copy to Audio Playlist', () => {
        if (!blob) return tell('Sound Recorder', 'Record or open audio first.');
        engine.add([{
          id: uid(),
          title: path ? basename(path) : `Recording.${extension()}`,
          artist: 'Sound Recorder',
          url: URL.createObjectURL(blob),
          mime: blob.type,
          file: blob,
          duration: getLength()
        }]);
        bar.textContent = 'Added to the shared audio playlist';
      }), menu('Clear Recording', newRecording)]
    }, {
      label: 'Effects',
      items: [menu('Increase Playback Volume', () => {
        playbackVolume = clamp(playbackVolume + 0.25, 0, 1);
        syncVolume();
        bar.textContent = `Playback volume: ${Math.round(playbackVolume * 100)}%`;
      }), menu('Decrease Playback Volume', () => {
        playbackVolume = clamp(playbackVolume - 0.25, 0, 1);
        syncVolume();
        bar.textContent = `Playback volume: ${Math.round(playbackVolume * 100)}%`;
      }), separator, menu('Half Playback Speed', () => {
        playback.playbackRate = 0.5;
        bar.textContent = 'Playback speed: 0.5×';
      }), menu('Normal Playback Speed', () => {
        playback.playbackRate = 1;
        bar.textContent = 'Playback speed: 1×';
      }), menu('Double Playback Speed', () => {
        playback.playbackRate = 2;
        bar.textContent = 'Playback speed: 2×';
      })]
    }, {
      label: 'Help',
      items: [menu('About Sound Recorder', () => tell('Sound Recorder', 'Records audio from your microphone after you grant permission. Recordings are saved in the format supported by your browser, usually WebM or Ogg.\n\nPlayback effects affect listening only; the saved recording retains its original audio.'))]
    }]);
    function update() {
      const elapsed = recording ? (performance.now() - startedAt) / 1000 : playback.currentTime || 0;
      position.textContent = `Position: ${elapsed.toFixed(2)} sec.`;
      length.textContent = `Length: ${(recording ? elapsed : getLength() || 0).toFixed(2)} sec.`;
      seek.max = String(getLength() || 1);
      seek.value = String(playback.currentTime || 0);
      seek.disabled = !blob || recording || preparing;
      [first, last, play].forEach(b => {
        b.disabled = !blob || recording || preparing;
      });
      stop.disabled = !recording && playback.paused;
      record.disabled = recording || preparing;
      record.classList.toggle('media-pressed', recording);
    }
    ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended'].forEach(name => playback.addEventListener(name, update));
    listen(win, engine.events, 'volume', syncVolume);
    syncVolume();
    const ctx = canvas.getContext('2d'),
      waveform = new Uint8Array(512);
    let frame;
    const draw = () => {
      if (ctx) {
        ctx.fillStyle = '#001300';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (recording && analyser) analyser.getByteTimeDomainData(waveform);else waveform.fill(128);
        for (let i = 0; i < waveform.length; i++) {
          const x = i / (waveform.length - 1) * canvas.width,
            y = waveform[i] / 255 * canvas.height;
          if (i === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (recording) update();
      frame = requestAnimationFrame(draw);
    };
    draw();
    win.onBeforeClose = () => {
      if (recording) {
        stopRecording();
        tell('Sound Recorder', 'Recording has stopped. Save or discard the recording before closing.');
        return false;
      }
      if (preparing) return false;
      if (!dirty) return true;
      sys.dialog({
        title: 'Sound Recorder',
        message: 'Save the recording before closing?',
        buttons: [{
          label: 'Yes',
          value: 'yes'
        }, {
          label: 'No',
          value: 'no'
        }, {
          label: 'Cancel',
          value: 'cancel'
        }]
      }).then(async value => {
        if (value === 'no' || value === 'yes' && (await save())) {
          dirty = false;
          win.close();
        }
      });
      return false;
    };
    win.addCleanup(() => {
      cancelAnimationFrame(frame);
      playback.pause();
      if (recorder?.state === 'recording') recorder.stop();
      stopTracks();
      if (blobURL) URL.revokeObjectURL(blobURL);
    });
    update();
    if (args.path) openSaved(args.path);
    return win;
  }
  let contacts = readArray('addressbook.contacts', []).filter(c => c && typeof c === 'object');
  const contactName = c => [c.first, c.last].filter(Boolean).join(' ').trim() || c.name || c.email || '(Unnamed contact)';
  const persistContacts = () => {
    settings.set('addressbook.contacts', contacts);
    notify('contacts');
  };
  function contactEditor(contact = null, afterSave = null) {
    const win = makeWin({
      title: contact ? `${contactName(contact)} Properties` : 'New Contact Properties',
      icon: 'addressbook',
      width: 440,
      height: 425,
      minWidth: 400,
      minHeight: 380,
      resizable: false
    }, 'media-contact-editor');
    const tabs = E('div', 'media-property-tabs');
    const panels = E('div', 'media-property-panel');
    const inputs = {};
    const definitions = [{
      name: 'Name',
      fields: [['First name:', 'first'], ['Last name:', 'last'], ['Nickname:', 'nickname'], ['E-mail address:', 'email'], ['Home phone:', 'phone']]
    }, {
      name: 'Home',
      fields: [['Street:', 'street'], ['City:', 'city'], ['State/Province:', 'state'], ['ZIP/Postal code:', 'zip'], ['Country/Region:', 'country']]
    }, {
      name: 'Business',
      fields: [['Company:', 'company'], ['Job title:', 'job'], ['Business phone:', 'workPhone']]
    }, {
      name: 'Notes',
      fields: []
    }];
    definitions.forEach((definition, index) => {
      const panel = E('div', 'media-contact-panel');
      panel.hidden = index !== 0;
      if (index === 0) {
        const heading = E('div', 'media-contact-heading');
        heading.append(icon('addressbook', 32), E('span', '', 'Enter information about this contact.'));
        panel.append(heading);
      }
      definition.fields.forEach(([label, key]) => {
        const f = field(label, contact?.[key] || '', key === 'email' ? 'email' : 'text');
        inputs[key] = f.input;
        panel.append(f.wrap);
      });
      if (definition.name === 'Notes') {
        const label = E('label', '', 'Notes:');
        const notes = E('textarea', 'sunken media-contact-notes');
        notes.value = contact?.notes || '';
        inputs.notes = notes;
        label.append(notes);
        panel.append(label);
      }
      panels.append(panel);
      const tab = button(definition.name, () => {
        [...panels.children].forEach((p, i) => {
          p.hidden = i !== index;
        });
        [...tabs.children].forEach((t, i) => t.classList.toggle('active', i === index));
      });
      tab.classList.toggle('active', index === 0);
      tabs.append(tab);
    });
    const actions = E('div', 'media-dialog-actions');
    actions.append(button('OK', () => {
      const value = {
        id: contact?.id || uid()
      };
      Object.entries(inputs).forEach(([key, node]) => {
        value[key] = node.value.trim();
      });
      if (![value.first, value.last, value.email].some(Boolean)) return tell('Address Book', 'Enter a name or an e-mail address for this contact.');
      if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) && !/^[^\s@]+@localhost$/.test(value.email)) return tell('Address Book', 'Enter an e-mail address in the form name@example.com.');
      if (contact) contacts = contacts.map(c => c.id === contact.id ? value : c);else contacts.push(value);
      persistContacts();
      afterSave?.(value);
      win.close();
    }), button('Cancel', () => win.close()));
    win.body.append(tabs, panels, actions);
    setTimeout(() => inputs.first?.focus(), 0);
    return win;
  }
  function addressBook(args = {}) {
    const win = makeWin({
      title: 'Address Book - Main Identity',
      icon: 'addressbook',
      width: 650,
      height: 423,
      minWidth: 460,
      minHeight: 300,
      resizable: true
    }, 'media-addressbook');
    let selectedId = contacts[0]?.id || null,
      sortKey = 'name',
      sortDirection = 1,
      contactsSignature = '';
    const selected = () => contacts.find(c => c.id === selectedId);
    const newContact = () => contactEditor(null, c => {
      selectedId = c.id;
      render();
    });
    const properties = () => {
      const c = selected();
      if (c) contactEditor(c);else tell('Address Book', 'Select a contact first.');
    };
    const remove = async () => {
      const c = selected();
      if (c && (await confirm('Address Book', `Delete ${contactName(c)} from your address book?`))) {
        contacts = contacts.filter(item => item.id !== c.id);
        selectedId = null;
        persistContacts();
      }
    };
    const useContact = () => {
      const c = selected();
      if (!c) return;
      if (!c.email) return tell('Address Book', 'This contact does not have an e-mail address. Add one in Properties.');
      if (typeof args.onPick === 'function') {
        args.onPick(c);
        win.close();
      } else openCompose({
        to: c.email
      });
    };
    const toolbar = E('div', 'toolbar media-mail-toolbar');
    const add = button('New', newContact);
    add.prepend(icon('addressbook'));
    const prop = button('Properties', properties);
    prop.prepend(icon('properties'));
    const del = button('Delete', remove);
    del.prepend(icon('delete'));
    const compose = button(typeof args.onPick === 'function' ? 'Use Address' : 'New Message', useContact);
    compose.prepend(icon('outlook'));
    toolbar.append(add, prop, del, E('span', 'media-toolbar-divider'), compose);
    const searchRow = E('label', 'media-address-search', 'Type name or select from list:');
    const search = E('input', 'sunken');
    search.placeholder = 'Find a contact';
    search.setAttribute('aria-label', 'Find contact');
    search.addEventListener('input', render);
    searchRow.append(search);
    const main = E('div', 'media-address-main');
    const folders = E('div', 'media-address-folders sunken');
    const identity = E('div', 'selected');
    identity.append(icon('folder'), E('span', '', 'Main Identity'));
    folders.append(identity);
    const list = E('div', 'media-address-list sunken');
    const table = E('table', 'media-table');
    const thead = E('thead'),
      tr = E('tr');
    [['Name', 'name'], ['E-mail Address', 'email'], ['Phone', 'phone']].forEach(([title, key]) => {
      const th = E('th');
      const sort = E('button', '', title);
      sort.addEventListener('click', () => {
        sortDirection = sortKey === key ? -sortDirection : 1;
        sortKey = key;
        render();
      });
      th.append(sort);
      tr.append(th);
    });
    thead.append(tr);
    const tbody = E('tbody');
    table.append(thead, tbody);
    const empty = E('div', 'media-empty-list', 'There are no contacts to display. Click New to add a contact.');
    list.append(table, empty);
    main.append(folders, list);
    win.body.append(toolbar, searchRow, main);
    const bar = status(win, '');
    const exportContacts = () => {
      const lines = ['First Name,Last Name,E-mail Address,Phone,Company', ...contacts.map(c => [c.first, c.last, c.email, c.phone, c.company].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))];
      sys.download(lines.join('\r\n'), 'Address Book.csv', 'text/csv;charset=utf-8');
    };
    sys.menuBar(win, [{
      label: 'File',
      items: [menu('New Contact...', newContact), menu('Properties', properties), separator, menu('Export Address Book (CSV)...', exportContacts), separator, menu('Exit', () => win.close())]
    }, {
      label: 'Edit',
      items: [menu('Delete', remove), menu('Find', () => search.focus(), 'Ctrl+F')]
    }, {
      label: 'View',
      items: [menu('Sort by Name', () => {
        sortKey = 'name';
        sortDirection = 1;
        render();
      }), menu('Sort by E-mail Address', () => {
        sortKey = 'email';
        sortDirection = 1;
        render();
      })]
    }, {
      label: 'Tools',
      items: [menu('New Message', useContact)]
    }, {
      label: 'Help',
      items: [menu('About Address Book', () => tell('Address Book', 'Contacts are saved locally in this desktop. Create, edit, delete, search, and export contacts, or select one to address a local Outlook Express draft.'))]
    }]);
    function render() {
      const query = search.value.trim().toLowerCase();
      const visible = contacts.filter(c => `${contactName(c)} ${c.email || ''} ${c.company || ''}`.toLowerCase().includes(query)).sort((a, b) => String(sortKey === 'name' ? contactName(a) : a[sortKey] || '').localeCompare(String(sortKey === 'name' ? contactName(b) : b[sortKey] || '')) * sortDirection);
      const signature = JSON.stringify(visible);
      if (signature !== contactsSignature) {
        contactsSignature = signature;
        tbody.replaceChildren();
        visible.forEach(c => {
          const row = E('tr');
          row.dataset.contactId = c.id;
          row.tabIndex = 0;
          const nameCell = E('td');
          nameCell.append(icon('addressbook'), E('span', '', contactName(c)));
          row.append(nameCell, E('td', '', c.email || ''), E('td', '', c.phone || ''));
          row.addEventListener('click', () => {
            selectedId = c.id;
            render();
          });
          row.addEventListener('dblclick', () => {
            selectedId = c.id;
            if (typeof args.onPick === 'function') useContact();else properties();
          });
          row.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
              selectedId = c.id;
              properties();
            }
            if (e.key === 'Delete') {
              selectedId = c.id;
              remove();
            }
          });
          tbody.append(row);
        });
      }
      [...tbody.children].forEach(row => row.classList.toggle('selected', row.dataset.contactId === selectedId));
      empty.hidden = visible.length > 0;
      empty.textContent = query ? 'No contacts match your search.' : 'There are no contacts to display. Click New to add a contact.';
      prop.disabled = !selected();
      del.disabled = !selected();
      compose.disabled = !selected();
      bar.textContent = `${contacts.length} contact${contacts.length === 1 ? '' : 's'}${query ? `, ${visible.length} shown` : ''}`;
    }
    listen(win, localEvents, 'contacts', render);
    listen(win, win.el, 'keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        search.focus();
      }
    });
    render();
    return win;
  }
  const welcomeMail = {
    id: 'outlook-welcome',
    folder: 'Inbox',
    from: 'Windows 98 Welcome',
    fromEmail: 'welcome@localhost',
    to: 'user@localhost',
    cc: '',
    subject: 'Welcome to Outlook Express',
    body: 'Welcome to Outlook Express!\n\nThis local mailbox is ready for your messages and address book.\n\n• Choose Create Mail to compose a message.\n• Save a message to Drafts and return to it later.\n• Export a draft as an .eml file, or choose Open in Mail App to hand it to your configured e-mail application.\n• Add your contacts in the Address Book.\n\nMessages and contacts stay in this desktop. No e-mail account is connected, and this application does not send or receive messages.\n\nEnjoy your Windows 98 desktop.',
    date: '1998-06-25T09:00:00.000Z',
    read: false
  };
  let messages = readArray('outlook.messages', [welcomeMail]).filter(m => m && typeof m === 'object');
  const persistMail = () => {
    settings.set('outlook.messages', messages);
    notify('mail');
  };
  const safeHeader = value => String(value || '').replace(/[\r\n\x00-\x1f]/g, ' ').trim();
  const encodeHeader = value => /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
  const eml = message => [`From: ${safeHeader(message.fromEmail || 'user@localhost')}`, `To: ${safeHeader(message.to)}`, ...(message.cc ? [`Cc: ${safeHeader(message.cc)}`] : []), `Subject: ${encodeHeader(safeHeader(message.subject))}`, `Date: ${new Date(message.date || Date.now()).toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', 'X-Unsent: 1', '', String(message.body || '').replace(/\r?\n/g, '\r\n')].join('\r\n');
  const messageFilename = subject => `${String(subject || 'Untitled message').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100)}.eml`;
  const exportMail = message => sys.download(eml(message), messageFilename(message.subject), 'message/rfc822');
  const displayDate = date => {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  function openCompose(args = {}) {
    const existing = args.draftId ? messages.find(m => m.id === args.draftId && m.folder === 'Drafts') : null;
    const win = makeWin({
      title: `${existing?.subject || args.subject || 'New Message'} - Outlook Express`,
      icon: 'outlook',
      width: 675,
      height: 510,
      minWidth: 430,
      minHeight: 335,
      resizable: true
    }, 'media-composer');
    let draftId = existing?.id || null,
      dirty = false;
    const toolbar = E('div', 'toolbar media-mail-toolbar');
    const saveButton = button('Save Draft', saveDraft);
    saveButton.prepend(icon('save'));
    const exportButton = button('Export .eml', () => exportMail(value()));
    exportButton.prepend(icon('file'));
    const externalButton = button('Open in Mail App', openMailApp);
    externalButton.prepend(icon('outlook'));
    toolbar.append(saveButton, exportButton, E('span', 'media-toolbar-divider'), externalButton);
    const headers = E('div', 'media-compose-headers');
    const to = field('To:', existing?.to || args.to || '');
    const cc = field('Cc:', existing?.cc || args.cc || '');
    const subject = field('Subject:', existing?.subject || args.subject || '');
    subject.input.maxLength = 998;
    const toButton = button('To...', () => addressBook({
      onPick: c => {
        to.input.value += `${to.input.value.trim() ? '; ' : ''}${c.email}`;
        markDirty();
      }
    }));
    to.wrap.firstChild.replaceWith(toButton);
    const ccButton = button('Cc...', () => addressBook({
      onPick: c => {
        cc.input.value += `${cc.input.value.trim() ? '; ' : ''}${c.email}`;
        markDirty();
      }
    }));
    cc.wrap.firstChild.replaceWith(ccButton);
    headers.append(to.wrap, cc.wrap, subject.wrap);
    const textToolbar = E('div', 'media-compose-format');
    textToolbar.append(E('span', 'sunken', 'Plain Text'), E('span', '', 'UTF-8'), button('Clear', async () => {
      if ([to.input.value, cc.input.value, subject.input.value, body.value].some(Boolean) && (await confirm('Clear Draft', 'Clear the recipients, subject, and message text?'))) {
        [to.input, cc.input, subject.input, body].forEach(node => {
          node.value = '';
        });
        markDirty();
        body.focus();
      }
    }));
    const body = E('textarea', 'media-compose-body sunken');
    body.setAttribute('aria-label', 'Message text');
    body.spellcheck = true;
    body.value = existing?.body || args.body || '';
    win.body.append(toolbar, headers, textToolbar, body);
    const bar = status(win, 'Local draft • Use Export or Open in Mail App to continue outside this desktop');
    function value() {
      return {
        id: draftId || uid(),
        folder: 'Drafts',
        from: 'You',
        fromEmail: 'user@localhost',
        to: to.input.value.trim(),
        cc: cc.input.value.trim(),
        subject: subject.input.value.trim(),
        body: body.value,
        date: new Date().toISOString(),
        read: true
      };
    }
    function markDirty() {
      dirty = true;
      win.setTitle(`${subject.input.value || 'New Message'} - Outlook Express`);
      bar.textContent = 'Draft modified';
    }
    [to.input, cc.input, subject.input, body].forEach(input => input.addEventListener('input', markDirty));
    function saveDraft() {
      const message = value();
      draftId = message.id;
      const index = messages.findIndex(m => m.id === draftId);
      if (index < 0) messages.push(message);else messages[index] = message;
      persistMail();
      dirty = false;
      win.setTitle(`${message.subject || 'New Message'} - Outlook Express`);
      bar.textContent = `Saved to Drafts at ${new Date().toLocaleTimeString()}`;
      return true;
    }
    function openMailApp() {
      const message = value();
      saveDraft();
      if (!message.to) {
        tell('Open in Mail App', 'Enter an e-mail address in the To field first. The draft has been saved.');
        to.input.focus();
        return;
      }
      const url = `mailto:${message.to.split(/[;,]/).map(s => encodeURIComponent(s.trim())).filter(Boolean).join(',')}?subject=${encodeURIComponent(message.subject)}${message.cc ? `&cc=${encodeURIComponent(message.cc)}` : ''}&body=${encodeURIComponent(message.body)}`;
      if (url.length > 12000) {
        tell('Open in Mail App', 'This message is too long for a reliable mailto link. Export the draft as an .eml file and open it in your e-mail application.');
        return;
      }
      const link = E('a');
      link.href = url;
      link.click();
      bar.textContent = 'Opened a mailto request • Your configured mail app handles sending';
    }
    sys.menuBar(win, [{
      label: 'File',
      items: [menu('Save Draft', saveDraft, 'Ctrl+S'), menu('Export as .eml...', () => exportMail(value())), menu('Open in Mail App...', openMailApp), separator, menu('Close', () => win.close())]
    }, {
      label: 'Edit',
      items: [menu('Select All', () => {
        body.focus();
        body.select();
      }, 'Ctrl+A'), menu('Insert Contact Address...', () => addressBook({
        onPick: c => {
          const start = body.selectionStart,
            end = body.selectionEnd;
          body.setRangeText(c.email, start, end, 'end');
          markDirty();
          body.focus();
        }
      }))]
    }, {
      label: 'Tools',
      items: [menu('Address Book', () => addressBook())]
    }, {
      label: 'Help',
      items: [menu('About Local Mail', () => tell('Outlook Express', 'Save Draft stores this message in the local Drafts folder. Export creates a standard .eml file. Open in Mail App creates a mailto request for your configured e-mail application. Nothing is sent by this desktop.'))]
    }]);
    listen(win, win.el, 'keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDraft();
      }
    });
    win.onBeforeClose = () => {
      if (!dirty) return true;
      sys.dialog({
        title: 'Outlook Express',
        message: 'Save changes to this message?',
        buttons: [{
          label: 'Yes',
          value: 'yes'
        }, {
          label: 'No',
          value: 'no'
        }, {
          label: 'Cancel',
          value: 'cancel'
        }]
      }).then(result => {
        if (result === 'yes') saveDraft();
        if (result === 'yes' || result === 'no') {
          dirty = false;
          win.close();
        }
      });
      return false;
    };
    setTimeout(() => (to.input.value ? body : to.input).focus(), 0);
    return win;
  }
  function outlook(args = {}) {
    if (args.compose || args.to || args.draftId) return openCompose(args);
    const win = makeWin({
      title: 'Outlook Express',
      icon: 'outlook',
      width: 830,
      height: 560,
      minWidth: 560,
      minHeight: 385,
      resizable: true
    }, 'media-outlook');
    let folder = 'Inbox',
      selectedId = messages.find(m => m.folder === 'Inbox')?.id || null,
      sortKey = 'date',
      ascending = false,
      messageSignature = '';
    const selected = () => messages.find(m => m.id === selectedId && m.folder === folder);
    const create = () => openCompose({});
    const reply = () => {
      const m = selected();
      if (m) openCompose({
        to: m.fromEmail || '',
        subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject || ''}`,
        body: `\n\n----- Original Message -----\nFrom: ${m.from || m.fromEmail || ''}\nTo: ${m.to || ''}\nSent: ${displayDate(m.date)}\nSubject: ${m.subject || ''}\n\n${m.body || ''}`
      });
    };
    const forward = () => {
      const m = selected();
      if (m) openCompose({
        subject: /^fw:/i.test(m.subject) ? m.subject : `Fw: ${m.subject || ''}`,
        body: `\n\n----- Forwarded Message -----\nFrom: ${m.from || m.fromEmail || ''}\nSent: ${displayDate(m.date)}\nSubject: ${m.subject || ''}\n\n${m.body || ''}`
      });
    };
    const remove = async () => {
      const m = selected();
      if (!m) return;
      if (folder === 'Deleted Items') {
        if (!(await confirm('Outlook Express', 'Permanently delete this message?'))) return;
        messages = messages.filter(message => message.id !== m.id);
      } else {
        m.previousFolder = m.folder;
        m.folder = 'Deleted Items';
      }
      selectedId = null;
      persistMail();
    };
    const restore = () => {
      const m = selected();
      if (m && m.folder === 'Deleted Items') {
        m.folder = m.previousFolder === 'Drafts' ? 'Drafts' : 'Inbox';
        delete m.previousFolder;
        selectedId = null;
        persistMail();
      }
    };
    const toolbar = E('div', 'toolbar media-mail-toolbar');
    const createButton = button('Create Mail', create);
    createButton.prepend(icon('outlook'));
    const replyButton = button('Reply', reply);
    replyButton.prepend(icon('reply'));
    const forwardButton = button('Forward', forward);
    forwardButton.prepend(icon('forward'));
    const deleteButton = button('Delete', remove);
    deleteButton.prepend(icon('delete'));
    const book = button('Addresses', () => addressBook());
    book.prepend(icon('addressbook'));
    const exportButton = button('Export .eml', () => {
      if (selected()) exportMail(selected());
    });
    exportButton.prepend(icon('save'));
    toolbar.append(createButton, E('span', 'media-toolbar-divider'), replyButton, forwardButton, deleteButton, E('span', 'media-toolbar-divider'), book, exportButton);
    const location = E('div', 'media-mail-location');
    location.append(E('span', '', 'Folder:'));
    const locationValue = E('div', 'sunken');
    location.append(locationValue);
    const main = E('div', 'media-mail-main');
    const sidebar = E('aside', 'media-mail-sidebar');
    const foldersHeader = E('div', 'media-pane-header', 'Folders');
    const folderTree = E('div', 'media-mail-folder-tree sunken');
    const treeRoot = E('div', 'media-tree-root');
    treeRoot.append(icon('outlook'), E('span', '', 'Outlook Express'));
    const localRoot = E('div', 'media-tree-local');
    localRoot.append(E('span', '', '−'), icon('folder'), E('span', '', 'Local Folders'));
    folderTree.append(treeRoot, localRoot);
    const folderNodes = {};
    ['Inbox', 'Outbox', 'Sent Items', 'Deleted Items', 'Drafts'].forEach(name => {
      const item = E('button', 'media-mail-folder');
      item.type = 'button';
      item.append(icon(name === 'Deleted Items' ? 'recyclebin' : name === 'Inbox' ? 'outlook' : 'folder'), E('span', '', name));
      item.addEventListener('click', () => {
        folder = name;
        selectedId = messages.find(m => m.folder === folder)?.id || null;
        render();
      });
      folderNodes[name] = item;
      folderTree.append(item);
    });
    const contactHeader = E('div', 'media-pane-header', 'Contacts');
    const contactList = E('div', 'media-mail-contacts sunken');
    sidebar.append(foldersHeader, folderTree, contactHeader, contactList);
    const right = E('div', 'media-mail-right');
    const folderHeading = E('div', 'media-mail-folder-heading', 'Inbox');
    const messageList = E('div', 'media-message-list sunken');
    const table = E('table', 'media-table media-message-table'),
      thead = E('thead'),
      thRow = E('tr');
    [['!', 'read'], ['From', 'from'], ['Subject', 'subject'], ['Received', 'date']].forEach(([label, key]) => {
      const th = E('th');
      const b = E('button', '', label);
      b.addEventListener('click', () => {
        ascending = sortKey === key ? !ascending : true;
        sortKey = key;
        render();
      });
      th.append(b);
      thRow.append(th);
    });
    thead.append(thRow);
    const tbody = E('tbody');
    table.append(thead, tbody);
    const empty = E('div', 'media-empty-list', 'There are no items in this folder.');
    messageList.append(table, empty);
    const preview = E('div', 'media-message-preview sunken');
    const previewHeader = E('div', 'media-preview-header');
    const previewBody = E('div', 'media-preview-body');
    preview.append(previewHeader, previewBody);
    right.append(folderHeading, messageList, preview);
    main.append(sidebar, right);
    win.body.append(toolbar, location, main);
    const bar = status(win, 'Working Offline');
    const openMessage = () => {
      const m = selected();
      if (!m) return;
      if (m.folder === 'Drafts') {
        openCompose({
          draftId: m.id
        });
        return;
      }
      const detail = makeWin({
        title: `${m.subject || '(No subject)'} - Outlook Express`,
        icon: 'outlook',
        width: 640,
        height: 480,
        minWidth: 400,
        minHeight: 280,
        resizable: true
      }, 'media-mail-reader');
      const tools = E('div', 'toolbar media-mail-toolbar');
      tools.append(button('Reply', () => openCompose({
        to: m.fromEmail,
        subject: `Re: ${m.subject || ''}`,
        body: `\n\n${m.body || ''}`
      })), button('Export .eml', () => exportMail(m)));
      const hdr = E('div', 'media-preview-header');
      fillHeader(hdr, m);
      const body = E('div', 'media-preview-body');
      body.textContent = m.body || '';
      detail.body.append(tools, hdr, body);
      status(detail, 'Local message');
    };
    sys.menuBar(win, [{
      label: 'File',
      items: [menu('New Message', create, 'Ctrl+N'), menu('Open Message', openMessage), menu('Export Selected Message...', () => {
        if (selected()) exportMail(selected());
      }), separator, menu('Work Offline', () => tell('Outlook Express', 'This mailbox works locally. No e-mail account or mail server is connected. Use Open in Mail App from a draft to continue in your configured e-mail application.')), separator, menu('Exit', () => win.close())]
    }, {
      label: 'Edit',
      items: [menu('Delete', remove, 'Del'), menu('Restore Deleted Message', restore), separator, menu('Mark as Read', () => {
        if (selected()) {
          selected().read = true;
          persistMail();
        }
      }), menu('Mark as Unread', () => {
        if (selected()) {
          selected().read = false;
          persistMail();
        }
      })]
    }, {
      label: 'View',
      items: [menu('Inbox', () => {
        folder = 'Inbox';
        selectedId = messages.find(m => m.folder === folder)?.id;
        render();
      }), menu('Drafts', () => {
        folder = 'Drafts';
        selectedId = messages.find(m => m.folder === folder)?.id;
        render();
      }), menu('Sort by Date', () => {
        sortKey = 'date';
        ascending = false;
        render();
      })]
    }, {
      label: 'Tools',
      items: [menu('Address Book', () => addressBook()), menu('Empty Deleted Items', async () => {
        const count = messages.filter(m => m.folder === 'Deleted Items').length;
        if (!count) return tell('Outlook Express', 'Deleted Items is already empty.');
        if (await confirm('Outlook Express', `Permanently delete ${count} message${count === 1 ? '' : 's'}?`)) {
          messages = messages.filter(m => m.folder !== 'Deleted Items');
          persistMail();
        }
      })]
    }, {
      label: 'Message',
      items: [menu('New Message', create), menu('Reply', reply), menu('Forward', forward), menu('Edit Draft', () => {
        const m = selected();
        if (m?.folder === 'Drafts') openCompose({
          draftId: m.id
        });else tell('Outlook Express', 'Select a message in the Drafts folder to edit it.');
      })]
    }, {
      label: 'Help',
      items: [menu('About Outlook Express', () => tell('Outlook Express', 'Outlook Express — Local Edition\n\nYour inbox, drafts, deleted messages, and address book are saved locally. Create and export .eml messages or open a draft in your configured e-mail application. This desktop does not send or receive e-mail.'))]
    }]);
    function fillHeader(node, m) {
      node.replaceChildren();
      [['From:', m.from ? `${m.from}${m.fromEmail ? ` <${m.fromEmail}>` : ''}` : m.fromEmail], ['To:', m.to], ['Sent:', displayDate(m.date)], ['Subject:', m.subject || '(No subject)']].forEach(([label, value]) => {
        const row = E('div');
        row.append(E('strong', '', label), E('span', '', value || ''));
        node.append(row);
      });
    }
    function render() {
      const visible = messages.filter(m => m.folder === folder).sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')) * (ascending ? 1 : -1));
      locationValue.textContent = `Local Folders \\ ${folder}`;
      folderHeading.textContent = folder;
      win.setTitle(`${folder} - Outlook Express`);
      Object.entries(folderNodes).forEach(([name, node]) => {
        node.classList.toggle('selected', name === folder);
        const unread = messages.filter(m => m.folder === name && !m.read).length;
        node.lastChild.textContent = `${name}${unread ? ` (${unread})` : ''}`;
        node.classList.toggle('media-unread', unread > 0);
      });
      const signature = JSON.stringify(visible.map(m => ({
        ...m,
        read: undefined
      })));
      if (signature !== messageSignature) {
        messageSignature = signature;
        tbody.replaceChildren();
        visible.forEach(m => {
          const row = E('tr');
          row.tabIndex = 0;
          row.dataset.messageId = m.id;
          row.append(E('td', '', m.read ? '□' : '✉'), E('td', '', m.folder === 'Drafts' ? m.to || '(No recipient)' : m.from || m.fromEmail || ''), E('td', '', m.subject || '(No subject)'), E('td', '', displayDate(m.date)));
          row.addEventListener('click', () => {
            selectedId = m.id;
            if (!m.read) {
              m.read = true;
              persistMail();
            } else render();
          });
          row.addEventListener('dblclick', () => {
            selectedId = m.id;
            openMessage();
          });
          row.addEventListener('keydown', event => {
            selectedId = m.id;
            if (event.key === 'Enter') openMessage();
            if (event.key === 'Delete') remove();
          });
          tbody.append(row);
        });
      }
      const byId = new Map(visible.map(m => [m.id, m]));
      [...tbody.children].forEach(row => {
        const m = byId.get(row.dataset.messageId);
        row.classList.toggle('selected', m?.id === selectedId);
        row.classList.toggle('media-unread', !m?.read);
        row.firstChild.textContent = m?.read ? '□' : '✉';
      });
      empty.hidden = visible.length > 0;
      const m = selected();
      if (m) {
        fillHeader(previewHeader, m);
        previewBody.textContent = m.body || '';
      } else {
        previewHeader.replaceChildren();
        previewBody.textContent = visible.length ? 'Select a message to preview it.' : folder === 'Outbox' || folder === 'Sent Items' ? 'This local mailbox does not send messages. Save a draft, export it as .eml, or use Open in Mail App to continue in your e-mail application.' : 'There are no items to display.';
      }
      [replyButton, forwardButton, deleteButton, exportButton].forEach(b => {
        b.disabled = !m;
      });
      bar.textContent = `${visible.length} message${visible.length === 1 ? '' : 's'}, ${visible.filter(m => !m.read).length} unread  •  Working Offline`;
    }
    function renderContacts() {
      contactList.replaceChildren();
      if (!contacts.length) {
        const add = button('Add a contact...', () => contactEditor());
        contactList.append(add);
      } else contacts.slice().sort((a, b) => contactName(a).localeCompare(contactName(b))).forEach(c => {
        const row = E('button', 'media-mail-contact');
        row.append(icon('addressbook'), E('span', '', contactName(c)));
        row.addEventListener('dblclick', () => c.email ? openCompose({
          to: c.email
        }) : contactEditor(c));
        row.addEventListener('click', () => {
          [...contactList.children].forEach(n => n.classList.remove('selected'));
          row.classList.add('selected');
        });
        contactList.append(row);
      });
    }
    listen(win, localEvents, 'mail', render);
    listen(win, localEvents, 'contacts', renderContacts);
    listen(win, win.el, 'keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        create();
      }
    });
    render();
    renderContacts();
    return win;
  }
  [{
    id: 'mediaplayer',
    title: 'Windows Media Player',
    icon: 'mediaplayer',
    open: player
  }, {
    id: 'cdplayer',
    title: 'CD Player',
    icon: 'cdplayer',
    open: cdPlayer
  }, {
    id: 'soundrecorder',
    title: 'Sound Recorder',
    icon: 'soundrecorder',
    open: soundRecorder
  }, {
    id: 'volume',
    title: 'Volume Control',
    icon: 'volume',
    open: volumeControl
  }, {
    id: 'outlook',
    title: 'Outlook Express',
    icon: 'outlook',
    open: outlook
  }, {
    id: 'addressbook',
    title: 'Address Book',
    icon: 'addressbook',
    open: addressBook
  }].forEach(app => sys.registerApp(app));
}
