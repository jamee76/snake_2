import type { KAPLAYCtx, GameObj, ColorComp, OpacityComp, AreaComp } from "kaplay";
import type { IPlatform } from "../../platform/platform.ts";
import {
  GRID_COLS,
  GRID_ROWS,
  BASE_STEP_MS,
  SNAKE_START_LENGTH,
  stepMsFromLength,
  KEY_BEST_LENGTH,
  INTERSTITIAL_EVERY_N_DEATHS,
  PURPLE_LIFETIME_MS,
  PURPLE_COOLDOWN_MS,
  PURPLE_BLINK_MS,
  PURPLE_BLINK_PERIOD_MS,
  COLOR_PURPLE,
  COLOR_HEAD_NORMAL,
  purpleSpawnChance,
  purpleInvincibilityMs,
  CTRL_H_FRAC,
  BASE_BTN_ENABLED_COLOR,
  BTN_DISABLED_COLOR,
  HELPER_BTN_ENABLED_COLOR,
  BTN_OPACITY_ENABLED,
  BTN_OPACITY_DISABLED,
} from "../systems/balance.ts";
import { rng } from "../../shared/rng.ts";
import { telemetry } from "../../shared/telemetry.ts";

type Direction = "up" | "down" | "left" | "right";

interface Cell {
  x: number;
  y: number;
}

/** Shared game state persisted between continues. */
let deathCount = 0;

export function registerGameScene(k: KAPLAYCtx, platform: IPlatform): void {
  k.scene(
    "game",
    (opts?: {
      snakeLength?: number;
      continuesUsed?: number;
    }) => {
      telemetry.log("scene:game", opts);

      // ─── Touch detection ─────────────────────────────────────
      const isTouch =
        navigator.maxTouchPoints > 0 || "ontouchstart" in window;

      // ─── Layout ──────────────────────────────────────────────
      const W = k.width();
      const H = k.height();

      // Reserve bottom area for the controls on touch devices
      const CTRL_H = isTouch ? Math.floor(H * CTRL_H_FRAC) : 0;
      const GAME_H = H - CTRL_H;

      // Cell size that fits the grid inside the game area
      const cellSize = Math.floor(
        Math.min(W / GRID_COLS, GAME_H / GRID_ROWS)
      );
      const gridW = cellSize * GRID_COLS;
      const gridH = cellSize * GRID_ROWS;

      // Center the grid
      const gridX = Math.floor((W - gridW) / 2);
      const gridY = Math.floor((GAME_H - gridH) / 2);

      // ─── State ───────────────────────────────────────────────
      const continuesUsed = opts?.continuesUsed ?? 0;
      let bestLength = platform.storage.get<number>(KEY_BEST_LENGTH) ?? 0;

      // Build initial snake
      const startCol = Math.floor(GRID_COLS / 2);
      const startRow = Math.floor(GRID_ROWS / 2);
      let snake: Cell[] = [];
      const initLen = opts?.snakeLength ?? SNAKE_START_LENGTH;
      for (let i = 0; i < initLen; i++) {
        snake.push({ x: startCol - i, y: startRow });
      }

      let dir: Direction = "right";
      let turnQueue: Direction[] = [];
      let stepAccum = 0;
      let gameOver = false;

      // ─── Food ────────────────────────────────────────────────
      let food: Cell = spawnFood(snake, null);
      let foodEaten = 0;
      let purpleFood: Cell | null = null;
      let purpleLifetimeMs = 0;
      let purpleCooldownMs = 0;      // cooldown after picking up purple
      let purpleFoodEatenSinceSpawn = 0; // resets when purple spawns

      // ─── Invincibility ───────────────────────────────────────
      let invincible = false;
      let invincibleTimeMs = 0;
      let maxInvincibleMs = purpleInvincibilityMs(BASE_STEP_MS); // for bar fraction
      let blinkAccum = 0;

      // ─── Background ──────────────────────────────────────────
      k.add([k.rect(W, H), k.color(15, 20, 30), k.pos(0, 0), k.fixed()]);

      // Grid border
      k.add([
        k.rect(gridW + 4, gridH + 4),
        k.color(60, 90, 60),
        k.pos(gridX - 2, gridY - 2),
        k.fixed(),
      ]);
      k.add([
        k.rect(gridW, gridH),
        k.color(20, 30, 20),
        k.pos(gridX, gridY),
        k.fixed(),
      ]);

      // ─── HUD ─────────────────────────────────────────────────
      const hudSize = Math.min(W * 0.04, 18);

      const lengthLabel = k.add([
        k.text(`Length: ${snake.length}`, { size: hudSize, font: "monospace" }),
        k.color(200, 255, 200),
        k.pos(8, 4),
        k.fixed(),
      ]);
      const bestLabel = k.add([
        k.text(`Best: ${bestLength}`, { size: hudSize, font: "monospace" }),
        k.color(200, 220, 160),
        k.pos(W - 8, 4),
        k.anchor("topright"),
        k.fixed(),
      ]);

      // ─── Progress bars ───────────────────────────────────────
      const barH = Math.max(8, Math.floor(hudSize * 0.55));
      const barX = 8;
      const barW = W - 16;
      const invBarY = Math.floor(hudSize + 14);
      const barTextSize = Math.max(8, Math.floor(hudSize * 0.65));

      // Invincibility bar (purple)
      const invBarBg = k.add([
        k.rect(barW, barH),
        k.color(40, 10, 40),
        k.pos(barX, invBarY),
        k.fixed(),
      ]);
      const invBarFill = k.add([
        k.rect(barW, barH),
        k.color(...COLOR_PURPLE),
        k.pos(barX, invBarY),
        k.fixed(),
      ]);
      const invBarText = k.add([
        k.text("", { size: barTextSize, font: "monospace" }),
        k.color(220, 180, 220),
        k.pos(barX + 2, invBarY + 1),
        k.fixed(),
      ]);
      invBarBg.hidden = true;
      invBarFill.hidden = true;
      invBarText.hidden = true;

      // ─── Touch swipe controls (non-touch/desktop fallback only) ─
      if (!isTouch) {
        const SWIPE_MIN_DIST_PX = 30;
        let touchStartX = 0;
        let touchStartY = 0;

        k.onTouchStart((pos) => {
          touchStartX = pos.x;
          touchStartY = pos.y;
        });

        k.onTouchEnd((pos) => {
          if (gameOver) return;
          const dx = pos.x - touchStartX;
          const dy = pos.y - touchStartY;
          const adx = Math.abs(dx);
          const ady = Math.abs(dy);
          if (Math.max(adx, ady) < SWIPE_MIN_DIST_PX) return;
          if (adx > ady) {
            applyDir(dx > 0 ? "right" : "left");
          } else {
            applyDir(dy > 0 ? "down" : "up");
          }
        });
      }

      // ─── Keyboard controls (desktop) ─────────────────────────
      k.onKeyPress("up", () => applyDir("up"));
      k.onKeyPress("down", () => applyDir("down"));
      k.onKeyPress("left", () => applyDir("left"));
      k.onKeyPress("right", () => applyDir("right"));
      k.onKeyPress("w", () => applyDir("up"));
      k.onKeyPress("s", () => applyDir("down"));
      k.onKeyPress("a", () => applyDir("left"));
      k.onKeyPress("d", () => applyDir("right"));

      function isOpposite(a: Direction, b: Direction): boolean {
        return (
          (a === "up" && b === "down") ||
          (a === "down" && b === "up") ||
          (a === "left" && b === "right") ||
          (a === "right" && b === "left")
        );
      }

      function applyDir(d: Direction): void {
        // Forbid 180° reversal — overwrite queue with single direction
        if (isOpposite(d, dir)) return;
        turnQueue = [d];
      }

      // ─── Render helpers ──────────────────────────────────────
      function cellToWorld(c: Cell) {
        return {
          x: gridX + c.x * cellSize,
          y: gridY + c.y * cellSize,
        };
      }

      // Snake segments pool — we recreate each frame via simple rects
      // (simple approach: destroy & re-add each step)
      const snakeObjs: ReturnType<typeof k.add>[] = [];
      let foodObj: ReturnType<typeof k.add> | null = null;
      let purpleFoodObj: ReturnType<typeof k.add> | null = null;
      // Head is kept separate so its color can be updated between steps (blink)
      let headObj: GameObj<ColorComp> | null = null;

      function redraw(): void {
        // Remove previous snake body rects
        for (const obj of snakeObjs) obj.destroy();
        snakeObjs.length = 0;

        // Remove previous head
        if (headObj) { headObj.destroy(); headObj = null; }

        // Draw body
        const pad = Math.max(1, Math.floor(cellSize * 0.08));
        for (let i = 1; i < snake.length; i++) {
          const { x, y } = cellToWorld(snake[i]);
          snakeObjs.push(
            k.add([
              k.rect(cellSize - pad * 2, cellSize - pad * 2),
              k.color(50, 160, 50),
              k.pos(x + pad, y + pad),
              k.fixed(),
            ])
          );
        }

        // Draw head — purple when invincible, green otherwise
        if (snake.length > 0) {
          const { x, y } = cellToWorld(snake[0]);
          const [hr, hg, hb] = invincible ? COLOR_PURPLE : COLOR_HEAD_NORMAL;
          headObj = k.add([
            k.rect(cellSize - pad * 2, cellSize - pad * 2),
            k.color(hr, hg, hb),
            k.pos(x + pad, y + pad),
            k.fixed(),
          ]) as GameObj<ColorComp>;
        }

        // Food
        if (foodObj) foodObj.destroy();
        const fp = cellToWorld(food);
        foodObj = k.add([
          k.rect(cellSize - pad * 2, cellSize - pad * 2),
          k.color(240, 80, 80),
          k.pos(fp.x + pad, fp.y + pad),
          k.fixed(),
        ]);

        // Purple dot
        if (purpleFoodObj) purpleFoodObj.destroy();
        purpleFoodObj = null;
        if (purpleFood) {
          const pp = cellToWorld(purpleFood);
          purpleFoodObj = k.add([
            k.rect(cellSize - pad * 2, cellSize - pad * 2),
            k.color(...COLOR_PURPLE),
            k.pos(pp.x + pad, pp.y + pad),
            k.fixed(),
          ]);
        }
      }

      redraw();

      // ─── Mobile UI state callbacks (populated for touch devices) ──
      let updateDialState = () => {};

      // ─── Minimalist D-pad UI (touch devices only) ─────────────────
      if (isTouch) {
        // ── Sizing ──────────────────────────────────────────────────
        const baseSz    = Math.max(40, Math.min(54, Math.floor(CTRL_H * 0.23)));
        const helpSz    = Math.max(20, Math.floor(baseSz / 2));
        const gap       = Math.max(4,  Math.floor(baseSz * 0.12));
        const step      = baseSz + gap;
        const baseLblSz = Math.max(14, Math.floor(baseSz * 0.45));
        const helpLblSz = Math.max(9,  Math.floor(helpSz * 0.55));

        const dpadCX = Math.floor(W / 2);
        const dpadCY = Math.floor(GAME_H + CTRL_H / 2);

        // Base button centres
        const upCX = dpadCX,        upCY = dpadCY - step;
        const dnCX = dpadCX,        dnCY = dpadCY + step;
        const ltCX = dpadCX - step, ltCY = dpadCY;
        const rtCX = dpadCX + step, rtCY = dpadCY;

        // Anchor positions for helper button columns/rows
        const hRightX = Math.floor(rtCX + baseSz / 2 + gap + helpSz / 2);
        const hLeftX  = Math.floor(ltCX - baseSz / 2 - gap - helpSz / 2);
        const hDownY  = Math.floor(dnCY + baseSz / 2 + gap + helpSz / 2);
        const hUpY    = Math.floor(upCY - baseSz / 2 - gap - helpSz / 2);
        const hOff    = Math.floor((helpSz + gap) / 2);

        // ── Panel background ─────────────────────────────────────────
        k.add([k.rect(W, CTRL_H), k.color(10, 15, 25), k.pos(0, GAME_H), k.fixed()]);

        // ── Button factory ───────────────────────────────────────────
        const mkBtn = (
          cx: number, cy: number, sz: number,
          label: string, lSz: number,
          bgRgb: readonly [number, number, number],
          txtRgb: readonly [number, number, number],
          dirs: Direction[],
        ) => {
          const [r, g, b] = bgRgb;
          const bg = k.add([
            k.rect(sz, sz, { radius: Math.floor(sz * 0.2) }),
            k.color(r, g, b),
            k.opacity(BTN_OPACITY_ENABLED),
            k.area(),
            k.pos(cx - sz / 2, cy - sz / 2),
            k.fixed(),
          ]) as GameObj<ColorComp & OpacityComp & AreaComp>;

          const [tr, tg, tb] = txtRgb;
          const lbl = k.add([
            k.text(label, { size: lSz, font: "monospace" }),
            k.color(tr, tg, tb),
            k.pos(cx, cy),
            k.anchor("center"),
            k.fixed(),
          ]);

          const btnDirs = dirs;
          bg.onClick(() => {
            if (gameOver) return;
            if (isOpposite(btnDirs[0], dir)) return;
            turnQueue = [...btnDirs];
          });

          return { bg, lbl, bgRgb };
        };

        // ── 4 Base buttons (always visible, 2× size, white) ─────────
        const DARK_TXT  = [20,  20,  20 ] as const;
        const LIGHT_TXT = [230, 240, 255] as const;

        type BtnEntry = {
          dirs: Direction[];
          bg: GameObj<ColorComp & OpacityComp & AreaComp>;
          lbl: ReturnType<typeof k.add>;
          bgRgb: readonly [number, number, number];
        };

        const baseBtns: BtnEntry[] = [
          { dirs: ["up"],    ...mkBtn(upCX, upCY, baseSz, "↑", baseLblSz, BASE_BTN_ENABLED_COLOR, DARK_TXT, ["up"])    },
          { dirs: ["down"],  ...mkBtn(dnCX, dnCY, baseSz, "↓", baseLblSz, BASE_BTN_ENABLED_COLOR, DARK_TXT, ["down"])  },
          { dirs: ["left"],  ...mkBtn(ltCX, ltCY, baseSz, "←", baseLblSz, BASE_BTN_ENABLED_COLOR, DARK_TXT, ["left"])  },
          { dirs: ["right"], ...mkBtn(rtCX, rtCY, baseSz, "→", baseLblSz, BASE_BTN_ENABLED_COLOR, DARK_TXT, ["right"]) },
        ];

        // ── Helper buttons (2 visible at a time, 1× size) ────────────
        // 2 per direction = 8 total; only the pair matching current dir is shown.
        const helperDefs: Array<{
          forDir: Direction; cx: number; cy: number;
          label: string; dirs: Direction[];
        }> = [
          // dir === "left"  → helpers near the Right button
          { forDir: "left",  cx: hRightX,       cy: dpadCY - hOff, label: "↑→", dirs: ["up",    "right"] },
          { forDir: "left",  cx: hRightX,       cy: dpadCY + hOff, label: "↓→", dirs: ["down",  "right"] },
          // dir === "right" → helpers near the Left button
          { forDir: "right", cx: hLeftX,        cy: dpadCY - hOff, label: "↑←", dirs: ["up",    "left"]  },
          { forDir: "right", cx: hLeftX,        cy: dpadCY + hOff, label: "↓←", dirs: ["down",  "left"]  },
          // dir === "up"    → helpers below the Down button
          { forDir: "up",    cx: dpadCX - hOff, cy: hDownY,        label: "←↓", dirs: ["left",  "down"]  },
          { forDir: "up",    cx: dpadCX + hOff, cy: hDownY,        label: "→↓", dirs: ["right", "down"]  },
          // dir === "down"  → helpers above the Up button
          { forDir: "down",  cx: dpadCX - hOff, cy: hUpY,          label: "←↑", dirs: ["left",  "up"]    },
          { forDir: "down",  cx: dpadCX + hOff, cy: hUpY,          label: "→↑", dirs: ["right", "up"]    },
        ];

        type HelpEntry = BtnEntry & { forDir: Direction };
        const helpBtns: HelpEntry[] = [];
        for (const e of helperDefs) {
          const { bg, lbl, bgRgb } = mkBtn(
            e.cx, e.cy, helpSz, e.label, helpLblSz,
            HELPER_BTN_ENABLED_COLOR, LIGHT_TXT, e.dirs,
          );
          bg.hidden  = true;
          lbl.hidden = true;
          helpBtns.push({ forDir: e.forDir, dirs: e.dirs, bg, lbl, bgRgb });
        }

        // ── State updater ─────────────────────────────────────────────
        const applyBtnStyle = (
          bg: GameObj<ColorComp & OpacityComp & AreaComp>,
          disabled: boolean,
          enabledRgb: readonly [number, number, number],
        ) => {
          const [r, g, b] = disabled ? BTN_DISABLED_COLOR : enabledRgb;
          bg.color.r = r;
          bg.color.g = g;
          bg.color.b = b;
          bg.opacity = disabled ? BTN_OPACITY_DISABLED : BTN_OPACITY_ENABLED;
        };

        updateDialState = () => {
          // Base buttons: gray + dim when the press would be a 180° reversal
          for (const btn of baseBtns) {
            applyBtnStyle(btn.bg, isOpposite(btn.dirs[0], dir), btn.bgRgb);
          }

          // Helper buttons: show only the 2 matching current dir
          for (const hBtn of helpBtns) {
            const show = hBtn.forDir === dir;
            hBtn.bg.hidden  = !show;
            hBtn.lbl.hidden = !show;
            if (show) {
              applyBtnStyle(hBtn.bg, isOpposite(hBtn.dirs[0], dir), HELPER_BTN_ENABLED_COLOR);
            }
          }
        };

        // Initialise button states
        updateDialState();
      }


      // ─── Game loop ───────────────────────────────────────────
      k.onUpdate(() => {
        if (gameOver) return;

        const dt = k.dt() * 1000;

        // ── Purple dot lifetime ───────────────────────────────
        if (purpleFood) {
          purpleLifetimeMs -= dt;
          if (purpleLifetimeMs <= 0) {
            purpleFood = null;
            if (purpleFoodObj) { purpleFoodObj.destroy(); purpleFoodObj = null; }
          }
        }

        // ── Purple cooldown (after picking up purple) ─────────
        if (purpleCooldownMs > 0) {
          purpleCooldownMs -= dt;
        }

        // ── Invincibility timer ───────────────────────────────
        if (invincible) {
          invincibleTimeMs -= dt;
          blinkAccum += dt;

          if (invincibleTimeMs <= 0) {
            // Invincibility expired — restore head to green immediately
            invincible = false;
            blinkAccum = 0;
            if (headObj) {
              [headObj.color.r, headObj.color.g, headObj.color.b] = COLOR_HEAD_NORMAL;
            }
          } else if (invincibleTimeMs <= PURPLE_BLINK_MS && headObj) {
            // Last 2 seconds — blink head between purple and green
            const blinkOn =
              Math.floor(blinkAccum / PURPLE_BLINK_PERIOD_MS) % 2 === 0;
            [headObj.color.r, headObj.color.g, headObj.color.b] = blinkOn
              ? COLOR_PURPLE
              : COLOR_HEAD_NORMAL;
          }
        }

        // ── Update HUD progress bars (every frame, smooth) ────
        if (invincible && invincibleTimeMs > 0) {
          invBarBg.hidden = false;
          invBarFill.hidden = false;
          invBarText.hidden = false;
          invBarFill.width = Math.max(0, barW * (invincibleTimeMs / maxInvincibleMs));
          invBarText.text = `Inv: ${(invincibleTimeMs / 1000).toFixed(1)}s`;
        } else {
          invBarBg.hidden = true;
          invBarFill.hidden = true;
          invBarText.hidden = true;
        }

        // ── Step accumulator ─────────────────────────────────
        stepAccum += dt;
        const effectiveStepMs = stepMsFromLength(snake.length);

        if (stepAccum < effectiveStepMs) return;
        stepAccum -= effectiveStepMs;

        // ── Consume turn queue ────────────────────────────────
        if (turnQueue.length > 0) {
          const candidate = turnQueue.shift()!;
          if (!isOpposite(candidate, dir)) {
            dir = candidate;
          }
        }
        // (else dir remains the same — snake continues straight)

        // ── Move snake ───────────────────────────────────────
        const head = snake[0];
        const newHead: Cell = { x: head.x, y: head.y };
        if (dir === "up") newHead.y -= 1;
        else if (dir === "down") newHead.y += 1;
        else if (dir === "left") newHead.x -= 1;
        else newHead.x += 1;

        // Wall collision — lethal when not invincible; wrap around when invincible
        if (
          newHead.x < 0 ||
          newHead.x >= GRID_COLS ||
          newHead.y < 0 ||
          newHead.y >= GRID_ROWS
        ) {
          if (invincible) {
            newHead.x = ((newHead.x % GRID_COLS) + GRID_COLS) % GRID_COLS;
            newHead.y = ((newHead.y % GRID_ROWS) + GRID_ROWS) % GRID_ROWS;
          } else {
            triggerGameOver();
            return;
          }
        }

        const eatFood =
          newHead.x === food.x && newHead.y === food.y;

        const eatPurple =
          purpleFood !== null &&
          newHead.x === purpleFood.x &&
          newHead.y === purpleFood.y;

        // Eating the purple dot grants invincibility before the self-collision
        // check, so the snake can immediately pass through its tail this step.
        if (eatPurple) {
          const stepMs = stepMsFromLength(snake.length);
          maxInvincibleMs = purpleInvincibilityMs(stepMs);
          invincibleTimeMs = maxInvincibleMs;
          invincible = true;
          blinkAccum = 0;
          purpleFood = null;
          if (purpleFoodObj) { purpleFoodObj.destroy(); purpleFoodObj = null; }
          // Start cooldown — next purple can't spawn for PURPLE_COOLDOWN_MS
          purpleCooldownMs = PURPLE_COOLDOWN_MS;
          telemetry.log("game:purple", { length: snake.length });
        }

        // Self collision — skipped while invincible
        if (!invincible) {
          const bodyToCheck = eatFood
            ? snake
            : snake.slice(0, snake.length - 1);
          if (bodyToCheck.some((c) => c.x === newHead.x && c.y === newHead.y)) {
            triggerGameOver();
            return;
          }
        }

        // Eat food
        if (eatFood) {
          foodEaten += 1;
          purpleFoodEatenSinceSpawn += 1;
          snake = [newHead, ...snake];
          food = spawnFood(snake, purpleFood);
          if (snake.length > bestLength) {
            bestLength = snake.length;
            platform.storage.set(KEY_BEST_LENGTH, bestLength);
          }
          lengthLabel.text = `Length: ${snake.length}`;
          bestLabel.text = `Best: ${bestLength}`;
          telemetry.log("game:eat", { length: snake.length });

          // Possibly spawn a purple dot (only if no cooldown and no active purple)
          if (!purpleFood && purpleCooldownMs <= 0 && rng.next() < purpleSpawnChance(purpleFoodEatenSinceSpawn)) {
            purpleFood = spawnPurpleFood(snake, food);
            if (purpleFood) {
              purpleLifetimeMs = PURPLE_LIFETIME_MS;
              purpleFoodEatenSinceSpawn = 0; // Reset chance when purple spawns
            }
          }
        } else {
          // Move: add new head, remove tail
          snake = [newHead, ...snake.slice(0, snake.length - 1)];
        }

        redraw();
        updateDialState();
      });

      function triggerGameOver(): void {
        if (gameOver) return;
        gameOver = true;
        deathCount += 1;

        // Update best length
        if (snake.length > bestLength) {
          bestLength = snake.length;
          platform.storage.set(KEY_BEST_LENGTH, bestLength);
        }

        telemetry.log("game:over", { length: snake.length, deathCount });

        // Show interstitial every N deaths
        const shouldShowInterstitial =
          deathCount % INTERSTITIAL_EVERY_N_DEATHS === 0;

        const goToResult = () => {
          k.go("result", {
            length: snake.length,
            bestLength,
            continuesUsed,
          });
        };

        if (shouldShowInterstitial) {
          platform.ads.showInterstitial().then(goToResult);
        } else {
          // Small delay so player sees they died
          setTimeout(goToResult, 500);
        }
      }
    }
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Spawn regular food avoiding the snake body and an optional purple dot. */
function spawnFood(snake: Cell[], purpleFood: Cell | null): Cell {
  const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));
  if (purpleFood) occupied.add(`${purpleFood.x},${purpleFood.y}`);
  const free: Cell[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return { x: 0, y: 0 }; // Grid is full — edge case
  return free[rng.int(free.length)];
}

/** Spawn purple dot avoiding the snake body and the regular food cell. */
function spawnPurpleFood(snake: Cell[], regularFood: Cell): Cell | null {
  const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));
  occupied.add(`${regularFood.x},${regularFood.y}`);
  const free: Cell[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[rng.int(free.length)];
}
