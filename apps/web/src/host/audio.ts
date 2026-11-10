import type { AudioSink, SoundId } from '@dotoro/kernel';

type Ctx = AudioContext;

/** Mechanical key "clack" + "thump" (ported from the prototype's useKeySound). */
function keyClick(ctx: Ctx, out: AudioNode): void {
  const now = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1800 + (Math.random() * 300 - 150);
  band.Q.value = 5;
  const clack = ctx.createGain();
  clack.gain.setValueAtTime(0, now);
  clack.gain.linearRampToValueAtTime(0.35, now + 0.002);
  clack.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
  noise.connect(band).connect(clack).connect(out);

  const thump = ctx.createOscillator();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(120 + (Math.random() * 20 - 10), now);
  thump.frequency.exponentialRampToValueAtTime(40, now + 0.025);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0, now);
  thumpGain.gain.linearRampToValueAtTime(0.6, now + 0.001);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  thump.connect(thumpGain).connect(out);

  noise.start(now);
  noise.stop(now + 0.04);
  thump.start(now);
  thump.stop(now + 0.03);
}

/** Square-wave beeps: [startOffset s, frequency Hz, duration s]. */
function beeps(ctx: Ctx, out: AudioNode, notes: [number, number, number][], volume = 0.2, at = ctx.currentTime): void {
  for (const [t, freq, dur] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, at + t);
    gain.gain.setValueAtTime(volume, at + t);
    gain.gain.exponentialRampToValueAtTime(0.001, at + t + dur);
    osc.connect(gain).connect(out);
    osc.start(at + t);
    osc.stop(at + t + dur);
  }
}

const ALARM_PATTERN: [number, number, number][] = [0, 0.12, 0.24, 0.48, 0.6, 0.72].map((t) => [t, 1046.5, 0.09]);
const ALARM_PERIOD_S = 1.4;
/** How far ahead alarm beeps are scheduled on the audio clock (survives timer throttling). */
const ALARM_LOOKAHEAD_S = 30;

/**
 * Web Audio implementation of the kernel's AudioSink. Browsers only allow audio after a
 * user gesture, so `unlock()` must be called from an input handler.
 */
export class WebAudioHost implements AudioSink {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private bootBuffer: AudioBuffer | null = null;
  private readonly loops = new Map<SoundId, { gain: GainNode; timer: ReturnType<typeof setInterval> }>();
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      void this.loadBoot();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async loadBoot(): Promise<void> {
    try {
      const res = await fetch('/sounds/boot.mp3');
      this.bootBuffer = await this.ctx!.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn('[audio] boot sound unavailable', e);
    }
  }

  keyClick(): void {
    if (this.ctx && this.master) keyClick(this.ctx, this.master);
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out) return;
    switch (id) {
      case 'boot': {
        if (!this.bootBuffer) return;
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = 0.55;
        src.buffer = this.bootBuffer;
        src.connect(gain).connect(out);
        src.start();
        break;
      }
      case 'eat':
        beeps(ctx, out, [[0, 880, 0.05], [0.05, 1320, 0.07]], 0.12);
        break;
      case 'die':
        beeps(ctx, out, [[0, 440, 0.12], [0.12, 330, 0.12], [0.24, 220, 0.25]], 0.15);
        break;
      case 'blip':
        beeps(ctx, out, [[0, 900, 0.035]], 0.07);
        break;
      case 'select':
        beeps(ctx, out, [[0, 660, 0.05], [0.05, 990, 0.09]], 0.1);
        break;
      case 'back':
        beeps(ctx, out, [[0, 660, 0.05], [0.05, 440, 0.09]], 0.1);
        break;
      case 'click':
        this.keyClick();
        break;
      case 'alarm':
        beeps(ctx, out, ALARM_PATTERN);
        break;
    }
  }

  loop(id: SoundId): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.loops.has(id) || id !== 'alarm') return;
    const gain = ctx.createGain();
    gain.connect(out);
    let next = ctx.currentTime;
    const schedule = () => {
      while (next < ctx.currentTime + ALARM_LOOKAHEAD_S) {
        beeps(ctx, gain, ALARM_PATTERN, 0.22, next);
        next += ALARM_PERIOD_S;
      }
    };
    schedule();
    this.loops.set(id, { gain, timer: setInterval(schedule, 5000) });
  }

  stop(id: SoundId): void {
    const loop = this.loops.get(id);
    if (!loop) return;
    clearInterval(loop.timer);
    loop.gain.disconnect(); // silences everything already scheduled for this loop
    this.loops.delete(id);
  }

  stopAll(): void {
    for (const id of [...this.loops.keys()]) this.stop(id);
  }
}
