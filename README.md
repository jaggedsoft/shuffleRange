# shuffleRange**: Random numbers without replacement**

**Every integer in a range, dealt in random order, like a shuffled deck of cards.** Every number comes out exactly once, then the deck is reshuffled. Lightweight enough for tens of thousands of instances. Built to provide satisfying gameplay outcomes while reducing player frustration.

In role-playing games, a **consecutive string of failures** can deeply frustrate players and cause them to quit. To mitigate this issue, developers can adjust how random mechanics are calculated. Rather than **sampling with replacement**, which resembles rolling a die and allows for prolonged streaks of bad luck, games can use **sampling without replacement**, similar to drawing cards from a shuffled deck. This alternative approach drastically lowers the likelihood of repeated misses by guaranteeing an eventual hit. Although this card-based method requires slightly more memory and processing power, statistical models demonstrate that it significantly reduces negative user experiences across both multiplayer and single-player titles.

## Usage

```js
import { shuffleRange } from './shuffleRange/index.js';

// A goblin spawns with a 10–15 damage deck
const goblinId = 'goblin_994';
const goblinDamage = shuffleRange.range(goblinId, 10, 15);

goblinDamage.next(); // 12
goblinDamage.next(); // 10
goblinDamage.next(); // 15  (no repeats until all six values have been dealt)

// Every entity gets its own independent deck
const playerDamage = shuffleRange.range('player_1', 50, 100);
playerDamage.next(); // 84

// On despawn, drop the deck so its memory can be reclaimed
shuffleRange.removeEntity(goblinId);
```

A shuffler can also be used standalone:

```js
import { DeckShuffle } from './shuffleRange/index.js';

const d20 = new DeckShuffle(1, 20);
d20.next();     // 1..20, each exactly once per 20 draws
d20.remaining;  // numbers left in the current cycle
d20.reset();    // put every card back and start a fresh cycle

// Never the same number twice in a row, even across a reshuffle
const hitRoll = new DeckShuffle(1, 20, { noRepeat: true });
```



## The problem

A die has no memory. Roll a 50% hit chance enough times across enough players and someone *will* miss ten times in a row. Improbable events become certain at scale, and each one is a frustrated player.

David Kennerly's [Randomness without Replacement](https://gamedev.net/tutorials/programming/math-and-physics/randomness-without-replacement-r2206) proposes drawing cards instead of rolling dice. The results are still unpredictable and the long-run distribution is identical, but streaks are bounded. A deck of 10 hits and 10 misses can never produce more than 20 misses in a row. Compared with a die, long streaks become about an order of magnitude rarer.

## How it works

**One swap per draw.** The article's "more elegant algorithm" shuffles one card per draw instead of the whole deck up front. `next()` is a single [Fisher–Yates](https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle) step: pick a random card from the undrawn part of the deck and swap it behind the cut. After a one-time fill on the first draw, every draw costs O(1) and makes one RNG call. There is never a reshuffle spike, and a new cycle continues straight from the previous order with no refill. Each cycle is still a uniformly random permutation (the test suite checks this with a chi-square test).

**Flyweight state, shared logic.** An instance holds only `min`, `size`, `remaining`, its RNG, its `noRepeat` flag and its deck. All behavior lives on the class prototype and is shared by every instance. Fields are assigned in a fixed order, so all instances share one V8 hidden class.

**Lazy decks.** Nothing is allocated until the first `next()`. An entity that spawns and dies without drawing costs only its 64-byte instance.

**Offsets in the narrowest TypedArray.** The deck stores offsets `0..size-1` rather than values, so it fits in a `Uint8Array` (up to 256 numbers), a `Uint16Array` (up to 65,536) or a `Uint32Array`. Negative ranges come free, and the deck data is up to 4× smaller than an `Int32Array` of values.

**Registry.** `ShuffleRange` is a thin wrapper over a `Map`: O(1) lookups, keyed by anything (ids, objects, `"goblin_994:crit"`). `removeEntity()` releases the deck on despawn so memory stays flat over time.

## API



### `new DeckShuffle(min, max, { random, noRepeat })`


| Member               | Description                                                                           |
| -------------------- | ------------------------------------------------------------------------------------- |
| `next()`             | Next number in `[min, max]`. Starts a new cycle automatically when the deck runs out. |
| `reset()`            | Returns all drawn numbers to the deck. Chainable.                                     |
| `min`, `max`, `size` | Range bounds (inclusive) and how many numbers it holds.                               |
| `remaining`          | Numbers left in the current cycle (a full deck once a cycle ends).                    |



| Option     | Default       | Description                                                                      |
| ---------- | ------------- | -------------------------------------------------------------------------------- |
| `random`   | `Math.random` | Returns a float in `[0, 1)`. Pass a seeded generator for reproducible sequences. |
| `noRepeat` | `false`       | Never deal the same number twice in a row, even across a reshuffle or `reset()`. |


`min` and `max` must be safe integers with `min <= max`, and the range can hold at most 2³² numbers. Invalid arguments throw `TypeError` or `RangeError`. Out-of-range values from a faulty `random` are clamped, so they can bias results but never corrupt the deck.

### `new ShuffleRange({ random, noRepeat })`


| Member                          | Description                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `range(id, min, max, options?)` | Returns the entity's shuffler, creating it on first request. `options` overrides the manager's defaults for this shuffler. An existing shuffler is returned unchanged, even if the arguments differ. |
| `get(id)`, `has(id)`            | Lookup without creating.                                                                                                                                                                             |
| `removeEntity(id)`              | Drops the shuffler. Returns whether one existed.                                                                                                                                                     |
| `clear()`, `size`               | Remove all shufflers; count them.                                                                                                                                                                    |


`shuffleRange` is a shared default instance. Create your own `ShuffleRange` for per-shard registries or isolated tests. Its options (same as `DeckShuffle`'s) are defaults for every shuffler it creates. `random` is checked on construction.

## Good to know

- **Cycle boundaries can repeat, unless you set** `noRepeat`**.** By default, the last number of one cycle can match the first number of the next, just as the bottom card of one deck can match the top card of a fresh one. With `noRepeat: true`, the first card of each new cycle is drawn uniformly from every number *except* the one just dealt. It costs nothing extra per draw. The trade-off: cycles are no longer perfectly uniform permutations, because the first card of a cycle can never be the last card of the one before. On a one-number range there is nothing else to deal, so that number repeats.
- **Decks can be counted.** Once all but one number of a cycle has been seen, the last one is certain, just like counting cards. That's harmless for damage rolls, but matters where players can observe draws and profit from predicting them.
- **Not cryptographic.** `Math.random` is fine for gameplay. For anything security-sensitive, pass a CSPRNG-backed `random`.
- **ES modules only.** From CommonJS, load it with `await import('./shuffleRange/index.js')`.
- **Many decks per entity:** use compound keys such as `${id}:damage` and `${id}:crit`, and remove each one on despawn. `removeEntity` drops only the exact key it is given.



## Performance

Measured on Node 24 (V8 13.6), 50,000 instances in a `ShuffleRange`. Run `npm run bench` to reproduce.


| Range                 | Before first draw | After first draw |
| --------------------- | ----------------- | ---------------- |
| 10–15 (6 numbers)     | 101 B/instance    | 325 B/instance   |
| 50–100 (51 numbers)   | 101 B/instance    | 373 B/instance   |
| 1–1000 (1000 numbers) | 101 B/instance    | 2.3 KB/instance  |


"Before first draw" is the 64-byte instance plus its `Map` entry. For a 1000-number deck, the `Uint16Array` of offsets takes 2.2 KB, where an `Int32Array` of values takes 4.2 KB and a plain JS array 8 KB.


| Throughput                                                      | Draws/sec |
| --------------------------------------------------------------- | --------- |
| `Math.floor(Math.random() * 6) + 10` (plain die, for reference) | ~190 M    |
| `next()` on one 10–15 shuffler                                  | ~130 M    |
| 50,000 decks of 10–15, visited in allocation order              | ~85 M     |
| 50,000 decks of 10–15, visited in random order                  | ~8–35 M   |
| 50,000 decks of 1–1000, visited in random order                 | ~5 M      |


With many decks, speed is limited by memory latency once the decks no longer fit in the CPU cache, so these rows swing with machine load between runs. Even the slowest row is about 5× what 50,000 entities drawing on every tick of a 20 Hz server need (1 M draws/sec).

## Roadmap

Every TypedArray carries about 220 bytes of fixed overhead, which dominates small decks. Below about two dozen numbers, even a plain JS array is lighter: 96 B for a 6-number deck against 224 B. A **binned slab pool** would beat both: one shared `ArrayBuffer` per size class, with each instance storing only an integer offset into it. A 6-number deck would then cost 6 bytes, and high spawn/despawn churn would create no garbage for the collector. It isn't implemented yet because simplicity comes first.

## Development

```bash
npm test        # node:test, zero dependencies
npm run bench   # memory and throughput numbers
```



## License

MIT