// Meridian Heat — fully synthesized WebAudio sound. No audio files.
// Engine hum, sirens, gunshots, punches, pickup chimes and a bass loop
// are all generated with oscillators and filtered noise.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._startEngine();
    this._startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _noiseBuffer(seconds = 0.5) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  _startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc) return;
    const target = driving ? 0.05 + speed01 * 0.09 : 0.015;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, this.ctx.currentTime, 0.08);
  }

  // Simple two-note bass loop, ~112 BPM, minor key.
  _startMusic() {
    const bass = [55, 55, 65.4, 49, 55, 55, 82.4, 73.4];
    const stepMs = 270;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx || document.hidden) return;
      const f = bass[this.musicStep % bass.length];
      this._tone(f, 0.24, 'triangle', 0.10);
      if (this.musicStep % 4 === 2) this._tone(f * 2, 0.12, 'sine', 0.05);
      this.musicStep++;
    }, stepMs);
  }

  shoot() { this._noise(0.12, 0.5, 3200); this._tone(220, 0.1, 'square', 0.18, 60); }
  enemyShoot() { this._noise(0.1, 0.25, 2400); this._tone(180, 0.09, 'square', 0.1, 55); }
  punch() { this._noise(0.09, 0.4, 700); }
  crash() { this._noise(0.35, 0.55, 900); this._tone(90, 0.3, 'sine', 0.3, 40); }
  explosion() { this._noise(0.8, 0.7, 500); this._tone(70, 0.7, 'sine', 0.4, 28); }
  pickup() { this._tone(660, 0.12, 'sine', 0.22); this._tone(990, 0.2, 'sine', 0.22, null, 0.1); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.2, null, i * 0.12));
  }
  busted() { this._tone(392, 0.25, 'sawtooth', 0.16); this._tone(311, 0.5, 'sawtooth', 0.16, null, 0.22); }
  enterCar() { this._tone(140, 0.12, 'square', 0.12, 90); this._noise(0.15, 0.15, 1200, 0.05); }
  siren(on) {
    if (on && !this.sirenTimer) {
      let hi = true;
      this.sirenTimer = setInterval(() => {
        if (this.muted || !this.ctx) return;
        this._tone(hi ? 950 : 700, 0.34, 'sine', 0.055);
        hi = !hi;
      }, 360);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
  }
}
