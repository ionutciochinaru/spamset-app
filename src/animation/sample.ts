import type { Clip, Pose, Vec3 } from './types';

const MM = 0.001;

function lerp3(a: number[], b: number[], t: number): Vec3 {
  return [(a[0] + (b[0] - a[0]) * t) * MM, (a[1] + (b[1] - a[1]) * t) * MM, (a[2] + (b[2] - a[2]) * t) * MM];
}

/**
 * Pose at `seconds` into a looping clip. Samples are 30 per second, so linear
 * blending between neighbours keeps limb-length drift well under a millimetre.
 */
export function samplePose(clip: Clip, seconds: number, speed = 1): Pose {
  const count = clip.frames.length;
  const position = ((((seconds * speed) / clip.duration) % 1) + 1) % 1 * count;
  const i0 = Math.floor(position) % count;
  const i1 = (i0 + 1) % count;
  const t = position - Math.floor(position);
  const a = clip.frames[i0];
  const b = clip.frames[i1];

  const joints: Record<string, Vec3> = {};
  clip.joints.forEach((name, k) => {
    joints[name] = lerp3(a.j.slice(k * 3, k * 3 + 3), b.j.slice(k * 3, k * 3 + 3), t);
  });

  const bells = a.b.map((bell, k) => {
    const next = b.b[k] ?? bell;
    return {
      center: lerp3(bell.c, next.c, t),
      handle: [lerp3(bell.h[0], next.h[0], t), lerp3(bell.h[1], next.h[1], t)] as [Vec3, Vec3],
      radius: bell.r * MM,
      horns: bell.horns && next.horns
        ? ([lerp3(bell.horns[0], next.horns[0], t), lerp3(bell.horns[1], next.horns[1], t)] as [Vec3, Vec3])
        : undefined,
      grips: bell.g
        ? Object.fromEntries(
            Object.entries(bell.g).map(([s, g]) => [s, lerp3(g, next.g?.[s as 'l' | 'r'] ?? g, t)]),
          )
        : undefined,
    };
  });
  // Hand states are discrete: take the nearer sample (no blending, no flicker).
  const hs = (t < 0.5 ? a : b).hs;
  return { joints, bells, hands: hs ? { l: hs[0], r: hs[1] } : undefined };
}

/** Bounding box over every frame, used to frame the camera once per clip. */
/** Smallest framed size (m): a standing figure plus headroom. */
const MIN_FRAME = 1.9;

export function clipBounds(clip: Clip): { center: Vec3; size: number } {
  const min = [Infinity, 0, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const frame of clip.frames) {
    const points = [...Array(frame.j.length / 3).keys()].map((k) => frame.j.slice(k * 3, k * 3 + 3));
    for (const bell of frame.b) points.push(bell.c);
    for (const p of points) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], p[axis] * MM);
        max[axis] = Math.max(max[axis], p[axis] * MM);
      }
    }
  }
  // Include the head's top and the floor.
  max[1] += 0.12;
  const crop = clip.view.cropBelow;
  if (crop !== undefined) min[1] = Math.max(min[1], crop);
  // Never frame tighter than a standing adult (unless the drill is framed as upper body only),
  // so every exercise shows at a consistent scale.
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], crop === undefined ? MIN_FRAME : 0);
  return { center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], size };
}
