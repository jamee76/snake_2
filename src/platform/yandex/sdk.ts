import type { IPlatform, IGameplay } from "../platform.ts";
import { stubAds, createYandexAds, type YaSDK } from "./ads.ts";
import { localStorageAdapter } from "./storage.ts";
import { telemetry } from "../../shared/telemetry.ts";

/**
 * Creates the platform adapter.
 * Attempts to initialise the real YaGames SDK; falls back to stubs silently.
 */
export async function createYandexPlatform(): Promise<IPlatform> {
  let ads = stubAds;
  let ysdk: YaSDK | null = null;

  try {
    // YaGames is injected by Yandex Games environment as a global.
    const yaGames = (window as unknown as { YaGames?: { init(): Promise<unknown> } }).YaGames;
    if (yaGames) {
      ysdk = await yaGames.init() as YaSDK;
      ads = createYandexAds(ysdk);
      telemetry.log("platform:yandex:ready");
    } else {
      telemetry.log("platform:yandex:stub", { reason: "YaGames not found" });
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
