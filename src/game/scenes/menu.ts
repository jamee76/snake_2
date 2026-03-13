import type { KAPLAYCtx } from "kaplay";
import type { IPlatform } from "../../platform/platform.ts";
import { telemetry } from "../../shared/telemetry.ts";

/** Register the menu scene. */
export function registerMenuScene(k: KAPLAYCtx, platform: IPlatform): void {
  k.scene("menu", () => {
    telemetry.log("scene:menu");

    platform.gameplay.stop();

    const W = k.width();
    const H = k.height();

    // Background
    k.add([k.rect(W, H), k.color(15, 20, 30), k.pos(0, 0), k.fixed()]);

    // Grid decoration lines (subtle)
    for (let x = 0; x < W; x += 32) {
      k.add([
        k.rect(1, H),
        k.color(30, 40, 55),
        k.pos(x, 0),
        k.opacity(0.4),
        k.fixed(),
      ]);
    }
    for (let y = 0; y < H; y += 32) {
      k.add([
        k.rect(W, 1),
        k.color(30, 40, 55),
        k.pos(0, y),
        k.opacity(0.4),
        k.fixed(),
      ]);
    }

    // Title
    k.add([
      k.text("Snake Rush", { size: Math.min(W * 0.1, 64), font: "monospace" }),
      k.color(80, 220, 80),
      k.pos(W / 2, H * 0.35),
      k.anchor("center"),
      k.fixed(),
    ]);

    // Subtitle
    k.add([
      k.text("Classic arcade — eat, grow, survive!", {
        size: Math.min(W * 0.035, 20),
        font: "monospace",
      }),
      k.color(160, 200, 160),
      k.pos(W / 2, H * 0.48),
      k.anchor("center"),
      k.fixed(),
    ]);

    // Start button
    const btnW = Math.min(W * 0.45, 260);
    const btnH = Math.max(H * 0.12, 54);
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.62;

    const btnBg = k.add([
      k.rect(btnW, btnH, { radius: 8 }),
      k.color(60, 180, 60),
      k.pos(btnX, btnY),
      k.fixed(),
      k.area(),
    ]);

    k.add([
      k.text("Start Game", {
        size: Math.min(btnW * 0.18, 26),
        font: "monospace",
      }),
      k.color(255, 255, 255),
      k.pos(W / 2, btnY + btnH / 2),
      k.anchor("center"),
      k.fixed(),
    ]);

    // Desktop hover
    btnBg.onHover(() => btnBg.color = k.Color.fromHex("#50cc50"));
    btnBg.onHoverEnd(() => btnBg.color = k.Color.fromHex("#3cb43c"));

    // Click/tap (works for both mouse and touch)
    btnBg.onClick(() => {
      telemetry.log("menu:startGame");
      k.go("game");
    });
  });
}
