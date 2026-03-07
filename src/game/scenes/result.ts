import type { KAPLAYCtx } from "kaplay";
import type { IPlatform } from "../../platform/platform.ts";
import {
  KEY_LAST_REWARDED_AT,
  MAX_CONTINUES_PER_RUN,
  REWARDED_COOLDOWN_MS,
} from "../systems/balance.ts";
import { telemetry } from "../../shared/telemetry.ts";

interface ResultOpts {
  score: number;
  bestScore: number;
  snakeLength: number;
  continuesUsed: number;
}

export function registerResultScene(k: KAPLAYCtx, platform: IPlatform): void {
  k.scene("result", (opts: ResultOpts) => {
    telemetry.log("scene:result", opts as unknown as Record<string, unknown>);

    const { score, bestScore, snakeLength, continuesUsed } = opts;

    const W = k.width();
    const H = k.height();

    // Background overlay
    k.add([k.rect(W, H), k.color(10, 15, 20), k.pos(0, 0), k.fixed()]);

    // Title
    k.add([
      k.text("Game Over", { size: Math.min(W * 0.1, 60), font: "monospace" }),
      k.color(240, 80, 80),
      k.pos(W / 2, H * 0.18),
      k.anchor("center"),
      k.fixed(),
    ]);

    const statSize = Math.min(W * 0.045, 22);

    k.add([
      k.text(`Score: ${score}`, { size: statSize, font: "monospace" }),
      k.color(200, 255, 200),
      k.pos(W / 2, H * 0.33),
      k.anchor("center"),
      k.fixed(),
    ]);

    k.add([
      k.text(`Best:  ${bestScore}`, { size: statSize, font: "monospace" }),
      k.color(200, 220, 160),
      k.pos(W / 2, H * 0.43),
      k.anchor("center"),
      k.fixed(),
    ]);

    // ─── Check rewarded eligibility ──────────────────────────
    const lastRewardedAt =
      platform.storage.get<number>(KEY_LAST_REWARDED_AT) ?? 0;
    const cooldownOk = Date.now() - lastRewardedAt >= REWARDED_COOLDOWN_MS;
    const continueAvailable =
      continuesUsed < MAX_CONTINUES_PER_RUN && cooldownOk;

    // ─── Buttons ─────────────────────────────────────────────
    const btnW = Math.min(W * 0.38, 200);
    const btnH = Math.max(H * 0.13, 50);
    const btnY = H * 0.57;
    const gap = Math.min(W * 0.04, 20);

    // Layout: if continue button is shown, 3 buttons; else 2
    const buttons: { label: string; color: string; action: () => void }[] = [];

    if (continueAvailable) {
      buttons.push({
        label: "Continue\n(Ad)",
        color: "#b8860b",
        action: handleContinue,
      });
    }
    buttons.push({ label: "Retry", color: "#3cb43c", action: handleRetry });
    buttons.push({
      label: "Menu",
      color: "#2255aa",
      action: handleMenu,
    });

    const totalW = buttons.length * btnW + (buttons.length - 1) * gap;
    const startX = (W - totalW) / 2;

    buttons.forEach((btn, i) => {
      const bx = startX + i * (btnW + gap);
      const bg = k.add([
        k.rect(btnW, btnH, { radius: 8 }),
        k.color(k.Color.fromHex(btn.color)),
        k.pos(bx, btnY),
        k.fixed(),
        k.area(),
      ]);

      k.add([
        k.text(btn.label, { size: Math.min(btnW * 0.17, 20), font: "monospace", align: "center" }),
        k.color(255, 255, 255),
        k.pos(bx + btnW / 2, btnY + btnH / 2),
        k.anchor("center"),
        k.fixed(),
      ]);

      bg.onClick(btn.action);
    });

    // ─── Actions ─────────────────────────────────────────────
    function handleRetry(): void {
      telemetry.log("result:retry");
      k.go("game");
    }

    function handleMenu(): void {
      telemetry.log("result:menu");
      k.go("menu");
    }

    async function handleContinue(): Promise<void> {
      telemetry.log("result:continue:request");
      const result = await platform.ads.showRewarded("continue");
      if (result.rewarded) {
        platform.storage.set(KEY_LAST_REWARDED_AT, Date.now());
        telemetry.log("result:continue:rewarded", { score, snakeLength });
        // Respawn with same score and length
        k.go("game", {
          score,
          snakeLength,
          continuesUsed: continuesUsed + 1,
        });
      } else {
        telemetry.log("result:continue:skipped");
      }
    }
  });
}
