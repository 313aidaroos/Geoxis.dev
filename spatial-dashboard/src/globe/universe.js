// The universe behind the Earth: twinkling stars, a Milky Way band, drifting nebulae, a few faint
// galaxies and the odd shooting star, slowly rotating. Pre-rendered layers + a light per-frame pass,
// so it costs almost nothing next to Cesium. Respects prefers-reduced-motion (static sky).

const TAU = Math.PI * 2;

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Universe {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.stars = [];
    this.twinklers = [];
    this.shooting = null;
    this.rot = 0;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.last = performance.now();
    this._raf = 0;
    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    new ResizeObserver(this.resize).observe(canvas.parentElement || canvas);
    this.resize();
    this.frame = this.frame.bind(this);
    this._raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const r = (this.canvas.parentElement || this.canvas).getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (Math.round(r.width) === this.w && Math.round(r.height) === this.h && dpr === this.dpr) return;
    this.w = Math.max(1, Math.round(r.width)); this.h = Math.max(1, Math.round(r.height)); this.dpr = dpr;
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr;
    this.canvas.style.width = `${this.w}px`; this.canvas.style.height = `${this.h}px`;
    this.#build();
  }

  /** Nudge the sky when the camera turns (tiny parallax). dx/dy in [-1, 1]. */
  nudge(dx, dy) { this.parallax.tx = dx * 18; this.parallax.ty = dy * 18; }

  #build() {
    const R = Math.hypot(this.w, this.h) * 0.75; // sky layer is a square larger than the viewport so rotation never shows edges
    const S = Math.ceil(R * 2);
    this.S = S;
    const rand = rng(1337);
    // --- deep layer: nebulae + galaxies + Milky Way band ---
    const deep = document.createElement("canvas");
    deep.width = deep.height = S;
    const d = deep.getContext("2d");
    d.fillStyle = "#03060f"; d.fillRect(0, 0, S, S);
    // Milky Way: a soft diagonal band made of many faint blobs with a warm core.
    d.save(); d.translate(S / 2, S / 2); d.rotate(-0.55);
    for (let i = 0; i < 420; i++) {
      const t = rand() * 2 - 1;
      const x = t * S * 0.75;
      const spread = (0.05 + 0.06 * Math.exp(-(t * t) * 3)) * S * (0.6 + rand() * 0.8);
      const y = (rand() - 0.5) * spread * 2;
      const rad = 18 + rand() * 90;
      const g = d.createRadialGradient(x, y, 0, x, y, rad);
      const warm = Math.abs(t) < 0.35 && rand() < 0.5;
      const col = warm ? [255, 232, 200] : rand() < 0.5 ? [170, 190, 255] : [200, 180, 255];
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${(0.05 + rand() * 0.06).toFixed(3)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = g; d.beginPath(); d.arc(x, y, rad, 0, TAU); d.fill();
    }
    // dust lanes
    for (let i = 0; i < 90; i++) {
      const t = rand() * 2 - 1; const x = t * S * 0.7; const y = (rand() - 0.5) * S * 0.06; const rad = 20 + rand() * 60;
      const g = d.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(3,6,15,${(0.25 + rand() * 0.3).toFixed(2)})`); g.addColorStop(1, "rgba(3,6,15,0)");
      d.fillStyle = g; d.beginPath(); d.arc(x, y, rad, 0, TAU); d.fill();
    }
    d.restore();
    // nebulae: a few large coloured clouds
    const nebulae = [["#5b3cff", 0.16], ["#ff4fa3", 0.08], ["#22d3ee", 0.09], ["#7c3aed", 0.12], ["#f59e0b", 0.05]];
    for (let i = 0; i < nebulae.length; i++) {
      const [c, a] = nebulae[i];
      const cx = rand() * S, cy = rand() * S;
      for (let k = 0; k < 14; k++) {
        const x = cx + (rand() - 0.5) * S * 0.18, y = cy + (rand() - 0.5) * S * 0.14, rad = 60 + rand() * 170;
        const g = d.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, hexA(c, a * (0.5 + rand() * 0.6))); g.addColorStop(1, hexA(c, 0));
        d.fillStyle = g; d.beginPath(); d.arc(x, y, rad, 0, TAU); d.fill();
      }
    }
    // galaxies: tilted spirals built from clustered points
    for (let gIdx = 0; gIdx < 5; gIdx++) {
      const cx = rand() * S, cy = rand() * S, size = 26 + rand() * 46, tilt = rand() * Math.PI, squash = 0.3 + rand() * 0.5;
      d.save(); d.translate(cx, cy); d.rotate(tilt); d.scale(1, squash);
      const core = d.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
      core.addColorStop(0, "rgba(255,245,225,0.55)"); core.addColorStop(1, "rgba(255,245,225,0)");
      d.fillStyle = core; d.beginPath(); d.arc(0, 0, size * 0.5, 0, TAU); d.fill();
      for (let arm = 0; arm < 2; arm++) {
        for (let i = 0; i < 160; i++) {
          const a = arm * Math.PI + i * 0.05 + rand() * 0.12; const r = i * (size / 130);
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          d.fillStyle = `rgba(${200 + rand() * 55 | 0},${210 + rand() * 45 | 0},255,${(0.08 + rand() * 0.22).toFixed(2)})`;
          d.beginPath(); d.arc(x, y, 0.6 + rand() * 1.4, 0, TAU); d.fill();
        }
      }
      d.restore();
    }
    this.deep = deep;

    // --- star layer ---
    const starsC = document.createElement("canvas");
    starsC.width = starsC.height = S;
    const s = starsC.getContext("2d");
    const count = Math.round((S * S) / 1700);
    this.stars = [];
    const palette = ["#ffffff", "#dfe8ff", "#ffe9c4", "#bcd0ff", "#ffd1a6", "#c8f1ff"];
    for (let i = 0; i < count; i++) {
      const x = rand() * S, y = rand() * S, m = rand();
      const r = m < 0.86 ? 0.4 + rand() * 0.6 : m < 0.97 ? 1 + rand() * 0.6 : 1.6 + rand() * 1.2;
      const col = palette[(rand() * palette.length) | 0];
      s.fillStyle = col; s.globalAlpha = 0.35 + rand() * 0.65;
      s.beginPath(); s.arc(x, y, r, 0, TAU); s.fill();
      if (r > 1.4) { // glow + cross flare on bright stars
        const g = s.createRadialGradient(x, y, 0, x, y, r * 6);
        g.addColorStop(0, hexA(col, 0.35)); g.addColorStop(1, hexA(col, 0));
        s.fillStyle = g; s.beginPath(); s.arc(x, y, r * 6, 0, TAU); s.fill();
      }
      if (rand() < 0.08) this.stars.push({ x, y, r, col, phase: rand() * TAU, speed: 0.6 + rand() * 2.2 });
    }
    s.globalAlpha = 1;
    this.starLayer = starsC;
    this.twinklers = this.stars.slice(0, 220);
    this.offset = { x: this.w / 2 - S / 2, y: this.h / 2 - S / 2 };
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const { ctx, w, h, dpr } = this;
    if (!this.deep) return;
    if (!this.reduced) this.rot += dt * (TAU / 900); // one full turn every 15 minutes
    this.parallax.x += (this.parallax.tx - this.parallax.x) * 0.04;
    this.parallax.y += (this.parallax.ty - this.parallax.y) * 0.04;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + this.parallax.x, h / 2 + this.parallax.y);
    ctx.rotate(this.rot);
    ctx.drawImage(this.deep, -this.S / 2, -this.S / 2);
    ctx.drawImage(this.starLayer, -this.S / 2, -this.S / 2);
    if (!this.reduced) {
      const t = now / 1000;
      for (const st of this.twinklers) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * st.speed + st.phase));
        ctx.globalAlpha = a;
        ctx.fillStyle = st.col;
        ctx.beginPath(); ctx.arc(st.x - this.S / 2, st.y - this.S / 2, st.r * (0.9 + 0.5 * a), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // shooting star
    if (!this.reduced) {
      if (!this.shooting && Math.random() < dt / 9) {
        const ang = Math.PI / 4 + (Math.random() - 0.5) * 0.8;
        this.shooting = { x: Math.random() * w, y: Math.random() * h * 0.5, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, life: 0.7 + Math.random() * 0.5, age: 0 };
      }
      const sh = this.shooting;
      if (sh) {
        sh.age += dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        const k = 1 - sh.age / sh.life;
        if (k <= 0) this.shooting = null;
        else {
          const len = 120;
          const g = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx / 900 * len, sh.y - sh.vy / 900 * len);
          g.addColorStop(0, `rgba(255,255,255,${(0.9 * k).toFixed(2)})`); g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - sh.vx / 900 * len, sh.y - sh.vy / 900 * len); ctx.stroke();
        }
      }
    }
    // vignette so the edges fall into black like a real viewport
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, "rgba(3,6,15,0)"); v.addColorStop(1, "rgba(3,6,15,0.55)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    this._raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this.resize);
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
