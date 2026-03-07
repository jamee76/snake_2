/** Simple countdown/interval timer helper. */
export function createTimer(durationMs: number, onDone: () => void) {
  let elapsed = 0;
  let done = false;
  return {
    update(dtMs: number): void {
      if (done) return;
      elapsed += dtMs;
      if (elapsed >= durationMs) {
        done = true;
        onDone();
      }
    },
    reset(): void {
      elapsed = 0;
      done = false;
    },
    isDone(): boolean {
      return done;
    },
  };
}
