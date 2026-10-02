/**
 * Low-poly faceted head, like a blocked-out sculpt. The skull is one continuous
 * mesh lofted through horizontal rings; each ring's shape carries the brow ridge,
 * the eye sockets, the cheekbones, the jaw and the chin. A wedge nose and simple
 * ears sit on it. Faces are flat-shaded, so the planes read as facets.
 * Local frame (metres): x toward the head's left, y up, z forward (the face);
 * origin at the head joint.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

import { Solid } from './parts';

type P = [number, number, number];

/**
 * Rings from the crown down: height, then the left half as (x, z) from the front
 * centre round to the back centre (front, 20, 40, 60, 90, 120, 150 degrees, back).
 */
const RINGS: [number, [number, number][]][] = [
  [0.1, [[0, 0.045], [0.018, 0.043], [0.034, 0.034], [0.045, 0.02], [0.05, -0.012], [0.044, -0.046], [0.026, -0.066], [0, -0.072]]],
  [0.07, [[0, 0.075], [0.025, 0.072], [0.048, 0.058], [0.06, 0.038], [0.068, -0.01], [0.06, -0.055], [0.035, -0.085], [0, -0.095]]],
  [0.04, [[0, 0.085], [0.028, 0.082], [0.05, 0.066], [0.064, 0.04], [0.072, -0.01], [0.064, -0.058], [0.038, -0.09], [0, -0.1]]],
  // Brow ridge.
  [0.012, [[0, 0.095], [0.028, 0.094], [0.05, 0.08], [0.066, 0.046], [0.073, -0.01], [0.064, -0.06], [0.038, -0.09], [0, -0.1]]],
  // Eyes: sockets set back either side of the nose bridge.
  [-0.012, [[0, 0.088], [0.022, 0.071], [0.044, 0.066], [0.063, 0.044], [0.072, -0.012], [0.062, -0.058], [0.036, -0.088], [0, -0.096]]],
  // Cheekbones.
  [-0.036, [[0, 0.088], [0.024, 0.082], [0.047, 0.076], [0.066, 0.04], [0.069, -0.015], [0.058, -0.055], [0.034, -0.08], [0, -0.09]]],
  // Mouth and upper jaw.
  [-0.062, [[0, 0.088], [0.022, 0.084], [0.042, 0.068], [0.057, 0.034], [0.061, -0.015], [0.05, -0.05], [0.03, -0.07], [0, -0.078]]],
  // Jaw angle.
  [-0.088, [[0, 0.08], [0.022, 0.077], [0.04, 0.06], [0.054, 0.024], [0.054, -0.018], [0.04, -0.045], [0.022, -0.056], [0, -0.06]]],
  // Chin.
  [-0.112, [[0, 0.07], [0.018, 0.067], [0.029, 0.05], [0.034, 0.026], [0.03, 0.002], [0.022, -0.016], [0.012, -0.024], [0, -0.026]]],
];
const CROWN: P = [0, 0.124, -0.012];
const UNDER_CHIN: P = [0, -0.12, 0.036];

function skullGeometry(): THREE.BufferGeometry {
  // Each ring as a full loop: left half front to back, then the right half back to front.
  const loops = RINGS.map(([y, half]) => {
    const left = half.map(([x, z]) => new THREE.Vector3(x, y, z));
    const right = half.slice(1, -1).reverse().map(([x, z]) => new THREE.Vector3(-x, y, z));
    return [...left, ...right];
  });
  const n = loops[0].length;
  const positions: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const crown = new THREE.Vector3(...CROWN);
  const chin = new THREE.Vector3(...UNDER_CHIN);
  // Winding: outward normals (counter-clockwise seen from outside).
  for (let k = 0; k < n; k++) tri(crown, loops[0][k], loops[0][(k + 1) % n]);
  for (let r = 0; r < loops.length - 1; r++) {
    const [a, b] = [loops[r], loops[r + 1]];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      tri(a[k], b[k1], a[k1]);
      tri(a[k], b[k], b[k1]);
    }
  }
  const last = loops[loops.length - 1];
  for (let k = 0; k < n; k++) tri(chin, last[(k + 1) % n], last[k]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); // non-indexed: one normal per face, so facets stay flat
  return geometry;
}

const NOSE: P[] = [
  [0, 0.01, 0.094], [0.009, -0.004, 0.09], [-0.009, -0.004, 0.09], // bridge
  [0, -0.044, 0.122], // tip
  [0.016, -0.054, 0.092], [-0.016, -0.054, 0.092], [0, -0.058, 0.1], // wings and base
];

// One ear (left); the right is its mirror.
const EAR: P[] = [
  [0.066, 0.022, -0.012], [0.066, -0.042, -0.018], [0.066, -0.03, -0.04], [0.066, 0.016, -0.042],
  [0.082, 0.018, -0.024], [0.08, -0.034, -0.028], [0.076, 0.002, -0.046],
];

const vecs = (points: P[]) => points.map(([x, y, z]) => new THREE.Vector3(x, y, z));

export class HeadModel {
  private parts: Solid[];

  constructor(parent: THREE.Object3D, material: THREE.Material) {
    const hull = (points: P[]) => new ConvexGeometry(vecs(points));
    this.parts = [
      new Solid(parent, skullGeometry(), material, [1.06, 1.05, 1.06]),
      new Solid(parent, hull(NOSE), material, [1.03, 1.03, 1.03]),
      new Solid(parent, hull(EAR), material, [1.03, 1.05, 1.05]),
      new Solid(parent, hull(EAR.map(([x, y, z]) => [-x, y, z] as P)), material, [1.03, 1.05, 1.05]),
    ];
  }

  /** `side` points to the head's left, `up` along the neck, `front` where the face looks. */
  place(origin: THREE.Vector3, side: THREE.Vector3, up: THREE.Vector3, front: THREE.Vector3, size = 0.92) {
    for (const part of this.parts) part.place(origin, side, up, front, [size, size, size]);
  }
}
