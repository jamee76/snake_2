/** All gameplay balance constants in one place — tweak here only. */

// Grid
export const GRID_COLS = 24;
export const GRID_ROWS = 14;

// Snake start
export const SNAKE_START_LENGTH = 3;

// Scoring
export const SCORE_PER_FOOD = 10;

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

/** Compute step interval in ms from the current score. */
export function stepMsFromScore(score: number): number {
  const reductions = Math.floor(score / SPEED_UP_EVERY_SCORE);
  return Math.max(MIN_STEP_MS, BASE_STEP_MS - reductions * STEP_REDUCE_MS);
}
