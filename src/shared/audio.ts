/**
 * Thin audio wrapper.
 * In MVP there are no audio assets; module is a no-op stub ready to extend.
 */
export const audio = {
  enabled: true,

  play(_soundId: string): void {
    if (!this.enabled) return;
    // TODO: load sounds via kaplay loadSound() and play() when assets are added
  },

  setEnabled(val: boolean): void {
    this.enabled = val;
  },
};
