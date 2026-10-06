import * as THREE from 'three';

import type { AuraFx, AuraKind } from '@/core/celebrations';

import type { Clip, Vec3 } from './types';

/** Power-up colours: HUD yellow at the core, the shirt's orange at the edge. */
const CORE = new THREE.Color('#ffd23f');
const EDGE = new THREE.Color('#ff6b2b');
const WHITE = new THREE.Color('#fff8e0');

/** Sustained anime auras for celebrations: [core, edge]. */
const PALETTES: Record<AuraKind, [string, string]> = {
  gold: ['#fff27a', '#ffb300'],
  blue: ['#c8f6ff', '#2a9dff'],
  red: ['#ffc2b0', '#ff2d1f'],
  violet: ['#f2d0ff', '#9d3dff'],
  silver: ['#ffffff', '#8fa8d8'],
  green: ['#e6ffb8', '#2ee86a'],
};

const FLAMES = 40;
const DUST = 30;
const ROCKS = 16;
const BOLTS = 4;
/** Joints per lightning bolt path (start, jagged middle, end). */
const BOLT_POINTS = 9;
const DUST_COLOURS = ['#d8bb8c', '#c9a57a', '#b08d63', '#e6cfa6'].map((c) => new THREE.Color(c));
const BOLT_COLOUR = new THREE.Color('#d8f4ff');
/** Flame tongues born per second while an aura burns. */
const FLAME_RATE = 55;

const ARROWS = 9;
const SPARKS = 20;
const STREAKS = 7;
/** How far behind each joint (m, away from the camera) the glow sits, so the body occludes it. */
const BEHIND = 0.14;
/** Burst decay per second (the halo is gone in about 0.8 s). */
const DECAY = 4;
const RING_LIFE = 0.55;
/** Matches the top of the figure's ground plate. */
const FLOOR_Y = -0.002;

/** Bursts per loop of a clip: one per rep it shows (two when it shows both sides or two reps); holds burst once a loop. */
export function repsPerLoop(clip: Clip): number {
  const counting = clip.contract?.counting ?? '';
  return !/time-based/i.test(counting) && /loop shows (two|both)/i.test(counting) ? 2 : 1;
}

/** RGBA texture from a colour function over [0, 1]^2 (v up); no DOM canvas on native. */
function texture(size: number, pixel: (u: number, v: number) => [number, number, number, number], nearest = false) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel((x + 0.5) / size, (y + 0.5) / size);
      data.set([r, g, b, Math.round(Math.max(0, Math.min(1, a)) * 255)], (y * size + x) * 4);
    }
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  if (nearest) map.magFilter = map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;
  return map;
}

/** Soft round falloff, white. */
const glowTexture = () => texture(64, (u, v) => [255, 255, 255, Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2) ** 2]);

/** A billowing dust puff: a soft disc with a lumpy edge, white (tinted per puff). */
const puffTexture = () =>
  texture(64, (u, v) => {
    const a = Math.atan2(v - 0.5, u - 0.5);
    const edge = 0.42 + 0.05 * Math.sin(a * 5) + 0.03 * Math.sin(a * 11 + 1.3);
    const d = Math.hypot(u - 0.5, v - 0.5);
    return [255, 255, 255, Math.min(1, Math.max(0, (edge - d) / 0.08)) * (0.75 + 0.25 * (1 - d / edge))];
  });

/** A chunk of rock: a solid pixel square, white (tinted). */
const rockTexture = () => texture(4, (u, v) => [255, 255, 255, u > 0.25 || v > 0.25 ? 1 : 0], true);

/** Thin ring for the floor shockwave, white. */
const ringTexture = () =>
  texture(64, (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    return [255, 255, 255, Math.max(0, 1 - Math.abs(d - 0.85) / 0.12) ** 1.5];
  });

/** Pixel-art up arrow on a 12 px grid: yellow fill, orange outline, a light top edge. */
const ARROW_ART = [
  '.....OO.....',
  '....OYYO....',
  '...OYWWYO...',
  '..OYYWWYYO..',
  '.OYYYYYYYYO.',
  'OOOOYYYYOOOO',
  '...OYYYYO...',
  '...OYYYYO...',
  '...OYYYYO...',
  '...OYYYYO...',
  '...OOOOOO...',
  '............',
];
const ARROW_COLOURS: Record<string, [number, number, number, number]> = {
  O: [201, 74, 22, 1],
  Y: [255, 210, 63, 1],
  W: [255, 248, 224, 1],
  '.': [0, 0, 0, 0],
};
const arrowTexture = () =>
  texture(12, (u, v) => ARROW_COLOURS[ARROW_ART[Math.floor((1 - v) * 12)][Math.floor(u * 12)]], true);

/** Clip the whole billboard, including its lower corners, against the ground. */
function aboveFloor<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.auraFloorY = { value: FLOOR_Y };
    shader.vertexShader = `varying float vAuraWorldY;\n${shader.vertexShader}`.replace(
      '#include <clipping_planes_vertex>',
      `#include <clipping_planes_vertex>
      // Recover world height after the sprite shader has applied its camera-facing offsets.
      vAuraWorldY = dot(viewMatrix[1].xyz, mvPosition.xyz) + cameraPosition.y;`,
    );
    shader.fragmentShader = `uniform float auraFloorY;\nvarying float vAuraWorldY;\n${shader.fragmentShader}`.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      if (vAuraWorldY < auraFloorY) discard;`,
    );
  };
  material.customProgramCacheKey = () => 'aura-above-floor-v1';
  return material;
}

function additive(map: THREE.Texture, color: THREE.Color) {
  return aboveFloor(new THREE.SpriteMaterial({ map, color, opacity: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}

type Particle = { sprite: THREE.Sprite; velocity: THREE.Vector3; age: number; life: number; size: number };

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/**
 * XP bursts for the figure while you do a spam set. When a rep completes the body flares
 * white-hot and cools to orange (glow behind every joint, so it rims the silhouette), a
 * shockwave rolls across the floor, and pixel arrows, sparks and light streaks shoot up.
 * Plain sprites in the scene, so the PSX pass pixelates them with the figure.
 */
export class Aura {
  readonly group = new THREE.Group();
  private glow = glowTexture();
  private arrow = arrowTexture();
  private ringMap = ringTexture();
  private halo = new Map<string, { outer: THREE.Sprite; inner: THREE.Sprite; seed: number }>();
  private arrows: Particle[];
  private sparks: Particle[];
  private streaks: Particle[];
  private ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private ringAge = RING_LIFE;
  private energy = 0;
  private time = 0;
  private joints: Record<string, Vec3> = {};
  private toCamera = new THREE.Vector3();
  private point = new THREE.Vector3();
  private center = new THREE.Vector3();
  private floor = 0;
  private innerColor = new THREE.Color();
  private core: THREE.Color;
  private edge: THREE.Color;
  /** Celebrations burn continuously: flame tongues licking up the silhouette and a steady halo. */
  private sustained: boolean;
  private flames: Particle[] = [];
  private flameDebt = 0;
  private nextFlame = 0;
  private fx: AuraFx;
  /** The pose has been struck (first burst): dust, rocks and lightning run from then on. */
  private fired = false;
  private puffMap?: THREE.Texture;
  private rockMap?: THREE.Texture;
  private dust: Particle[] = [];
  private rocks: Particle[] = [];
  private bolts: { line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>; age: number; life: number }[] = [];
  private dustDebt = 0;
  private rockDebt = 0;

  constructor(kind?: AuraKind, fx: AuraFx = {}) {
    this.fx = fx;
    this.sustained = kind !== undefined;
    this.core = kind ? new THREE.Color(PALETTES[kind][0]) : CORE;
    this.edge = kind ? new THREE.Color(PALETTES[kind][1]) : EDGE;
    const pool = (count: number, material: () => THREE.SpriteMaterial) =>
      Array.from({ length: count }, () => {
        const sprite = new THREE.Sprite(material());
        sprite.visible = false;
        this.group.add(sprite);
        return { sprite, velocity: new THREE.Vector3(), age: 1, life: 1, size: 0 };
      });
    // Arrows are solid pixel art (normal blending keeps the dark outline); the rest is light.
    this.arrows = pool(ARROWS, () => aboveFloor(new THREE.SpriteMaterial({ map: this.arrow, transparent: true, depthWrite: false, opacity: 0 })));
    this.sparks = pool(SPARKS, () => additive(this.glow, this.core));
    this.streaks = pool(STREAKS, () => additive(this.glow, this.core));
    if (this.sustained) this.flames = pool(FLAMES, () => additive(this.glow, this.edge));
    // Dust and rocks are solid (normal blending); they sit in front of the feet like the cels.
    if (fx.dust) {
      const puff = (this.puffMap = puffTexture());
      const rock = (this.rockMap = rockTexture());
      this.dust = pool(DUST, () => aboveFloor(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0 })));
      this.rocks = pool(ROCKS, () => aboveFloor(new THREE.SpriteMaterial({ map: rock, color: '#4a3f33', transparent: true, depthWrite: false, opacity: 0 })));
    }
    if (fx.lightning) {
      for (let i = 0; i < BOLTS; i++) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3));
        const line = new THREE.Line(
          geometry,
          aboveFloor(new THREE.LineBasicMaterial({ color: BOLT_COLOUR, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })),
        );
        line.visible = false;
        line.frustumCulled = false;
        this.group.add(line);
        this.bolts.push({ line, age: 1, life: 1 });
      }
    }
    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.ringMap, color: this.core, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  /** A rep just completed: flare, shockwave, and arrows, sparks and streaks shooting up. */
  burst() {
    const names = Object.keys(this.joints);
    if (!names.length) return;
    this.energy = 1;
    // The first burst of a celebration kicks up a cloud of dust and a spray of rocks.
    if (!this.fired && this.fx.dust) {
      for (let i = 0; i < 22; i++) this.puff(1.6);
      for (let i = 0; i < 10; i++) this.rock();
    }
    this.fired = true;
    this.ringAge = 0;
    this.ring.visible = true;
    this.ring.position.set(this.center.x, this.floor + 0.005, this.center.z);

    // Start around the silhouette: a joint, pushed outward from the body's centre.
    const around = (p: Particle, push: number) => {
      const [x, y, z] = this.joints[names[Math.floor(Math.random() * names.length)]];
      p.sprite.position.set(
        x + (x - this.center.x) * push + (Math.random() - 0.5) * 0.18,
        y + (Math.random() - 0.5) * 0.12,
        z + (z - this.center.z) * push + (Math.random() - 0.5) * 0.18,
      );
      p.sprite.visible = true;
    };
    // Celebrations burn without the XP arrows: the flames are the show.
    if (!this.sustained) this.arrows.forEach((p, i) => {
      around(p, 0.35);
      p.velocity.set(0, 1.5 + Math.random() * 0.5, 0);
      p.age = -i * 0.035; // A quick ripple rather than one sheet.
      p.life = 0.8 + Math.random() * 0.25;
      p.size = 0.1 + Math.random() * 0.05;
    });
    for (const p of this.sparks) {
      around(p, 0.2);
      p.velocity.set((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3);
      p.age = -Math.random() * 0.12;
      p.life = 0.5 + Math.random() * 0.4;
      p.size = 0.035 + Math.random() * 0.035;
    }
    for (const p of this.streaks) {
      around(p, 0.5);
      p.velocity.set(0, 2.4 + Math.random() * 0.8, 0);
      p.age = -Math.random() * 0.1;
      p.life = 0.35 + Math.random() * 0.15;
      p.size = 0.32 + Math.random() * 0.2;
    }
  }

  update(joints: Record<string, Vec3>, camera: THREE.Vector3, delta: number) {
    const dt = Math.min(delta, 0.1);
    this.time += dt;
    this.joints = joints;
    this.energy *= Math.exp(-DECAY * dt);
    // A sustained aura never drops below a pulsing simmer.
    const level = this.sustained ? Math.max(this.energy, 0.5 + 0.12 * Math.sin(this.time * 7)) : this.energy;

    const names = Object.keys(joints);
    this.center.set(0, 0, 0);
    this.floor = Infinity;
    for (const name of names) {
      const [x, y, z] = joints[name];
      this.center.x += x / names.length;
      this.center.y += y / names.length;
      this.center.z += z / names.length;
      this.floor = Math.min(this.floor, y);
    }
    this.floor = Math.max(0, Math.min(this.floor, 0.05));

    // Halo: two layers per joint, pushed back from the camera, white-hot then orange.
    this.innerColor.copy(this.core).lerp(WHITE, this.energy ** 2);
    for (const [k, name] of names.entries()) {
      let glow = this.halo.get(name);
      if (!glow) {
        glow = { outer: new THREE.Sprite(additive(this.glow, this.edge)), inner: new THREE.Sprite(additive(this.glow, this.core)), seed: k * 1.7 };
        this.group.add(glow.outer, glow.inner);
        this.halo.set(name, glow);
      }
      const visible = level > 0.01;
      glow.outer.visible = glow.inner.visible = visible;
      if (!visible) continue;
      const [x, y, z] = joints[name];
      this.point.set(x, y, z);
      this.toCamera.copy(camera).sub(this.point).normalize();
      this.point.addScaledVector(this.toCamera, -BEHIND);
      const flicker = 1 + 0.12 * Math.sin(this.time * 11 + glow.seed);
      const grow = 1 + 0.4 * (1 - level); // Swells outward as it fades.
      glow.outer.position.copy(this.point);
      glow.outer.scale.setScalar(0.52 * flicker * grow);
      glow.inner.position.copy(this.point);
      glow.inner.scale.setScalar(0.27 * flicker * grow);
      (glow.inner.material as THREE.SpriteMaterial).color.copy(this.innerColor);
      (glow.outer.material as THREE.SpriteMaterial).opacity = 0.45 * level;
      (glow.inner.material as THREE.SpriteMaterial).opacity = 0.6 * level;
    }

    if (this.sustained) this.burn(names, camera, dt);
    if (this.fired) this.storm(names, dt);

    // Shockwave: rolls out across the floor and fades.
    if (this.ring.visible) {
      this.ringAge += dt;
      const t = this.ringAge / RING_LIFE;
      if (t >= 1) this.ring.visible = false;
      else {
        this.ring.scale.setScalar(0.3 + 1.5 * (1 - (1 - t) ** 3));
        this.ring.material.opacity = 0.9 * (1 - t);
      }
    }

    // Arrows: pop in, shoot up and slow, fade at the top.
    for (const p of this.arrows) {
      if (!this.live(p, dt)) continue;
      const t = p.age / p.life;
      p.sprite.position.addScaledVector(p.velocity, dt * (1 - t) * 1.6);
      p.sprite.scale.setScalar(p.size * easeOutBack(Math.min(1, t * 5)));
      p.sprite.material.opacity = t > 0.7 ? (1 - t) / 0.3 : 1;
    }
    // Sparks: drift up, twinkle and fade.
    for (const p of this.sparks) {
      if (!this.live(p, dt)) continue;
      const t = p.age / p.life;
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.setScalar(p.size * (1 - t * 0.5) * (0.75 + 0.25 * Math.sin(this.time * 30 + p.size * 400)));
      p.sprite.material.opacity = Math.min(1, t * 8) * (1 - t);
    }
    // Streaks: tall, thin light rising fast.
    for (const p of this.streaks) {
      if (!this.live(p, dt)) continue;
      const t = p.age / p.life;
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.sprite.scale.set(0.035, p.size * (0.6 + 0.4 * t), 1);
      p.sprite.material.opacity = 0.7 * Math.sin(Math.PI * t);
    }
  }

  /**
   * Flame tongues: born around the silhouette just behind the body, they lick upward, narrow
   * and fade, so the figure stands in a rising, flickering envelope. Sparks drift up too.
   */
  private burn(names: string[], camera: THREE.Vector3, dt: number) {
    this.flameDebt += FLAME_RATE * (this.fx.rays ? 1.4 : 1) * dt;
    while (this.flameDebt >= 1 && names.length) {
      this.flameDebt -= 1;
      const p = this.flames[this.nextFlame];
      this.nextFlame = (this.nextFlame + 1) % this.flames.length;
      const [x, y, z] = this.joints[names[Math.floor(Math.random() * names.length)]];
      this.point.set(x + (x - this.center.x) * 0.3 + (Math.random() - 0.5) * 0.16, y - 0.05, z + (z - this.center.z) * 0.3 + (Math.random() - 0.5) * 0.16);
      this.toCamera.copy(camera).sub(this.point).normalize();
      p.sprite.position.copy(this.point).addScaledVector(this.toCamera, -0.08);
      p.sprite.visible = true;
      p.velocity.set((x - this.center.x) * 0.4, 1 + Math.random() * 0.7, (z - this.center.z) * 0.4);
      p.age = 0;
      p.life = 0.4 + Math.random() * 0.3;
      p.size = 0.1 + Math.random() * 0.07;
      (p.sprite.material as THREE.SpriteMaterial).color.copy(Math.random() < 0.3 ? this.core : this.edge);
    }
    for (const p of this.flames) {
      if (!this.live(p, dt)) continue;
      const t = p.age / p.life;
      p.sprite.position.addScaledVector(p.velocity, dt);
      // Rays (the super-saiyan look) stretch into tall spikes.
      p.sprite.scale.set(p.size * (1 - t * 0.7) * (this.fx.rays ? 0.7 : 1), p.size * (2.6 + 1.6 * t) * (this.fx.rays ? 2.4 : 1), 1);
      p.sprite.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.4));
    }
    // A few sparks always drifting up.
    if (Math.random() < dt * 14) {
      const p = this.sparks.find((s) => !s.sprite.visible);
      if (p) {
        const [x, y, z] = this.joints[names[Math.floor(Math.random() * names.length)]];
        p.sprite.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
        p.sprite.visible = true;
        p.velocity.set((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.2);
        p.age = 0;
        p.life = 0.6 + Math.random() * 0.5;
        p.size = 0.03 + Math.random() * 0.03;
      }
    }
  }

  /** A dust puff on the floor around the feet, rolling outward (`force` > 1 for the blast). */
  private puff(force = 1) {
    const p = this.dust.find((d) => !d.sprite.visible) ?? this.dust[Math.floor(Math.random() * this.dust.length)];
    const a = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 0.25;
    p.sprite.position.set(this.center.x + Math.cos(a) * r, this.floor + 0.06 + Math.random() * 0.1, this.center.z + Math.sin(a) * r);
    p.sprite.visible = true;
    const speed = (0.25 + Math.random() * 0.35) * force;
    p.velocity.set(Math.cos(a) * speed, 0.05 + Math.random() * 0.12, Math.sin(a) * speed);
    p.age = 0;
    p.life = 1.2 + Math.random() * 0.8;
    p.size = (0.22 + Math.random() * 0.16) * (force > 1 ? 1.3 : 1);
    p.sprite.material.color.copy(DUST_COLOURS[Math.floor(Math.random() * DUST_COLOURS.length)]);
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
  }

  /** A rock lifted off the floor by the power, drifting up and tumbling. */
  private rock() {
    const p = this.rocks.find((d) => !d.sprite.visible) ?? this.rocks[Math.floor(Math.random() * this.rocks.length)];
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 0.45;
    p.sprite.position.set(this.center.x + Math.cos(a) * r, this.floor + 0.03, this.center.z + Math.sin(a) * r);
    p.sprite.visible = true;
    p.velocity.set((Math.random() - 0.5) * 0.08, 0.3 + Math.random() * 0.45, (Math.random() - 0.5) * 0.08);
    p.age = 0;
    p.life = 1.6 + Math.random() * 1.2;
    p.size = 0.02 + Math.random() * 0.03;
  }

  /**
   * After the pose is struck: dust keeps billowing at the feet, rocks float up, and
   * SSJ2-style lightning crackles over the body in short jagged bolts.
   */
  private storm(names: string[], dt: number) {
    if (this.fx.dust) {
      this.dustDebt += 7 * dt;
      while (this.dustDebt >= 1) {
        this.dustDebt -= 1;
        this.puff();
      }
      this.rockDebt += 5 * dt;
      while (this.rockDebt >= 1) {
        this.rockDebt -= 1;
        this.rock();
      }
      for (const p of this.dust) {
        if (!this.live(p, dt)) continue;
        const t = p.age / p.life;
        p.velocity.multiplyScalar(Math.exp(-1.6 * dt));
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.sprite.scale.setScalar(p.size * (0.7 + 1.1 * (1 - (1 - t) ** 2)));
        p.sprite.material.opacity = 0.9 * Math.min(1, t * 6) * (1 - t) ** 0.8;
      }
      for (const p of this.rocks) {
        if (!this.live(p, dt)) continue;
        const t = p.age / p.life;
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.sprite.material.rotation += dt * 3;
        p.sprite.scale.setScalar(p.size);
        p.sprite.material.opacity = Math.min(1, t * 8) * (t > 0.75 ? (1 - t) / 0.25 : 1);
      }
    }
    if (this.fx.lightning && names.length) {
      for (const bolt of this.bolts) {
        if (bolt.line.visible) {
          bolt.age += dt;
          if (bolt.age >= bolt.life) bolt.line.visible = false;
          // Flickers while it lives.
          else bolt.line.material.opacity = Math.random() < 0.25 ? 0.25 : 1;
        } else if (Math.random() < dt * 5) {
          this.strike(bolt, names);
        }
      }
    }
  }

  /** A jagged bolt between two points just outside the body. */
  private strike(bolt: (typeof this.bolts)[number], names: string[]) {
    const pick = () => {
      const [x, y, z] = this.joints[names[Math.floor(Math.random() * names.length)]];
      return new THREE.Vector3(x + (x - this.center.x) * 0.25, y + (Math.random() - 0.5) * 0.1, z + (z - this.center.z) * 0.25);
    };
    const a = pick();
    const b = pick();
    if (a.distanceTo(b) < 0.25) b.y += 0.3;
    const positions = bolt.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const jag = a.distanceTo(b) * 0.18;
    for (let i = 0; i < BOLT_POINTS; i++) {
      const t = i / (BOLT_POINTS - 1);
      const kink = i === 0 || i === BOLT_POINTS - 1 ? 0 : jag;
      positions.setXYZ(
        i,
        a.x + (b.x - a.x) * t + (Math.random() - 0.5) * kink,
        a.y + (b.y - a.y) * t + (Math.random() - 0.5) * kink,
        a.z + (b.z - a.z) * t + (Math.random() - 0.5) * kink,
      );
    }
    positions.needsUpdate = true;
    bolt.line.visible = true;
    bolt.line.material.opacity = 1;
    bolt.age = 0;
    bolt.life = 0.08 + Math.random() * 0.1;
  }

  /** Advance a particle; false while waiting to start or once it has ended. */
  private live(p: Particle, dt: number): boolean {
    if (!p.sprite.visible) return false;
    p.age += dt;
    if (p.age >= p.life) {
      p.sprite.visible = false;
      return false;
    }
    if (p.age < 0) {
      p.sprite.material.opacity = 0;
      return false;
    }
    return true;
  }

  dispose() {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.material) (mesh.material as THREE.Material).dispose();
    });
    this.ring.geometry.dispose();
    for (const bolt of this.bolts) bolt.line.geometry.dispose();
    this.puffMap?.dispose();
    this.rockMap?.dispose();
    this.glow.dispose();
    this.arrow.dispose();
    this.ringMap.dispose();
  }
}
