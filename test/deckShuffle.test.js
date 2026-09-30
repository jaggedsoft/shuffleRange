import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeckShuffle } from '../index.js';
import { seededRandom } from './seededRandom.js';

const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const drawCycle = (shuffler) => Array.from({ length: shuffler.size }, () => shuffler.next());
const sorted = (values) => [...values].sort((a, b) => a - b);

test('each cycle is a permutation of [min, max]', () => {
  const shuffler = new DeckShuffle(10, 15);
  for (let cycle = 0; cycle < 100; cycle++) {
    assert.deepEqual(sorted(drawCycle(shuffler)), range(10, 15));
  }
});

test('handles negative and zero-crossing ranges', () => {
  assert.deepEqual(sorted(drawCycle(new DeckShuffle(-20, -15))), range(-20, -15));
  assert.deepEqual(sorted(drawCycle(new DeckShuffle(-3, 3))), range(-3, 3));
});

test('a single-number range always returns that number', () => {
  const shuffler = new DeckShuffle(7, 7);
  for (let i = 0; i < 10; i++) assert.equal(shuffler.next(), 7);
});

test('deck width boundaries (Uint8/Uint16/Uint32) keep every value intact', () => {
  for (const size of [255, 256, 257, 65535, 65536, 65537]) {
    const min = -1000;
    const shuffler = new DeckShuffle(min, min + size - 1, { random: seededRandom(size) });
    for (let cycle = 0; cycle < 2; cycle++) {
      const seen = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        const offset = shuffler.next() - min;
        assert.ok(offset >= 0 && offset < size, `size ${size}: ${offset} out of range`);
        assert.equal(seen[offset], 0, `size ${size}: offset ${offset} drawn twice`);
        seen[offset] = 1;
      }
    }
  }
});

test('works at the edges of the safe integer range', () => {
  const max = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(sorted(drawCycle(new DeckShuffle(max - 4, max))), range(max - 4, max));
  const min = Number.MIN_SAFE_INTEGER;
  assert.deepEqual(sorted(drawCycle(new DeckShuffle(min, min + 4))), range(min, min + 4));
});

test('remaining counts down and wraps into a new cycle', () => {
  const shuffler = new DeckShuffle(1, 3);
  assert.equal(shuffler.remaining, 3);
  shuffler.next();
  assert.equal(shuffler.remaining, 2);
  shuffler.next();
  shuffler.next();
  assert.equal(shuffler.remaining, 3, 'a finished cycle reports a full new deck');
  shuffler.next();
  assert.equal(shuffler.remaining, 2);
});

test('noRepeat never deals the same number twice in a row, across cycles', () => {
  for (const size of [2, 3, 6, 300]) {
    const shuffler = new DeckShuffle(1, size, { noRepeat: true, random: seededRandom(size) });
    let last = NaN;
    for (let cycle = 0; cycle < 500; cycle++) {
      const values = drawCycle(shuffler);
      assert.deepEqual(sorted(values), range(1, size), 'each cycle is still a permutation');
      assert.notEqual(values[0], last, `size ${size}: repeat across cycle ${cycle}`);
      last = values[size - 1];
    }
  }
});

test('noRepeat holds across reset()', () => {
  const shuffler = new DeckShuffle(1, 4, { noRepeat: true, random: seededRandom(7) });
  for (let i = 0; i < 2000; i++) {
    const drawn = Array.from({ length: 1 + (i % 4) }, () => shuffler.next());
    shuffler.reset();
    assert.notEqual(shuffler.next(), drawn.at(-1));
    shuffler.reset();
  }
});

test('noRepeat keeps the first draw of each cycle uniform over the other numbers', () => {
  const shuffler = new DeckShuffle(0, 4, { noRepeat: true, random: seededRandom(11) });
  const cycles = 100_000;
  const counts = new Array(4).fill(0); // offset of the first card from the previous last card
  let last = drawCycle(shuffler).at(-1);
  for (let c = 0; c < cycles; c++) {
    const values = drawCycle(shuffler);
    counts[(values[0] - last + 5) % 5 - 1]++;
    last = values.at(-1);
  }
  const expected = cycles / 4;
  const chiSquare = counts.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
  assert.ok(chiSquare < 16.27, `chi-square ${chiSquare.toFixed(2)} exceeds p=0.001 critical value (3 df)`);
});

test('noRepeat on a one-number range still returns that number', () => {
  const shuffler = new DeckShuffle(5, 5, { noRepeat: true });
  for (let i = 0; i < 5; i++) assert.equal(shuffler.next(), 5);
});

test('reset() starts a fresh full cycle', () => {
  const shuffler = new DeckShuffle(1, 6);
  shuffler.next();
  shuffler.next();
  assert.equal(shuffler.reset(), shuffler);
  assert.equal(shuffler.remaining, 6);
  assert.deepEqual(sorted(drawCycle(shuffler)), range(1, 6));
});

test('exposes min, max and size', () => {
  const shuffler = new DeckShuffle(-5, 10);
  assert.equal(shuffler.min, -5);
  assert.equal(shuffler.max, 10);
  assert.equal(shuffler.size, 16);
});

test('the same seed reproduces the same sequence', () => {
  const a = new DeckShuffle(1, 100, { random: seededRandom(42) });
  const b = new DeckShuffle(1, 100, { random: seededRandom(42) });
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test('construction does no work until the first draw', () => {
  let calls = 0;
  const shuffler = new DeckShuffle(1, 1e6, { random: () => (calls++, 0.5) });
  assert.equal(calls, 0);
  shuffler.next();
  assert.equal(calls, 1);
});

test('an out-of-contract random() never corrupts the deck', () => {
  for (const bad of [1, NaN, -0.5, 1.5, Infinity]) {
    const shuffler = new DeckShuffle(1, 6, { random: () => bad });
    for (let cycle = 0; cycle < 3; cycle++) {
      assert.deepEqual(sorted(drawCycle(shuffler)), range(1, 6), `random() returned ${bad}`);
    }
  }
});

test('rejects invalid arguments', () => {
  assert.throws(() => new DeckShuffle(1.5, 3), TypeError);
  assert.throws(() => new DeckShuffle(1, NaN), TypeError);
  assert.throws(() => new DeckShuffle('1', 3), TypeError);
  assert.throws(() => new DeckShuffle(Symbol('min'), 3), { name: 'TypeError', message: /safe integers/ });
  assert.throws(() => new DeckShuffle(1, Number.MAX_SAFE_INTEGER + 1), TypeError);
  assert.throws(() => new DeckShuffle(5, 4), RangeError);
  assert.throws(() => new DeckShuffle(0, 2 ** 32), RangeError);
  assert.throws(() => new DeckShuffle(1, 3, { random: 'not a function' }), TypeError);
  assert.doesNotThrow(() => new DeckShuffle(0, 2 ** 32 - 1)); // max size; deck is lazy
});

// Each cycle's order *relative to the previous cycle* must be uniform over all
// 4! = 24 permutations. Pooling raw orders would not do: consecutive decks form
// a random walk that drifts to uniform even when the picks are biased.
test('cycles are uniformly distributed permutations (chi-square)', () => {
  const cycles = 240_000;
  const shuffler = new DeckShuffle(0, 3, { random: seededRandom(1234) });
  const counts = new Map();
  let previous = drawCycle(shuffler);
  for (let c = 0; c < cycles; c++) {
    const current = drawCycle(shuffler);
    const key = current.map((value) => previous.indexOf(value)).join('');
    counts.set(key, (counts.get(key) ?? 0) + 1);
    previous = current;
  }
  assert.equal(counts.size, 24);
  const expected = cycles / 24;
  let chiSquare = 0;
  for (const observed of counts.values()) chiSquare += (observed - expected) ** 2 / expected;
  assert.ok(chiSquare < 49.73, `chi-square ${chiSquare.toFixed(2)} exceeds p=0.001 critical value (23 df)`);
});
