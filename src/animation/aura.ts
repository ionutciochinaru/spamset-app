import * as THREE from 'three';

import type { Vec3 } from './types';

/** Power-up colours: HUD yellow at the core, the shirt's orange at the edge. */
const CORE = new THREE.Color('#ffd23f');
const EDGE = new THREE.Color('#ff6b2b');

const SPARKS = 32;
/** How far behind each joint (m, away from the camera) the glow sits, so the body occludes it. */
const BEHIND = 0.14;

/** A soft round falloff, white, for additive sprites (no DOM canvas on native). */
function glowTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(0, 1 - d) ** 2;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function additive(map: THREE.Texture, color: THREE.Color, opacity: number) {
  return new THREE.SpriteMaterial({
    map,
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

type Spark = { sprite: THREE.Sprite; velocity: THREE.Vector3; age: number; life: number };

/**
 * A charging-up aura for the figure while you do a spam set: flickering glow behind every
 * joint (so it rims the silhouette) and yellow sparks rising off the body, like XP going up.
 * Plain sprites in the scene, so the PSX pass pixelates them with the figure.
 */
export class Aura {
  readonly group = new THREE.Group();
  private texture = glowTexture();
  private halo = new Map<string, { outer: THREE.Sprite; inner: THREE.Sprite; seed: number }>();
  private sparks: Spark[] = [];
  private time = 0;
  private toCamera = new THREE.Vector3();
  private point = new THREE.Vector3();

  constructor() {
    for (let i = 0; i < SPARKS; i++) {
      const sprite = new THREE.Sprite(additive(this.texture, CORE, 0));
      sprite.visible = false;
      this.group.add(sprite);
      // Staggered so they don't all start together.
      this.sparks.push({ sprite, velocity: new THREE.Vector3(), age: 1, life: Math.random() });
    }
  }

  update(joints: Record<string, Vec3>, camera: THREE.Vector3, delta: number) {
    const dt = Math.min(delta, 0.1);
    this.time += dt;
    const names = Object.keys(joints);
    if (!names.length) return;

    // Glow: two layers per joint, pushed back from the camera, flickering.
    for (const [k, name] of names.entries()) {
      let glow = this.halo.get(name);
      if (!glow) {
        glow = {
          outer: new THREE.Sprite(additive(this.texture, EDGE, 0.32)),
          inner: new THREE.Sprite(additive(this.texture, CORE, 0.38)),
          seed: k * 1.7,
        };
        this.group.add(glow.outer, glow.inner);
        this.halo.set(name, glow);
      }
      const [x, y, z] = joints[name];
      this.point.set(x, y, z);
      this.toCamera.copy(camera).sub(this.point).normalize();
      this.point.addScaledVector(this.toCamera, -BEHIND);
      const flicker = 1 + 0.12 * Math.sin(this.time * 11 + glow.seed) + 0.06 * Math.sin(this.time * 23 + glow.seed * 2);
      glow.outer.position.copy(this.point);
      glow.outer.scale.setScalar(0.5 * flicker);
      glow.inner.position.copy(this.point);
      glow.inner.scale.setScalar(0.26 * flicker);
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 4);
      (glow.outer.material as THREE.SpriteMaterial).opacity = 0.3 * pulse;
      (glow.inner.material as THREE.SpriteMaterial).opacity = 0.34 * pulse;
    }

    // Sparks: rise from a random joint, drift, fade and shrink.
    for (const spark of this.sparks) {
      spark.age += dt;
      if (spark.age >= spark.life) {
        const [x, y, z] = joints[names[Math.floor(Math.random() * names.length)]];
        spark.sprite.position.set(x + (Math.random() - 0.5) * 0.25, y + (Math.random() - 0.5) * 0.15, z + (Math.random() - 0.5) * 0.25);
        spark.velocity.set((Math.random() - 0.5) * 0.12, 0.45 + Math.random() * 0.5, (Math.random() - 0.5) * 0.12);
        spark.age = 0;
        spark.life = 0.6 + Math.random() * 0.7;
        spark.sprite.visible = true;
      }
      const t = spark.age / spark.life;
      spark.sprite.position.addScaledVector(spark.velocity, dt);
      spark.sprite.scale.setScalar(0.07 * (1 - t * 0.6));
      (spark.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * t) * 0.95;
    }
  }

  dispose() {
    this.group.traverse((object) => {
      if ((object as THREE.Sprite).isSprite) ((object as THREE.Sprite).material as THREE.Material).dispose();
    });
    this.texture.dispose();
  }
}
