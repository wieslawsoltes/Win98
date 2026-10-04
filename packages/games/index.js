/* Four self-contained, dependency-free games for the Windows desktop. */

const SUITS = [{
  id: 'C',
  symbol: '♣',
  name: 'clubs',
  color: 'black'
}, {
  id: 'D',
  symbol: '♦',
  name: 'diamonds',
  color: 'red'
}, {
  id: 'S',
  symbol: '♠',
  name: 'spades',
  color: 'black'
}, {
  id: 'H',
  symbol: '♥',
  name: 'hearts',
  color: 'red'
}];
const SUIT = Object.fromEntries(SUITS.map(s => [s.id, s]));
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const copy = value => JSON.parse(JSON.stringify(value));
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const cardName = c => `${{
  1: 'Ace',
  11: 'Jack',
  12: 'Queen',
  13: 'King'
}[c.rank] || c.rank} of ${SUIT[c.suit].name}`;
const color = c => SUIT[c.suit].color;
const cardKey = c => `${c.suit}${c.rank}`;
const timeText = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
function deck() {
  return SUITS.flatMap(s => Array.from({
    length: 13
  }, (_, i) => ({
    id: `${s.id}${i + 1}`,
    suit: s.id,
    rank: i + 1,
    up: true
  })));
}
function shuffled(cards, rng = Math.random) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function seededRandom(seed) {
  let n = Number(seed) >>> 0;
  return () => {
    n = Math.imul(n, 1664525) + 1013904223 >>> 0;
    return n / 4294967296;
  };
}
function element(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html !== undefined) el.innerHTML = html;
  return el;
}
function statusBar(sys, win, text) {
  const status = sys.statusBar(win, text);
  status.classList.add('games-status');
  if (!status.parentNode) win.body.append(status);
  return status;
}
function addCleanup(win, fn) {
  if (win.addCleanup) win.addCleanup(fn);
}
function listen(win, target, type, fn, options) {
  target.addEventListener(type, fn, options);
  addCleanup(win, () => target.removeEventListener(type, fn, options));
}
function dialog(sys, title, message, icon = 'info') {
  return sys.dialog({
    title,
    message,
    icon,
    buttons: [{
      label: 'OK',
      value: 'ok'
    }]
  });
}

/** Pure model. The first reveal reserves its full neighbourhood. */
export class MinesweeperModel {
  constructor(cols = 8, rows = 8, mines = 10, rng = Math.random) {
    this.cols = cols;
    this.rows = rows;
    this.mineCount = clamp(Math.floor(mines), 1, cols * rows - 9);
    this.rng = rng;
    this.state = 'ready';
    this.seeded = false;
    this.exploded = -1;
    this.cells = Array.from({
      length: cols * rows
    }, () => ({
      mine: false,
      near: 0,
      open: false,
      mark: 0
    }));
  }
  neighbors(index) {
    const x = index % this.cols,
      y = Math.floor(index / this.cols),
      out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy || x + dx < 0 || x + dx >= this.cols || y + dy < 0 || y + dy >= this.rows) continue;
      out.push((y + dy) * this.cols + x + dx);
    }
    return out;
  }
  seed(first) {
    const safe = new Set([first, ...this.neighbors(first)]);
    const candidates = shuffled(this.cells.map((_, i) => i).filter(i => !safe.has(i)), this.rng);
    candidates.slice(0, this.mineCount).forEach(i => {
      this.cells[i].mine = true;
    });
    this.cells.forEach((c, i) => {
      c.near = this.neighbors(i).filter(n => this.cells[n].mine).length;
    });
    this.seeded = true;
  }
  mark(index, questions = true) {
    const c = this.cells[index];
    if (!c || c.open || this.state === 'lost' || this.state === 'won') return false;
    c.mark = questions ? (c.mark + 1) % 3 : c.mark === 1 ? 0 : 1;
    return true;
  }
  reveal(index) {
    const first = this.cells[index];
    if (!first || first.open || first.mark === 1 || this.state === 'lost' || this.state === 'won') return false;
    if (!this.seeded) this.seed(index);
    this.state = 'playing';
    if (first.mine) {
      first.open = true;
      this.exploded = index;
      this.state = 'lost';
      return true;
    }
    const stack = [index];
    while (stack.length) {
      const i = stack.pop(),
        c = this.cells[i];
      if (c.open || c.mark === 1 || c.mine) continue;
      c.open = true;
      c.mark = 0;
      if (!c.near) stack.push(...this.neighbors(i).filter(n => !this.cells[n].open));
    }
    if (this.cells.filter(c => c.open).length === this.cells.length - this.mineCount) {
      this.state = 'won';
      this.cells.forEach(c => {
        if (c.mine) c.mark = 1;
      });
    }
    return true;
  }
  chord(index) {
    const c = this.cells[index];
    if (!c?.open || !c.near || this.state !== 'playing') return false;
    const near = this.neighbors(index);
    if (near.filter(i => this.cells[i].mark === 1).length !== c.near) return false;
    let changed = false;
    for (const i of near) {
      if (this.state === 'lost' || this.state === 'won') break;
      if (this.reveal(i)) changed = true;
    }
    return changed;
  }
  get flags() {
    return this.cells.filter(c => c.mark === 1).length;
  }
}

/** Shared, fully validated Klondike and FreeCell move engine. */
export class PatienceModel {
  constructor(kind = 'solitaire', options = {}) {
    this.kind = kind;
    this.drawCount = options.drawCount === 3 ? 3 : 1;
    this.autoMove = options.autoMove !== false;
    this.seed = options.seed || Math.floor(Math.random() * 1000000) + 1;
    this.columns = Array.from({
      length: kind === 'freecell' ? 8 : 7
    }, () => []);
    this.free = [null, null, null, null];
    this.foundations = [[], [], [], []];
    this.stock = [];
    this.waste = [];
    this.score = 0;
    this.moves = 0;
    this.won = false;
    this.lastDraw = 0;
    this.history = [];
    const cards = shuffled(deck(), options.rng || seededRandom(this.seed));
    if (kind === 'freecell') cards.forEach((c, i) => this.columns[i % 8].push(c));else {
      for (let c = 0; c < 7; c++) for (let i = 0; i <= c; i++) this.columns[c].push({
        ...cards.pop(),
        up: i === c
      });
      this.stock = cards.map(c => ({
        ...c,
        up: false
      }));
    }
    this.initial = this.snapshot();
  }
  snapshot() {
    return copy({
      columns: this.columns,
      free: this.free,
      foundations: this.foundations,
      stock: this.stock,
      waste: this.waste,
      score: this.score,
      moves: this.moves,
      won: this.won,
      lastDraw: this.lastDraw
    });
  }
  restore(snapshot) {
    Object.assign(this, copy(snapshot));
  }
  remember() {
    this.history.push(this.snapshot());
    if (this.history.length > 200) this.history.shift();
  }
  undo() {
    if (!this.history.length) return false;
    this.restore(this.history.pop());
    return true;
  }
  restart() {
    this.restore(this.initial);
    this.history = [];
  }
  getRun(source) {
    if (!source) return [];
    if (source.type === 'tableau') return this.columns[source.index]?.slice(source.card) || [];
    if (source.type === 'free') return this.free[source.index] ? [this.free[source.index]] : [];
    if (source.type === 'waste') return this.waste.length ? [this.waste[this.waste.length - 1]] : [];
    if (source.type === 'foundation' && this.kind === 'solitaire') {
      const pile = this.foundations[source.index];
      return pile?.length ? [pile[pile.length - 1]] : [];
    }
    return [];
  }
  validRun(cards) {
    return !!cards.length && cards.every((c, i) => c.up && (!i || cards[i - 1].rank === c.rank + 1 && color(cards[i - 1]) !== color(c)));
  }
  canMove(source, target) {
    if (this.won || !source || !target || source.type === target.type && source.index === target.index) return false;
    const cards = this.getRun(source);
    if (!this.validRun(cards)) return false;
    const first = cards[0];
    if (target.type === 'foundation') {
      const f = this.foundations[target.index];
      return !!f && cards.length === 1 && SUITS[target.index].id === first.suit && first.rank === f.length + 1;
    }
    if (target.type === 'free') return this.kind === 'freecell' && Number.isInteger(target.index) && target.index >= 0 && target.index < 4 && cards.length === 1 && !this.free[target.index];
    if (target.type !== 'tableau' || !this.columns[target.index]) return false;
    const pile = this.columns[target.index],
      top = pile[pile.length - 1];
    if (top ? !top.up || top.rank !== first.rank + 1 || color(top) === color(first) : this.kind === 'solitaire' && first.rank !== 13) return false;
    if (this.kind === 'freecell' && cards.length > 1) {
      const free = this.free.filter(c => !c).length;
      const empty = this.columns.filter(c => !c.length).length - (pile.length ? 0 : 1);
      if (cards.length > (free + 1) * 2 ** empty) return false;
    }
    return true;
  }
  remove(source) {
    if (source.type === 'tableau') return this.columns[source.index].splice(source.card);
    if (source.type === 'free') {
      const c = this.free[source.index];
      this.free[source.index] = null;
      return [c];
    }
    if (source.type === 'waste') return [this.waste.pop()];
    return [this.foundations[source.index].pop()];
  }
  put(cards, target) {
    if (target.type === 'free') this.free[target.index] = cards[0];else if (target.type === 'foundation') this.foundations[target.index].push(...cards);else this.columns[target.index].push(...cards);
  }
  move(source, target) {
    if (!this.canMove(source, target)) return false;
    this.remember();
    const cards = this.remove(source);
    this.put(cards, target);
    this.moves++;
    if (this.kind === 'solitaire') {
      if (target.type === 'foundation') this.score += 10;
      if (source.type === 'foundation') this.score = Math.max(0, this.score - 15);
      if (source.type === 'waste' && target.type === 'tableau') this.score += 5;
      if (source.type === 'tableau') {
        const pile = this.columns[source.index],
          top = pile[pile.length - 1];
        if (top && !top.up) {
          top.up = true;
          this.score += 5;
        }
      }
    } else if (this.autoMove) this.autoHome();
    this.won = this.foundations.every(p => p.length === 13);
    return true;
  }
  draw() {
    if (this.kind !== 'solitaire' || this.won || !this.stock.length && !this.waste.length) return false;
    this.remember();
    this.moves++;
    if (this.stock.length) {
      this.lastDraw = Math.min(this.drawCount, this.stock.length);
      for (let n = 0; n < this.lastDraw; n++) this.waste.push({
        ...this.stock.pop(),
        up: true
      });
    } else {
      this.stock = this.waste.reverse().map(c => ({
        ...c,
        up: false
      }));
      this.waste = [];
      this.lastDraw = 0;
      this.score = Math.max(0, this.score - (this.drawCount === 1 ? 100 : 20));
    }
    return true;
  }
  sources(includeFoundation = false) {
    const out = [];
    this.columns.forEach((p, index) => p.forEach((c, card) => {
      if (c.up && this.validRun(p.slice(card))) out.push({
        type: 'tableau',
        index,
        card
      });
    }));
    if (this.waste.length) out.push({
      type: 'waste',
      index: 0
    });
    this.free.forEach((c, index) => {
      if (c) out.push({
        type: 'free',
        index
      });
    });
    if (includeFoundation && this.kind === 'solitaire') this.foundations.forEach((p, index) => {
      if (p.length) out.push({
        type: 'foundation',
        index
      });
    });
    return out;
  }
  foundationFor(card) {
    return {
      type: 'foundation',
      index: SUITS.findIndex(s => s.id === card.suit)
    };
  }
  isSafeHome(card) {
    if (card.rank <= 2) return true;
    return SUITS.every((s, i) => s.id === card.suit || this.foundations[i].length >= card.rank - (s.color === color(card) ? 2 : 1));
  }
  autoHome() {
    let moved = true;
    while (moved) {
      moved = false;
      for (const source of this.sources()) {
        const cards = this.getRun(source);
        if (cards.length !== 1 || !this.isSafeHome(cards[0])) continue;
        const target = this.foundationFor(cards[0]);
        if (this.canMove(source, target)) {
          this.put(this.remove(source), target);
          moved = true;
          break;
        }
      }
    }
    this.won = this.foundations.every(p => p.length === 13);
  }
  hint() {
    const candidates = [];
    for (const source of this.sources()) {
      const cards = this.getRun(source);
      const target = this.foundationFor(cards[0]);
      if (this.canMove(source, target)) candidates.push({
        source,
        target,
        priority: 100 + (this.isSafeHome(cards[0]) ? 20 : 0)
      });
      this.columns.forEach((pile, index) => {
        const target = {
          type: 'tableau',
          index
        };
        if (!this.canMove(source, target)) return;
        if (source.type === 'tableau' && source.card === 0 && !pile.length) return;
        let priority = 20 + cards.length;
        if (source.type === 'waste' || source.type === 'free') priority += 20;
        if (source.type === 'tableau' && source.card > 0 && !this.columns[source.index][source.card - 1].up) priority += 50;
        candidates.push({
          source,
          target,
          priority
        });
      });
    }
    if (candidates.length) return candidates.sort((a, b) => b.priority - a.priority)[0];
    if (this.kind === 'solitaire' && (this.stock.length || this.waste.length)) return {
      draw: true
    };
    if (this.kind === 'freecell') {
      const free = this.free.findIndex(c => !c);
      if (free !== -1) {
        const source = this.sources().filter(s => s.type === 'tableau' && this.getRun(s).length === 1).sort((a, b) => this.columns[b.index].length - this.columns[a.index].length)[0];
        if (source) return {
          source,
          target: {
            type: 'free',
            index: free
          }
        };
      }
    }
    return null;
  }
  get canFinish() {
    return !this.won && !this.stock.length && !this.waste.length && this.columns.every(p => p.every(c => c.up) && (this.kind !== 'freecell' || !p.length || this.validRun(p)));
  }
  get remaining() {
    return 52 - this.foundations.reduce((n, p) => n + p.length, 0);
  }
}
const heartsPoints = c => c.suit === 'H' ? 1 : c.suit === 'S' && c.rank === 12 ? 13 : 0;
const sortHand = hand => hand.sort((a, b) => ['C', 'D', 'S', 'H'].indexOf(a.suit) - ['C', 'D', 'S', 'H'].indexOf(b.suit) || a.rank - b.rank);

/** Four-player Hearts, including passing, legal play, moon scoring and AI. */
export class HeartsModel {
  constructor(options = {}) {
    this.rng = options.rng || Math.random;
    this.names = options.names || ['You', 'Pauline', 'Michele', 'Ben'];
    this.totals = [0, 0, 0, 0];
    this.round = 0;
    this.history = [];
    this.newHand();
  }
  newHand() {
    this.hands = [[], [], [], []];
    shuffled(deck(), this.rng).forEach((c, i) => this.hands[i % 4].push(c));
    this.hands.forEach(sortHand);
    this.roundPoints = [0, 0, 0, 0];
    this.trick = [];
    this.lastTrick = [];
    this.trickNumber = 0;
    this.heartsBroken = false;
    this.moon = -1;
    this.pendingWinner = -1;
    this.passOffset = [1, 3, 2, 0][this.round % 4];
    this.phase = this.passOffset ? 'passing' : 'playing';
    if (!this.passOffset) this.startPlay();
  }
  get passName() {
    return ['left', 'right', 'across', 'none'][this.round % 4];
  }
  aiPass(player) {
    const hand = this.hands[player];
    const danger = c => c.suit === 'S' && c.rank >= 12 ? 50 + c.rank : c.suit === 'H' ? 15 + c.rank : c.rank;
    return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3).map(c => c.id);
  }
  pass(ids) {
    if (this.phase !== 'passing' || ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => !this.hands[0].some(c => c.id === id))) return false;
    const outgoing = this.hands.map((h, p) => (p ? this.aiPass(p) : ids).map(id => h.find(c => c.id === id)));
    outgoing.forEach((cards, p) => {
      this.hands[p] = this.hands[p].filter(c => !cards.some(x => x.id === c.id));
    });
    outgoing.forEach((cards, p) => this.hands[(p + this.passOffset) % 4].push(...cards));
    this.hands.forEach(sortHand);
    this.startPlay();
    return true;
  }
  startPlay() {
    this.phase = 'playing';
    this.turn = this.hands.findIndex(h => h.some(c => c.suit === 'C' && c.rank === 2));
    this.leader = this.turn;
  }
  legalCards(player = this.turn) {
    if (this.phase !== 'playing' || player !== this.turn) return [];
    const hand = this.hands[player];
    if (!this.trick.length) {
      if (this.trickNumber === 0) return hand.filter(c => c.suit === 'C' && c.rank === 2);
      if (!this.heartsBroken && hand.some(c => c.suit !== 'H')) return hand.filter(c => c.suit !== 'H');
      return hand.slice();
    }
    const follow = hand.filter(c => c.suit === this.trick[0].card.suit);
    if (follow.length) return follow;
    if (this.trickNumber === 0) {
      const clean = hand.filter(c => !heartsPoints(c));
      if (clean.length) return clean;
    }
    return hand.slice();
  }
  play(player, id) {
    const card = this.legalCards(player).find(c => c.id === id);
    if (!card) return false;
    this.hands[player].splice(this.hands[player].findIndex(c => c.id === id), 1);
    this.trick.push({
      player,
      card
    });
    if (card.suit === 'H') this.heartsBroken = true;
    if (this.trick.length < 4) this.turn = (player + 1) % 4;else {
      const suit = this.trick[0].card.suit;
      this.pendingWinner = this.trick.filter(t => t.card.suit === suit).reduce((a, b) => a.card.rank > b.card.rank ? a : b).player;
      this.roundPoints[this.pendingWinner] += this.trick.reduce((n, t) => n + heartsPoints(t.card), 0);
      this.phase = 'trick-end';
    }
    return true;
  }
  advanceTrick() {
    if (this.phase !== 'trick-end') return false;
    this.lastTrick = copy(this.trick);
    this.lastWinner = this.pendingWinner;
    this.trick = [];
    this.trickNumber++;
    if (this.trickNumber === 13) {
      this.moon = this.roundPoints.findIndex(n => n === 26);
      const points = this.moon === -1 ? this.roundPoints.slice() : this.roundPoints.map((_, p) => p === this.moon ? 0 : 26);
      this.totals = this.totals.map((n, p) => n + points[p]);
      this.history.push({
        round: this.round + 1,
        points,
        totals: this.totals.slice(),
        moon: this.moon
      });
      this.phase = this.totals.some(n => n >= 100) ? 'game-over' : 'round-over';
    } else {
      this.turn = this.pendingWinner;
      this.leader = this.turn;
      this.phase = 'playing';
    }
    return true;
  }
  nextHand() {
    if (this.phase !== 'round-over') return false;
    this.round++;
    this.newHand();
    return true;
  }
  aiCard(player = this.turn) {
    const legal = this.legalCards(player);
    if (!legal.length) return null;
    const ascending = legal.slice().sort((a, b) => a.rank - b.rank);
    if (!this.trick.length) return ascending.find(c => c.suit !== 'H' && !(c.suit === 'S' && c.rank >= 12)) || ascending[0];
    const lead = this.trick[0].card.suit;
    if (legal[0].suit !== lead) return legal.slice().sort((a, b) => heartsPoints(b) - heartsPoints(a) || b.rank - a.rank)[0];
    const high = Math.max(...this.trick.filter(t => t.card.suit === lead).map(t => t.card.rank));
    const losers = legal.filter(c => c.rank < high).sort((a, b) => b.rank - a.rank);
    if (losers.length) return losers[0];
    const points = this.trick.reduce((n, t) => n + heartsPoints(t.card), 0);
    if (this.trick.length === 3 && !points) return legal.slice().filter(c => !heartsPoints(c)).sort((a, b) => b.rank - a.rank)[0] || ascending[0];
    return ascending[0];
  }
}
const PIPS = {
  1: [[50, 50]],
  2: [[50, 24], [50, 76]],
  3: [[50, 22], [50, 50], [50, 78]],
  4: [[28, 24], [72, 24], [28, 76], [72, 76]],
  5: [[28, 24], [72, 24], [50, 50], [28, 76], [72, 76]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
  7: [[28, 22], [72, 22], [50, 36], [28, 50], [72, 50], [28, 78], [72, 78]],
  8: [[28, 22], [72, 22], [50, 36], [28, 50], [72, 50], [50, 64], [28, 78], [72, 78]],
  9: [[28, 18], [72, 18], [28, 39], [72, 39], [50, 50], [28, 61], [72, 61], [28, 82], [72, 82]],
  10: [[28, 18], [72, 18], [50, 29], [28, 39], [72, 39], [28, 61], [72, 61], [50, 71], [28, 82], [72, 82]]
};
function courtHTML(card) {
  const isKing = card.rank === 13,
    isQueen = card.rank === 12;
  const headwear = isKing || isQueen ? '<path d="M27 20L22 6L36 13L45 3L55 13L70 6L65 20Z" fill="#edc847" stroke="#28254d" stroke-width="2"/>' : '<path d="M22 19Q36 -1 65 10L72 19Z" fill="#cb2323" stroke="#28254d" stroke-width="2"/><path d="M45 9L52 1L55 13" fill="#eac047"/>';
  const half = `<path d="M10 66L13 48L33 40L57 40L78 50L80 66Z" fill="${color(card) === 'red' ? '#b41d26' : '#263976'}" stroke="#28254d" stroke-width="2"/><path d="M31 43L43 62L59 43L60 66H28Z" fill="#edc847"/><path d="M30 18L28 31L35 42L52 42L61 32L61 18Z" fill="#ffe4a4" stroke="#28254d" stroke-width="2"/>${headwear}<path d="M33 23H40M49 23H56M44 26L41 33H47M38 37H51" fill="none" stroke="#28254d" stroke-width="2"/>${isKing ? '<path d="M33 35L37 45L45 49L53 44L57 34L49 39H40Z" fill="#554129"/>' : isQueen ? '<path d="M28 20L23 34L27 45M61 20L67 36L63 45" fill="none" stroke="#c39522" stroke-width="6"/>' : '<path d="M28 19L24 29M62 19L65 30" stroke="#513c21" stroke-width="4"/>'}<path d="M16 49L28 59M62 50L74 60" stroke="#edc847" stroke-width="5"/>`;
  return `<svg class="game-court" viewBox="0 0 90 132" aria-hidden="true"><rect x="1" y="1" width="88" height="130" fill="#fff9df" stroke="#31326b" stroke-width="2"/>${half}<g transform="rotate(180 45 66)">${half}</g><path d="M2 66H88" stroke="#31326b" stroke-width="2"/></svg>`;
}
function cardHTML(card, {
  back = false,
  source = null,
  selected = false,
  extraClass = '',
  style = '',
  draggable = true,
  interactive = true
} = {}) {
  if (back || !card?.up) return `<div class="game-card game-card-back ${extraClass}" style="${style}" role="img" aria-label="Face-down card"></div>`;
  const s = SUIT[card.suit];
  const pips = card.rank <= 10 ? `<div class="game-pips ${card.rank === 1 ? 'is-ace' : ''} ${card.rank >= 9 ? 'is-many' : ''}">${PIPS[card.rank].map(([x, y]) => `<span class="game-pip ${y > 50 ? 'is-inverted' : ''}" style="left:${x}%;top:${y}%">${s.symbol}</span>`).join('')}</div>` : courtHTML(card);
  return `<div class="game-card ${s.color === 'red' ? 'game-card-red' : ''} ${selected ? 'is-selected' : ''} ${extraClass}" style="${style}" ${source ? `data-source='${escapeHTML(JSON.stringify(source))}'` : ''} data-card="${card.id}" ${draggable ? 'draggable="true"' : ''} ${interactive ? 'tabindex="0" role="button"' : 'role="img"'} aria-label="${cardName(card)}${selected ? ', selected' : ''}" ${interactive ? `aria-pressed="${selected}"` : ''}><span class="game-card-corner"><b>${RANKS[card.rank]}</b><i>${s.symbol}</i></span>${pips}<span class="game-card-corner game-card-corner-bottom"><b>${RANKS[card.rank]}</b><i>${s.symbol}</i></span></div>`;
}
function sameSource(a, b) {
  return !!a && !!b && a.type === b.type && a.index === b.index && a.card === b.card;
}
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
function ledHTML(value) {
  const text = value < 0 ? `-${String(Math.min(99, -value)).padStart(2, '0')}` : String(Math.min(999, value)).padStart(3, '0');
  return [...text].map(d => `<span class="ms-digit">${[...'abcdefg'].map(s => `<i class="ms-segment ms-segment-${s} ${((d === '-' ? 'g' : DIGITS[Number(d)]) || '').includes(s) ? 'is-lit' : ''}"></i>`).join('')}</span>`).join('');
}
function smileHTML(state, pressed) {
  const eyes = state === 'lost' ? '<path d="M5 5L8 8M8 5L5 8M12 5L15 8M15 5L12 8"/>' : state === 'won' ? '<path d="M3 5H17M4 6L5 9H8L9 6M11 6L12 9H15L16 6" fill="#000"/>' : '<path d="M6 5V7M13 5V7" stroke-width="2"/>';
  const mouth = pressed ? '<ellipse cx="10" cy="13" rx="2" ry="3" fill="#000"/>' : state === 'lost' ? '<path d="M5 15Q10 9 15 15"/>' : '<path d="M5 11Q10 18 15 11"/>';
  return `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#ff0" stroke="#000"/><g fill="none" stroke="#000" stroke-width="1.2">${eyes}${mouth}</g></svg>`;
}
const MINE_HTML = '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><g stroke="#000"><path d="M7 0V14M0 7H14M2 2L12 12M12 2L2 12"/><circle cx="7" cy="7" r="4" fill="#000"/></g><rect x="5" y="4" width="2" height="2" fill="#fff"/></svg>';
const FLAG_HTML = '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M7 2L2 5L7 7Z" fill="red"/><path d="M7 2V11H4V12H11V11H8V2Z" fill="#000"/></svg>';
function openMinesweeper(sys, args) {
  const levels = {
    beginner: {
      cols: 8,
      rows: 8,
      mines: 10,
      label: 'Beginner'
    },
    intermediate: {
      cols: 16,
      rows: 16,
      mines: 40,
      label: 'Intermediate'
    },
    expert: {
      cols: 30,
      rows: 16,
      mines: 99,
      label: 'Expert'
    }
  };
  let level = args.level || sys.settings.get('games.minesweeper.level', 'beginner');
  if (!levels[level] && level !== 'custom') level = 'beginner';
  let custom = sys.settings.get('games.minesweeper.custom', {
    cols: 16,
    rows: 16,
    mines: 40
  });
  custom = {
    cols: clamp(Number(custom.cols) || 16, 8, 30),
    rows: clamp(Number(custom.rows) || 16, 8, 24),
    mines: Number(custom.mines) || 40
  };
  let questions = sys.settings.get('games.minesweeper.questions', true),
    model,
    startedAt = 0,
    elapsed = 0,
    generation = 0,
    facePressed = false,
    suppress = 0,
    longPress = null;
  const win = sys.wm.create({
    title: 'Minesweeper',
    icon: 'minesweeper',
    width: 184,
    height: 260,
    minWidth: 164,
    minHeight: 230,
    resizable: false,
    x: args.x,
    y: args.y
  });
  win.body.classList.add('games-window', 'ms-host');
  const menuItems = [{
    label: 'New',
    shortcut: 'F2',
    action: () => newGame()
  }, {
    type: 'separator'
  }, ...Object.entries(levels).map(([key, l]) => ({
    label: l.label,
    checked: key === level,
    action: () => {
      level = key;
      newGame();
    }
  })), {
    label: 'Custom…',
    checked: level === 'custom',
    action: customGame
  }, {
    type: 'separator'
  }, {
    label: 'Marks (?)',
    checked: questions,
    action: () => {
      questions = !questions;
      sys.settings.set('games.minesweeper.questions', questions);
      menuItems[7].checked = questions;
    }
  }, {
    label: 'Best Times…',
    action: showBest
  }, {
    type: 'separator'
  }, {
    label: 'Exit',
    action: () => win.close()
  }];
  sys.menuBar(win, [{
    label: 'Game',
    items: menuItems
  }, {
    label: 'Help',
    items: [{
      label: 'How to Play',
      action: () => dialog(sys, 'Minesweeper Help', 'Uncover every safe square without hitting a mine. The number in a square tells you how many mines touch it, including diagonally.\n\nLeft-click to uncover. Right-click to place a flag, then a question mark. On a touch screen, hold a square to flag it. Your first click and its neighboring squares are always safe.\n\nWhen a number has the correct number of flags around it, double-click, middle-click, or press both mouse buttons to uncover its remaining neighbors. Incorrect flags can trigger a mine.\n\nKeyboard: arrow keys move; Space uncovers; F marks a square; Enter chords; F2 starts a new game.')
    }, {
      type: 'separator'
    }, {
      label: 'About Minesweeper',
      action: () => dialog(sys, 'About Minesweeper', 'Minesweeper\nA classic game of logic and a little luck.\n\nBuilt for this Windows desktop.')
    }]
  }]);
  const shell = element('div', 'ms-shell');
  shell.innerHTML = '<div class="ms-header"><div class="ms-counter ms-mines" role="status" aria-label="Mines remaining"></div><button class="ms-smile" aria-label="New game" title="New game (F2)"></button><div class="ms-counter ms-time" role="timer" aria-label="Elapsed seconds"></div></div><div class="ms-board" role="grid" aria-label="Mine field"></div>';
  win.body.append(shell);
  const board = shell.querySelector('.ms-board'),
    mineCounter = shell.querySelector('.ms-mines'),
    timerCounter = shell.querySelector('.ms-time'),
    smile = shell.querySelector('.ms-smile');
  const status = statusBar(sys, win, 'Right-click to flag a square.');
  function setFace() {
    smile.innerHTML = smileHTML(model?.state, facePressed);
  }
  function updateClock() {
    if (model.state === 'playing' && startedAt) elapsed = Math.min(999, Math.floor((Date.now() - startedAt) / 1000));
    timerCounter.innerHTML = ledHTML(elapsed);
    timerCounter.setAttribute('aria-label', `${elapsed} seconds`);
  }
  function render() {
    const focused = board.contains(document.activeElement) ? document.activeElement.dataset.index : null;
    board.style.gridTemplateColumns = `repeat(${model.cols},16px)`;
    board.innerHTML = model.cells.map((c, i) => {
      let cls = 'ms-cell',
        html = '',
        label = 'Covered square';
      const lost = model.state === 'lost';
      if (c.open || lost && c.mine && c.mark !== 1) {
        cls += ' is-open';
        if (c.mine) {
          html = MINE_HTML;
          cls += i === model.exploded ? ' is-exploded' : '';
          label = 'Mine';
        } else if (c.near) {
          html = String(c.near);
          cls += ` ms-n${c.near}`;
          label = `${c.near} adjacent mines`;
        } else label = 'Empty square';
      } else if (c.mark === 1) {
        html = FLAG_HTML;
        label = 'Flagged square';
        if (lost && !c.mine) {
          cls += ' is-wrong is-open';
          html = MINE_HTML + '<span class="ms-wrong-mark">×</span>';
          label = 'Incorrect flag';
        }
      } else if (c.mark === 2) {
        html = '?';
        label = 'Question mark';
      }
      return `<button class="${cls}" role="gridcell" data-index="${i}" aria-label="Row ${Math.floor(i / model.cols) + 1}, column ${i % model.cols + 1}: ${label}" tabindex="${focused === String(i) || !focused && i === 0 ? 0 : -1}">${html}</button>`;
    }).join('');
    mineCounter.innerHTML = ledHTML(model.mineCount - model.flags);
    mineCounter.setAttribute('aria-label', `${model.mineCount - model.flags} mines remaining`);
    setFace();
    updateClock();
    status.textContent = model.state === 'won' ? `You won! ${elapsed} seconds.` : model.state === 'lost' ? 'Game over. Click the smile to try again.' : `${levels[level]?.label || 'Custom'} · ${model.mineCount} mines`;
    if (focused !== null) board.querySelector(`[data-index="${focused}"]`)?.focus({
      preventScroll: true
    });
  }
  function act(kind, index) {
    const before = model.state;
    const changed = kind === 'mark' ? model.mark(index, questions) : kind === 'chord' ? model.chord(index) : model.reveal(index);
    if (!changed) return;
    if (before === 'ready' && model.state !== 'ready') startedAt = Date.now();
    if (before === 'playing') elapsed = Math.min(999, Math.floor((Date.now() - startedAt) / 1000));
    render();
    if (model.state === 'won' && before !== 'won') recordWin();
  }
  function newGame() {
    generation++;
    startedAt = 0;
    elapsed = 0;
    facePressed = false;
    const setup = levels[level] || custom;
    model = new MinesweeperModel(setup.cols, setup.rows, setup.mines);
    sys.settings.set('games.minesweeper.level', level);
    menuItems.forEach(item => {
      if (item.label === 'Custom…') item.checked = level === 'custom';else for (const [k, l] of Object.entries(levels)) if (item.label === l.label) item.checked = level === k;
    });
    win.el.style.width = `${Math.max(170, model.cols * 16 + 38)}px`;
    win.el.style.height = `${model.rows * 16 + 155}px`;
    render();
  }
  async function customGame() {
    const cols = await sys.prompt({
      title: 'Custom Field',
      message: 'Width (8–30 squares):',
      value: String(custom.cols)
    });
    if (cols === null) return;
    const rows = await sys.prompt({
      title: 'Custom Field',
      message: 'Height (8–24 squares):',
      value: String(custom.rows)
    });
    if (rows === null) return;
    const max = Number(cols) * Number(rows) - 9;
    const mines = await sys.prompt({
      title: 'Custom Field',
      message: `Number of mines (1–${Math.max(1, max)}):`,
      value: String(custom.mines)
    });
    if (mines === null) return;
    if (![cols, rows, mines].every(v => /^\d+$/.test(String(v).trim())) || +cols < 8 || +cols > 30 || +rows < 8 || +rows > 24 || +mines < 1 || +mines > max) return dialog(sys, 'Custom Field', 'Enter a width from 8 to 30, a height from 8 to 24, and at least 1 mine. Leave at least 9 safe squares.', 'warning');
    custom = {
      cols: +cols,
      rows: +rows,
      mines: +mines
    };
    sys.settings.set('games.minesweeper.custom', custom);
    level = 'custom';
    newGame();
  }
  async function recordWin() {
    if (!levels[level]) return;
    const key = level,
      seconds = elapsed,
      best = sys.settings.get('games.minesweeper.best', {});
    if (best[key] && best[key].time <= seconds) return;
    const name = await sys.prompt({
      title: 'Fastest Time',
      message: `You have the fastest time for ${levels[key].label}: ${seconds} seconds.\nPlease enter your name:`,
      value: sys.settings.get('games.minesweeper.player', 'Anonymous')
    });
    const player = (name || 'Anonymous').trim().slice(0, 32) || 'Anonymous';
    const current = sys.settings.get('games.minesweeper.best', {});
    if (!current[key] || current[key].time > seconds) {
      current[key] = {
        time: seconds,
        name: player
      };
      sys.settings.set('games.minesweeper.best', current);
    }
    sys.settings.set('games.minesweeper.player', player);
  }
  async function showBest() {
    const best = sys.settings.get('games.minesweeper.best', {});
    const result = await sys.dialog({
      title: 'Fastest Mine Sweepers',
      message: Object.entries(levels).map(([key, l]) => `${l.label}: ${best[key] ? `${best[key].time} seconds — ${best[key].name}` : '999 seconds — Anonymous'}`).join('\n\n'),
      icon: 'minesweeper',
      buttons: [{
        label: 'Reset Scores',
        value: 'reset'
      }, {
        label: 'OK',
        value: 'ok'
      }]
    });
    if (result === 'reset') sys.settings.set('games.minesweeper.best', {});
  }
  smile.addEventListener('click', newGame);
  board.addEventListener('click', e => {
    const cell = e.target.closest('[data-index]');
    if (cell && Date.now() > suppress) act('reveal', +cell.dataset.index);
  });
  board.addEventListener('dblclick', e => {
    const cell = e.target.closest('[data-index]');
    if (cell) act('chord', +cell.dataset.index);
  });
  board.addEventListener('contextmenu', e => {
    e.preventDefault();
    const cell = e.target.closest('[data-index]');
    if (cell && Date.now() > suppress) act('mark', +cell.dataset.index);
  });
  board.addEventListener('pointerdown', e => {
    const cell = e.target.closest('[data-index]');
    if (!cell) return;
    if (e.button === 1 || e.buttons === 3) {
      e.preventDefault();
      suppress = Date.now() + 400;
      act('chord', +cell.dataset.index);
    } else if (e.button === 0) {
      facePressed = true;
      setFace();
    }
    if (e.pointerType === 'touch') longPress = setTimeout(() => {
      suppress = Date.now() + 650;
      act('mark', +cell.dataset.index);
    }, 480);
  });
  listen(win, window, 'pointerup', () => {
    clearTimeout(longPress);
    facePressed = false;
    if (model) setFace();
  });
  listen(win, window, 'pointercancel', () => {
    clearTimeout(longPress);
    facePressed = false;
    if (model) setFace();
  });
  win.el.addEventListener('keydown', e => {
    if (e.key === 'F2') {
      e.preventDefault();
      newGame();
      return;
    }
    const cell = e.target.closest('[data-index]');
    if (!cell) return;
    let i = +cell.dataset.index,
      next = i;
    if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);else if (e.key === 'ArrowRight') next = Math.min(model.cells.length - 1, i + 1);else if (e.key === 'ArrowUp') next = Math.max(0, i - model.cols);else if (e.key === 'ArrowDown') next = Math.min(model.cells.length - 1, i + model.cols);else if (e.key.toLowerCase() === 'f') act('mark', i);else if (e.key === 'Enter') act('chord', i);else if (e.key === ' ') act('reveal', i);else return;
    e.preventDefault();
    board.querySelector(`[data-index="${next}"]`)?.focus({
      preventScroll: true
    });
  });
  const timer = setInterval(() => {
    if (model.state === 'playing') updateClock();
  }, 250);
  addCleanup(win, () => {
    generation++;
    clearInterval(timer);
    clearTimeout(longPress);
  });
  newGame();
  return win;
}
function openPatience(sys, kind, args) {
  const freecell = kind === 'freecell',
    title = freecell ? 'FreeCell' : 'Solitaire';
  let drawCount = sys.settings.get('games.solitaire.draw', 3) === 1 ? 1 : 3;
  let autoMove = sys.settings.get('games.freecell.autoMove', true),
    back = sys.settings.get('games.cards.back', 'blue');
  let model,
    selection = null,
    dragSource = null,
    hintSource = null,
    hintTarget = null,
    message = '',
    startedAt = 0,
    elapsed = 0,
    generation = 0,
    wonShown = false,
    autoTimer = null,
    autoFinishing = false,
    closed = false;
  const win = sys.wm.create({
    title,
    icon: kind,
    width: freecell ? 768 : 708,
    height: 548,
    minWidth: 430,
    minHeight: 330,
    resizable: true,
    x: args.x,
    y: args.y
  });
  win.body.classList.add('games-window', 'patience-host');
  const gameItems = [{
    label: 'New Game',
    shortcut: 'F2',
    action: () => newGame()
  }, ...(freecell ? [{
    label: 'Select Game…',
    action: selectDeal
  }] : []), {
    label: 'Restart Game',
    action: restart
  }, {
    type: 'separator'
  }, {
    label: 'Undo',
    shortcut: 'Ctrl+Z',
    action: undo
  }, {
    label: 'Hint',
    shortcut: 'H',
    action: hint
  }, {
    label: 'Auto Finish',
    action: autoFinish
  }, {
    type: 'separator'
  }, {
    label: 'Statistics…',
    action: showStats
  }, {
    type: 'separator'
  }, {
    label: 'Exit',
    action: () => win.close()
  }];
  const optionItems = freecell ? [{
    label: 'Automatic Home Moves',
    checked: autoMove,
    action: () => {
      autoMove = !autoMove;
      model.autoMove = autoMove;
      optionItems[0].checked = autoMove;
      sys.settings.set('games.freecell.autoMove', autoMove);
      message = autoMove ? 'Safe cards move home automatically.' : 'Automatic home moves are off.';
      updateStatus();
    }
  }] : [{
    label: 'Draw One Card',
    checked: drawCount === 1,
    action: () => setDraw(1)
  }, {
    label: 'Draw Three Cards',
    checked: drawCount === 3,
    action: () => setDraw(3)
  }];
  optionItems.push({
    type: 'separator'
  }, {
    label: 'Blue Deck',
    checked: back !== 'red',
    action: () => setBack('blue')
  }, {
    label: 'Red Deck',
    checked: back === 'red',
    action: () => setBack('red')
  });
  sys.menuBar(win, [{
    label: 'Game',
    items: gameItems
  }, {
    label: 'Options',
    items: optionItems
  }, {
    label: 'Help',
    items: [{
      label: `How to Play ${title}`,
      action: help
    }, {
      label: 'About ' + title,
      action: () => dialog(sys, 'About ' + title, `${title}\nClassic cards, a green table, and time well spent.\n\nCards are drawn especially for this desktop.`)
    }]
  }]);
  const board = element('div', `patience-board ${freecell ? 'freecell-board' : 'solitaire-board'}`);
  board.dataset.back = back;
  board.tabIndex = 0;
  board.setAttribute('aria-label', `${title} card table`);
  win.body.append(board);
  const status = statusBar(sys, win, '');
  function targetData(target) {
    return `data-target='${escapeHTML(JSON.stringify(target))}'`;
  }
  function slot(target, label, content = '', extra = '') {
    const symbol = target.type === 'foundation' ? SUITS[target.index].symbol : target.type === 'free' ? ['I', 'II', 'III', 'IV'][target.index] : '';
    return `<div class="patience-pile ${target.type === 'tableau' ? 'patience-column' : 'patience-top-pile'} ${extra}" ${targetData(target)} aria-label="${label}"><div class="game-card-slot" aria-hidden="true">${symbol}</div>${content}</div>`;
  }
  function render() {
    const refocus = win.el.contains(document.activeElement);
    let top = '';
    if (freecell) {
      top = model.free.map((c, i) => slot({
        type: 'free',
        index: i
      }, `Free cell ${i + 1}`, c ? cardHTML(c, {
        source: {
          type: 'free',
          index: i
        }
      }) : '', 'freecell-cell')).join('');
    } else {
      const stockContent = model.stock.length ? cardHTML(null, {
        back: true
      }) : `<span class="solitaire-recycle ${model.waste.length ? '' : 'is-empty'}" aria-hidden="true">${model.waste.length ? '↻' : '×'}</span>`;
      top = `<div class="patience-pile patience-top-pile solitaire-stock" data-action="draw" tabindex="0" role="button" aria-label="${model.stock.length ? `Draw ${drawCount === 1 ? 'a card' : 'three cards'} (${model.stock.length} in stock)` : model.waste.length ? 'Recycle the waste pile' : 'Stock is empty'}"><div class="game-card-slot"></div>${stockContent}</div>`;
      const shown = Math.min(drawCount === 3 ? Math.max(1, model.lastDraw) : 1, model.waste.length);
      top += `<div class="patience-pile patience-top-pile solitaire-waste" aria-label="Waste pile">${model.waste.slice(-shown || model.waste.length).map((c, i) => cardHTML(c, {
        source: i === shown - 1 ? {
          type: 'waste',
          index: 0
        } : null,
        draggable: i === shown - 1,
        interactive: i === shown - 1,
        extraClass: i === shown - 1 ? '' : 'is-covered',
        style: `left:calc(var(--fan-step) * ${i});z-index:${i + 1}`
      })).join('')}</div><div class="patience-top-spacer"></div>`;
    }
    top += model.foundations.map((p, i) => slot({
      type: 'foundation',
      index: i
    }, `${SUITS[i].name} foundation${p.length ? ', ' + RANKS[p.length] : ' (empty)'}`, p.length ? cardHTML(p[p.length - 1], {
      source: freecell ? null : {
        type: 'foundation',
        index: i
      },
      draggable: !freecell,
      interactive: !freecell
    }) : '', 'patience-foundation')).join('');
    const columns = model.columns.map((pile, index) => {
      let down = 0,
        up = 0;
      const cards = pile.map((c, card) => {
        const style = `top:calc(var(--down-step) * ${down} + var(--up-step) * ${up});z-index:${card + 2}`;
        if (c.up) up++;else down++;
        return cardHTML(c, {
          source: c.up ? {
            type: 'tableau',
            index,
            card
          } : null,
          style,
          draggable: c.up && model.validRun(pile.slice(card)),
          extraClass: c.up ? '' : 'is-covered'
        });
      }).join('');
      const last = pile[pile.length - 1],
        height = `calc(var(--card-h) + var(--down-step) * ${Math.max(0, down - (last && !last.up ? 1 : 0))} + var(--up-step) * ${Math.max(0, up - (last?.up ? 1 : 0))})`;
      return `<div class="patience-pile patience-column" ${targetData({
        type: 'tableau',
        index
      })} style="min-height:${height}" aria-label="Tableau column ${index + 1}"><div class="game-card-slot"></div>${cards}</div>`;
    }).join('');
    board.innerHTML = `<div class="patience-top-row">${top}</div><div class="patience-tableau">${columns}</div>${model.won ? '<div class="patience-win-banner"><strong>You won!</strong><span>A beautifully cleared table.</span></div>' : ''}`;
    const undoItem = gameItems.find(i => i.label === 'Undo');
    if (undoItem) undoItem.disabled = !model.history.length;
    const finishItem = gameItems.find(i => i.label === 'Auto Finish');
    if (finishItem) finishItem.disabled = !model.canFinish || autoFinishing;
    paintSelection();
    if (refocus) board.focus({
      preventScroll: true
    });
  }
  function paintSelection() {
    board.querySelectorAll('[data-source]').forEach(el => {
      const source = JSON.parse(el.dataset.source);
      const selected = sameSource(source, selection) || source.type === 'tableau' && selection?.type === 'tableau' && source.index === selection.index && source.card >= selection.card;
      el.classList.toggle('is-selected', selected);
      el.setAttribute('aria-pressed', String(selected));
      el.classList.toggle('is-hint', sameSource(source, hintSource));
    });
    board.querySelectorAll('[data-target]').forEach(el => {
      const target = JSON.parse(el.dataset.target);
      el.classList.toggle('is-valid-target', !!selection && model.canMove(selection, target));
      el.classList.toggle('is-hint-target', !!hintTarget && target.type === hintTarget.type && target.index === hintTarget.index);
    });
    board.querySelector('.solitaire-stock')?.classList.toggle('is-hint', hintTarget?.type === 'stock');
    updateStatus();
  }
  function updateStatus() {
    if (startedAt && !model.won) elapsed = Math.floor((Date.now() - startedAt) / 1000);
    let info = message;
    if (!info && selection) {
      const run = model.getRun(selection);
      info = run.length > 1 ? `${run.length} cards selected. Choose a destination.` : `${run[0] ? cardName(run[0]) : 'Card'} selected.`;
    }
    if (!info) info = model.won ? 'Congratulations!' : freecell ? `${model.remaining} cards remaining · Game #${model.seed}` : 'Drag cards, or click a card and its destination.';
    const score = Math.max(0, model.score - Math.floor(elapsed / 10) * 2);
    status.innerHTML = `<span class="games-status-message">${escapeHTML(info)}</span>${model.canFinish && !autoFinishing ? '<button class="games-finish-button" data-action="finish">Finish game</button>' : ''}<span class="games-status-count">${freecell ? `Moves: ${model.moves}` : `Score: ${score}`}</span><span class="games-status-time">Time: ${timeText(elapsed)}</span>`;
  }
  function cancelAutomatic() {
    clearTimeout(autoTimer);
    autoTimer = null;
    autoFinishing = false;
  }
  function newGame(seed) {
    cancelAutomatic();
    generation++;
    wonShown = false;
    selection = null;
    dragSource = null;
    hintSource = null;
    hintTarget = null;
    message = '';
    startedAt = 0;
    elapsed = 0;
    model = new PatienceModel(kind, {
      seed,
      drawCount,
      autoMove
    });
    win.setTitle(freecell ? `FreeCell — Game #${model.seed}` : 'Solitaire');
    render();
    board.focus({
      preventScroll: true
    });
  }
  function restart() {
    cancelAutomatic();
    generation++;
    wonShown = false;
    selection = null;
    hintSource = null;
    hintTarget = null;
    message = 'Game restarted.';
    startedAt = 0;
    elapsed = 0;
    model.restart();
    win.setTitle(freecell ? `FreeCell — Game #${model.seed}` : 'Solitaire');
    render();
  }
  function afterAction(changed) {
    if (!changed) return false;
    if (!startedAt) startedAt = Date.now();
    selection = null;
    dragSource = null;
    hintSource = null;
    hintTarget = null;
    message = '';
    render();
    if (model.won && !wonShown) celebrate();
    return true;
  }
  function tryMove(source, target) {
    if (!source || !target) return false;
    if (afterAction(model.move(source, target))) return true;
    const cards = model.getRun(source);
    if (freecell && cards.length > 1 && target.type === 'tableau') {
      const empty = model.columns.filter(p => !p.length).length - (model.columns[target.index]?.length ? 0 : 1);
      message = `That move is not available. With these empty cells and columns, you can carry up to ${(model.free.filter(c => !c).length + 1) * 2 ** Math.max(0, empty)} cards.`;
    } else message = target.type === 'foundation' ? 'Build each foundation by suit, from Ace to King.' : target.type === 'free' ? 'A free cell holds one card.' : freecell ? 'Build down in alternating colors, or use an empty column.' : 'Build down in alternating colors. Only a King can fill an empty column.';
    updateStatus();
    return false;
  }
  function choose(source) {
    if (!model.validRun(model.getRun(source))) {
      message = 'Select a descending run of alternating colors.';
      updateStatus();
      return;
    }
    selection = sameSource(selection, source) ? null : source;
    hintSource = null;
    hintTarget = null;
    message = '';
    paintSelection();
  }
  function draw() {
    cancelAutomatic();
    afterAction(model.draw());
  }
  function undo() {
    cancelAutomatic();
    if (!model.undo()) {
      message = 'There are no moves to undo.';
      updateStatus();
      return;
    }
    selection = null;
    hintSource = null;
    hintTarget = null;
    message = 'Move undone.';
    if (model.won) wonShown = false;
    win.setTitle(freecell ? `FreeCell — Game #${model.seed}` : 'Solitaire');
    render();
  }
  function automaticSource(source) {
    const run = model.getRun(source);
    if (run.length !== 1) return;
    if (tryMove(source, model.foundationFor(run[0]))) return;
    if (freecell && source.type === 'tableau') {
      const empty = model.free.findIndex(c => !c);
      if (empty !== -1) tryMove(source, {
        type: 'free',
        index: empty
      });
    }
  }
  function hint() {
    const next = model.hint();
    selection = null;
    hintSource = null;
    hintTarget = null;
    if (!next) message = 'No useful move is available. Try Undo or start a new game.';else if (next.draw) {
      hintTarget = {
        type: 'stock'
      };
      message = model.stock.length ? 'Click the stock to draw more cards.' : 'Click the empty stock to recycle the waste pile.';
    } else {
      hintSource = next.source;
      hintTarget = next.target;
      const c = model.getRun(next.source)[0];
      message = `Move ${cardName(c)}${model.getRun(next.source).length > 1 ? ' and the cards below it' : ''} to ${next.target.type === 'foundation' ? 'its foundation' : next.target.type === 'free' ? `free cell ${next.target.index + 1}` : `column ${next.target.index + 1}`}.`;
    }
    paintSelection();
  }
  function autoFinish() {
    if (autoFinishing || model.won) return;
    if (!model.canFinish) return dialog(sys, title, freecell ? 'Auto Finish is available when every column is arranged in descending order with alternating colors.' : 'Auto Finish is available once every tableau card is face up and the stock and waste are empty.');
    selection = null;
    autoFinishing = true;
    const token = generation;
    const step = () => {
      if (closed || generation !== token) return;
      const source = model.sources().find(s => {
        const cards = model.getRun(s);
        return cards.length === 1 && model.canMove(s, model.foundationFor(cards[0]));
      });
      if (!source) {
        autoFinishing = false;
        render();
        return;
      }
      afterAction(model.move(source, model.foundationFor(model.getRun(source)[0])));
      if (model.won) {
        autoFinishing = false;
        return;
      }
      autoTimer = setTimeout(step, 115);
    };
    step();
  }
  async function celebrate() {
    wonShown = true;
    cancelAutomatic();
    elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const stats = sys.settings.get(`games.${kind}.stats`, {
      wins: 0,
      bestTime: null
    });
    stats.wins++;
    stats.bestTime = stats.bestTime === null ? elapsed : Math.min(stats.bestTime, elapsed);
    sys.settings.set(`games.${kind}.stats`, stats);
    const token = generation;
    win.setTitle(`${title} — You won!`);
    updateStatus();
    const result = await sys.dialog({
      title: 'Congratulations!',
      message: `You won ${title} in ${timeText(elapsed)} with ${model.moves} moves.${freecell ? '' : `\nScore: ${Math.max(0, model.score - Math.floor(elapsed / 10) * 2)}`}\n\nWould you like to deal again?`,
      icon: kind,
      buttons: [{
        label: 'New Game',
        value: 'new'
      }, {
        label: 'Keep Table',
        value: 'keep'
      }]
    });
    if (!closed && token === generation && result === 'new') newGame();
  }
  function setDraw(count) {
    drawCount = count;
    model.drawCount = count;
    sys.settings.set('games.solitaire.draw', count);
    optionItems[0].checked = count === 1;
    optionItems[1].checked = count === 3;
    selection = null;
    message = `Drawing ${count === 1 ? 'one card' : 'three cards'} at a time.`;
    render();
  }
  function setBack(value) {
    back = value;
    board.dataset.back = value;
    sys.settings.set('games.cards.back', value);
    optionItems.forEach(i => {
      if (i.label === 'Blue Deck') i.checked = value === 'blue';
      if (i.label === 'Red Deck') i.checked = value === 'red';
    });
  }
  async function selectDeal() {
    const result = await sys.prompt({
      title: 'Select Game',
      message: 'Enter a game number from 1 to 1,000,000.\nThe same number always deals the same cards.',
      value: String(model.seed)
    });
    if (result === null) return;
    if (!/^\d+$/.test(result.trim()) || +result < 1 || +result > 1000000) return dialog(sys, 'Select Game', 'Please enter a whole number from 1 to 1,000,000.', 'warning');
    newGame(+result);
  }
  function showStats() {
    const stats = sys.settings.get(`games.${kind}.stats`, {
      wins: 0,
      bestTime: null
    });
    dialog(sys, `${title} Statistics`, `Games won: ${stats.wins}\nFastest win: ${stats.bestTime === null ? 'No wins yet' : timeText(stats.bestTime)}\n\nCurrent game: ${model.moves} moves, ${timeText(elapsed)}${freecell ? `\nGame number: ${model.seed}` : ''}`);
  }
  function help() {
    dialog(sys, `${title} Help`, freecell ? 'Move all 52 cards to the four home cells at the upper right, building each suit from Ace to King.\n\nBuild tableau columns downward in alternating red and black. Any card can fill an empty column. The four free cells at upper left each hold one card.\n\nYou can move an ordered sequence when there is enough temporary space: (empty free cells + 1) × 2 for each available empty column. An empty destination column does not count as temporary space.\n\nDrag a card or sequence, or click it and then its destination. Double-click an exposed card to send it home, or to an empty free cell. Safe cards move home automatically; this can be changed in Options.\n\nCtrl+Z undoes the entire last move, including automatic moves. H gives a hint. F2 deals a new game.' : 'Move all 52 cards to the four foundations at the upper right, building each suit from Ace to King.\n\nBuild tableau columns downward in alternating red and black. Move a face-up run together. Only a King, or a run starting with a King, can fill an empty column.\n\nClick the stock at upper left to draw cards. Click it again when empty to recycle the waste. Choose Draw One or Draw Three in Options. Only the top waste card can be moved.\n\nDrag cards, or click a card and then its destination. Double-click an exposed card to send it to a foundation. Cards turn over automatically when uncovered.\n\nCtrl+Z undoes a move or draw. H gives a hint. F2 deals a new game. Auto Finish appears when all cards are exposed and the stock and waste are empty.');
  }
  function boardClick(e) {
    if (autoFinishing) cancelAutomatic();
    if (e.target.closest('[data-action="draw"]')) {
      draw();
      return;
    }
    const targetEl = e.target.closest('[data-target]'),
      sourceEl = e.target.closest('[data-source]');
    if (selection && targetEl && tryMove(selection, JSON.parse(targetEl.dataset.target))) return;
    if (sourceEl) choose(JSON.parse(sourceEl.dataset.source));else {
      selection = null;
      message = '';
      paintSelection();
    }
  }
  board.addEventListener('click', boardClick);
  board.addEventListener('dblclick', e => {
    const el = e.target.closest('[data-source]');
    if (el) {
      e.preventDefault();
      automaticSource(JSON.parse(el.dataset.source));
    }
  });
  board.addEventListener('dragstart', e => {
    const el = e.target.closest('[data-source]');
    if (!el) {
      e.preventDefault();
      return;
    }
    const source = JSON.parse(el.dataset.source);
    if (!model.validRun(model.getRun(source))) {
      e.preventDefault();
      return;
    }
    cancelAutomatic();
    dragSource = source;
    selection = source;
    message = '';
    paintSelection();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      game: win.id,
      source
    }));
    board.classList.add('is-dragging');
  });
  board.addEventListener('dragover', e => {
    const el = e.target.closest('[data-target]');
    if (el && dragSource && model.canMove(dragSource, JSON.parse(el.dataset.target))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('is-drag-over');
    }
  });
  board.addEventListener('dragleave', e => {
    e.target.closest('[data-target]')?.classList.remove('is-drag-over');
  });
  board.addEventListener('drop', e => {
    e.preventDefault();
    const el = e.target.closest('[data-target]');
    if (el && dragSource) tryMove(dragSource, JSON.parse(el.dataset.target));
    board.classList.remove('is-dragging');
    board.querySelectorAll('.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
    dragSource = null;
  });
  board.addEventListener('dragend', () => {
    dragSource = null;
    board.classList.remove('is-dragging');
    board.querySelectorAll('.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
  });
  status.addEventListener('click', e => {
    if (e.target.closest('[data-action="finish"]')) autoFinish();
  });
  win.el.addEventListener('keydown', e => {
    if (e.key === 'F2') {
      e.preventDefault();
      newGame();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      hint();
    } else if (e.key === 'Escape') {
      cancelAutomatic();
      selection = null;
      hintSource = null;
      hintTarget = null;
      message = '';
      paintSelection();
    } else if ((e.key === 'Enter' || e.key === ' ') && (e.target.matches('.game-card') || e.target.matches('.solitaire-stock'))) {
      e.preventDefault();
      boardClick(e);
    }
  });
  const resize = () => {
    const columns = freecell ? 8 : 7;
    const w = clamp(Math.floor((board.clientWidth - 32 - (columns - 1) * 12) / columns), 40, 71);
    board.style.setProperty('--card-w', `${w}px`);
    board.style.setProperty('--card-h', `${Math.round(w * 96 / 71)}px`);
    board.style.setProperty('--up-step', `${Math.round(w * 23 / 71)}px`);
    board.style.setProperty('--down-step', `${Math.round(w * 14 / 71)}px`);
    board.style.setProperty('--fan-step', `${Math.round(w * 14 / 71)}px`);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(board);
  const timer = setInterval(() => {
    if (startedAt && !model.won) updateStatus();
  }, 1000);
  addCleanup(win, () => {
    closed = true;
    generation++;
    clearInterval(timer);
    cancelAutomatic();
    observer.disconnect();
  });
  newGame(Number(args.deal) || undefined);
  resize();
  return win;
}
function openHearts(sys, args) {
  let model,
    selected = [],
    hintCard = null,
    received = new Set(),
    message = '',
    nextTimer = null,
    generation = 0,
    closed = false,
    roundDialogShown = '',
    recorded = false,
    scoreWindow = null;
  let fast = sys.settings.get('games.hearts.fast', false);
  const playerName = sys.settings.get('games.hearts.player', 'You');
  const win = sys.wm.create({
    title: 'Hearts',
    icon: 'hearts',
    width: 744,
    height: 560,
    minWidth: 530,
    minHeight: 450,
    resizable: true,
    x: args.x,
    y: args.y
  });
  win.body.classList.add('games-window', 'hearts-host');
  const options = [{
    label: 'Fast Play',
    checked: fast,
    action: () => {
      fast = !fast;
      options[0].checked = fast;
      sys.settings.set('games.hearts.fast', fast);
      schedule();
    }
  }, {
    label: 'Player Name…',
    action: changeName
  }];
  sys.menuBar(win, [{
    label: 'Game',
    items: [{
      label: 'New Game',
      shortcut: 'F2',
      action: newGame
    }, {
      label: 'Show Score',
      shortcut: 'F4',
      action: showScores
    }, {
      label: 'Show Last Trick',
      action: showLastTrick
    }, {
      type: 'separator'
    }, {
      label: 'Hint',
      shortcut: 'H',
      action: hint
    }, {
      type: 'separator'
    }, {
      label: 'Exit',
      action: () => win.close()
    }]
  }, {
    label: 'Options',
    items: options
  }, {
    label: 'Help',
    items: [{
      label: 'How to Play Hearts',
      action: help
    }, {
      label: 'About Hearts',
      action: () => dialog(sys, 'About Hearts', 'Hearts\nA four-player game of passing, tricks, and avoiding trouble.\n\nThree computer opponents are ready to play.')
    }]
  }]);
  const board = element('div', 'hearts-board');
  board.tabIndex = 0;
  board.setAttribute('aria-label', 'Hearts card table');
  win.body.append(board);
  const status = statusBar(sys, win, '');
  function newGame() {
    clearTimeout(nextTimer);
    generation++;
    selected = [];
    hintCard = null;
    received = new Set();
    message = '';
    roundDialogShown = '';
    recorded = false;
    model = new HeartsModel({
      names: [sys.settings.get('games.hearts.player', playerName), 'Pauline', 'Michele', 'Ben']
    });
    refresh();
    board.focus({
      preventScroll: true
    });
  }
  function render() {
    const focusId = board.contains(document.activeElement) ? document.activeElement.dataset.card : null;
    const positions = ['south', 'west', 'north', 'east'];
    const players = model.names.map((name, p) => {
      const backs = p && model.hands[p].length ? `<div class="hearts-opponent-cards" aria-label="${model.hands[p].length} cards">${Array.from({
        length: Math.min(6, model.hands[p].length)
      }, (_, i) => cardHTML(null, {
        back: true,
        style: `left:${i * 8}px;top:${i % 2}px;z-index:${i}`
      })).join('')}</div>` : '';
      return `<div class="hearts-player hearts-player-${positions[p]} ${model.phase === 'playing' && model.turn === p ? 'is-turn' : ''}"><strong>${escapeHTML(name)}</strong><small>${model.totals[p]} total · ${model.roundPoints[p]} this hand</small>${backs}</div>`;
    }).join('');
    const trick = `<div class="hearts-trick" aria-label="Current trick">${model.trick.map(t => cardHTML(t.card, {
      draggable: false,
      interactive: false,
      extraClass: `hearts-trick-card-${t.player} ${model.phase === 'trick-end' && model.pendingWinner === t.player ? 'is-trick-winner' : ''}`
    })).join('')}</div>`;
    const legal = new Set(model.legalCards(0).map(c => c.id));
    const cards = model.hands[0].map((c, i) => cardHTML(c, {
      draggable: false,
      selected: selected.includes(c.id),
      extraClass: `${model.phase === 'playing' && model.turn === 0 && !legal.has(c.id) ? 'is-illegal' : ''} ${hintCard === c.id ? 'is-hint' : ''} ${received.has(c.id) ? 'is-received' : ''}`,
      style: `left:calc(var(--hand-step, 30px) * ${i});z-index:${i + 10}`
    })).join('');
    let note = '';
    if (model.phase === 'passing') note = `<div class="hearts-table-note"><strong>Pass three cards ${model.passName === 'across' ? 'across' : `to the ${model.passName}`}</strong>Select cards from your hand (${selected.length} of 3).<button class="win-button" data-action="pass" ${selected.length === 3 ? '' : 'disabled'}>Pass ${model.passName}</button></div>`;else if (model.phase === 'round-over') note = '<div class="hearts-table-note"><strong>Hand complete</strong>The lowest total score wins.<button class="win-button" data-action="next">Deal Next Hand</button></div>';else if (model.phase === 'game-over') {
      const lowest = Math.min(...model.totals),
        names = model.names.filter((_, p) => model.totals[p] === lowest);
      note = `<div class="hearts-table-note"><strong>${escapeHTML(names.join(' and '))} ${names.length > 1 ? 'tie for the win' : names[0] === 'You' ? 'win' : 'wins'}!</strong>Winning score: ${lowest}<button class="win-button" data-action="new">New Game</button></div>`;
    }
    board.innerHTML = `<div class="hearts-round-indicator">Hand ${model.round + 1}<br>${model.heartsBroken ? '♥ Hearts are broken' : 'Hearts are not broken'}</div>${players}${trick}${note}<div class="hearts-hand" aria-label="Your hand">${cards}</div>`;
    sizeHand();
    updateStatus();
    if (focusId) (board.querySelector(`.hearts-hand [data-card="${focusId}"]`) || board).focus({
      preventScroll: true
    });
  }
  function sizeHand() {
    const w = clamp(Math.floor((board.clientWidth - 80) / 7), 53, 71),
      h = Math.round(w * 96 / 71);
    board.style.setProperty('--card-w', `${w}px`);
    board.style.setProperty('--card-h', `${h}px`);
    const count = model?.hands[0].length || 0;
    const step = Math.min(32, (board.clientWidth - 48 - w) / Math.max(1, count - 1));
    board.style.setProperty('--hand-step', `${Math.max(13, step)}px`);
    const hand = board.querySelector('.hearts-hand');
    if (hand) hand.style.width = `${w + Math.max(0, count - 1) * Math.max(13, step)}px`;
  }
  function updateStatus() {
    let text = message;
    if (!text && model.phase === 'passing') text = `Choose three cards to pass ${model.passName}. Click a selected card to keep it.`;else if (!text && model.phase === 'playing') {
      if (model.turn !== 0) text = `${model.names[model.turn]} is thinking…`;else if (!model.trick.length && model.trickNumber === 0) text = 'Your turn. Open the first trick with the two of clubs.';else if (model.trick.length) text = `Your turn. Follow ${SUIT[model.trick[0].card.suit].name} if you can.`;else text = `Your turn to lead.${model.heartsBroken ? '' : ' Hearts have not been broken.'}`;
    } else if (!text && model.phase === 'trick-end') {
      const points = model.trick.reduce((n, t) => n + heartsPoints(t.card), 0);
      text = `${model.names[model.pendingWinner]} takes the trick${points ? ` and ${points} point${points === 1 ? '' : 's'}` : ' with no points'}.`;
    } else if (!text) text = 'Choose Show Score to see the results.';
    status.innerHTML = `<span class="games-status-message">${escapeHTML(text)}</span><span class="games-status-count">Trick: ${Math.min(13, model.trickNumber + 1)} / 13</span>`;
  }
  function refresh() {
    render();
    updateScoreWindow();
    schedule();
  }
  function schedule() {
    clearTimeout(nextTimer);
    const token = generation;
    if (closed || !model) return;
    if (model.phase === 'playing' && model.turn !== 0) nextTimer = setTimeout(() => {
      if (closed || generation !== token) return;
      const card = model.aiCard();
      if (card) {
        model.play(model.turn, card.id);
        hintCard = null;
        message = '';
        refresh();
      }
    }, fast ? 250 : 700);else if (model.phase === 'trick-end') nextTimer = setTimeout(() => {
      if (closed || generation !== token) return;
      model.advanceTrick();
      message = '';
      refresh();
    }, fast ? 600 : 1250);else if (['round-over', 'game-over'].includes(model.phase) && roundDialogShown !== `${generation}:${model.round}`) nextTimer = setTimeout(showRoundResult, 250);
  }
  function pass() {
    const before = new Set(model.hands[0].map(c => c.id));
    if (!model.pass(selected)) return;
    received = new Set(model.hands[0].filter(c => !before.has(c.id)).map(c => c.id));
    selected = [];
    hintCard = null;
    message = '';
    refresh();
  }
  function nextHand() {
    if (model.nextHand()) {
      selected = [];
      hintCard = null;
      received = new Set();
      message = '';
      refresh();
    }
  }
  function playCard(id) {
    if (model.phase === 'passing') {
      if (selected.includes(id)) selected = selected.filter(c => c !== id);else if (selected.length < 3) selected.push(id);else {
        message = 'Three cards are selected. Click one of them to change your choice.';
        updateStatus();
        return;
      }
      message = '';
      hintCard = null;
      render();
      return;
    }
    if (model.phase !== 'playing' || model.turn !== 0) return;
    if (!model.play(0, id)) {
      const c = model.hands[0].find(c => c.id === id);
      message = model.trick.length && model.hands[0].some(c => c.suit === model.trick[0].card.suit) ? `You must follow ${SUIT[model.trick[0].card.suit].name}.` : model.trickNumber === 0 ? 'The first trick must begin with the two of clubs, and point cards cannot be discarded when another choice is available.' : c?.suit === 'H' && !model.heartsBroken ? 'Hearts cannot be led until they are broken, unless you have only hearts.' : 'Choose one of the legal cards in your hand.';
      updateStatus();
      return;
    }
    selected = [];
    hintCard = null;
    received = new Set();
    message = '';
    refresh();
  }
  function hint() {
    if (model.phase === 'passing') {
      selected = model.aiPass(0);
      message = 'Three high-risk cards are selected. You can change them before passing.';
      render();
    } else if (model.phase === 'playing' && model.turn === 0) {
      hintCard = model.aiCard(0)?.id;
      message = hintCard ? `Consider playing the ${cardName(model.hands[0].find(c => c.id === hintCard))}.` : '';
      render();
    } else {
      message = 'A hint is available when it is your turn.';
      updateStatus();
    }
  }
  async function showRoundResult() {
    if (closed || !['round-over', 'game-over'].includes(model.phase)) return;
    const token = generation,
      round = model.round,
      ended = model.phase === 'game-over';
    roundDialogShown = `${generation}:${model.round}`;
    let intro = model.moon !== -1 ? `${model.names[model.moon]} shot the moon! The other players receive 26 points.\n\n` : '';
    if (ended) {
      const low = Math.min(...model.totals),
        winners = model.names.filter((_, p) => model.totals[p] === low);
      intro += `${winners.join(' and ')} ${winners.length > 1 ? 'tie for the win' : winners[0] === 'You' ? 'win' : 'wins'} with ${low} points.\n\n`;
      if (!recorded) {
        recorded = true;
        const stats = sys.settings.get('games.hearts.stats', {
          games: 0,
          wins: 0
        });
        stats.games++;
        if (model.totals[0] === low) stats.wins++;
        sys.settings.set('games.hearts.stats', stats);
      }
    }
    const result = await sys.dialog({
      title: ended ? 'Hearts — Game Over' : `Hand ${model.round + 1} Complete`,
      message: intro + model.names.map((name, p) => `${name}: ${model.history[model.history.length - 1].points[p]} points this hand · ${model.totals[p]} total`).join('\n'),
      icon: 'hearts',
      buttons: [{
        label: ended ? 'New Game' : 'Next Hand',
        value: 'continue'
      }, {
        label: 'Show Score',
        value: 'score'
      }]
    });
    if (closed || generation !== token || model.round !== round) return;
    if (result === 'continue') ended ? newGame() : nextHand();else if (result === 'score') showScores();
  }
  function scoreHTML() {
    return `<table class="hearts-score-table"><thead><tr><th>Hand</th>${model.names.map(n => `<th>${escapeHTML(n)}</th>`).join('')}</tr></thead><tbody>${model.history.map(h => `<tr><td>${h.round}${h.moon !== -1 ? ' ☾' : ''}</td>${h.points.map(p => `<td>${p}</td>`).join('')}</tr>`).join('')}${['passing', 'playing', 'trick-end'].includes(model.phase) ? `<tr><td>Current</td>${model.roundPoints.map(p => `<td>${p}</td>`).join('')}</tr>` : ''}</tbody><tfoot><tr><td>Total</td>${model.totals.map(p => `<td>${p}</td>`).join('')}</tr></tfoot></table><p class="hearts-score-footnote">Lowest score wins. The game ends when a player reaches 100.<br>☾ = a player shot the moon.</p>`;
  }
  function updateScoreWindow() {
    if (scoreWindow?.el.isConnected) scoreWindow.body.querySelector('.hearts-score-wrap').innerHTML = scoreHTML();
  }
  function showScores() {
    if (scoreWindow?.el.isConnected) {
      updateScoreWindow();
      scoreWindow.focus();
      return;
    }
    scoreWindow = sys.wm.create({
      title: 'Hearts Score',
      icon: 'hearts',
      width: 484,
      height: 298,
      minWidth: 390,
      minHeight: 190,
      resizable: true
    });
    scoreWindow.body.classList.add('games-window');
    const wrap = element('div', 'hearts-score-wrap', scoreHTML());
    scoreWindow.body.append(wrap);
    const current = scoreWindow;
    addCleanup(current, () => {
      if (scoreWindow === current) scoreWindow = null;
    });
  }
  function showLastTrick() {
    if (!model.lastTrick.length) return dialog(sys, 'Last Trick', 'No trick has been completed yet.');
    const last = sys.wm.create({
      title: 'Last Trick',
      icon: 'hearts',
      width: 398,
      height: 210,
      minWidth: 398,
      minHeight: 210,
      resizable: false
    });
    last.body.classList.add('games-window');
    last.body.append(element('div', 'hearts-last-table', model.lastTrick.map(t => `<div class="hearts-last-player"><span>${escapeHTML(model.names[t.player])}${t.player === model.lastWinner ? ' ★' : ''}</span>${cardHTML(t.card, {
      draggable: false,
      interactive: false
    })}</div>`).join('')));
    const points = model.lastTrick.reduce((n, t) => n + heartsPoints(t.card), 0);
    statusBar(sys, last, `${model.names[model.lastWinner]} took this trick (${points} points).`);
  }
  async function changeName() {
    const result = await sys.prompt({
      title: 'Hearts',
      message: 'Your player name:',
      value: model.names[0]
    });
    if (result === null) return;
    const name = result.trim().slice(0, 20) || 'You';
    sys.settings.set('games.hearts.player', name);
    model.names[0] = name;
    refresh();
  }
  function help() {
    dialog(sys, 'Hearts Help', 'Finish with the lowest score. Every heart is worth 1 penalty point, and the queen of spades is worth 13.\n\nAt the start of a hand, choose three cards to pass. The direction rotates left, right, across, then no pass. All players pass at the same time.\n\nThe player with the two of clubs leads the first trick. Play a card of the led suit if you have one. Otherwise, you may discard another suit. Hearts and the queen of spades cannot be discarded on the first trick if you have a non-point card available.\n\nThe highest card of the led suit wins the trick and leads next. You cannot lead a heart until a heart has been discarded, unless your hand contains only hearts.\n\nTake all 26 points in one hand to shoot the moon: you receive zero, and each opponent receives 26. The game ends when any player reaches 100 points. The lowest total wins.\n\nClick a card to play it. H suggests a card. F4 shows scores. F2 starts a new game.');
  }
  board.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'pass') pass();else if (action === 'next') nextHand();else if (action === 'new') newGame();else {
      const card = e.target.closest('.hearts-hand [data-card]');
      if (card) playCard(card.dataset.card);
    }
  });
  win.el.addEventListener('keydown', e => {
    if (e.key === 'F2') {
      e.preventDefault();
      newGame();
    } else if (e.key === 'F4') {
      e.preventDefault();
      showScores();
    } else if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      hint();
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.hearts-hand [data-card]')) {
      e.preventDefault();
      playCard(e.target.closest('[data-card]').dataset.card);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const cards = [...board.querySelectorAll('.hearts-hand [data-card]')],
        index = cards.indexOf(document.activeElement);
      if (cards.length) {
        e.preventDefault();
        cards[clamp(index + (e.key === 'ArrowLeft' ? -1 : 1), 0, cards.length - 1)].focus({
          preventScroll: true
        });
      }
    }
  });
  const observer = new ResizeObserver(sizeHand);
  observer.observe(board);
  addCleanup(win, () => {
    closed = true;
    generation++;
    clearTimeout(nextTimer);
    observer.disconnect();
    if (scoreWindow?.el.isConnected) scoreWindow.close();
  });
  newGame();
  return win;
}
export function registerGames(sys) {
  sys.registerApp({
    id: 'minesweeper',
    title: 'Minesweeper',
    icon: 'minesweeper',
    open: args => openMinesweeper(sys, args || {})
  });
  sys.registerApp({
    id: 'solitaire',
    title: 'Solitaire',
    icon: 'solitaire',
    open: args => openPatience(sys, 'solitaire', args || {})
  });
  sys.registerApp({
    id: 'freecell',
    title: 'FreeCell',
    icon: 'freecell',
    open: args => openPatience(sys, 'freecell', args || {})
  });
  sys.registerApp({
    id: 'hearts',
    title: 'Hearts',
    icon: 'hearts',
    open: args => openHearts(sys, args || {})
  });
}
