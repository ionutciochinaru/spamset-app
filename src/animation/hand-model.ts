/**
 * Stylised mitten hands (no separate fingers): a rounded palm, a mitten block
 * that curls with the grip, and a thumb. Every hand is oriented from anatomy
 * rather than world axes, so it never flips between frames:
 * - free: palm toward the body's midline, thumb forward, mitten relaxed;
 * - floor: palm flat on the floor, thumb out;
 * - grip: palm against the handle or horn, the mitten wrapped around it, the thumb
 *   closing over it from the other side.
 * The state comes from the exported clip (which hand holds which bell), not from
 * a distance threshold, so it cannot flicker.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { Solid } from './parts';
import type { HandState } from './types';

export type Grip = {
  point: THREE.Vector3;
  /** Unit direction of the gripped bar (handle or horn). */
  axis: THREE.Vector3;
  /** Hands on the horns face the bell; on the handle the grip is overhand. */
  horn: boolean;
  /** Both hands share the handle (swing, deadlift, upright row). */
  twoHand: boolean;
  center: THREE.Vector3;
  /** Where the thumb points along the bar: +1 along `axis`, -1 against it. */
  thumb: 1 | -1;
  /** Explicit palm facing (hanging bar: forward overhand, backward underhand). */
  palm?: THREE.Vector3;
};

export type HandInput = {
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  palm: THREE.Vector3;
  /** Unit vector from the body's midline out toward this hand's side. */
  lateral: THREE.Vector3;
  /** The body's left direction (the same for both hands). */
  left: THREE.Vector3;
  /** The body's forward direction. */
  anterior: THREE.Vector3;
  state: HandState;
  grip?: Grip;
  /** For a flat hand: unit normal of the surface it presses (default: the floor, up). */
  surface?: THREE.Vector3;
};

const PALM = { width: 0.078, length: 0.074, thick: 0.03 };
const MITTEN = { width: 0.074, length: 0.066, thick: 0.026 };
const THUMB = { radius: 0.0115, length: 0.036 };
const BAR = 0.017; // handle radius

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * The front (flexor) surface of the forearm, the same rule for both arms: it faces the upper
 * arm when the elbow is bent, and for a straight arm it turns with the arm's elevation
 * (forward when hanging, back when overhead). Never degenerate, so hands cannot flip.
 */
function forearmFront({ shoulder, elbow, wrist, left }: HandInput): THREE.Vector3 {
  const f = wrist.clone().sub(elbow).normalize();
  const bend = flatten(shoulder.clone().sub(elbow).normalize(), f);
  const lift = flatten(new THREE.Vector3().crossVectors(f, left), f).normalize();
  return bend.addScaledVector(lift, 0.35).normalize();
}

/** v with its component along n removed. */
function flatten(v: THREE.Vector3, n: THREE.Vector3): THREE.Vector3 {
  return v.clone().addScaledVector(n, -v.dot(n));
}

export class HandModel {
  private palm: Solid;
  private mitten: Solid;
  private wrap: Solid;
  private thumb: Solid;

  constructor(parent: THREE.Object3D, material: THREE.Material) {
    const box = new RoundedBoxGeometry(1, 1, 1, 3, 0.32);
    this.palm = new Solid(parent, box, material, [1.14, 1.12, 1.36]);
    this.mitten = new Solid(parent, box, material, [1.14, 1.12, 1.4]);
    // Mitten wrapped around a bar: part of a torus, widened along the bar.
    this.wrap = new Solid(parent, new THREE.TorusGeometry(BAR + MITTEN.thick / 2, MITTEN.thick / 2, 10, 24, Math.PI * 1.2),
      material, [1.1, 1.1, 1.08]);
    this.thumb = new Solid(parent, new THREE.CapsuleGeometry(THUMB.radius, THUMB.length, 6, 12), material, [1.4, 1.2, 1.4]);
  }

  update(input: HandInput) {
    if (input.state === 1 && input.grip) this.gripped(input, input.grip);
    else this.open(input);
  }

  /** Free, flat or fisted hand. */
  private open({ elbow, wrist, palm, lateral, anterior, state, surface }: HandInput) {
    const floor = state === 2;
    const fist = state === 3;
    // Flat hands press into their surface: the floor, or a wall (wall push-up).
    const into = surface ? surface.clone().negate() : DOWN.clone();
    const forearm = wrist.clone().sub(elbow).normalize();
    // A fist keeps the wrist straight: the knuckles continue the forearm.
    let y = fist ? forearm.clone() : palm.clone().sub(wrist);
    if (y.lengthSq() < 1e-4) y = forearm.clone();
    if (floor) y = flatten(y, into);
    if (floor && y.lengthSq() < 1e-6) y = flatten(forearm, into);
    y.normalize();

    // Palm normal: into the surface, otherwise toward the midline (a relaxed, neutral hand),
    // nudged backward so it stays defined when the hand points sideways.
    // A fist turns palm-down as the arm extends into a punch (palms in at the guard).
    const reach = fist ? THREE.MathUtils.clamp(forearm.dot(anterior), 0, 1) : 0;
    const want = floor
      ? into
      : lateral.clone().negate().addScaledVector(anterior, -0.25).multiplyScalar(1 - reach).addScaledVector(DOWN, reach);
    let z = flatten(want, y);
    if (z.lengthSq() < 1e-6) z = flatten(anterior.clone().negate(), y);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    // Thumb on the forward side of the hand (radial side of a neutral forearm).
    const s = x.dot(anterior) >= 0 ? 1 : -1;

    if (fist) {
      // One compact rounded block (palm with the fingers rolled into it), thumb tucked flat
      // across the front of the fingers. Separate folded fingers read as an open hand.
      const block = { length: PALM.length * 0.92, thick: PALM.thick * 1.9 };
      const center = wrist.clone().addScaledVector(y, block.length / 2 + 0.006).addScaledVector(z, PALM.thick * 0.35);
      this.palm.place(center, x, y, z, [PALM.width, block.length, block.thick]);
      this.mitten.visible = false;
      this.wrap.visible = false;
      const s = x.dot(anterior) >= 0 ? 1 : -1;
      const front = center.clone().addScaledVector(z, block.thick / 2 + THUMB.radius * 0.3).addScaledVector(y, block.length * 0.12);
      this.placeThumb(front.clone().addScaledVector(x, s * PALM.width * 0.4), x.clone().multiplyScalar(-s), PALM.width * 0.55);
      return;
    }
    const palmCenter = wrist.clone().addScaledVector(y, PALM.length / 2 + 0.006);
    // A hand flat on the floor rests on it: the exported wrist sits ~5 cm up, which left the
    // palm hovering. Drop palm, fingers and thumb together onto the floor plane.
    // Fades out as a lifting hand rises (a hard switch made the hand jump ~4 cm when it left
    // or met the floor).
    const drop = new THREE.Vector3();
    if (!surface) {
      const near = floor ? 1 : 1 - THREE.MathUtils.smoothstep(wrist.y, 0.06, 0.14);
      drop.y = Math.min(0, PALM.thick / 2 + 0.002 - palmCenter.y) * near;
    }
    palmCenter.add(drop);
    this.palm.place(palmCenter, x, y, z, [PALM.width, PALM.length, PALM.thick]);

    // Mitten hinged at the knuckles, curled toward the palm (relaxed) or flat (on the floor).
    const curl = floor ? 0.05 : 0.55;
    const knuckles = wrist.clone().addScaledVector(y, PALM.length + 0.004).add(drop);
    const my = y.clone().multiplyScalar(Math.cos(curl)).addScaledVector(z, Math.sin(curl));
    const mz = z.clone().multiplyScalar(Math.cos(curl)).addScaledVector(y, -Math.sin(curl));
    this.mitten.place(knuckles.clone().addScaledVector(my, MITTEN.length / 2 - 0.006), x, my, mz,
      [MITTEN.width, MITTEN.length, MITTEN.thick]);
    this.mitten.visible = true;
    this.wrap.visible = false;

    // Thumb from the base of the palm, forward and a little across the palm.
    const base = wrist.clone().addScaledVector(y, 0.022).addScaledVector(x, s * PALM.width * 0.42).addScaledVector(z, 0.004).add(drop);
    const dir = y.clone().multiplyScalar(floor ? 0.55 : 0.75).addScaledVector(x, s * (floor ? 0.8 : 0.35))
      .addScaledVector(z, floor ? 0 : 0.45).normalize();
    this.placeThumb(base, dir);
  }

  /** Hand closed around a handle or horn. */
  private gripped(input: HandInput, grip: Grip) {
    const { elbow, wrist } = input;
    const a = grip.axis.clone().normalize();
    // Hand direction: from the wrist to the bar, across the bar. When the wrist itself sits on
    // the bar, continue the forearm instead.
    let y = flatten(grip.point.clone().sub(wrist), a);
    if (y.length() < 0.03) y = flatten(wrist.clone().sub(elbow), a);
    y.normalize();
    // Palm normal: toward the bell for horns; overhand on the handle, the back of the hand
    // facing the front of the forearm.
    let z = new THREE.Vector3().crossVectors(y, a).normalize();
    // Horns: palms toward the bell. Two hands on the handle: overhand, palms toward the body
    // (and down when the arms are out in front) in every pose, so they never flip. One hand:
    // the back of the hand faces the front of the forearm (it turns over for the rack/lockout).
    const want = grip.palm
      ? grip.palm.clone()
      : grip.horn
      ? grip.center.clone().sub(grip.point)
      : grip.twoHand
        ? input.anterior.clone().negate().addScaledVector(DOWN, 0.4)
        : forearmFront(input).negate();
    if (z.dot(want) < 0) z.negate();
    const x = new THREE.Vector3().crossVectors(y, z); // along the bar (±a)

    // The bar lies against the far end of the palm. When the wrist is a hand-length from the
    // bar, the palm spans from the wrist to the bar, so hand and forearm stay joined.
    const barSide = grip.point.clone().addScaledVector(z, -(PALM.thick / 2 + BAR));
    let palmCenter = barSide.clone().addScaledVector(y, -(PALM.length / 2 - 0.014));
    let palmLength = PALM.length;
    const span = barSide.clone().sub(wrist);
    if (span.dot(y) > 0.03) {
      palmLength = span.length() + 0.014;
      palmCenter = wrist.clone().addScaledVector(span.normalize(), palmLength / 2);
    }
    this.palm.place(palmCenter, x, y, z, [PALM.width, palmLength, PALM.thick]);

    // Mitten wrapped over the far side of the bar: the torus arc starts at the palm side (-z)
    // and sweeps over the fingertip side (+y) around to the front (+z).
    const tx = z.clone().negate();
    const ty = y.clone();
    const tz = new THREE.Vector3().crossVectors(tx, ty);
    this.wrap.place(grip.point, tx, ty, tz, [1, 1, MITTEN.width / MITTEN.thick]);
    this.wrap.visible = true;
    this.mitten.visible = false;

    // Thumb closes over the front of the bar from the thumb side.
    const s = grip.thumb * (x.dot(a) >= 0 ? 1 : -1);
    const base = palmCenter.clone().addScaledVector(x, s * PALM.width * 0.45).addScaledVector(y, -0.012);
    const tip = grip.point.clone().addScaledVector(z, BAR + THUMB.radius * 0.6).addScaledVector(x, s * 0.012);
    const reach = base.distanceTo(tip);
    this.placeThumb(base, tip.clone().sub(base).normalize(), reach);
  }

  private placeThumb(base: THREE.Vector3, dir: THREE.Vector3, length = THUMB.length + THUMB.radius * 2) {
    const side = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tx = new THREE.Vector3().crossVectors(dir, side).normalize();
    const tz = new THREE.Vector3().crossVectors(tx, dir);
    const stretch = Math.max(0.6, length / (THUMB.length + THUMB.radius * 2));
    this.thumb.place(base.clone().addScaledVector(dir, length / 2), tx, dir, tz, [1, stretch, 1]);
  }
}
