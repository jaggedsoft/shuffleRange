/**
 * DeckShuffle — every integer in [min, max] is drawn exactly once, in random
 * order, before any number repeats. Dice become a deck of cards.
 *
 * Each instance holds only its own small state. All logic lives on the shared
 * prototype, so tens of thousands of instances cost little more than their decks.
 */

const MAX_SIZE = 2 ** 32; // largest deck whose offsets fit in a Uint32Array

/** Shows a bad argument in an error message without running any of its code. */
const describe = (value) => (typeof value === 'number' ? value : typeof value);

/** Throws unless `random` is a function. Shared with ShuffleRange. */
export function assertRandom(random) {
  if (typeof random !== 'function') {
    throw new TypeError(`random must be a function returning a float in [0, 1) (got ${describe(random)})`);
  }
}

/** Narrowest typed array that can hold the offsets 0..size-1, filled in order. */
function createDeck(size) {
  const deck =
    size <= 0x100 ? new Uint8Array(size) :
    size <= 0x10000 ? new Uint16Array(size) :
    new Uint32Array(size);
  for (let i = 0; i < size; i++) deck[i] = i;
  return deck;
}

export class DeckShuffle {
  #min;
  #size;
  #remaining;
  #random;
  #noRepeat; // 1 or 0: how many cards at the front of the deck a new cycle skips
  #deck = null; // allocated on the first draw

  /**
   * @param {number} min - Lowest number in the range (inclusive, safe integer).
   * @param {number} max - Highest number in the range (inclusive, safe integer).
   * @param {object} [options]
   * @param {() => number} [options.random=Math.random] - Returns a float in [0, 1).
   *   Pass a seeded generator for reproducible sequences.
   * @param {boolean} [options.noRepeat=false] - Never deal the same number twice
   *   in a row, even across a reshuffle.
   */
  constructor(min, max, { random = Math.random, noRepeat = false } = {}) {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new TypeError(`min and max must be safe integers (got ${describe(min)}, ${describe(max)})`);
    }
    if (min > max) {
      throw new RangeError(`min must not exceed max (got ${min} > ${max})`);
    }
    const size = max - min + 1;
    if (size > MAX_SIZE) {
      throw new RangeError(`range spans ${size} numbers; the maximum is ${MAX_SIZE}`);
    }
    assertRandom(random);
    this.#min = min;
    this.#size = size;
    this.#remaining = size;
    this.#random = random;
    this.#noRepeat = noRepeat ? 1 : 0;
  }

  /**
   * Draws the next number. When every number has been drawn, a new cycle starts.
   *
   * One Fisher-Yates step per draw: pick a random card from the undrawn part of
   * the deck and swap it behind the cut. After the deck's one-time O(size) fill
   * on the first draw, each call is O(1), so there is never a reshuffle spike.
   * Continuing from the previous cycle's order still yields a uniformly random
   * permutation.
   *
   * When a cycle ends, the last card dealt sits at deck[0]. With noRepeat, the
   * first pick of the next cycle skips that slot.
   *
   * @returns {number}
   */
  next() {
    const deck = this.#deck ?? (this.#deck = createDeck(this.#size));
    let remaining = this.#remaining;
    let skip = 0;
    if (remaining === 0) {
      remaining = this.#size;
      skip = this.#noRepeat;
    }
    // `>>> 0` floors like Math.floor for any float in [0, 1) (the product stays
    // below 2^32). The clamp keeps the deck a valid permutation even if a custom
    // random() returns 1, NaN or a negative number, and covers noRepeat on a
    // one-number range.
    let pick = skip + ((this.#random() * (remaining - skip)) >>> 0);
    if (pick >= remaining) pick = remaining - 1;
    const card = deck[pick];
    deck[pick] = deck[--remaining];
    deck[remaining] = card;
    this.#remaining = remaining;
    return this.#min + card;
  }

  /**
   * Returns every drawn card to the deck; the next draw starts a fresh cycle.
   * @returns {this}
   */
  reset() {
    const deck = this.#deck;
    const remaining = this.#remaining;
    if (deck !== null && remaining !== 0) {
      // End the cycle early, moving the last card dealt to deck[0] like a
      // natural cycle end would, so noRepeat still applies.
      const last = deck[remaining];
      deck[remaining] = deck[0];
      deck[0] = last;
      this.#remaining = 0;
    }
    return this;
  }

  /** Lowest number in the range. */
  get min() {
    return this.#min;
  }

  /** Highest number in the range. */
  get max() {
    return this.#min + this.#size - 1;
  }

  /** How many numbers the range contains. */
  get size() {
    return this.#size;
  }

  /** How many numbers are left before the current cycle ends. */
  get remaining() {
    return this.#remaining || this.#size; // 0 internally means "start a new cycle"
  }
}
