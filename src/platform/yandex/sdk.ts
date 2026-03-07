import type { IPlatform } from "../platform.ts";
import { stubAds, createYandexAds } from "./ads.ts";
import { localStorageAdapter } from "./storage.ts";
import { telemetry } from "../../shared/telemetry.ts";

/**
 * Creates the platform adapter.
 * Attempts to initialise the real YaGames SDK; falls back to stubs silently.
 */
export async function createYandexPlatform(): Promise<IPlatform> {
  let ads = stubAds;

  try {
    // YaGames is injected by Yandex Games environment as a global.
    const yaGames = (window as unknown as { YaGames?: { init(): Promise<unknown> } }).YaGames;
    if (yaGames) {
      const ysdk = await yaGames.init();
      ads = createYandexAds(ysdk as Parameters<typeof createYandexAds>[0]);
      telemetry.log("platform:yandex:ready");
    } else {
      telemetry.log("platform:yandex:stub", { reason: "YaGames not found" });
    }
  } catch (err) {
    telemetry.log("platform:yandex:error", { err: String(err) });
  }

  return {
    async init() {
      // Nothing extra needed after constructor.
    },
    ads,
    storage: localStorageAdapter,
  };
}
