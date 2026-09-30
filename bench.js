// Run with: npm run bench   (node --expose-gc bench.js)
import { DeckShuffle, ShuffleRange } from './index.js';

const INSTANCES = 50_000;
const DRAWS = 20_000_000;
const gc = globalThis.gc ?? (() => {});

function memory() {
  gc();
  const { heapUsed, arrayBuffers } = process.memoryUsage();
  return heapUsed + arrayBuffers;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const perInstance = (bytes) => `${(bytes / INSTANCES).toFixed(0)} B/instance`;

function time(label, fn) {
  const start = performance.now();
  const sink = fn();
  const ms = performance.now() - start;
  console.log(`${label.padEnd(48)} ${((DRAWS / ms) / 1000).toFixed(1).padStart(7)} M draws/s  (sink ${sink % 10})`);
}

// --- Memory: registry of 50k shufflers, before and after their first draw ---
for (const [min, max] of [[10, 15], [50, 100], [1, 1000]]) {
  const baseline = memory();
  const manager = new ShuffleRange();
  for (let i = 0; i < INSTANCES; i++) manager.range(i, min, max);
  const created = memory();
  for (let i = 0; i < INSTANCES; i++) manager.get(i).next();
  const drawn = memory();
  console.log(
    `range ${min}-${max} (${max - min + 1} numbers) x ${INSTANCES}: ` +
    `created ${kb(created - baseline)} (${perInstance(created - baseline)}), ` +
    `after first draw ${kb(drawn - baseline)} (${perInstance(drawn - baseline)})`,
  );
  manager.clear();
}
console.log();

// --- Throughput ---
time('Math.floor(Math.random() * 6) + 10 (dice)', () => {
  let sink = 0;
  for (let i = 0; i < DRAWS; i++) sink += Math.floor(Math.random() * 6) + 10;
  return sink;
});

time('DeckShuffle(10, 15).next(), one instance', () => {
  const shuffler = new DeckShuffle(10, 15);
  let sink = 0;
  for (let i = 0; i < DRAWS; i++) sink += shuffler.next();
  return sink;
});

// Many decks at once. Visiting them in allocation order lets the CPU prefetch;
// a shuffled order (like real entities) makes every draw a likely cache miss.
function roundRobin(min, max, shuffled) {
  const shufflers = Array.from({ length: INSTANCES }, () => new DeckShuffle(min, max));
  for (const shuffler of shufflers) shuffler.next(); // allocate decks outside the timer
  const order = new Uint32Array(INSTANCES);
  const visit = new DeckShuffle(0, INSTANCES - 1); // one cycle = a random visit order
  for (let i = 0; i < INSTANCES; i++) order[i] = shuffled ? visit.next() : i;

  time(`next(), ${INSTANCES} decks of ${min}-${max}, ${shuffled ? 'shuffled' : 'in-order'}`, () => {
    let sink = 0;
    for (let i = 0, k = 0; i < DRAWS; i++, k = k + 1 === INSTANCES ? 0 : k + 1) {
      sink += shufflers[order[k]].next();
    }
    return sink;
  });
}

roundRobin(10, 15, false);
roundRobin(10, 15, true);
roundRobin(1, 1000, true);
