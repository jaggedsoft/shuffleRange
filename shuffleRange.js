import { DeckShuffle, assertRandom } from './deckShuffle.js';

/**
 * Registry of DeckShuffle instances keyed by entity (a monster id, a player
 * object, "goblin_994:damage" — any Map key works).
 */
export class ShuffleRange {
  #shufflers = new Map();
  #options;

  /**
   * @param {object} [options] - Defaults for every shuffler this manager creates.
   * @param {() => number} [options.random=Math.random] - Pass a seeded generator
   *   for replays and tests.
   * @param {boolean} [options.noRepeat=false] - Never deal the same number twice in a row.
   */
  constructor({ random = Math.random, noRepeat = false } = {}) {
    assertRandom(random);
    this.#options = { random, noRepeat };
  }

  /**
   * Returns the entity's shuffler, creating it on first request.
   * If one already exists, it is returned as-is and the other arguments are ignored.
   *
   * @param {*} entityId
   * @param {number} min - Lowest number in the range (inclusive).
   * @param {number} max - Highest number in the range (inclusive).
   * @param {object} [options] - Overrides the manager's defaults for this shuffler
   *   (same shape as the DeckShuffle options).
   * @returns {DeckShuffle}
   */
  range(entityId, min, max, options) {
    let shuffler = this.#shufflers.get(entityId);
    if (shuffler === undefined) {
      const merged = options === undefined ? this.#options : { ...this.#options, ...options };
      shuffler = new DeckShuffle(min, max, merged);
      this.#shufflers.set(entityId, shuffler);
    }
    return shuffler;
  }

  /**
   * @param {*} entityId
   * @returns {DeckShuffle | undefined}
   */
  get(entityId) {
    return this.#shufflers.get(entityId);
  }

  /**
   * @param {*} entityId
   * @returns {boolean}
   */
  has(entityId) {
    return this.#shufflers.has(entityId);
  }

  /**
   * Forgets the shuffler registered under exactly this key so its memory can be
   * reclaimed. Call on despawn, once per key if an entity uses several.
   * @param {*} entityId
   * @returns {boolean} Whether a shuffler was removed.
   */
  removeEntity(entityId) {
    return this.#shufflers.delete(entityId);
  }

  /** Removes every shuffler. */
  clear() {
    this.#shufflers.clear();
  }

  /** Number of registered shufflers. */
  get size() {
    return this.#shufflers.size;
  }
}

/** Shared default manager. Create your own ShuffleRange for per-shard or per-test registries. */
export const shuffleRange = new ShuffleRange();
