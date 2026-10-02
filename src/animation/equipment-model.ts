/**
 * Equipment around the figure, as on the watch (render.py): round bars for the pull-up bar,
 * doorframe, chair frame and band, flat slabs for the chair seat and wall, and dumbbells with
 * orange plates. Every piece has the same thin black outline as the figure.
 */
import * as THREE from 'three';

import { Chain, lambert, Solid } from './parts';
import type { Shape, Vec3 } from './types';

const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
const UP = new THREE.Vector3(0, 1, 0);

/** Dumbbell proportions from render.py: handle stroke 0.04 m, plates 0.128 m across and 0.056 m thick. */
const DUMBBELL = { handle: 0.04, plate: 0.064, plateThick: 0.056, plateOffset: 0.01, handleColor: '#aaa99f' };

type Item = { update(shape: Shape, figureCenter: THREE.Vector3): void };

/** Any unit vector perpendicular to `axis`. */
function perpendicular(axis: THREE.Vector3): THREE.Vector3 {
  const helper = Math.abs(axis.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(axis, helper).normalize();
}

function tubeItem(parent: THREE.Object3D, count: number, radius: number, color: string): Item {
  const chain = new Chain(parent, Array(count).fill(radius * 2), lambert(color));
  return {
    update(shape) {
      if (shape.kind === 'tube') chain.update(shape.points.map(v));
    },
  };
}

function slabItem(parent: THREE.Object3D, color: string): Item {
  const slab = new Solid(parent, new THREE.BoxGeometry(1, 1, 1), lambert(color), [1.01, 1.2, 1.01]);
  return {
    update(shape, figureCenter) {
      if (shape.kind !== 'slab') return;
      const [c0, c1, , c3] = shape.corners.map(v);
      const along = c1.clone().sub(c0);
      const across = c3.clone().sub(c0);
      const x = along.clone().normalize();
      const z = across.clone().normalize();
      const y = new THREE.Vector3().crossVectors(z, x).normalize();
      const center = shape.corners.map(v).reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(4);
      // The authored corners are the surface the body touches: a seat's top, a wall's face.
      // The thickness goes below a seat, and behind a wall (away from the figure).
      const away = Math.abs(y.y) > 0.7 ? new THREE.Vector3(0, -1, 0) : center.clone().sub(figureCenter);
      if (y.dot(away) < 0) y.negate();
      center.addScaledVector(y, shape.thickness / 2);
      slab.place(center, x, y, new THREE.Vector3().crossVectors(x, y), [along.length(), shape.thickness, across.length()]);
    },
  };
}

function dumbbellItem(parent: THREE.Object3D, color: string): Item {
  const handle = new Chain(parent, [DUMBBELL.handle, DUMBBELL.handle], lambert(DUMBBELL.handleColor));
  const plate = new THREE.CylinderGeometry(DUMBBELL.plate, DUMBBELL.plate, DUMBBELL.plateThick, 24);
  const material = lambert(color);
  const plates = [0, 1].map(() => new Solid(parent, plate, material, [1.08, 1.2, 1.08]));
  return {
    update(shape) {
      if (shape.kind !== 'dumbbell') return;
      const [a, b] = shape.handle.map(v);
      handle.update([a, b]);
      const axis = b.clone().sub(a).normalize();
      const x = perpendicular(axis);
      const z = new THREE.Vector3().crossVectors(x, axis);
      plates[0].place(a.clone().addScaledVector(axis, -DUMBBELL.plateOffset), x, axis, z);
      plates[1].place(b.clone().addScaledVector(axis, DUMBBELL.plateOffset), x, axis, z);
    },
  };
}

export class EquipmentModel {
  readonly group = new THREE.Group();
  private key = '';
  private items: Item[] = [];

  /** Rebuild only when the set of pieces changes (a different clip); otherwise just move them. */
  update(shapes: Shape[], figureCenter: THREE.Vector3) {
    const key = shapes
      .map((s) => (s.kind === 'tube' ? `t${s.points.length}:${s.radius}:${s.color}` : `${s.kind}:${s.color}`))
      .join('|');
    if (key !== this.key) {
      this.clear();
      this.key = key;
      this.items = shapes.map((s) =>
        s.kind === 'tube'
          ? tubeItem(this.group, s.points.length, s.radius, s.color)
          : s.kind === 'slab'
            ? slabItem(this.group, s.color)
            : dumbbellItem(this.group, s.color),
      );
    }
    shapes.forEach((shape, i) => this.items[i].update(shape, figureCenter));
  }

  private clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    this.items = [];
  }
}
