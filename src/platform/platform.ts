/** Common platform interface used by all game code. */
export interface IAds {
  showInterstitial(): Promise<{ ok: boolean }>;
  showRewarded(reason: string): Promise<{ ok: boolean; rewarded: boolean }>;
}

export interface IStorage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
}

export interface IPlatform {
  /** Resolves when the platform SDK is ready. */
  init(): Promise<void>;
  ads: IAds;
  storage: IStorage;
}
