"use client";

import { useLayoutEffect, useRef } from "react";

const SCRIPT = [
  { side: "right", text: "the night folds into gold.", start: 80, type: 0 },
  { side: "left", text: "a new page, still warm.", start: 560, type: 310 },
  { side: "right", text: "Eos walks the horizon.", start: 1540, type: 0 },
  { side: "left", text: "stay curious, stay golden.", start: 2140, type: 340 }
] as const;

const T = {
  detach: 3480,
  morph: 3630,
  rise: 3840,
  titleStart: 7520,
  tagline: 8520
};

const KLEIN = "#D8A2A0";
const KLEIN_DEEP = "#A96F6B";
const PAPER = "#FAF4F0";
const INK = "#4A312E";
const FONT_UI = "\"Inter\", -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", sans-serif";
const FONT_SERIF = "\"Instrument Serif\", Georgia, \"Times New Roman\", serif";
const FONT_MONO = "\"JetBrains Mono\", ui-monospace, monospace";

const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function bounceOut(x: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

function drawPillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawHeartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const tipY = cy + h * 0.42;
  const topY = cy - h * 0.38;
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx - w * 0.52, tipY - h * 0.05, cx - w * 0.6, topY + h * 0.08, cx, topY + h * 0.1);
  ctx.bezierCurveTo(cx + w * 0.6, topY + h * 0.08, cx + w * 0.52, tipY - h * 0.05, cx, tipY);
  ctx.closePath();
}

export function SplashAnimation() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const stageEl = stageRef.current;
    const canvasEl = canvasRef.current;
    const context = canvasEl?.getContext("2d");
    if (!stageEl || !canvasEl || !context) return;
    const stage: HTMLDivElement = stageEl;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;
    const supportsCanvasFilter = typeof (ctx as CanvasRenderingContext2D & { filter?: string }).filter === "string";
    const useSoftEdgeFallback =
      !supportsCanvasFilter ||
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;

    let W = 0;
    let H = 0;
    let raf = 0;
    let resizeTimer = 0;
    let startTime = 0;
    let pausedElapsed = 0;
    let isAnimating = false;
    let titleFontSize = 80;
    const charsSpawnedFor = new Set<Bubble>();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = stage.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    class Speck {
      x = 0;
      y = 0;
      r = 1;
      vy = 0;
      vx = 0;
      alpha = 0.2;
      tone = true;
      swayP = 0;
      constructor(initial: boolean) {
        this.reset(initial);
      }
      reset(initial: boolean) {
        this.x = Math.random() * W;
        this.y = initial ? Math.random() * H : H + 8;
        this.r = rand(0.2, 1.5);
        this.vy = -rand(0.05, 0.32);
        this.vx = rand(-0.1, 0.1);
        this.alpha = rand(0.06, 0.32);
        this.tone = Math.random() < 0.7;
        this.swayP = Math.random() * Math.PI * 2;
      }
      update() {
        this.swayP += 0.01;
        this.x += this.vx + Math.sin(this.swayP) * 0.05;
        this.y += this.vy;
        if (this.y < -10) this.reset(false);
      }
      draw() {
        ctx.fillStyle = this.tone ? `rgba(216,162,160,${this.alpha})` : `rgba(74,49,46,${this.alpha * 0.65})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    class Bubble {
      side: "left" | "right";
      text: string;
      idx: number;
      fontSize: number;
      padX: number;
      textW: number;
      w: number;
      h: number;
      textColor: string;
      detachColor: string;
      chatBaseY: number;
      yStep: number;
      ay: number;
      ax: number;
      balloonCenterX: number;
      balloonScale: number;
      scale = 0;
      morph = 0;
      driftX = 0;
      driftY = 0;
      swayPhase: number;
      charsOut = false;
      textReveal = 0;
      showTyping = false;
      showText = false;
      config: typeof SCRIPT[number];
      constructor(config: typeof SCRIPT[number], idx: number) {
        this.side = config.side;
        this.text = config.text;
        this.idx = idx;
        this.config = config;
        this.fontSize = Math.max(13, Math.min(16, W * 0.042));
        this.padX = this.fontSize * 0.86;
        const padY = this.fontSize * 0.52;
        this.textColor = this.side === "left" ? INK : "#FFFFFF";
        this.detachColor = this.side === "left" ? INK : KLEIN_DEEP;
        ctx.font = `300 ${this.fontSize}px ${FONT_UI}`;
        this.textW = ctx.measureText(this.text).width;
        this.w = this.textW + this.padX * 2;
        this.h = this.fontSize * 1.7 + padY * 0.4;
        const margin = W * 0.07;
        this.chatBaseY = H * 0.61;
        this.yStep = H * 0.072;
        this.ay = this.chatBaseY;
        this.ax = this.side === "left" ? margin : W - margin - this.w;
        const sideIndex = Math.floor(idx / 2);
        const leftFloatSlots = [0.42, 0.25, 0.44, 0.27];
        const rightFloatSlots = [0.58, 0.75, 0.56, 0.73];
        const balloonScales = [0.78, 0.67, 0.86, 0.72, 0.64, 0.82, 0.7, 0.76];
        this.balloonCenterX = W * (this.side === "left" ? leftFloatSlots[sideIndex % leftFloatSlots.length] : rightFloatSlots[sideIndex % rightFloatSlots.length]);
        this.balloonScale = balloonScales[idx % balloonScales.length];
        this.swayPhase = idx * 0.7;
      }
      update(t: number, visibleCount: number) {
        const at = this.config.start;
        if (t < at) {
          this.ay = this.chatBaseY;
        } else {
          const targetRow = this.idx - Math.max(0, visibleCount - 1);
          this.ay = lerp(this.ay, this.chatBaseY + targetRow * this.yStep, 0.16);
        }
        this.scale = t < at ? 0 : easeOutBack(clamp((t - at) / 440, 0, 1));
        if (this.scale > 0) {
          if (this.config.type > 0 && t < at + this.config.type) {
            this.showTyping = true;
            this.showText = false;
            this.textReveal = 0;
          } else {
            this.showTyping = false;
            this.showText = true;
            const revealDur = Math.max(this.config.type > 0 ? 360 : 220, this.text.length * (this.config.type > 0 ? 32 : 26));
            this.textReveal = clamp((t - at - this.config.type) / revealDur, 0, 1);
          }
        }
        this.morph = t > T.morph ? clamp((t - T.morph) / 720, 0, 1) : 0;
        if (t > T.rise) {
          const dt = (t - T.rise) / 1000;
          this.driftY = -dt * (70 + this.idx * 4) - Math.pow(dt, 1.4) * 16;
          this.swayPhase += 0.026;
          this.driftX = Math.sin(this.swayPhase + this.idx) * (9 + this.idx * 1.5);
        }
      }
      draw(t: number) {
        if (this.scale <= 0.001) return;
        const baseCx = this.ax + this.w / 2;
        const cx = lerp(baseCx, this.balloonCenterX + this.driftX, this.morph);
        const cy = this.ay + this.h / 2 + this.driftY;
        const m = this.morph;
        const squish = m > 0 ? 1 - 0.12 * Math.sin(m * Math.PI) : 1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(this.scale * squish, this.scale * squish);
        if (m > 0.5) ctx.rotate(Math.sin(this.swayPhase + this.idx) * (this.side === "right" ? 0.15 : 0.09));
        const target = Math.max(this.w, this.h);
        const sw = lerp(this.w, target * 0.46 * this.balloonScale, m);
        const sh = lerp(this.h, target * 0.62 * this.balloonScale, m);
        const radius = lerp(this.h / 2, Math.min(sw, sh) * 0.46, m);
        const softEdge = Math.pow(1 - clamp(m / 0.72, 0, 1), 1.8);
        const edgeBlur = 2.4 * softEdge;
        // 交叉淡变：文字气泡淡出 → 爱心/水泡弹入飘升
        const pillA = 1 - clamp((m - 0.3) / 0.3, 0, 1);
        const popIn = clamp((m - 0.28) / 0.5, 0, 1);
        const popScale = 0.7 + 0.3 * easeOutBack(popIn);
        const isRight = this.side === "right";
        const hw = target * 0.5 * this.balloonScale * popScale;
        const hh = target * 0.64 * this.balloonScale * popScale;
        // ── 1) 文字气泡（淡出阶段） ──
        if (pillA > 0.01) {
          ctx.globalAlpha = pillA;
          if (softEdge > 0.01) {
            ctx.shadowColor = isRight ? `rgba(169,111,107,${0.3 * softEdge})` : `rgba(255,255,255,${0.68 * softEdge})`;
            ctx.shadowBlur = isRight ? 14 * softEdge : 10 * softEdge;
          }
          const drawPillShape = () => drawPillPath(ctx, -sw / 2, -sh / 2, sw, sh, radius);
          const drawExpandedPill = (expand: number) => drawPillPath(ctx, -sw / 2 - expand, -sh / 2 - expand, sw + expand * 2, sh + expand * 2, radius + expand);
          ctx.fillStyle = isRight ? KLEIN : "#FFFFFF";
          if (edgeBlur > 0.06 && useSoftEdgeFallback) {
            ctx.shadowColor = "transparent";
            const blurSize = Math.max(1.2, edgeBlur * 1.35);
            const passes = [
              { expand: blurSize * 2.2, alpha: 0.07 },
              { expand: blurSize * 1.55, alpha: 0.12 },
              { expand: blurSize * 0.95, alpha: 0.20 },
              { expand: blurSize * 0.42, alpha: 0.34 },
              { expand: 0, alpha: 0.58 }
            ];
            ctx.save();
            for (const pass of passes) {
              ctx.globalAlpha = pillA * pass.alpha;
              drawExpandedPill(pass.expand);
              ctx.fill();
            }
            ctx.restore();
          } else {
            drawPillShape();
            ctx.filter = edgeBlur > 0.06 ? `blur(${edgeBlur}px)` : "none";
            ctx.fill();
            ctx.filter = "none";
          }
          ctx.shadowColor = "transparent";
          if (m > 0.3) {
            ctx.globalAlpha = pillA * (isRight ? 0.5 : 0.55);
            ctx.fillStyle = "#FFFFFF";
            ctx.beginPath();
            ctx.ellipse(-sw * 0.23, -sh * 0.31, sw * 0.085, sh * 0.13, 0.48, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          if (!this.charsOut) {
            if (this.showTyping) drawTypingDots(t, isRight ? "rgba(255,255,255,0.85)" : "rgba(120,120,120,0.85)");
            else if (this.showText) {
              ctx.fillStyle = this.textColor;
              ctx.font = `300 ${this.fontSize}px ${FONT_UI}`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(this.textReveal < 1 ? this.text.slice(0, Math.ceil(this.text.length * this.textReveal)) : this.text, 0, 0);
            }
          }
          ctx.globalAlpha = 1;
        }
        // ── 2) 爱心（右）/ 玻璃水泡（左）弹入飘升 ──
        if (popIn > 0.01) {
          ctx.globalAlpha = popIn;
          if (isRight) {
            const g = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
            g.addColorStop(0, "#F3C9C6");
            g.addColorStop(0.5, "#D8A2A0");
            g.addColorStop(1, "#A96F6B");
            ctx.fillStyle = g;
            drawHeartPath(ctx, 0, 0, hw, hh);
            ctx.fill();
            ctx.strokeStyle = "rgba(169,111,107,0.45)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.beginPath();
            ctx.ellipse(-hw * 0.2, -hh * 0.26, hw * 0.1, hh * 0.13, 0.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.beginPath();
            ctx.ellipse(0, 0, hw / 2, hh / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.65)";
            ctx.lineWidth = 1.1;
            ctx.stroke();
            ctx.strokeStyle = "rgba(216,162,160,0.35)";
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.ellipse(0, 0, hw / 2 - 1.4, hh / 2 - 1.4, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,255,255,0.75)";
            ctx.lineWidth = hh * 0.07;
            ctx.beginPath();
            ctx.ellipse(-hw * 0.2, -hh * 0.22, hw * 0.22, hh * 0.2, -0.5, Math.PI * 1.15, Math.PI * 1.75);
            ctx.stroke();
          }
          // 小尾巴 + 细线（弹入后短暂出现，飘升后消失）
          const tailA = clamp((popIn - 0.05) / 0.3, 0, 1) * (1 - clamp((m - 0.8) / 0.2, 0, 1));
          if (tailA > 0.02) {
            ctx.globalAlpha = popIn * tailA;
            const ny = isRight ? hh * 0.42 + 3 : hh * 0.52;
            ctx.fillStyle = isRight ? KLEIN_DEEP : "rgba(216,162,160,0.5)";
            ctx.beginPath();
            ctx.moveTo(-3.2, ny - 1);
            ctx.lineTo(3.2, ny - 1);
            ctx.lineTo(2, ny + 4);
            ctx.lineTo(-2, ny + 4);
            ctx.closePath();
            ctx.fill();
            const len = (60 + this.idx * 6) * tailA;
            const sw1 = Math.sin(this.swayPhase * 1.4) * 8;
            const sw2 = Math.sin(this.swayPhase * 1.4 + 1) * 6;
            ctx.strokeStyle = isRight ? "rgba(169,111,107,0.55)" : "rgba(216,162,160,0.4)";
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(0, ny + 4);
            ctx.bezierCurveTo(sw2 * 0.5, ny + 4 + len * 0.35, sw1 * 0.7, ny + 4 + len * 0.7, sw1, ny + 4 + len);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
    }

    function drawTypingDots(t: number, color: string) {
      for (let i = 0; i < 3; i++) {
        const phase = ((t * 0.0048) + i * 0.22) % 1.1;
        const wave = Math.sin(phase * Math.PI / 1.1);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3 + Math.max(0, wave) * 0.7;
        ctx.beginPath();
        ctx.arc((i - 1) * 8, -wave * 1.6, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    class FloatChar {
      vx = rand(-0.95, 0.95);
      vy = -rand(0.7, 1.9);
      rot = rand(-0.18, 0.18);
      rotV = rand(-0.022, 0.022);
      alpha = 1;
      swayPhase = Math.random() * Math.PI * 2;
      swayAmp = rand(0.18, 0.55);
      constructor(public ch: string, public x: number, public y: number, public color: string, public size: number) {}
      update() {
        this.swayPhase += 0.04;
        this.x += this.vx + Math.sin(this.swayPhase) * this.swayAmp;
        this.y += this.vy;
        this.vy *= 0.991;
        this.vx *= 0.991;
        if (this.vy > -0.55) this.vy -= 0.009;
        this.rot += this.rotV;
        if (this.y < H * 0.13) this.alpha = clamp(this.y / (H * 0.13), 0, 1);
      }
      draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.font = `300 ${this.size}px ${FONT_UI}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.ch, 0, 0);
        ctx.restore();
      }
    }

    class TitleLetter {
      scale = 0;
      opacity = 0;
      x: number;
      y: number;
      rot = 0;
      startTime: number;
      bobPhase: number;
      constructor(public ch: string, public tx: number, public ty: number, public idx: number, public fontSize: number) {
        this.x = tx;
        this.y = ty + 100;
        this.startTime = T.titleStart + idx * 110;
        this.bobPhase = idx * 0.7 + Math.random() * 0.3;
      }
      update(t: number) {
        const dt = t - this.startTime;
        if (dt < 0) {
          this.opacity = 0;
          return;
        }
        if (dt < 760) {
          const p = dt / 760;
          const e = bounceOut(p);
          this.x = this.tx;
          this.y = this.ty + (1 - e) * 110;
          this.scale = e;
          this.opacity = clamp(p * 1.6, 0, 1);
          this.rot = (1 - e) * 0.2 * (this.idx % 2 ? 1 : -1);
        } else {
          const bt = (dt - 760) / 1000;
          this.x = this.tx + Math.sin(bt * 1.25 + this.bobPhase) * 1.8;
          this.y = this.ty + Math.sin(bt * 1.65 + this.bobPhase) * 4;
          this.scale = 1 + Math.sin(bt * 2 + this.bobPhase) * 0.028;
          this.rot = Math.sin(bt * 1.4 + this.bobPhase) * 0.03;
          this.opacity = 1;
        }
      }
      draw() {
        if (this.opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.scale(this.scale, this.scale);
        ctx.font = `italic 400 ${this.fontSize}px ${FONT_SERIF}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // 柔和立体描边
        ctx.fillStyle = "rgba(169,111,107,0.14)";
        for (const [dx, dy] of [[-1.7, 0], [1.7, 0], [0, -1.7], [0, 1.7], [-1.2, -1.2], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2]]) {
          ctx.fillText(this.ch, dx, dy);
        }
        // 玫瑰金渐变主体
        const g = ctx.createLinearGradient(0, -this.fontSize * 0.55, 0, this.fontSize * 0.55);
        g.addColorStop(0, "#F6DFDC");
        g.addColorStop(0.5, "#D8A2A0");
        g.addColorStop(1, "#A96F6B");
        ctx.fillStyle = g;
        ctx.fillText(this.ch, 0, 0);
        // 顶部镜面高光
        ctx.globalAlpha = this.opacity * 0.45;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(this.ch, 0, -this.fontSize * 0.045);
        // 右上玻璃反光点
        ctx.globalAlpha = this.opacity * 0.6;
        ctx.beginPath();
        ctx.arc(this.fontSize * 0.32, -this.fontSize * 0.34, this.fontSize * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    let bubbles: Bubble[] = [];
    let specks: Speck[] = [];
    let chars: FloatChar[] = [];
    let titles: TitleLetter[] = [];

    function init(elapsed = 0) {
      resize();
      bubbles = SCRIPT.map((item, index) => new Bubble(item, index));
      specks = Array.from({ length: Math.max(8, Math.floor(W * H / 12000)) }, () => new Speck(true));
      chars = [];
      charsSpawnedFor.clear();
      titles = [];
      titleFontSize = Math.max(54, Math.min(96, W * 0.22));
      ctx.font = `italic 400 ${titleFontSize}px ${FONT_SERIF}`;
      const word = "Eos";
      const widths = [...word].map((c) => ctx.measureText(c).width);
      const spacing = titleFontSize * 0.04;
      let total = widths.reduce((sum, width) => sum + width, 0) + spacing * (word.length - 1);
      let xc = W / 2 - total / 2;
      const titleY = H * 0.5;
      for (let i = 0; i < word.length; i++) {
        titles.push(new TitleLetter(word[i], xc + widths[i] / 2, titleY, i, titleFontSize));
        xc += widths[i] + spacing;
      }
      startTime = performance.now() - elapsed;
    }

    function getElapsed() {
      return startTime > 0 ? Math.max(0, performance.now() - startTime) : 0;
    }

    function spawnCharsFromBubble(b: Bubble) {
      if (charsSpawnedFor.has(b)) return;
      charsSpawnedFor.add(b);
      const cy = b.ay + b.h / 2 + b.driftY;
      ctx.font = `300 ${b.fontSize}px ${FONT_UI}`;
      let cursor = b.ax + b.w / 2 - b.textW / 2 + b.driftX;
      for (const ch of b.text) {
        const cw = ctx.measureText(ch).width;
        if (ch !== " ") chars.push(new FloatChar(ch, cursor + cw / 2, cy, b.detachColor, b.fontSize));
        cursor += cw;
      }
      b.charsOut = true;
    }

    function frame(now: number) {
      if (!isAnimating || document.visibilityState === "hidden") return;
      const t = now - startTime;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      const grad = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75);
      grad.addColorStop(0, "rgba(216,162,160,0)");
      grad.addColorStop(1, "rgba(216,162,160,0.08)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      specks.forEach((s) => { s.update(); s.draw(); });
      const visibleCount = SCRIPT.reduce((count, item) => count + (t >= item.start ? 1 : 0), 0);
      bubbles.forEach((b) => b.update(t, visibleCount));
      if (t > T.detach) bubbles.forEach((b, i) => { if (t > T.detach + i * 90) spawnCharsFromBubble(b); });
      bubbles.forEach((b) => b.draw(t));
      chars.forEach((c) => { c.update(); c.draw(); });
      titles.forEach((tl) => { tl.update(t); tl.draw(); });
      if (t > T.tagline) {
        const op = clamp((t - T.tagline) / 900, 0, 0.7);
        const txt = "WEIGHTLESS  ·  AI";
        const ls = 2.2;
        ctx.fillStyle = `rgba(216,162,160,${op})`;
        ctx.font = `300 10px ${FONT_MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const ws = [...txt].map((c) => ctx.measureText(c).width);
        let totalW = ws.reduce((sum, width) => sum + width + ls, 0) - ls;
        let xx = W / 2 - totalW / 2;
        for (let i = 0; i < txt.length; i++) {
          ctx.fillText(txt[i], xx + ws[i] / 2, H * 0.5 + titleFontSize * 0.55);
          xx += ws[i] + ls;
        }
      }
      raf = requestAnimationFrame(frame);
    }

    function stopAnimation() {
      isAnimating = false;
      cancelAnimationFrame(raf);
    }

    function startAnimation(elapsed = 0) {
      stopAnimation();
      init(elapsed);
      isAnimating = true;
      frame(performance.now());
    }

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      const elapsed = isAnimating ? getElapsed() : pausedElapsed;
      resizeTimer = window.setTimeout(() => startAnimation(elapsed), 120);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pausedElapsed = getElapsed();
        stopAnimation();
        return;
      }
      startAnimation(pausedElapsed);
    };
    const onPageShow = () => startAnimation(isAnimating ? getElapsed() : pausedElapsed);

    startAnimation(0);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopAnimation();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <div ref={stageRef} className="splash-animation-stage" aria-hidden>
      <canvas ref={canvasRef} className="splash-animation-canvas" />
      <div className="splash-animation-grain" />
      <div className="splash-animation-corner">Eos / 0.1</div>
      <div className="splash-animation-corner splash-animation-corner-right">no.001</div>
    </div>
  );
}
