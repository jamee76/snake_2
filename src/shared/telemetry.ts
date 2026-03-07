/** Unified telemetry module — all analytics events go through here. */
export const telemetry = {
  log(eventName: string, payload?: Record<string, unknown>): void {
    // In production this could forward to Yandex Metrika or another backend.
    console.log("[telemetry]", eventName, payload ?? "");
  },
};
