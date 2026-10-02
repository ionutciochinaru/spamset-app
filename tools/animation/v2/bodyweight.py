"""v2 bodyweight moves: the legacy keyframed motions, made load- and collision-aware.

Spamset's bodyweight, stretching and equipment moves come from the watch rig. In v2 each
one is a Lift (framework.py) that wraps its legacy motion, like the halo:

- Balance: the Lift solver finds the smooth, periodic hip shift that keeps the ZMP over
  the support. The shift moves the upper body and any free (lifted) leg rigidly; planted
  legs are re-solved to their feet, so feet never slide. Single-leg moves therefore shift
  the body over the standing foot instead of balancing on nothing.
- Arm clearance: drawn arms are thick (collide.PARTS), so an arm hanging straight down
  from the shoulder sits 2-3 cm inside the thigh. clear_arms rotates each free arm
  outward about the shoulder, in the trunk's frontal plane, by the smallest angle that
  clears the thighs and torso by ARM_CLEARANCE. The angle is a continuous function of the
  pose, so it adds no jerk. Arms whose hand is a declared contact (floor, wall, chair)
  or holds a prop are left exactly as authored.
"""
from math import cos, sin, radians, sqrt, log, exp

from functools import cached_property

try:
    from ..rig import add, sub, mul, unit, cross, dot, norm, side_sign, SIDES
    from .collide import PARTS, segment_distance
    from .framework import Lift, SAMPLES_PER_SECOND, minjerk, _safe_target, _support_centre
except ImportError:
    from rig import add, sub, mul, unit, cross, dot, norm, side_sign, SIDES
    from v2.collide import PARTS, segment_distance
    from v2.framework import Lift, SAMPLES_PER_SECOND, minjerk, _safe_target, _support_centre

ARM_CLEARANCE = .01
MAX_ABDUCTION = radians(40)
LEG_JOINTS = ('hip', 'knee', 'ankle', 'heel', 'toe')
ARM_JOINTS = ('elbow', 'wrist', 'palm')


def _rotate(point, origin, axis, angle):
    """Rodrigues rotation of point about the axis through origin."""
    v = sub(point, origin)
    c, s = cos(angle), sin(angle)
    rotated = add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))
    return add(origin, rotated)


def _capsule(j, part):
    a, b, r = PARTS[part]
    return j[a], j[b], r


def _arm_clearance(j, s):
    """Smallest clearance of this arm's hand and forearm to the thighs and torso."""
    worst = 1.
    for arm in ('hand', 'forearm'):
        a0, a1, ra = _capsule(j, f'{arm}_{s}')
        for body in ('thigh_l', 'thigh_r', 'torso'):
            b0, b1, rb = _capsule(j, body)
            worst = min(worst, segment_distance(a0, a1, b0, b1) - ra - rb)
    return worst


def _holds_prop(p, s):
    palm = p.j['palm_' + s]
    for prop in p.props:
        for key in ('grips', 'grip'):
            grips = prop.get(key)
            if isinstance(grips, dict) and s in grips:
                return True
        points = [prop.get('center')] + list(prop.get('handle') or [])
        for q in points:
            if q is not None and len(q) == 3 and norm(sub(tuple(q), palm)) < .12:
                return True
    return False


def clear_arms(p, clearance=ARM_CLEARANCE):
    """Abduct each free arm just enough to clear the thighs and torso (in place)."""
    j = p.j
    left = unit(sub(j['shoulder_l'], j['shoulder_r']))
    up = unit(sub(j['chest'], j['pelvis']))
    forward = unit(cross(left, up))
    for s in SIDES:
        if 'palm_' + s in p.contacts or _holds_prop(p, s):
            continue
        if _arm_clearance(j, s) >= clearance:
            continue
        # Positive angle about +forward moves a left arm up and out to the left; the
        # right arm turns the other way.
        axis = forward if s == 'l' else mul(forward, -1)
        origin = j['shoulder_' + s]
        base = {k: j[f'{k}_{s}'] for k in ARM_JOINTS}

        def apply(angle):
            for k, v in base.items():
                j[f'{k}_{s}'] = _rotate(v, origin, axis, angle)

        lo, hi = 0., MAX_ABDUCTION
        apply(hi)
        if _arm_clearance(j, s) < clearance:
            continue  # cannot clear by abduction alone; leave at the widest and let the validator report
        for _ in range(24):
            mid = (lo + hi) / 2
            apply(mid)
            lo, hi = (mid, hi) if _arm_clearance(j, s) < clearance else (lo, mid)
        apply(hi)
    return p


FOOT_FREE_HEIGHT = .10


def _follow(p, s):
    """How much a foot follows the body shift: 0 on the floor, 1 once FOOT_FREE_HEIGHT up.

    C2-continuous in foot height, so a foot leaving or touching the floor never jumps or jerks.
    A kneeling knee counts as a planted foot."""
    if f'knee_{s}' in p.contacts:
        return 0.
    height = min(p.j[f'heel_{s}'][2], p.j[f'toe_{s}'][2])
    t = max(0., min(1., height / FOOT_FREE_HEIGHT))
    # Smootherstep: continuous velocity and acceleration, so the ZMP sees no kink.
    return t * t * t * (t * (6 * t - 15) + 10)


def _smooth_max(a, b, width=.004):
    """C-infinity maximum (log-sum-exp), within `width` of max(a, b)."""
    m = max(a, b)
    return m + width * log(exp((a - m) / width) + exp((b - m) / width))


def _smooth_hinge(x, width=.004):
    """C-infinity max(0, x)."""
    return (x + sqrt(x * x + width * width)) / 2 - width / 2


def _hip_drop(p, dx, dy, follow):
    """How far the hips drop so each leg keeps its hip-to-ankle length after the shift.

    Shifting the body over one foot stretches the other leg; a real lifter's unloaded hip
    drops a little instead of the knee locking. Smooth in the shift, so it adds no jerk."""
    need = []
    for s in SIDES:
        hip, ankle = p.j['hip_' + s], p.j['ankle_' + s]
        before = norm(sub(hip, ankle))
        hx = hip[0] + dx - (ankle[0] + dx * follow[s])
        hy = hip[1] + dy - (ankle[1] + dy * follow[s])
        vertical = hip[2] - ankle[2]
        need.append(vertical - sqrt(max(before * before - hx * hx - hy * hy, 1e-9)))
    return _smooth_hinge(_smooth_max(*need))


def shift_upper_body(p, dx, dy):
    """Move the body by (dx, dy): planted feet stay, free feet follow, legs are re-solved."""
    if not dx and not dy:
        return p
    follow = {s: _follow(p, s) for s in SIDES}
    shift = (dx, dy, -_hip_drop(p, dx, dy, follow))
    # Hands on a support (floor, wall, chair) stay where they are; the arm is re-solved.
    hands = {s: (p.j['wrist_' + s], p.j['palm_' + s]) for s in SIDES if 'palm_' + s in p.contacts}
    feet = {s: {k: add(p.j[f'{k}_{s}'], mul(shift, follow[s])) for k in ('ankle', 'heel', 'toe')} for s in SIDES}
    for k, v in list(p.j.items()):
        side = k[-1] if k[-2:] in ('_l', '_r') else None
        if side and k[:-2] in LEG_JOINTS[1:]:
            continue
        p.j[k] = add(v, shift)
    for s in SIDES:
        for k, v in feet[s].items():
            p.j[f'{k}_{s}'] = v
        p.leg(s, feet[s]['ankle'], pole=add(p.j['hip_' + s], (1., side_sign(s) * .1, 0.)))
    for s, (wrist, palm) in hands.items():
        p.arm(s, wrist, palm=palm, contact=True)
    # Carried props move with the body; contacts are fixed in the world.
    for prop in p.props:
        if prop.get('type') in ('kettlebell', 'dumbbell', 'band') and 'center' in prop:
            prop['center'] = list(add(prop['center'], shift))
    return p


class Wrapped(Lift):
    """A legacy motion as a v2 Lift: balance-solved hip shift plus arm clearance.

    holds: [(legacy_phase, seconds)] inserts a pause at that point of the legacy motion,
    typically in double support before a foot leaves the floor, so the balance solver has
    time to move the body over the standing foot (people shift their weight before they
    lift a leg). Legacy reps start and end at rest, so a pause there adds no velocity jump.
    """

    def __init__(self, name, legacy, duration, balance='xy', mirror=False, clear=True, holds=(), iterations=3):
        self.legacy, self.clear, self.iterations = legacy, clear, iterations
        self.legacy_duration = duration
        self.holds = sorted(holds)
        total = duration + sum(seconds for _, seconds in self.holds)
        super().__init__(name, total, [(0., {}, True)], self._build, None,
                         balance=balance, mirror=mirror, look=False)

    def legacy_phase(self, phase):
        """Map a phase of the held loop to the legacy motion's phase.

        Each hold is a smooth slow-down of the legacy clock to a momentary standstill and
        back: its rate is 1 - (1 - u^2)^3 over a window of half-width a = 35/32 * seconds,
        which removes exactly `seconds` of legacy time. The window's first and second
        derivatives vanish at its edges, so the warp adds no velocity or acceleration
        jumps (a hard pause would, because legacy reps start with full acceleration)."""
        D, Dh = self.legacy_duration, self.duration
        t = (phase % 1.) * Dh

        def lost(u):  # integral of (1 - x^2)^3 from -1 to clamp(u)
            u = max(-1., min(1., u))
            return u - u ** 3 + 3 * u ** 5 / 5 - u ** 7 / 7 + 16 / 35

        def tau(t):
            value = t
            before = 0.
            for at, seconds in self.holds:
                a = seconds * 35 / 32
                centre = at * D + before + seconds / 2
                before += seconds
                for k in (-1, 0, 1):
                    value -= a * lost((t - centre - k * Dh) / a)
            return value

        return ((tau(t) - tau(0.)) / D) % 1.

    def state(self, phase):
        return {}

    @cached_property
    def stance_targets(self):
        """Per-sample balance target for moves that stand on one foot at times.

        Single support: the centre of the standing foot. Double support between two
        single-support stretches: a minimum-jerk glide from the previous stance foot to the
        next one, so the weight moves across before the foot leaves the floor. Moves that
        never stand on one foot keep the framework's default target."""
        n = max(48, round(self.duration * SAMPLES_PER_SECOND))
        n += n % 2
        poses = [self.raw(i / n).result() for i in range(n)]
        single, centres = [], []
        for pose in poses:
            j = pose['joints']
            free = [s for s in SIDES if min(j[f'heel_{s}'][2], j[f'toe_{s}'][2]) > .02 and f'knee_{s}' not in pose['contacts']]
            one = len(free) == 1 and not any(k.startswith('palm_') for k in pose['contacts'])
            single.append(one)
            # The standing foot's sole centre (midway heel to toe), not the support hull,
            # whose size depends on where a lifting foot crosses the floor threshold.
            stance = next((s for s in SIDES if s not in free), None)
            centres.append(tuple((j[f'heel_{stance}'][k] + j[f'toe_{stance}'][k]) / 2 for k in range(2)) if one else None)
        if not any(single) or all(single):
            return None
        targets = list(centres)
        first = single.index(True)
        k = 0
        while k < n:
            i = (first + k) % n
            if single[i]:
                k += 1
                continue
            start = k
            while not single[(first + k) % n]:
                k += 1
            before = centres[(first + start - 1) % n]
            after = centres[(first + k) % n]
            length = k - start
            for m in range(length):
                w = minjerk((m + 1) / (length + 1))
                targets[(first + start + m) % n] = tuple(x + (y - x) * w for x, y in zip(before, after))
        return targets

    def balance_target(self, phase, pose, com):
        table = self.stance_targets
        if table is None:
            return _safe_target(pose, com)
        return table[int(round(phase * len(table))) % len(table)]

    def _build(self, name, phase, st, dx, dy):
        p = self.legacy(name, self.legacy_phase(phase))
        shift_upper_body(p, dx, dy)
        if self.clear:
            clear_arms(p)
        return p

    def authored(self, phase, dx=0., dy=0.):
        pose = self.build(self.name, phase, {}, dx, dy)
        pose.view = dict(pose.view)
        return pose


def weight_shift_holds(legacy, name, seconds=.5, samples=480):
    """Pauses for Wrapped(holds=...): the middle of each double-support stretch of the
    legacy motion that borders a single-support stretch (a foot about to leave or just
    back on the floor). Moves that never stand on one foot get none."""
    def single(phase):
        j = legacy(name, phase).j
        free = [s for s in SIDES if min(j[f'heel_{s}'][2], j[f'toe_{s}'][2]) > .02]
        return len(free) == 1
    flags = [single(i / samples) for i in range(samples)]
    if not any(flags) or all(flags):
        return []
    holds = []
    first = flags.index(True)
    k = 0
    while k < samples:
        if flags[(first + k) % samples]:
            k += 1
            continue
        start = k
        while not flags[(first + k) % samples]:
            k += 1
        middle = ((first + (start + k - 1) / 2) / samples) % 1.
        holds.append((round(middle, 4), seconds))
    return sorted(holds)
