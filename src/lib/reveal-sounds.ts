import type { ActivityRarityTone, RevealStage } from './reveal';
// Synthesized reveal and interaction cues shared with the production box experience.

type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] };

// At most sixteen cents either way: one subtle shift per cue keeps its chord in tune.
const randomDetune = () => (Math.random() * 2 - 1) * 16;

// Short, locally synthesized cues keep playback independent of downloads. Every
// voice has a scheduled end and is disconnected, including on skips and mute.
export class BoxLiveSounds {
  private output: GainNode;
  private noise: AudioBuffer;
  private voices = new Set<Voice>();
  private lastHover = -Infinity;

  constructor(private context: AudioContext) {
    this.output = context.createGain();
    this.output.gain.value = 0.55;
    this.output.connect(context.destination);
    this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }

  async resume() {
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context.state === 'running';
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, end: number) {
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => {
      nodes.forEach((node) => node.disconnect());
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(end);
  }

  play(kind: RevealStage['kind'], rarity: ActivityRarityTone | undefined, detailIndex: number, elapsedMs = 0, speed = 1) {
    this.stop();
    if (this.context.state !== 'running') return;
    const context = this.context;
    const now = context.currentTime + 0.01;
    const rate = Math.max(1, speed);
    const elapsed = elapsedMs / 1000 * rate;
    const detune = randomDetune();

    // Offsets are relative to the visual stage, so enabling sound or resuming a
    // paused box plays only the remaining part of its buildup.
    const timing = (offset: number, duration: number) => {
      if (offset + duration <= elapsed) return null;
      const consumed = Math.max(0, elapsed - offset);
      const start = now + Math.max(0, offset - elapsed) / rate;
      return { start, end: start + (duration - consumed) / rate, consumed };
    };
    const envelope = (start: number, end: number, peak: number, attack = 0.015) => {
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(attack, (end - start) * 0.35));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(this.output);
      return gain;
    };
    const tone = (offset: number, duration: number, frequency: number, peak: number, target = frequency, type: OscillatorType = 'sine') => {
      const time = timing(offset, duration);
      if (!time) return;
      const source = context.createOscillator();
      source.type = type;
      source.detune.setValueAtTime(detune, time.start);
      source.frequency.setValueAtTime(frequency * Math.pow(target / frequency, time.consumed / duration), time.start);
      source.frequency.exponentialRampToValueAtTime(target, time.end);
      const gain = envelope(time.start, time.end, peak);
      source.connect(gain);
      this.track(source, [source, gain], time.start, time.end);
    };
    const whoosh = (offset: number, duration: number, peak: number) => {
      const time = timing(offset, duration);
      if (!time) return;
      const source = context.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.7;
      filter.detune.setValueAtTime(detune, time.start);
      filter.frequency.setValueAtTime(350 + 1800 * (time.consumed / duration), time.start);
      filter.frequency.exponentialRampToValueAtTime(2150, time.end);
      const gain = envelope(time.start, time.end, peak, duration * 0.45 / rate);
      source.connect(filter);
      filter.connect(gain);
      this.track(source, [source, filter, gain], time.start, time.end);
    };
    const bell = (offset: number, frequency: number, strength = 1) => {
      tone(offset, 0.65, frequency, 0.13 * strength);
      tone(offset, 0.3, frequency * 2, 0.035 * strength);
    };

    if (kind === 'box') {
      tone(0, 0.35, 150, 0.18, 55);
      whoosh(0.45, 3.15, 0.14);
      [1.65, 1.86, 2.05, 2.24, 2.43, 2.62, 2.81, 3.0].forEach((offset, i) => {
        tone(offset, 0.1, 180 + i * 22, 0.09 + i * 0.008, 75, 'triangle');
      });
      bell(3.22, 784, 0.6);
    } else if (kind === 'detail') {
      bell(0, [523.25, 659.25, 784][Math.max(0, detailIndex - 1) % 3], 0.55);
    } else if (kind === 'rarity') {
      const premium = rarity === 'premium';
      const rare = premium || rarity === 'rare';
      const strength = rare ? 1 : 0.5;
      tone(0, rare ? 0.8 : 0.35, 130.81, 0.25 * strength, 45);
      whoosh(0, rare ? 0.9 : 0.35, 0.25 * strength);
      [523.25, 659.25, 784, ...(rare ? [1046.5] : []), ...(premium ? [1318.51, 1568] : [])]
        .forEach((note, i) => bell(i * 0.09, note, strength));
      if (rare) [261.63, 329.63, 392].forEach((note) => tone(0.1, 1.5, note, 0.05));
    } else {
      bell(0, 659.25, 0.7);
      bell(0.12, 1046.5, 0.85);
      tone(0, 0.8, 261.63, 0.06);
    }
  }

  // UI notes mix quietly over the reveal without cancelling its scheduled audio.
  interaction(kind: 'hover' | 'navigation-hover' | 'item-hover' | 'select' | 'vault' | 'sell' | 'confirm' | 'dizzy') {
    if (this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (kind === 'dizzy') {
      // A falling cartoon whistle whose pitch wobble slows as Dilbert settles.
      const start = now + 0.005;
      const end = start + 1.25;
      const source = this.context.createOscillator();
      const wobble = this.context.createOscillator();
      const depth = this.context.createGain();
      const gain = this.context.createGain();
      source.type = 'triangle';
      source.detune.setValueAtTime(randomDetune(), start);
      source.frequency.setValueAtTime(680, start);
      source.frequency.exponentialRampToValueAtTime(260, end);
      wobble.frequency.setValueAtTime(9, start);
      wobble.frequency.exponentialRampToValueAtTime(3, end);
      depth.gain.setValueAtTime(360, start);
      depth.gain.exponentialRampToValueAtTime(45, end);
      wobble.connect(depth);
      depth.connect(source.detune);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(gain);
      gain.connect(this.output);
      this.track(wobble, [wobble, depth], start, end);
      this.track(source, [source, gain], start, end);
      return;
    }
    const isHover = kind === 'hover' || kind === 'navigation-hover' || kind === 'item-hover';
    if (isHover) {
      if (now - this.lastHover < 0.12) return;
      this.lastHover = now;
    }
    const detune = randomDetune();
    const notes = kind === 'vault' ? [523.25, 784, 1046.5]
      : kind === 'sell' ? [659.25, 880, 1318.51]
      : kind === 'confirm' ? [523.25, 659.25, 1046.5]
      : kind === 'navigation-hover' ? [659.25]
      : kind === 'item-hover' ? [830.61]
      : kind === 'hover' ? [740] : [880];
    notes.forEach((frequency, index) => {
      const start = now + 0.005 + index * 0.065;
      const end = start + (isHover ? 0.055 : 0.24);
      const source = this.context.createOscillator();
      const gain = this.context.createGain();
      source.detune.setValueAtTime(detune, start);
      source.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(isHover ? 0.035 : 0.09, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      source.connect(gain);
      gain.connect(this.output);
      this.track(source, [source, gain], start, end);
    });
  }

  stop() {
    this.voices.forEach(({ source, nodes }) => {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      nodes.forEach((node) => node.disconnect());
    });
    this.voices.clear();
  }

  dispose() {
    this.stop();
    this.output.disconnect();
  }

  close() {
    this.dispose();
    void this.context.close().catch(() => {});
  }
}
