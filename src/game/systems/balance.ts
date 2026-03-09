/** All gameplay balance constants in one place — tweak here only. */

// Grid (portrait-friendly for 9:16 mobile screens)
export const GRID_COLS = 14;
export const GRID_ROWS = 24;

// Snake start
export const SNAKE_START_LENGTH = 3;

// Speed progression (based on snake length)
export const BASE_STEP_MS = 220;          // ms between snake steps at minimum length
export const SPEED_UP_EVERY_LENGTH = 5;   // reduce stepMs every N length units
export const STEP_REDUCE_MS = 5;          // how many ms to reduce per threshold
export const MIN_STEP_MS = 150;           // hard cap — fastest possible (casual-friendly)

// Ads
export const INTERSTITIAL_EVERY_N_DEATHS = 2; // show interstitial every 2nd game-over
export const REWARDED_COOLDOWN_MS = 60_000;   // 60 seconds between rewarded ads
export const MAX_CONTINUES_PER_RUN = 1;

// Storage keys
export const KEY_BEST_LENGTH = "snakeRush_bestLength";
export const KEY_LAST_REWARDED_AT = "snakeRush_lastRewardedAt";
export const KEY_SOUND_ENABLED = "snakeRush_soundEnabled";

// Purple bonus dot
export const PURPLE_LIFETIME_MS = 10_000;          // purple dot lives 10 s
export const PURPLE_INVINCIBILITY_SLOW_MS = 8_000; // invincibility at slowest speed
export const PURPLE_INVINCIBILITY_FAST_MS = 6_000; // invincibility at fastest speed
export const PURPLE_BLINK_MS = 2_000;              // head starts blinking in last 2 s
export const PURPLE_BLINK_PERIOD_MS = 300;         // blink toggle every 300 ms
export const PURPLE_CHANCE_PER_FOOD = 0.05;        // +5 % chance per food eaten since last spawn
export const PURPLE_COOLDOWN_MS = 10_000;          // cooldown after picking up purple

// Colours (RGB 0-255)
export const COLOR_PURPLE = [180, 0, 200] as const;
export const COLOR_HEAD_NORMAL = [100, 240, 100] as const;

/** Compute step interval in ms from the current snake length. */
export function stepMsFromLength(length: number): number {
  const reductions = Math.max(0, Math.floor((length - SNAKE_START_LENGTH) / SPEED_UP_EVERY_LENGTH));
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

// ─── Mobile control UI (minimalist D-pad) ───────────────────────────────────

/** Fraction of screen height reserved for the control panel on touch devices. */
export const CTRL_H_FRAC = 0.30;

/** Enabled base button colour (RGB) — white. */
export const BASE_BTN_ENABLED_COLOR = [255, 255, 255] as const;

/** Disabled button colour (RGB) — gray for 180° reversal buttons. */
export const BTN_DISABLED_COLOR = [100, 100, 100] as const;

/** Enabled helper button colour (RGB) — muted blue, visually secondary. */
export const HELPER_BTN_ENABLED_COLOR = [100, 150, 200] as const;

/** Opacity for enabled buttons. */
export const BTN_OPACITY_ENABLED = 0.9;

/** Opacity for disabled buttons. */
export const BTN_OPACITY_DISABLED = 0.4;
