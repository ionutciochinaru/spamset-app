/**
 * Cast-iron kettlebell: flat base, round body, horns rising from the shoulders
 * into a round handle. Built in the bell's own frame (X across the handle,
 * Y from the body centre toward the handle, Z depth) from the clip's centre,
 * handle points and radius, so it follows every authored or simulated pose.
 */
import * as THREE from 'three';

import { outlineMaterial, Solid } from './parts';

const HANDLE_RADIUS = 0.017;
const HANDLE_OUTLINE = 0.004;

// Lighter iron: the darker #55534e merged into the near-black background.
export const BELL_COLORS = { iron: '#7c7a72' };

/** Unit-radius body profile (x = radius, y = height), flat base at y = -0.8. */
function bodyGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, -0.8), new THREE.Vector2(0.5, -0.8), new THREE.Vector2(0.6, -0.79)];
  for (let deg = -50; deg <= 78; deg += 8) {
    const a = THREE.MathUtils.degToRad(deg);
    profile.push(new THREE.Vector2(Math.cos(a), Math.sin(a)));
  }
  profile.push(new THREE.Vector2(0.12, 0.99), new THREE.Vector2(0, 1));
  const geometry = new THREE.LatheGeometry(profile, 36);
  geometry.computeVertexNormals();
  return geometry;
}

export type BellPose = {
  center: THREE.Vector3;
  handle: [THREE.Vector3, THREE.Vector3];
  radius: number;
  /** Explicit horn roots (halo, upside-down holds); otherwise derived from the body. */
  horns?: [THREE.Vector3, THREE.Vector3];
};

export class KettlebellModel {
  private body: Solid;
  private handle: THREE.Mesh;
  private handleOutline: THREE.Mesh;
  private shapeKey = '';
  private readonly material: THREE.MeshStandardMaterial;

  constructor(parent: THREE.Object3D) {
    this.material = new THREE.MeshStandardMaterial({ color: BELL_COLORS.iron, roughness: 0.38, metalness: 0.15 });
    this.body = new Solid(parent, bodyGeometry(), this.material, [1.05, 1.05, 1.05]);
    this.handle = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.handleOutline = new THREE.Mesh(new THREE.BufferGeometry(), outlineMaterial);
    for (const mesh of [this.handle, this.handleOutline]) {
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
  }

  set visible(value: boolean) {
    this.body.visible = value;
    this.handle.visible = value;
    this.handleOutline.visible = value;
  }

  place(bell: BellPose) {
    const { center, handle, radius } = bell;
    const [h0, h1] = handle;
    const mid = h0.clone().add(h1).multiplyScalar(0.5);
    const axis = mid.clone().sub(center).normalize();
    const acrossRaw = h0.clone().sub(h1);
    const across = acrossRaw.addScaledVector(axis, -acrossRaw.dot(axis)).normalize();
    const depth = new THREE.Vector3().crossVectors(across, axis);
    this.body.place(center, across, axis, depth, [radius, radius, radius]);

    // Handle path in the bell frame; rebuilt only when the clip's bell shape changes.
    const toLocal = (p: THREE.Vector3) => {
      const d = p.clone().sub(center);
      return new THREE.Vector3(d.dot(across), d.dot(axis), d.dot(depth));
    };
    const roots = bell.horns
      ? bell.horns.map(toLocal)
      : [1, -1].map((sign) => new THREE.Vector3(sign * 0.62 * radius, 0.74 * radius, 0));
    const ends = [toLocal(h0), toLocal(h1)];
    const key = [...roots, ...ends].map((p) => p.toArray().map((n) => Math.round(n * 1000)).join(',')).join('|');
    if (key !== this.shapeKey) {
      this.shapeKey = key;
      this.rebuildHandle(roots as [THREE.Vector3, THREE.Vector3], ends as [THREE.Vector3, THREE.Vector3]);
    }
    const basis = new THREE.Matrix4().makeBasis(across, axis, depth).setPosition(center);
    this.handle.matrix.copy(basis);
    this.handleOutline.matrix.copy(basis);
  }

  private rebuildHandle(roots: [THREE.Vector3, THREE.Vector3], ends: [THREE.Vector3, THREE.Vector3]) {
    // Horns rise from the body, round the corners, and run straight under the hands.
    const corner = (root: THREE.Vector3, end: THREE.Vector3) => {
      const outward = Math.sign(end.x || root.x || 1) * 0.018;
      return new THREE.Vector3(end.x + outward, root.y + (end.y - root.y) * 0.72, (root.z + end.z) / 2);
    };
    const points = [roots[0], corner(roots[0], ends[0]), ends[0], ends[1], corner(roots[1], ends[1]), roots[1]];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    for (const [mesh, radius] of [
      [this.handle, HANDLE_RADIUS],
      [this.handleOutline, HANDLE_RADIUS + HANDLE_OUTLINE],
    ] as const) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.TubeGeometry(curve, 48, radius, 12, false);
    }
  }

  dispose() {
    this.handle.geometry.dispose();
    this.handleOutline.geometry.dispose();
  }
}
