/**
 * The watch stick figure, built in 3D. Proportions, widths and colours follow
 * tools/animation/render.py: tapered limbs, the orange "dorito" shirt, pants
 * with cuffs, rounded shoes, a low-poly faceted head and a sloped kettlebell, all
 * with a thin black outline. As on the watch, the side nearer the camera is
 * drawn in ivory and the far side in grey; here that follows the orbit live.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

import { EquipmentModel } from './equipment-model';
import { HandModel, type Grip } from './hand-model';
import { HeadModel } from './head-model';
import { KettlebellModel } from './kettlebell-model';
import { Chain, lambert, outlineMaterial, Solid } from './parts';
import type { Pose, Vec3 } from './types';

export const FIGURE_COLORS = {
  ink: '#eeede4',
  far: '#8e9186',
  pants: '#bcc0ae',
  pantsFar: '#7f887a',
  cuff: '#7f887a',
  cuffFar: '#586152',
  accent: '#ff6b2b',
  bell: '#b4b1a6',
  prop: '#aaa99f',
  ground: '#191917',
  outline: '#000000',
};

const SIDES = ['l', 'r'] as const;
type Side = (typeof SIDES)[number];

const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
const mix = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);

/** Shoe profile from render.py, in a heel-origin frame: X across, Y up from sole, Z toward the toe. */
function shoeGeometry(length: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const profile: [number, number, number][] = [
    [0, 0.025, 0.025], [0.1, 0.045, 0.039], [0.46, 0.05, 0.046],
    [0.76, 0.06, 0.032], [0.9, 0.051, 0.024], [0.98, 0.028, 0.015], [1, 0.004, 0.01],
  ];
  for (const [t, width, height] of profile) {
    for (const sign of [-1, 1]) {
      points.push(new THREE.Vector3(width * sign, 0, t * length), new THREE.Vector3(width * sign, height, t * length));
    }
  }
  // Instep: the ankle sits 0.075 m forward of the heel, 0.085 m above the sole.
  for (const sign of [-1, 1]) points.push(new THREE.Vector3(0.034 * sign, 0.012 + 0.07, 0.075));
  return new ConvexGeometry(points);
}

type SideParts = {
  leg: Chain;
  cuff: Chain;
  arm: Chain;
  hand: HandModel;
  shoe: Solid;
  materials: { limb: THREE.MeshLambertMaterial; pants: THREE.MeshLambertMaterial; cuff: THREE.MeshLambertMaterial };
};


export class Figure {
  readonly group = new THREE.Group();
  private sides = {} as Record<Side, SideParts>;
  private waist: Chain;
  private neck: Chain;
  private head: HeadModel;
  private shirt: THREE.Mesh;
  private shirtOutline: THREE.Mesh;
  private bells: KettlebellModel[] = [];
  private equipment = new EquipmentModel();
  private colors = {
    ink: new THREE.Color(FIGURE_COLORS.ink),
    far: new THREE.Color(FIGURE_COLORS.far),
    pants: new THREE.Color(FIGURE_COLORS.pants),
    pantsFar: new THREE.Color(FIGURE_COLORS.pantsFar),
    cuff: new THREE.Color(FIGURE_COLORS.cuff),
    cuffFar: new THREE.Color(FIGURE_COLORS.cuffFar),
  };

  constructor() {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64), new THREE.MeshBasicMaterial({ color: FIGURE_COLORS.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.002;
    this.group.add(ground);

    const pants = lambert(FIGURE_COLORS.pants);
    this.waist = new Chain(this.group, [0.07, 0.07], pants, false);
    for (const side of SIDES) {
      const materials = { limb: lambert(FIGURE_COLORS.ink), pants: lambert(FIGURE_COLORS.pants), cuff: lambert(FIGURE_COLORS.cuff) };
      this.sides[side] = {
        materials,
        leg: new Chain(this.group, [0.14, 0.146, 0.108, 0.079], materials.pants),
        cuff: new Chain(this.group, [0.088, 0.079], materials.cuff, false),
        // Strong upper arms taper through the elbow into slender forearms.
        arm: new Chain(this.group, [0.098, 0.12, 0.068, 0.038], materials.limb),
        hand: new HandModel(this.group, materials.limb),
        shoe: new Solid(this.group, shoeGeometry(0.235), materials.limb, [1.18, 1.25, 1.06]),
      };
    }
    const ink = lambert(FIGURE_COLORS.ink);
    this.neck = new Chain(this.group, [0.048, 0.048], ink, false);
    this.head = new HeadModel(this.group, ink);

    const shirtMaterial = lambert(FIGURE_COLORS.accent);
    this.shirt = new THREE.Mesh(new THREE.BufferGeometry(), shirtMaterial);
    this.shirtOutline = new THREE.Mesh(this.shirt.geometry, outlineMaterial);
    this.group.add(this.shirt, this.shirtOutline);

    for (let i = 0; i < 2; i++) this.bells.push(new KettlebellModel(this.group));
    this.group.add(this.equipment.group);
  }

  /** Pose the figure. `camera` is the eye position, for near/far side shading. */
  update(pose: Pose, camera: THREE.Vector3) {
    const j = Object.fromEntries(Object.entries(pose.joints).map(([k, p]) => [k, v(p)])) as Record<string, THREE.Vector3>;
    const trunkUp = j.chest.clone().sub(j.pelvis).normalize();
    const sideways = j.shoulder_l.clone().sub(j.shoulder_r).normalize();
    const forward = new THREE.Vector3().crossVectors(sideways, trunkUp).normalize();
    const offset = (p: THREE.Vector3, side = 0, along = 0, front = 0) =>
      p.clone().addScaledVector(sideways, side).addScaledVector(trunkUp, along).addScaledVector(forward, front);

    // Near side ivory, far side grey, blended over ~10 cm of depth difference.
    const depth = (p: THREE.Vector3) => -p.distanceTo(camera);
    const nearness = depth(j.shoulder_l) + depth(j.hip_l) - depth(j.shoulder_r) - depth(j.hip_r);
    const leftNear = THREE.MathUtils.smoothstep(nearness, -0.1, 0.1);

    this.waist.update([offset(j.hip_l, 0, 0.012), offset(j.hip_r, 0, 0.012)]);
    for (const side of SIDES) {
      const parts = this.sides[side];
      const t = side === 'l' ? leftNear : 1 - leftNear;
      parts.materials.limb.color.lerpColors(this.colors.far, this.colors.ink, t);
      parts.materials.pants.color.lerpColors(this.colors.pantsFar, this.colors.pants, t);
      parts.materials.cuff.color.lerpColors(this.colors.cuffFar, this.colors.cuff, t);

      const [hip, knee, ankle] = [j[`hip_${side}`], j[`knee_${side}`], j[`ankle_${side}`]];
      const cuffEnd = mix(ankle, knee, 0.11);
      parts.leg.update([hip, mix(hip, knee, 0.38), knee, cuffEnd]);
      parts.cuff.update([mix(ankle, knee, 0.2), cuffEnd]);

      const [shoulder, elbow, wrist, palm] = [j[`shoulder_${side}`], j[`elbow_${side}`], j[`wrist_${side}`], j[`palm_${side}`]];
      parts.arm.update([shoulder, mix(shoulder, elbow, 0.43), elbow, wrist]);
      const lateral = j[`shoulder_${side}`].clone().sub(j.chest).normalize();
      const state = pose.hands?.[side] ?? 0;
      parts.hand.update({
        shoulder, elbow, wrist, palm, lateral, left: sideways, anterior: forward, state,
        grip: state === 1 ? this.gripFor(side, pose, forward) : undefined,
      });

      const heel = j[`heel_${side}`];
      const along = j[`toe_${side}`].clone().sub(heel).normalize();
      const normal = new THREE.Vector3().crossVectors(along, new THREE.Vector3(1, 0, 0)).normalize();
      const across = new THREE.Vector3().crossVectors(normal, along);
      parts.shoe.place(heel, across, normal, along);
    }

    this.updateShirt(j, offset);
    this.neck.update([mix(j.chest, j.neck, 0.66), mix(j.neck, j.head, 0.36)]);

    // Faceted head facing the authored gaze.
    const headUp = j.head.clone().sub(j.neck).normalize();
    const headFront = j.face.clone().sub(j.head);
    headFront.addScaledVector(headUp, -headFront.dot(headUp)).normalize();
    const headSide = new THREE.Vector3().crossVectors(headUp, headFront);
    this.head.place(j.head.clone().addScaledVector(headFront, -0.004), headSide, headUp, headFront);

    this.equipment.update(pose.equipment ?? [], j.pelvis);

    this.bells.forEach((model, i) => {
      const bell = pose.bells[i];
      model.visible = !!bell;
      if (!bell) return;
      model.place({
        center: v(bell.center),
        handle: [v(bell.handle[0]), v(bell.handle[1])],
        radius: bell.radius,
        horns: bell.horns ? [v(bell.horns[0]), v(bell.horns[1])] : undefined,
      });
    });
  }

  /** The bar this hand holds (exported grip point) and its direction. */
  private gripFor(side: Side, pose: Pose, forward: THREE.Vector3): Grip | undefined {
    const bar = pose.barGrips?.[side];
    if (bar) {
      // Pull-up bar, doorframe, dumbbell or band. On a hanging bar the palms face forward
      // (overhand) or toward the face (underhand).
      const point = v(bar.point);
      return {
        point, axis: v(bar.axis).normalize(), horn: false, twoHand: false, center: point, thumb: 1,
        palm: bar.facing ? forward.clone().multiplyScalar(bar.facing) : undefined,
      };
    }
    for (const bell of pose.bells) {
      const held = bell.grips?.[side];
      if (!held) continue;
      const point = v(held);
      const [h0, h1] = bell.handle.map(v);
      const bars: { a: THREE.Vector3; b: THREE.Vector3; horn: boolean }[] = [{ a: h0, b: h1, horn: false }];
      if (bell.horns) bars.push({ a: v(bell.horns[0]), b: h0, horn: true }, { a: v(bell.horns[1]), b: h1, horn: true });
      let best = bars[0];
      let bestDistance = Infinity;
      for (const bar of bars) {
        const distance = new THREE.Line3(bar.a, bar.b).closestPointToPoint(point, true, new THREE.Vector3()).distanceTo(point);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = bar;
        }
      }
      const axis = best.b.clone().sub(best.a).normalize();
      const center = v(bell.center);
      if (best.horn) {
        // Hands on the horns: palms toward the bell, thumbs up toward the handle.
        return { point, axis, horn: true, twoHand: true, center, thumb: 1 };
      }
      // Overhand on the handle; thumbs toward the other hand (the handle's middle).
      const middle = h0.clone().add(h1).multiplyScalar(0.5);
      const thumb = middle.clone().sub(point).dot(axis) >= 0 ? 1 : -1;
      const twoHand = Object.keys(bell.grips ?? {}).length === 2;
      return { point, axis, horn: false, twoHand, center, thumb };
    }
    return undefined;
  }

  private updateShirt(j: Record<string, THREE.Vector3>, offset: (p: THREE.Vector3, side?: number, along?: number, front?: number) => THREE.Vector3) {
    // Broad orange shoulders narrowing to the waist.
    const points: THREE.Vector3[] = [];
    for (const front of [-1, 1]) {
      points.push(
        offset(j.chest, 0.05, 0.08, 0.055 * front),
        offset(j.chest, -0.05, 0.08, 0.055 * front),
        offset(j.shoulder_l, -0.018, 0.01, 0.076 * front),
        offset(j.shoulder_r, 0.018, 0.01, 0.076 * front),
        offset(j.pelvis, 0.065, 0.02, 0.043 * front),
        offset(j.pelvis, -0.065, 0.02, 0.043 * front),
      );
    }
    const old = this.shirt.geometry;
    const geometry = new ConvexGeometry(points);
    this.shirt.geometry = geometry;
    this.shirtOutline.geometry = geometry;
    old.dispose();
    const centroid = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
    this.shirtOutline.position.copy(centroid).multiplyScalar(1 - 1.06);
    this.shirtOutline.scale.setScalar(1.06);
  }

  dispose() {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  }
}
