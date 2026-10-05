import type { Clip, ClipShape, Pose, Shape, Vec3 } from './types';

const MM = 0.001;

function lerp3(a: number[], b: number[], t: number): Vec3 {
  return [(a[0] + (b[0] - a[0]) * t) * MM, (a[1] + (b[1] - a[1]) * t) * MM, (a[2] + (b[2] - a[2]) * t) * MM];
}

function shape(a: ClipShape, b: ClipShape | undefined, t: number): Shape {
  const at = (points: number[][], next: number[][] | undefined) => points.map((p, i) => lerp3(p, next?.[i] ?? p, t));
  if (a.k === 'tube') return { kind: 'tube', points: at(a.pts, b?.k === 'tube' ? b.pts : undefined), radius: a.r * MM, color: a.c };
  if (a.k === 'slab') return { kind: 'slab', corners: at(a.pts, b?.k === 'slab' ? b.pts : undefined), thickness: a.t * MM, color: a.c };
  return { kind: 'dumbbell', handle: at(a.h, b?.k === 'db' ? b.h : undefined) as [Vec3, Vec3], color: a.c };
}

/**
 * Pose at `seconds` into a looping clip. Samples are 30 per second, so linear
 * blending between neighbours keeps limb-length drift well under a millimetre.
 */
export function samplePose(clip: Clip, seconds: number, speed = 1): Pose {
  const count = clip.frames.length;
  // A celebration plays once, then loops from loopFrom (its breathing); the rest loop whole.
  const from = clip.loopFrom ?? 0;
  const loop = Math.max(0, (seconds * speed) / clip.duration);
  const at = loop < 1 ? loop : from + ((loop - from) % (1 - from));
  const position = at * count;
  const i0 = Math.floor(position) % count;
  const i1 = i0 + 1 < count ? i0 + 1 : Math.round(from * count);
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
  const equipment = [
    ...(clip.scene ?? []).map((s) => shape(s, undefined, 0)),
    ...(a.p ?? []).map((s, k) => shape(s, b.p?.[k], t)),
  ];
  // Which hands hold a bar follows the hand states (nearer sample); the grip point blends.
  const held = (t < 0.5 ? a : b).g;
  const barGrips = held
    ? Object.fromEntries(
        (Object.keys(held) as ('l' | 'r')[]).map((side) => {
          const g = held[side]!;
          return [side, { point: lerp3(a.g?.[side]?.p ?? g.p, b.g?.[side]?.p ?? g.p, t), axis: lerp3(g.a, g.a, 0), facing: g.w }];
        }),
      )
    : undefined;
  const walls = (t < 0.5 ? a : b).pn;
  const palmSurfaces = walls
    ? Object.fromEntries(Object.entries(walls).map(([side, n]) => [side, [n[0] / 1000, n[1] / 1000, n[2] / 1000] as Vec3]))
    : undefined;
  return { joints, bells, hands: hs ? { l: hs[0], r: hs[1] } : undefined, equipment, barGrips, palmSurfaces };
}

/** Bounding box over every frame, used to frame the camera once per clip. */
/** Smallest framed size (m): a standing figure plus headroom. */
const MIN_FRAME = 1.9;

/** Where the clip touches the floor (x, z centre and radius, m): every joint and prop point within 15 cm of it. */
export function clipFootprint(clip: Clip): { x: number; z: number; radius: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const add = (p: number[]) => {
    if (p[1] * MM > 0.15) return;
    minX = Math.min(minX, p[0] * MM); maxX = Math.max(maxX, p[0] * MM);
    minZ = Math.min(minZ, p[2] * MM); maxZ = Math.max(maxZ, p[2] * MM);
  };
  for (const frame of clip.frames) {
    for (let k = 0; k < frame.j.length; k += 3) add(frame.j.slice(k, k + 3));
    for (const s of [...(clip.scene ?? []), ...(frame.p ?? [])]) (s.k === 'db' ? s.h : s.pts).forEach(add);
  }
  if (minX === Infinity) return { x: 0, z: 0, radius: 0.95 };
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 + 0.3 };
}

export function clipBounds(clip: Clip): { center: Vec3; size: number; height: number } {
  const min = [Infinity, 0, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const frame of clip.frames) {
    const points = [...Array(frame.j.length / 3).keys()].map((k) => frame.j.slice(k * 3, k * 3 + 3));
    for (const bell of frame.b) points.push(bell.c);
    for (const s of [...(clip.scene ?? []), ...(frame.p ?? [])]) points.push(...(s.k === 'db' ? s.h : s.pts));
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
  return { center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], size, height: max[1] - min[1] };
}
