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

  telemetry.log("bootstrap:ready");

  // Register scenes
  registerMenuScene(k, platform);
  registerGameScene(k, platform);
  registerResultScene(k, platform);

  // Start at the menu
  k.go("menu");
}
