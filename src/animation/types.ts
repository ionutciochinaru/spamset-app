/** One exported clip (tools/animation/export_3d.py). Coordinates are mm, three.js axes. */
export type ClipBell = { c: number[]; h: number[][]; r: number; horns?: number[][]; g?: Partial<Record<'l' | 'r', number[]>> };

/**
 * Non-kettlebell equipment (mm, three.js axes): a round bar through points (radius r), a flat
 * slab through four corners (thickness t), or a dumbbell along its handle.
 */
export type ClipShape =
  | { k: 'tube'; pts: number[][]; r: number; c: string }
  | { k: 'slab'; pts: number[][]; t: number; c: string }
  | { k: 'db'; h: number[][]; c: string };

/** A hand holding a bar, dumbbell or band: point, bar direction, palm facing on a hanging bar (1 over, -1 under). */
export type ClipGrip = { p: number[]; a: number[]; w?: 1 | -1 };

/** Hand state per side: 0 free, 1 gripping a bell or bar, 2 flat on a surface, 3 a fist. */
export type HandState = 0 | 1 | 2 | 3;

export type Clip = {
  id: string;
  duration: number;
  joints: string[];
  /** Default camera; cropBelow (m) frames only the body above that height (upper-body drills). */
  view: { azimuth: number; elevation: number; cropBelow?: number };
  contract?: { variant?: string; counting?: string; phases?: string; contacts?: string };
  /** Review exports only: validator v2 result for this clip. */
  validator?: { passed: boolean; failures: string[] };
  /** Equipment that stays still for the whole clip (bar, doorframe, chair, wall). */
  scene?: ClipShape[];
  frames: {
    j: number[];
    b: ClipBell[];
    hs?: [HandState, HandState];
    /** Moving equipment (band, dumbbells). */
    p?: ClipShape[];
    g?: Partial<Record<'l' | 'r', ClipGrip>>;
    /** Planted palms on a wall: the wall's normal toward the body (x1000); the floor is the default. */
    pn?: Partial<Record<'l' | 'r', number[]>>;
  }[];
};

/** Equipment in metres. */
export type Shape =
  | { kind: 'tube'; points: Vec3[]; radius: number; color: string }
  | { kind: 'slab'; corners: Vec3[]; thickness: number; color: string }
  | { kind: 'dumbbell'; handle: [Vec3, Vec3]; color: string };

export type BarGrip = { point: Vec3; axis: Vec3; facing?: 1 | -1 };

export type Vec3 = [number, number, number];

/** A sampled pose in metres. */
export type Pose = {
  joints: Record<string, Vec3>;
  bells: {
    center: Vec3;
    handle: [Vec3, Vec3];
    radius: number;
    horns?: [Vec3, Vec3];
    grips?: Partial<Record<'l' | 'r', Vec3>>;
  }[];
  hands?: { l: HandState; r: HandState };
  equipment?: Shape[];
  barGrips?: Partial<Record<'l' | 'r', BarGrip>>;
  /** Unit normal of the surface each flat palm presses (absent: the floor). */
  palmSurfaces?: Partial<Record<'l' | 'r', Vec3>>;
};
