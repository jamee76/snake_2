import type { KAPLAYCtx } from "kaplay";
import { telemetry } from "../../shared/telemetry.ts";

interface ReadyScreenOpts {
  snakeLength?: number;
  continuesUsed?: number;
}

/** Register the "Вы готовы?" scene shown before starting the game (after an ad or retry) to restore focus. */
export function registerReadyScene(k: KAPLAYCtx): void {
  k.scene("ready_screen", (opts: ReadyScreenOpts) => {
    telemetry.log("scene:ready_screen", opts as unknown as Record<string, unknown>);

    const { snakeLength, continuesUsed } = opts;

    const W = k.width();
    const H = k.height();

    // Dark background
    k.add([k.rect(W, H), k.color(10, 15, 20), k.pos(0, 0), k.fixed()]);

    // Title
    k.add([
      k.text("Вы готовы?", { size: Math.min(W * 0.1, 60), font: "monospace" }),
      k.color(80, 220, 80),
      k.pos(W / 2, H * 0.35),
      k.anchor("center"),
      k.fixed(),
    ]);

    // Start button
    const btnW = Math.min(W * 0.55, 280);
    const btnH = Math.max(H * 0.12, 54);
    const btnX = Math.floor((W - btnW) / 2);
    const btnY = Math.floor(H * 0.55);

    const btnBg = k.add([
      k.rect(btnW, btnH, { radius: 8 }),
      k.color(k.Color.fromHex("#3cb43c")),
      k.pos(btnX, btnY),
      k.fixed(),
      k.area(),
    ]);

    k.add([
      k.text("Старт", { size: Math.min(btnW * 0.18, 28), font: "monospace" }),
      k.color(255, 255, 255),
      k.pos(W / 2, btnY + btnH / 2),
      k.anchor("center"),
      k.fixed(),
    ]);

    btnBg.onHover(() => { btnBg.color = k.Color.fromHex("#50cc50"); });
    btnBg.onHoverEnd(() => { btnBg.color = k.Color.fromHex("#3cb43c"); });

    btnBg.onClick(() => {
      telemetry.log("ready_screen:start");
      k.go("game", { snakeLength, continuesUsed });
    });
  });
}
