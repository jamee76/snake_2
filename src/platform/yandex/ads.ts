import type { IAds } from "../platform.ts";
import { telemetry } from "../../shared/telemetry.ts";

/**
 * Stub ads adapter for dev / fallback.
 * Simulates a short delay so game logic can be tested end-to-end.
 */
export const stubAds: IAds = {
  async showInterstitial(): Promise<{ ok: boolean }> {
    telemetry.log("ads:interstitial:show");
    await delay(800);
    telemetry.log("ads:interstitial:done");
    return { ok: true };
  },

  async showRewarded(_reason: string): Promise<{ ok: boolean; rewarded: boolean }> {
    telemetry.log("ads:rewarded:show", { reason: _reason });
    await delay(1000);
    telemetry.log("ads:rewarded:done", { rewarded: true });
    return { ok: true, rewarded: true };
  },
};

/**
 * Real Yandex Games SDK ads adapter.
 * Only instantiated when YaGames is available in the environment.
 */
export function createYandexAds(ysdk: YaSDK): IAds {
  return {
    async showInterstitial() {
      return new Promise((resolve) => {
        ysdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: () => resolve({ ok: true }),
            onError: () => resolve({ ok: false }),
          },
        });
      });
    },

    async showRewarded(reason: string) {
      telemetry.log("ads:rewarded:request", { reason });
      return new Promise((resolve) => {
        ysdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => resolve({ ok: true, rewarded: true }),
            onClose: () => resolve({ ok: true, rewarded: false }),
            onError: () => resolve({ ok: false, rewarded: false }),
          },
        });
      });
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Minimal typing for the YaGames SDK surface we use. */
interface YaSDK {
  adv: {
    showFullscreenAdv(opts: {
      callbacks: { onClose?: () => void; onError?: () => void };
    }): void;
    showRewardedVideo(opts: {
      callbacks: {
        onRewarded?: () => void;
        onClose?: () => void;
        onError?: () => void;
      };
    }): void;
  };
}
