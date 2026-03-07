import type { IStorage } from "../platform.ts";

/** localStorage-backed storage. Falls back silently if localStorage is unavailable. */
export const localStorageAdapter: IStorage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded or private mode — silently ignore.
    }
  },
};
