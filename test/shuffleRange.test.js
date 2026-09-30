import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeckShuffle, ShuffleRange, shuffleRange } from '../index.js';
import { seededRandom } from './seededRandom.js';

test('range creates once, then returns the same instance', () => {
  const manager = new ShuffleRange();
  const first = manager.range('goblin_994', 10, 15);
  assert.ok(first instanceof DeckShuffle);
  assert.equal(manager.range('goblin_994', 10, 15), first);
  assert.equal(manager.range('goblin_994', 1, 2), first, 'existing range is kept');
  assert.equal(first.min, 10);
  assert.equal(manager.size, 1);
});

test('entities get independent decks', () => {
  const manager = new ShuffleRange();
  const goblin = manager.range('goblin', 1, 6);
  const player = manager.range('player', 50, 100);
  assert.notEqual(goblin, player);
  goblin.next();
  assert.equal(goblin.remaining, 5);
  assert.equal(player.remaining, 51);
});

test('get, has, removeEntity, clear and size', () => {
  const manager = new ShuffleRange();
  const key = { id: 7 }; // any Map key works
  const shuffler = manager.range(key, 1, 3);
  assert.equal(manager.get(key), shuffler);
  assert.equal(manager.has(key), true);
  assert.equal(manager.removeEntity(key), true);
  assert.equal(manager.removeEntity(key), false);
  assert.equal(manager.has(key), false);
  assert.equal(manager.get(key), undefined);

  manager.range('a', 1, 2);
  manager.range('b', 1, 2);
  assert.equal(manager.size, 2);
  manager.clear();
  assert.equal(manager.size, 0);
});

test('a seeded manager reproduces sequences', () => {
  const run = () => {
    const manager = new ShuffleRange({ random: seededRandom(99) });
    const a = manager.range('a', 1, 20);
    const b = manager.range('b', 1, 20);
    return Array.from({ length: 50 }, (_, i) => (i % 2 ? a : b).next());
  };
  assert.deepEqual(run(), run());
});

test('manager options are defaults that range can override', () => {
  const noRepeats = (shuffler) => {
    let last = shuffler.next();
    for (let i = 0; i < 2000; i++) {
      const value = shuffler.next();
      if (value === last) return false;
      last = value;
    }
    return true;
  };
  const manager = new ShuffleRange({ noRepeat: true, random: seededRandom(3) });
  assert.equal(noRepeats(manager.range('default', 1, 2)), true);
  assert.equal(noRepeats(manager.range('override', 1, 2, { noRepeat: false })), false);
});

test('invalid ranges throw at creation and are not registered', () => {
  const manager = new ShuffleRange();
  assert.throws(() => manager.range('bad', 5, 1), RangeError);
  assert.equal(manager.has('bad'), false);
});

test('an invalid random is rejected when the manager is constructed', () => {
  assert.throws(() => new ShuffleRange(null), TypeError);
  assert.throws(() => new ShuffleRange({ random: 42 }), TypeError);
});

test('exports a shared default manager', () => {
  assert.ok(shuffleRange instanceof ShuffleRange);
});
