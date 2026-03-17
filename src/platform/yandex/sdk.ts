import type { IPlatform, IGameplay } from "../platform.ts";
import { stubAds, createYandexAds, type YaSDK } from "./ads.ts";
import { localStorageAdapter } from "./storage.ts";
import { telemetry } from "../../shared/telemetry.ts";

type YaGamesGlobal = { init(): Promise<unknown> };

/**
 * Waits up to `timeoutMs` for `window.YaGames` to be available,
 * polling every 50 ms. Resolves with the YaGames object or null on timeout.
 */
function waitForYaGames(timeoutMs = 3000): Promise<YaGamesGlobal | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      const ya = (window as unknown as { YaGames?: YaGamesGlobal }).YaGames;
      if (ya) {
        resolve(ya);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, 50);
    }
    check();
  });
}

/**
 * Creates the platform adapter.
 * Waits up to 3 s for YaGames SDK to appear, then falls back to stubs.
 */
export async function createYandexPlatform(): Promise<IPlatform> {
  let ads = stubAds;
  let ysdk: YaSDK | null = null;

  try {
    const yaGames = await waitForYaGames(3000);
    if (yaGames) {
      ysdk = await yaGames.init() as YaSDK;
      ads = createYandexAds(ysdk);
      telemetry.log("platform:yandex:ready");
    } else {
      telemetry.log("platform:yandex:stub", { reason: "YaGames not found after timeout" });
    }
  } catch (err) {
    telemetry.log("platform:yandex:error", { err: String(err) });
  }

  const capturedSdk = ysdk;
  const gameplay: IGameplay = capturedSdk
    ? {
        ready() { capturedSdk.features.LoadingAPI?.ready(); },
        start() { capturedSdk.features.GameplayAPI?.start(); },
        stop()  { capturedSdk.features.GameplayAPI?.stop();  },
      }
    : {
        // Stub — no-op when running outside Yandex Games environment
        ready() {},
        start() {},
        stop()  {},
      };

  return {
    async init() {
      // Nothing extra needed after constructor.
    },
    ads,
    storage: localStorageAdapter,
    gameplay,
  };
}
