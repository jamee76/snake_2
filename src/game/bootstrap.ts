import kaplay from "kaplay";
import type { IPlatform } from "../platform/platform.ts";
import { registerMenuScene } from "./scenes/menu.ts";
import { registerGameScene } from "./scenes/game.ts";
import { registerResultScene } from "./scenes/result.ts";
import { telemetry } from "../shared/telemetry.ts";

/**
 * Initialises Kaplay and registers all scenes.
 * Call once at application startup.
 */
export async function bootstrap(platform: IPlatform): Promise<void> {
  await platform.init();

  const k = kaplay({
    // Let kaplay fill the entire window
    width: window.innerWidth,
    height: window.innerHeight,
    stretch: true,
    letterbox: false,
    background: [15, 20, 30],
    debug: import.meta.env.DEV,
  });

  // ─── Sprite assets ───────────────────────────────────────────────────────
  k.loadSprite("apple",         "assets/sprites/apple_sprite.png");
  k.loadSprite("invincibility", "assets/sprites/invicibility.png");
  k.loadSprite("snake_body",    "assets/sprites/snake_body.png");
  k.loadSprite("snake_head",    "assets/sprites/snake_head.png");
  k.loadSprite("btn_up",        "assets/sprites/button_up.png");
  k.loadSprite("btn_down",      "assets/sprites/button_down.png");
  k.loadSprite("btn_left",      "assets/sprites/button_left.png");
  k.loadSprite("btn_right",     "assets/sprites/button_right.png");
  k.loadSprite("btn_rev_left",  "assets/sprites/button_reverse_left.png");
  k.loadSprite("btn_rev_right", "assets/sprites/button_reverse_right.png");

  telemetry.log("bootstrap:ready");

  // Notify Yandex that the game is loaded and ready to display
  platform.gameplay.ready();

  // Stop/resume audio when the tab is hidden/visible (required by Yandex Games).
  // Intentionally not removed — bootstrap runs once per page lifetime.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      k.volume(0);
    } else {
      k.volume(1);
    }
  });

  // Register scenes
  registerMenuScene(k, platform);
  registerGameScene(k, platform);
  registerResultScene(k, platform);

  // Start at the menu
  k.go("menu");
}
