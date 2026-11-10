/** Logical sound ids. The host maps them to real audio (samples or synthesis). */
export type SoundId = 'boot' | 'alarm' | 'click' | 'blip' | 'select' | 'back' | 'eat' | 'die' | (string & {});

/** Where apps send sound requests. The kernel never touches Web Audio directly. */
export interface AudioSink {
  /** Play once. */
  play(id: SoundId): void;
  /** Start looping until `stop` (idempotent). */
  loop(id: SoundId): void;
  stop(id: SoundId): void;
  stopAll(): void;
}

export const nullAudio: AudioSink = {
  play() {},
  loop() {},
  stop() {},
  stopAll() {},
};

/** Records calls; useful in tests and for debugging. */
export class AudioLog implements AudioSink {
  readonly calls: string[] = [];
  readonly looping = new Set<SoundId>();
  play(id: SoundId): void {
    this.calls.push(`play:${id}`);
  }
  loop(id: SoundId): void {
    if (!this.looping.has(id)) this.calls.push(`loop:${id}`);
    this.looping.add(id);
  }
  stop(id: SoundId): void {
    if (this.looping.delete(id)) this.calls.push(`stop:${id}`);
  }
  stopAll(): void {
    for (const id of [...this.looping]) this.stop(id);
  }
}
