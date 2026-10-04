import test from 'node:test';
import assert from 'node:assert/strict';
import { VirtualFileSystem, normalizePath } from '../packages/core/index.js';
import { CalculatorEngine } from '../packages/accessories/index.js';
import { MinesweeperModel, PatienceModel, HeartsModel } from '../packages/games/index.js';
function volume() {
  const v = new VirtualFileSystem();
  v.emit = function () {
    this.revision++;
    this.dispatchEvent(new Event('change'));
  };
  v.mkdir('C:/');
  v.mkdir('C:/A');
  v.mkdir('C:/B');
  return v;
}
test('Windows paths normalize separators and dot segments', () => {
  assert.equal(normalizePath('c:\\A\\..\\B\\file.txt'), 'C:/B/file.txt');
});
test('read-only writes preserve existing bytes and metadata', () => {
  const v = volume();
  v.write('C:/A/note.txt', 'old');
  v.setAttributes('C:/A/note.txt', {
    readonly: true,
    hidden: true
  });
  assert.throws(() => v.write('c:/a/NOTE.txt', 'new'), /read-only/);
  assert.equal(v.read('C:/A/note.txt'), 'old');
  v.setAttributes('C:/A/note.txt', {
    readonly: false
  });
  v.write('C:/A/note.txt', 'new');
  assert.equal(v.stat('C:/A/note.txt').hidden, true);
});
test('overlapping move fails without losing source', () => {
  const v = volume();
  v.mkdir('C:/A/B');
  v.mkdir('C:/A/B/B');
  v.write('C:/A/B/B/data.txt', 'keep');
  const before = v.export();
  assert.throws(() => v.move('C:/A/B', 'C:/A', {
    overwrite: true
  }), /overlap/);
  assert.equal(v.export(), before);
});
test('file-folder collisions and invalid parents fail atomically', () => {
  const v = volume();
  v.write('C:/A/a.txt', 'data');
  v.mkdir('C:/B/folder');
  v.write('C:/B/folder/child.txt', 'child');
  const before = v.export();
  assert.throws(() => v.copy('C:/A/a.txt', 'C:/B/folder', {
    overwrite: true
  }));
  assert.throws(() => v.mkdir('C:/A/a.txt/child'));
  assert.equal(v.export(), before);
});
test('case-only rename preserves descendants and emits completed state once', () => {
  const v = volume();
  v.write('C:/A/test.txt', 'hello');
  let events = 0;
  v.addEventListener('change', () => events++);
  v.move('C:/A', 'C:/a');
  assert.equal(events, 1);
  assert.equal(v.stat('C:/a/test.txt').path, 'C:/a/test.txt');
  assert.equal(v.read('c:/A/TEST.txt'), 'hello');
});
test('backup preserves and restores deleted subtrees', () => {
  const v = volume();
  v.mkdir('C:/A/sub');
  v.write('C:/A/sub/note.txt', 'restorable');
  v.delete('C:/A/sub');
  const restored = volume();
  restored.import(v.export());
  assert.equal(restored.recycle.length, 1);
  restored.restore(restored.recycle[0].id);
  assert.equal(restored.read('C:/A/sub/note.txt'), 'restorable');
});
test('malformed backup leaves live files and recycle groups unchanged', () => {
  const v = volume();
  v.write('C:/A/test.txt', 'keep');
  const before = v.export(),
    bad = JSON.parse(before);
  bad.recycle = [{
    id: 'x',
    path: 'C:/A/deleted',
    deleted: Date.now(),
    entries: [{
      path: 'C:/outside.txt',
      name: 'outside.txt',
      type: 'file',
      content: 'bad'
    }]
  }];
  assert.throws(() => v.import(JSON.stringify(bad)));
  assert.equal(v.export(), before);
});
test('calculator supports operator replacement, repeated equals and percent', () => {
  const c = new CalculatorEngine();
  c.digit('7');
  c.binary('multiply');
  c.digit('8');
  c.equals();
  assert.equal(c.value, 56);
  c.equals();
  assert.equal(c.value, 448);
  c.clear();
  for (const n of '200') c.digit(n);
  c.binary('add');
  for (const n of '10') c.digit(n);
  c.percent();
  c.equals();
  assert.equal(c.value, 220);
  assert.throws(() => CalculatorEngine.calculate(1, 0, 'divide'));
});
test('Minesweeper reserves first-click neighborhood and exact mine count', () => {
  const m = new MinesweeperModel(8, 8, 10, () => .37);
  m.reveal(27);
  assert.equal(m.cells.filter(c => c.mine).length, 10);
  assert.equal(m.cells[27].near, 0);
  assert.ok([27, ...m.neighbors(27)].every(i => !m.cells[i].mine));
});
test('Solitaire deals all 52 cards and draw undo restores complete state', () => {
  const m = new PatienceModel('solitaire', {
    seed: 42,
    drawCount: 3
  });
  assert.equal(m.stock.length + m.columns.flat().length, 52);
  const before = m.snapshot();
  m.draw();
  assert.equal(m.waste.length, 3);
  assert.equal(m.stock.length, 21);
  m.undo();
  assert.deepEqual(m.snapshot(), before);
});
test('FreeCell can move exposed cards into empty cells and undo', () => {
  const m = new PatienceModel('freecell', {
    seed: 3,
    autoMove: false
  });
  const card = m.columns[0].at(-1);
  assert.equal(m.move({
    type: 'tableau',
    index: 0,
    card: m.columns[0].length - 1
  }, {
    type: 'free',
    index: 0
  }), true);
  assert.equal(m.free[0].id, card.id);
  m.undo();
  assert.equal(m.free[0], null);
  assert.equal(m.columns.flat().length, 52);
});
test('Hearts completes a legal 13-trick hand with conserved penalty points', () => {
  const m = new HeartsModel({
    rng: () => .41
  });
  assert.ok(m.pass(m.aiPass(0)));
  let moves = 0;
  while (m.phase === 'playing' || m.phase === 'trick-end') {
    if (m.phase === 'trick-end') m.advanceTrick();else {
      const legal = m.legalCards();
      assert.ok(legal.length);
      assert.ok(m.play(m.turn, legal[0].id));
      moves++;
    }
  }
  assert.equal(moves, 52);
  assert.equal(m.roundPoints.reduce((a, b) => a + b, 0), 26);
  assert.equal(m.hands.flat().length, 0);
});
