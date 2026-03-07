/** All gameplay balance constants in one place — tweak here only. */

// Grid (portrait-friendly for 9:16 mobile screens)
export const GRID_COLS = 14;
export const GRID_ROWS = 24;

// Snake start
export const SNAKE_START_LENGTH = 3;

// Scoring
export const BASE_SCORE_PER_FOOD = 10;

// Speed progression
export const BASE_STEP_MS = 220;       // ms between snake steps at score 0
export const SPEED_UP_EVERY_SCORE = 50; // reduce stepMs every N points
export const STEP_REDUCE_MS = 10;       // how many ms to reduce per threshold
export const MIN_STEP_MS = 90;          // hard cap — fastest possible

// Ads
export const INTERSTITIAL_EVERY_N_DEATHS = 2; // show interstitial every 2nd game-over
export const REWARDED_COOLDOWN_MS = 60_000;   // 60 seconds between rewarded ads
export const MAX_CONTINUES_PER_RUN = 1;

// Storage keys
export const KEY_BEST_SCORE = "snakeRush_bestScore";
export const KEY_LAST_REWARDED_AT = "snakeRush_lastRewardedAt";
export const KEY_SOUND_ENABLED = "snakeRush_soundEnabled";

// Purple bonus dot
export const PURPLE_LIFETIME_MS = 10_000;          // purple dot lives 10 s
export const PURPLE_INVINCIBILITY_SLOW_MS = 8_000; // invincibility at slowest speed
export const PURPLE_INVINCIBILITY_FAST_MS = 6_000; // invincibility at fastest speed
export const PURPLE_SPEED_BOOST = 1.5;             // +50% speed while invincible
export const PURPLE_BLINK_MS = 2_000;              // head starts blinking in last 2 s
export const PURPLE_BLINK_PERIOD_MS = 300;         // blink toggle every 300 ms
export const PURPLE_CHANCE_PER_FOOD = 0.05;        // +5 % chance per food eaten since last spawn
export const PURPLE_COOLDOWN_MS = 10_000;          // cooldown after picking up purple

// Gold apple / score multiplier
export const GOLD_CHAIN_TIMEOUT_MS = 10_000; // chain resets if no gold eaten for 10 s

// Colours (RGB 0-255)
export const COLOR_PURPLE = [180, 0, 200] as const;
export const COLOR_HEAD_NORMAL = [100, 240, 100] as const;
export const COLOR_GOLD = [255, 200, 0] as const;

/** Compute step interval in ms from the current score. */
export function stepMsFromScore(score: number): number {
  const reductions = Math.floor(score / SPEED_UP_EVERY_SCORE);
  return Math.max(MIN_STEP_MS, BASE_STEP_MS - reductions * STEP_REDUCE_MS);
}

/**
 * Probability of spawning a purple dot after eating food.
 * Increases by 5 % per food eaten since the last purple spawn.
 * Resets to 0 % when a purple dot spawns.
 */
export function purpleSpawnChance(foodEatenSinceSpawn: number): number {
  return Math.min(1, foodEatenSinceSpawn * PURPLE_CHANCE_PER_FOOD);
}

/**
 * Invincibility duration in ms, linearly interpolated between
 * FAST (at MIN_STEP_MS) and SLOW (at BASE_STEP_MS).
 */
export function purpleInvincibilityMs(currentStepMs: number): number {
  const t = Math.min(
    1,
    Math.max(0, (currentStepMs - MIN_STEP_MS) / (BASE_STEP_MS - MIN_STEP_MS))
  );
  return (
    PURPLE_INVINCIBILITY_FAST_MS +
    t * (PURPLE_INVINCIBILITY_SLOW_MS - PURPLE_INVINCIBILITY_FAST_MS)
  );
}
