import type { KAPLAYCtx } from "kaplay";
import type { IPlatform } from "../../platform/platform.ts";
import {
  KEY_LAST_REWARDED_AT,
  MAX_CONTINUES_PER_RUN,
  REWARDED_COOLDOWN_MS,
} from "../systems/balance.ts";
import { telemetry } from "../../shared/telemetry.ts";

interface ResultOpts {
  length: number;
  bestLength: number;
  continuesUsed: number;
}

export function registerResultScene(k: KAPLAYCtx, platform: IPlatform): void {
  k.scene("result", (opts: ResultOpts) => {
    telemetry.log("scene:result", opts as unknown as Record<string, unknown>);

    platform.gameplay.stop();

    const { length, bestLength, continuesUsed } = opts;

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
      k.text(`Length: ${length}`, { size: statSize, font: "monospace" }),
      k.color(200, 255, 200),
      k.pos(W / 2, H * 0.33),
      k.anchor("center"),
      k.fixed(),
    ]);

    k.add([
      k.text(`Best:   ${bestLength}`, { size: statSize, font: "monospace" }),
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
    const btnW = Math.min(W * 0.72, 300);
    const btnH = Math.max(H * 0.11, 48);
    const gap = Math.max(H * 0.018, 10);
    const bx = Math.floor((W - btnW) / 2);

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

    // Buttons stacked top-to-bottom in one column
    const startY = Math.floor(H * 0.55);

    buttons.forEach((btn, i) => {
      const by = startY + i * (btnH + gap);
      const bg = k.add([
        k.rect(btnW, btnH, { radius: 8 }),
        k.color(k.Color.fromHex(btn.color)),
        k.pos(bx, by),
        k.fixed(),
        k.area(),
      ]);

      k.add([
        k.text(btn.label, { size: Math.min(btnW * 0.14, 20), font: "monospace", align: "center" }),
        k.color(255, 255, 255),
        k.pos(bx + btnW / 2, by + btnH / 2),
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
        telemetry.log("result:continue:rewarded", { length });
        // Respawn with same snake length
        k.go("game", {
          snakeLength: length,
          continuesUsed: continuesUsed + 1,
        });
      } else {
        telemetry.log("result:continue:skipped");
      }
    }
  });
}
