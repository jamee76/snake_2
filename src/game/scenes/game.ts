import type { KAPLAYCtx } from "kaplay";
import type { IPlatform } from "../../platform/platform.ts";
import {
  GRID_COLS,
  GRID_ROWS,
  SCORE_PER_FOOD,
  SNAKE_START_LENGTH,
  stepMsFromScore,
  KEY_BEST_SCORE,
  INTERSTITIAL_EVERY_N_DEATHS,
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
      score?: number;
      snakeLength?: number;
      continuesUsed?: number;
    }) => {
      telemetry.log("scene:game", opts);

      // ─── Layout ──────────────────────────────────────────────
      const W = k.width();
      const H = k.height();

      // Reserve bottom area for controls
      const CTRL_H = Math.max(H * 0.22, 80);
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
      let score = opts?.score ?? 0;
      const continuesUsed = opts?.continuesUsed ?? 0;
      let bestScore = platform.storage.get<number>(KEY_BEST_SCORE) ?? 0;

      // Build initial snake
      const startCol = Math.floor(GRID_COLS / 2);
      const startRow = Math.floor(GRID_ROWS / 2);
      let snake: Cell[] = [];
      const initLen = opts?.snakeLength ?? SNAKE_START_LENGTH;
      for (let i = 0; i < initLen; i++) {
        snake.push({ x: startCol - i, y: startRow });
      }

      let dir: Direction = "right";
      let nextDir: Direction = "right";
      let stepAccum = 0;
      let gameOver = false;

      // ─── Food ────────────────────────────────────────────────
      let food: Cell = spawnFood(snake);

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

      const scoreLabel = k.add([
        k.text(`Score: ${score}`, { size: hudSize, font: "monospace" }),
        k.color(200, 255, 200),
        k.pos(8, 4),
        k.fixed(),
      ]);
      const bestLabel = k.add([
        k.text(`Best: ${bestScore}`, { size: hudSize, font: "monospace" }),
        k.color(200, 220, 160),
        k.pos(W - 8, 4),
        k.anchor("topright"),
        k.fixed(),
      ]);

      // ─── Control buttons (4 in a row: Up | Left | Down | Right) ──
      const btnAreaY = H - CTRL_H;
      const btnSize = Math.min(CTRL_H * 0.72, 60);
      const btnGap = Math.min(CTRL_H * 0.12, 10);
      const totalBtnsW = btnSize * 4 + btnGap * 3;
      const btnStartX = (W - totalBtnsW) / 2;
      const btnStartY = btnAreaY + (CTRL_H - btnSize) / 2;

      const dirButtons: { dir: Direction; label: string; col: number }[] = [
        { dir: "up", label: "▲", col: 0 },
        { dir: "left", label: "◄", col: 1 },
        { dir: "down", label: "▼", col: 2 },
        { dir: "right", label: "►", col: 3 },
      ];

      for (const btn of dirButtons) {
        const bx = btnStartX + btn.col * (btnSize + btnGap);
        const by = btnStartY;

        const bg = k.add([
          k.rect(btnSize, btnSize, { radius: 8 }),
          k.color(40, 80, 40),
          k.pos(bx, by),
          k.fixed(),
          k.area(),
          { btnDir: btn.dir },
        ]);

        k.add([
          k.text(btn.label, { size: btnSize * 0.45, font: "monospace" }),
          k.color(180, 255, 180),
          k.pos(bx + btnSize / 2, by + btnSize / 2),
          k.anchor("center"),
          k.fixed(),
        ]);

        // Works for both mouse click and touch tap
        bg.onClick(() => {
          if (!gameOver) applyDir(btn.dir);
        });
      }

      // ─── Also handle keyboard (desktop) ──────────────────────
      k.onKeyPress("up", () => applyDir("up"));
      k.onKeyPress("down", () => applyDir("down"));
      k.onKeyPress("left", () => applyDir("left"));
      k.onKeyPress("right", () => applyDir("right"));
      k.onKeyPress("w", () => applyDir("up"));
      k.onKeyPress("s", () => applyDir("down"));
      k.onKeyPress("a", () => applyDir("left"));
      k.onKeyPress("d", () => applyDir("right"));

      function applyDir(d: Direction): void {
        // Forbid 180° reversal
        if (d === "up" && dir === "down") return;
        if (d === "down" && dir === "up") return;
        if (d === "left" && dir === "right") return;
        if (d === "right" && dir === "left") return;
        nextDir = d;
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

      function redraw(): void {
        // Remove previous snake rects
        for (const obj of snakeObjs) obj.destroy();
        snakeObjs.length = 0;

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

        // Draw head (different colour)
        if (snake.length > 0) {
          const { x, y } = cellToWorld(snake[0]);
          snakeObjs.push(
            k.add([
              k.rect(cellSize - pad * 2, cellSize - pad * 2),
              k.color(100, 240, 100),
              k.pos(x + pad, y + pad),
              k.fixed(),
            ])
          );
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
      }

      redraw();

      // ─── Game loop ───────────────────────────────────────────
      k.onUpdate(() => {
        if (gameOver) return;

        stepAccum += k.dt() * 1000;
        const stepMs = stepMsFromScore(score);

        if (stepAccum < stepMs) return;
        stepAccum -= stepMs;

        // Advance direction
        dir = nextDir;

        // Move head
        const head = snake[0];
        const newHead: Cell = { x: head.x, y: head.y };
        if (dir === "up") newHead.y -= 1;
        else if (dir === "down") newHead.y += 1;
        else if (dir === "left") newHead.x -= 1;
        else newHead.x += 1;

        // Wall collision
        if (
          newHead.x < 0 ||
          newHead.x >= GRID_COLS ||
          newHead.y < 0 ||
          newHead.y >= GRID_ROWS
        ) {
          triggerGameOver();
          return;
        }

        // Self collision (skip tail that will be removed if no food)
        const eatFood =
          newHead.x === food.x && newHead.y === food.y;
        const bodyToCheck = eatFood
          ? snake
          : snake.slice(0, snake.length - 1);
        if (bodyToCheck.some((c) => c.x === newHead.x && c.y === newHead.y)) {
          triggerGameOver();
          return;
        }

        // Eat food
        if (eatFood) {
          score += SCORE_PER_FOOD;
          snake = [newHead, ...snake];
          food = spawnFood(snake);
          if (score > bestScore) {
            bestScore = score;
            platform.storage.set(KEY_BEST_SCORE, bestScore);
          }
          scoreLabel.text = `Score: ${score}`;
          bestLabel.text = `Best: ${bestScore}`;
          telemetry.log("game:eat", { score });
        } else {
          // Move: add new head, remove tail
          snake = [newHead, ...snake.slice(0, snake.length - 1)];
        }

        redraw();
      });

      function triggerGameOver(): void {
        if (gameOver) return;
        gameOver = true;
        deathCount += 1;

        // Update best score
        if (score > bestScore) {
          bestScore = score;
          platform.storage.set(KEY_BEST_SCORE, bestScore);
        }

        telemetry.log("game:over", { score, deathCount });

        // Show interstitial every N deaths
        const shouldShowInterstitial =
          deathCount % INTERSTITIAL_EVERY_N_DEATHS === 0;

        const goToResult = () => {
          k.go("result", {
            score,
            bestScore,
            snakeLength: snake.length,
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

function spawnFood(snake: Cell[]): Cell {
  const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));
  const free: Cell[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return { x: 0, y: 0 }; // Grid is full — edge case
  return free[rng.int(free.length)];
}
