/** One exported clip (tools/animation/export_3d.py). Coordinates are mm, three.js axes. */
export type ClipBell = { c: number[]; h: number[][]; r: number; horns?: number[][]; g?: Partial<Record<'l' | 'r', number[]>> };

/** Hand state per side: 0 free, 1 gripping a bell, 2 flat on the floor. */
export type HandState = 0 | 1 | 2;

export type Clip = {
  id: string;
  duration: number;
  joints: string[];
  /** Default camera; cropBelow (m) frames only the body above that height (upper-body drills). */
  view: { azimuth: number; elevation: number; cropBelow?: number };
  contract?: { variant?: string; counting?: string; phases?: string; contacts?: string };
  frames: { j: number[]; b: ClipBell[]; hs?: [HandState, HandState] }[];
};

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
};
