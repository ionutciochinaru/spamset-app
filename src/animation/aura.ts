import * as THREE from 'three';

import type { Clip, Vec3 } from './types';

/** Power-up colours: HUD yellow at the core, the shirt's orange at the edge. */
const CORE = new THREE.Color('#ffd23f');
const EDGE = new THREE.Color('#ff6b2b');

const SPARKS = 24;
const ARROWS = 10;
/** How far behind each joint (m, away from the camera) the glow sits, so the body occludes it. */
const BEHIND = 0.14;
/** Burst decay per second (the halo is gone in about 0.8 s). */
const DECAY = 4;

/** Bursts per loop of a clip: one per rep it shows (two when it shows both sides or two reps); holds burst once a loop. */
export function repsPerLoop(clip: Clip): number {
  const counting = clip.contract?.counting ?? '';
  return !/time-based/i.test(counting) && /loop shows (two|both)/i.test(counting) ? 2 : 1;
}

/** RGBA texture from an alpha function over [0, 1]^2 (v up), white (no DOM canvas on native). */
function alphaTexture(size: number, alpha: (u: number, v: number) => number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha((x + 0.5) / size, (y + 0.5) / size))) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/** Soft round falloff. */
const glowTexture = () => alphaTexture(64, (u, v) => Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2) ** 2);

/** A chunky up arrow: triangle head over a shaft. */
const arrowTexture = () =>
  alphaTexture(16, (u, v) => {
    const x = Math.abs(u - 0.5);
    if (v >= 0.5 && v <= 0.95) return x <= (0.95 - v) * 1.05 ? 1 : 0;
    return v >= 0.06 && v < 0.5 && x <= 0.16 ? 1 : 0;
  });

function additive(map: THREE.Texture, color: THREE.Color) {
  return new THREE.SpriteMaterial({ map, color, opacity: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}

type Particle = { sprite: THREE.Sprite; velocity: THREE.Vector3; age: number; life: number; size: number };

/**
 * XP bursts for the figure while you do a spam set: when a rep completes, the body flares
 * (glow behind every joint, so it rims the silhouette) and yellow arrows and sparks shoot up,
 * then it all fades until the next rep. Plain sprites in the scene, so the PSX pass pixelates
 * them with the figure.
 */
export class Aura {
  readonly group = new THREE.Group();
  private glow = glowTexture();
  private arrow = arrowTexture();
  private halo = new Map<string, { outer: THREE.Sprite; inner: THREE.Sprite; seed: number }>();
  private sparks: Particle[] = [];
  private arrows: Particle[] = [];
  private energy = 0;
  private time = 0;
  private joints: Record<string, Vec3> = {};
  private toCamera = new THREE.Vector3();
  private point = new THREE.Vector3();

  constructor() {
    const pool = (count: number, map: THREE.Texture, color: THREE.Color) =>
      Array.from({ length: count }, () => {
        const sprite = new THREE.Sprite(additive(map, color));
        sprite.visible = false;
        this.group.add(sprite);
        return { sprite, velocity: new THREE.Vector3(), age: 1, life: 1, size: 0 };
      });
    this.sparks = pool(SPARKS, this.glow, CORE);
    this.arrows = pool(ARROWS, this.arrow, CORE);
  }

  /** A rep just completed: flare and launch arrows and sparks from the body. */
  burst() {
    const names = Object.keys(this.joints);
    if (!names.length) return;
    this.energy = 1;
    const launch = (p: Particle, spread: number, speed: number, life: number, size: number) => {
      const [x, y, z] = this.joints[names[Math.floor(Math.random() * names.length)]];
      p.sprite.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.6, z + (Math.random() - 0.5) * spread);
      p.velocity.set((Math.random() - 0.5) * 0.1, speed * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 0.1);
      p.age = -Math.random() * 0.15; // A short stagger, so they don't move as one sheet.
      p.life = life * (0.85 + Math.random() * 0.3);
      p.size = size;
      p.sprite.visible = true;
    };
    for (const p of this.arrows) launch(p, 0.35, 1.1, 0.9, 0.13);
    for (const p of this.sparks) launch(p, 0.3, 0.7, 0.7, 0.06);
  }

  update(joints: Record<string, Vec3>, camera: THREE.Vector3, delta: number) {
    const dt = Math.min(delta, 0.1);
    this.time += dt;
    this.joints = joints;
    this.energy *= Math.exp(-DECAY * dt);

    // Halo: two layers per joint, pushed back from the camera, flaring with the burst.
    for (const [k, name] of Object.keys(joints).entries()) {
      let glow = this.halo.get(name);
      if (!glow) {
        glow = { outer: new THREE.Sprite(additive(this.glow, EDGE)), inner: new THREE.Sprite(additive(this.glow, CORE)), seed: k * 1.7 };
        this.group.add(glow.outer, glow.inner);
        this.halo.set(name, glow);
      }
      const visible = this.energy > 0.01;
      glow.outer.visible = glow.inner.visible = visible;
      if (!visible) continue;
      const [x, y, z] = joints[name];
      this.point.set(x, y, z);
      this.toCamera.copy(camera).sub(this.point).normalize();
      this.point.addScaledVector(this.toCamera, -BEHIND);
      const flicker = 1 + 0.12 * Math.sin(this.time * 11 + glow.seed);
      const grow = 1 + 0.35 * (1 - this.energy); // Swells outward as it fades.
      glow.outer.position.copy(this.point);
      glow.outer.scale.setScalar(0.5 * flicker * grow);
      glow.inner.position.copy(this.point);
      glow.inner.scale.setScalar(0.26 * flicker * grow);
      (glow.outer.material as THREE.SpriteMaterial).opacity = 0.45 * this.energy;
      (glow.inner.material as THREE.SpriteMaterial).opacity = 0.55 * this.energy;
    }

    // Arrows and sparks: rise, drift, fade in fast and out slowly.
    for (const p of [...this.arrows, ...this.sparks]) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        continue;
      }
      const t = Math.max(0, p.age) / p.life;
      if (p.age > 0) p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.setScalar(p.size * (1 - t * 0.4));
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.age < 0 ? 0 : Math.min(1, t * 8) * (1 - t);
    }
  }

  dispose() {
    this.group.traverse((object) => {
      if ((object as THREE.Sprite).isSprite) ((object as THREE.Sprite).material as THREE.Material).dispose();
    });
    this.glow.dispose();
    this.arrow.dispose();
  }
}
