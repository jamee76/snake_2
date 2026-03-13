import type { KAPLAYCtx, GameObj, ColorComp, OpacityComp, AreaComp, SpriteComp, RotateComp, ScaleComp } from "kaplay";
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
  purpleSpawnChance,
  purpleInvincibilityMs,
  CTRL_H_FRAC,
  BASE_BTN_ENABLED_COLOR,
  BTN_DISABLED_COLOR,
  HELPER_BTN_ENABLED_COLOR,
  BTN_OPACITY_ENABLED,
  BTN_OPACITY_DISABLED,
  BTN_OPACITY_SAME_DIR,
  MACRO_BTN_OPACITY_DISABLED,
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

      platform.gameplay.start();

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
      // Head is kept separate so its opacity can be updated between steps (blink)
      let headObj: GameObj<OpacityComp & RotateComp> | null = null;

      function redraw(): void {
        // Remove previous snake body sprites
        for (const obj of snakeObjs) obj.destroy();
        snakeObjs.length = 0;

        // Remove previous head
        if (headObj) { headObj.destroy(); headObj = null; }

        const pad = Math.max(1, Math.floor(cellSize * 0.08));
        const spriteSize = cellSize - pad * 2;

        // Draw body
        for (let i = 1; i < snake.length; i++) {
          const { x, y } = cellToWorld(snake[i]);
          snakeObjs.push(
            k.add([
              k.sprite("snake_body", { width: spriteSize, height: spriteSize }),
              k.pos(x + pad, y + pad),
              k.fixed(),
            ])
          );
        }

        // Draw head — rotated to face the current direction
        if (snake.length > 0) {
          const { x, y } = cellToWorld(snake[0]);
          const headAngle =
            dir === "right" ? 90 : dir === "down" ? 180 : dir === "left" ? 270 : 0;
          headObj = k.add([
            k.sprite("snake_head", { width: spriteSize, height: spriteSize }),
            k.pos(x + cellSize / 2, y + cellSize / 2),
            k.anchor("center"),
            k.rotate(headAngle),
            k.opacity(1),
            k.fixed(),
          ]) as GameObj<OpacityComp & RotateComp>;
        }

        // Food
        if (foodObj) foodObj.destroy();
        const fp = cellToWorld(food);
        foodObj = k.add([
          k.sprite("apple", { width: spriteSize, height: spriteSize }),
          k.pos(fp.x + pad, fp.y + pad),
          k.fixed(),
        ]);

        // Purple dot
        if (purpleFoodObj) purpleFoodObj.destroy();
        purpleFoodObj = null;
        if (purpleFood) {
          const pp = cellToWorld(purpleFood);
          purpleFoodObj = k.add([
            k.sprite("invincibility", { width: spriteSize, height: spriteSize }),
            k.pos(pp.x + pad, pp.y + pad),
            k.fixed(),
          ]);
        }
      }

      redraw();

      // ─── Mobile UI state callbacks (populated for touch devices) ──
      let updateDialState = () => {};

      // ─── 3×3 Grid UI (touch devices only) ─────────────────────────
      if (isTouch) {
        // ── Sizing ──────────────────────────────────────────────────
        const cellSz = Math.max(40, Math.floor(Math.min(W / 3, CTRL_H / 3) * 0.90));
        const gap    = Math.max(3, Math.floor(cellSz * 0.07));
        const step   = cellSz + gap;
        const iconSz = Math.round(cellSz * 0.80);

        const gridCX = Math.floor(W / 2);
        const gridCY = Math.floor(GAME_H + CTRL_H / 2);

        // Column and row centres for the 3×3 grid
        const colX = [gridCX - step, gridCX, gridCX + step];
        const rowY = [gridCY - step, gridCY, gridCY + step];

        // Numpad position (1–9) → pixel centre
        // 1 2 3   →  col0,row0  col1,row0  col2,row0
        // 4 5 6   →  col0,row1  col1,row1  col2,row1
        // 7 8 9   →  col0,row2  col1,row2  col2,row2
        const numpadCX = (n: number) => colX[(n - 1) % 3];
        const numpadCY = (n: number) => rowY[Math.floor((n - 1) / 3)];

        // ── Panel background ─────────────────────────────────────────
        k.add([k.rect(W, CTRL_H), k.color(10, 15, 25), k.pos(0, GAME_H), k.fixed()]);

        // ── Cell factory — creates the bg rect ───────────────────────
        const mkCell = (
          n: number,
          bgRgb: readonly [number, number, number],
          startDisabled: boolean,
        ) => {
          const cx = numpadCX(n);
          const cy = numpadCY(n);
          const [r, g, b] = startDisabled ? BTN_DISABLED_COLOR : bgRgb;
          const bg = k.add([
            k.rect(cellSz, cellSz, { radius: Math.floor(cellSz * 0.15) }),
            k.color(r, g, b),
            k.opacity(startDisabled ? BTN_OPACITY_DISABLED : BTN_OPACITY_ENABLED),
            k.area(),
            k.pos(cx - cellSz / 2, cy - cellSz / 2),
            k.fixed(),
          ]) as GameObj<ColorComp & OpacityComp & AreaComp>;

          return { bg, cx, cy };
        };

        // ── Icon factory — creates a centred sprite icon ──────────────
        const mkIcon = (
          spriteKey: string,
          cx: number,
          cy: number,
          startDisabled: boolean,
          size: number = iconSz,
        ) => {
          return k.add([
            k.sprite(spriteKey, { width: size, height: size }),
            k.pos(cx, cy),
            k.anchor("center"),
            k.rotate(0),
            k.color(255, 255, 255),
            k.scale(1, 1),
            k.opacity(startDisabled ? BTN_OPACITY_DISABLED : BTN_OPACITY_ENABLED),
            k.area(),
            k.fixed(),
          ]) as GameObj<SpriteComp & ColorComp & OpacityComp & RotateComp & ScaleComp & AreaComp>;
        };

        // ── Center (5) — always disabled, no action ─────────────────
        mkCell(5, BTN_DISABLED_COLOR, true);

        // ── Base direction buttons (2, 4, 6, 8) ─────────────────────
        type BtnEntry = {
          dirs: Direction[];
          btn: GameObj<SpriteComp & ColorComp & OpacityComp & RotateComp & ScaleComp & AreaComp>;
          bgRgb: readonly [number, number, number];
        };

        const baseBtnDefs: [number, Direction, string][] = [
          [2, "up",    "btn_up"],
          [4, "left",  "btn_left"],
          [6, "right", "btn_right"],
          [8, "down",  "btn_down"],
        ];

        const baseBtns: BtnEntry[] = baseBtnDefs.map(([n, direction, spriteKey]) => {
          const cx = numpadCX(n);
          const cy = numpadCY(n);
          const btn = mkIcon(spriteKey, cx, cy, false, cellSz);
          return { dirs: [direction], bgRgb: BASE_BTN_ENABLED_COLOR, btn };
        });

        for (const entry of baseBtns) {
          entry.btn.onClick(() => {
            if (gameOver) return;
            if (isOpposite(entry.dirs[0], dir)) return;
            turnQueue = [...entry.dirs];
          });
        }

        // ── Macro corner buttons (1, 3, 7, 9) ───────────────────────
        // Each corner has a different action per current direction.
        // When not applicable for the current dir the button is disabled.
        type MacroCfg = { label: string; dirs: Direction[] };
        type MacroMap = Partial<Record<Direction, MacroCfg>>;

        const MACRO_CORNER_CONFIG: Record<number, MacroMap> = {
          1: {
            right: { label: "↑←", dirs: ["up",    "left"]  },
            down:  { label: "←↑", dirs: ["left",  "up"]    },
          },
          3: {
            left:  { label: "↑→", dirs: ["up",    "right"] },
            down:  { label: "→↑", dirs: ["right", "up"]    },
          },
          7: {
            right: { label: "↓←", dirs: ["down",  "left"]  },
            up:    { label: "←↓", dirs: ["left",  "down"]  },
          },
          9: {
            left:  { label: "↓→", dirs: ["down",  "right"] },
            up:    { label: "→↓", dirs: ["right", "down"]  },
          },
        };

        // Corners 1 and 7 use btn_rev_left; 3 and 9 use btn_rev_right
        const macroRevSprite = (n: number) =>
          n === 1 || n === 7 ? "btn_rev_left" : "btn_rev_right";

        type MacroEntry = {
          n: number;
          btn: GameObj<SpriteComp & ColorComp & OpacityComp & RotateComp & ScaleComp & AreaComp>;
          cfgMap: MacroMap;
          currentDirs: Direction[];
        };

        const macroEntries: MacroEntry[] = [];
        for (const [nStr, cfgMap] of Object.entries(MACRO_CORNER_CONFIG)) {
          const n = parseInt(nStr);
          const cx = numpadCX(n);
          const cy = numpadCY(n);
          const btn = mkIcon(macroRevSprite(n), cx, cy, true, cellSz);
          const entry: MacroEntry = { n, btn, cfgMap, currentDirs: [] };
          btn.onClick(() => {
            if (gameOver) return;
            if (entry.currentDirs.length === 0) return;
            turnQueue = [...entry.currentDirs];
          });
          macroEntries.push(entry);
        }

        // ── State updater ─────────────────────────────────────────────
        const applyBtnStyle = (
          btn: GameObj<ColorComp & OpacityComp>,
          disabled: boolean,
          enabledRgb: readonly [number, number, number],
          opacityOverride?: number,
        ) => {
          const [r, g, b] = disabled ? BTN_DISABLED_COLOR : enabledRgb;
          btn.color.r = r;
          btn.color.g = g;
          btn.color.b = b;
          btn.opacity = opacityOverride ?? (disabled ? BTN_OPACITY_DISABLED : BTN_OPACITY_ENABLED);
        };

        // Determine sprite transform for each macro button given current dir.
        // Buttons in the bottom row (7, 9) are the "default" orientation for upward movement;
        // buttons in the top row (1, 3) and their column-mates need a vertical flip.
        const getMacroTransform = (n: number, d: Direction): { flipY: boolean } => {
          if (d === "up")    return { flipY: false };
          if (d === "down")  return { flipY: true  };
          // For left: btn 3 (top-right, correct) vs btn 9 (bottom-right, needs flip)
          if (d === "left")  return { flipY: n === 9 };
          // For right: btn 1 (top-left, correct) vs btn 7 (bottom-left, needs flip)
          if (d === "right") return { flipY: n === 7 };
          return { flipY: false };
        };

        updateDialState = () => {
          // Base buttons: three visual states
          for (const entry of baseBtns) {
            const isOpp     = isOpposite(entry.dirs[0], dir);
            const isSameDir = entry.dirs[0] === dir;
            if (isSameDir) {
              // Same axis as current movement — original colour but dimmed
              applyBtnStyle(entry.btn, false, entry.bgRgb, BTN_OPACITY_SAME_DIR);
            } else {
              applyBtnStyle(entry.btn, isOpp, entry.bgRgb);
            }
          }

          // Macro buttons: enabled only for specific current dirs;
          // icon flipped vertically where needed to match orientation
          for (const entry of macroEntries) {
            const cfg = entry.cfgMap[dir];
            if (cfg) {
              entry.currentDirs = cfg.dirs;
              applyBtnStyle(entry.btn, false, HELPER_BTN_ENABLED_COLOR);
            } else {
              entry.currentDirs = [];
              applyBtnStyle(entry.btn, true, HELPER_BTN_ENABLED_COLOR, MACRO_BTN_OPACITY_DISABLED);
            }
            const { flipY } = getMacroTransform(entry.n, dir);
            entry.btn.angle = 0;
            entry.btn.scale.y = flipY ? -1 : 1;
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
            // Invincibility expired — restore head opacity immediately
            invincible = false;
            blinkAccum = 0;
            if (headObj) {
              headObj.opacity = 1;
            }
          } else if (invincibleTimeMs <= PURPLE_BLINK_MS && headObj) {
            // Last 2 seconds — blink head by toggling opacity
            const blinkOn =
              Math.floor(blinkAccum / PURPLE_BLINK_PERIOD_MS) % 2 === 0;
            headObj.opacity = blinkOn ? 1 : 0.4;
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
        platform.gameplay.stop();
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
