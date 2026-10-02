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
import math
from math import cos, sin, radians, sqrt, log, exp

from functools import cached_property

try:
    from ..rig import add, sub, mul, unit, cross, dot, norm, side_sign, SIDES, UPPER_ARM, FOREARM
    from .collide import PARTS, segment_distance
    from .framework import Lift, SAMPLES_PER_SECOND, minjerk, _safe_target, _support_centre
    from .body import centre_of_mass, support_points, convex_hull, margin
except ImportError:
    from rig import add, sub, mul, unit, cross, dot, norm, side_sign, SIDES, UPPER_ARM, FOREARM
    from v2.collide import PARTS, segment_distance
    from v2.framework import Lift, SAMPLES_PER_SECOND, minjerk, _safe_target, _support_centre
    from v2.body import centre_of_mass, support_points, convex_hull, margin

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


# Which body parts each arm segment must clear. Hands behind the head, by the temples or
# arms overhead otherwise sink into the drawn head (sit-ups, back lifts, overhead reach).
ARM_TARGETS = {'hand': ('thigh_l', 'thigh_r', 'torso', 'head'),
               'forearm': ('thigh_l', 'thigh_r', 'torso', 'head'),
               'upper_arm': ('head', 'thigh_l', 'thigh_r')}


def _arm_clearance(j, s, rest=()):
    """Smallest clearance of this arm to the thighs, torso and head (except `rest` parts)."""
    worst = 1.
    for arm, bodies in ARM_TARGETS.items():
        a0, a1, ra = _capsule(j, f'{arm}_{s}')
        for body in bodies:
            if body in rest:
                continue
            b0, b1, rb = _capsule(j, body)
            worst = min(worst, segment_distance(a0, a1, b0, b1) - ra - rb)
    return worst


def _carried(p, s):
    """Dumbbells held in this hand: they move rigidly with the arm."""
    palm = p.j['palm_' + s]
    return [prop for prop in p.props if prop.get('type') == 'dumbbell'
            and norm(sub(tuple(prop['center']), palm)) < .12]


def _holds_prop(p, s):
    """Holding something the arm cannot carry by itself (a bell, both ends of a band)."""
    palm = p.j['palm_' + s]
    for prop in p.props:
        if prop.get('type') == 'dumbbell':
            continue
        for key in ('grips', 'grip'):
            grips = prop.get(key)
            if isinstance(grips, dict) and s in grips:
                return True
        points = [prop.get('center')] + list(prop.get('handle') or [])
        for q in points:
            if q is not None and len(q) == 3 and norm(sub(tuple(q), palm)) < .12:
                return True
    return False


HEAD_CLEARANCE = .003


def _head_clearance(j, s):
    hx, _, hr = _capsule(j, 'head')
    worst = 1.
    for arm in ('hand', 'forearm'):
        a0, a1, ra = _capsule(j, f'{arm}_{s}')
        worst = min(worst, segment_distance(a0, a1, hx, hx) - ra - hr)
    return worst


def _push_from_head(p, s, clearance=HEAD_CLEARANCE):
    """Hands at the head (behind it, at the temples): move the wrist straight out from the
    head centre until hand and forearm just touch the head, then re-solve the arm with the
    elbow kept on its side. Smooth: the push distance is a continuous function of the pose."""
    j = p.j
    if _head_clearance(j, s) >= clearance:
        return
    head = j['head']
    wrist0, palm0, elbow0 = j['wrist_' + s], j['palm_' + s], j['elbow_' + s]
    out = unit(sub(wrist0, head))
    middle = mul(add(j['shoulder_' + s], wrist0), .5)
    pole = add(elbow0, sub(elbow0, middle))

    def apply(d):
        push = mul(out, d)
        p.arm(s, add(wrist0, push), pole=pole, palm=add(palm0, push))

    # Never push the wrist beyond the arm's reach (a hand down the back, triceps stretch).
    # The exact largest reachable push is a continuous function of the pose, so the push,
    # min(needed, reachable), is continuous too; any clearance left is handled by rotation.
    reach = UPPER_ARM + FOREARM - .002
    rel = sub(wrist0, j['shoulder_' + s])
    b = dot(out, rel)
    c = dot(rel, rel) - reach * reach
    if c > 0 or b * b - c < 0:
        return
    cap = min(.15, -b + sqrt(b * b - c))
    if cap <= 0:
        return
    lo, hi = 0., cap
    apply(hi)
    if _head_clearance(j, s) >= clearance:
        for _ in range(24):
            mid = (lo + hi) / 2
            apply(mid)
            lo, hi = (mid, hi) if _head_clearance(j, s) < clearance else (lo, mid)
        apply(hi)
    if _head_clearance(j, s) < clearance:
        lo = hi  # cannot clear within reach: push as far as reach allows
    for _ in range(24 if lo < hi else 0):
        mid = (lo + hi) / 2
        apply(mid)
        lo, hi = (mid, hi) if _head_clearance(j, s) < clearance else (lo, mid)
    apply(hi)


def _rest_on(p, s, part, clearance=0.):
    """A hand resting on a body part (hands on the front thigh): push the wrist straight out
    from the part's axis until the hand lies on its surface, then re-solve the arm."""
    j = p.j
    a0, a1, rb = _capsule(j, part)
    ha, hb, rh = _capsule(j, 'hand_' + s)

    def gap():
        return segment_distance(ha, hb, a0, a1) - rh - rb
    if gap() >= clearance:
        return
    wrist0, palm0, elbow0 = j['wrist_' + s], j['palm_' + s], j['elbow_' + s]
    axis = sub(a1, a0)
    t = max(0., min(1., dot(sub(palm0, a0), axis) / max(dot(axis, axis), 1e-9)))
    out = unit(sub(palm0, add(a0, mul(axis, t))))
    pole = _pole(j['shoulder_' + s], elbow0, wrist0)
    reach = UPPER_ARM + FOREARM - .002

    def apply(d):
        push = mul(out, d)
        target = add(wrist0, push)
        if norm(sub(target, j['shoulder_' + s])) > reach:
            return False
        p.arm(s, target, pole=pole, palm=add(palm0, push))
        ha_, hb_ = j['wrist_' + s], j['palm_' + s]
        return True
    lo, hi = 0., .15
    for _ in range(24):
        mid = (lo + hi) / 2
        if not apply(mid):
            hi = mid
            continue
        ha, hb = j['wrist_' + s], j['palm_' + s]
        lo, hi = (mid, hi) if gap() < clearance else (lo, mid)
    apply(hi)


def _abduct(p, s, clearance, rest=(), sign=None, exact=False):
    """Rotate the arm about the shoulder in the trunk's frontal plane by the smallest angle,
    in whichever direction clears the body (outward for a hanging arm, away from the head
    for a raised one)."""
    j = p.j
    left = unit(sub(j['shoulder_l'], j['shoulder_r']))
    up = unit(sub(j['chest'], j['pelvis']))
    forward = unit(cross(left, up))
    origin = j['shoulder_' + s]
    base = {k: j[f'{k}_{s}'] for k in ARM_JOINTS}
    carried = [(prop, list(prop['center']), [list(h) for h in prop['handle']]) for prop in _carried(p, s)]
    def apply(angle):
        for k, v in base.items():
            j[f'{k}_{s}'] = _rotate(v, origin, forward, angle)
        for prop, center, handle in carried:
            prop['center'] = list(_rotate(tuple(center), origin, forward, angle))
            prop['handle'] = [list(_rotate(tuple(h), origin, forward, angle)) for h in handle]

    best = None
    for sign in ((1., -1.) if sign is None else (sign,)):
        apply(sign * MAX_ABDUCTION)
        if _arm_clearance(j, s, rest) < clearance:
            continue
        lo, hi = 0., MAX_ABDUCTION
        for _ in range(24):
            mid = (lo + hi) / 2
            apply(sign * mid)
            lo, hi = (mid, hi) if _arm_clearance(j, s, rest) < clearance else (lo, mid)
        if best is None or hi < abs(best):
            best = sign * hi
    if best is None and sign is not None and not exact:
        # Cannot clear in this stretch's direction: rotate as far as it helps (continuous).
        best = sign * MAX_ABDUCTION
    apply(best if best is not None else 0.)
    return abs(best) if best is not None else float('inf')


FOREARM_GAP = .005


def _forearm_gap(j):
    (a0, a1, ra), (b0, b1, rb) = _capsule(j, 'forearm_l'), _capsule(j, 'forearm_r')
    return segment_distance(a0, a1, b0, b1) - ra - rb


def separate_forearms(p, gap=FOREARM_GAP):
    """Arms crossing in front pass one over the other: the left arm pitches up and the right
    down about the shoulder axis, by the smallest equal angle that keeps the forearms apart."""
    j = p.j
    if _forearm_gap(j) >= gap:
        return
    axis = unit(sub(j['shoulder_l'], j['shoulder_r']))
    base = {(k, s): j[f'{k}_{s}'] for k in ARM_JOINTS for s in SIDES}

    def apply(angle):
        for (k, s), v in base.items():
            j[f'{k}_{s}'] = _rotate(v, j['shoulder_' + s], axis, angle if s == 'l' else -angle)

    lo, hi = 0., radians(25)
    apply(hi)
    if _forearm_gap(j) < gap:
        apply(0.)
        return
    for _ in range(24):
        mid = (lo + hi) / 2
        apply(mid)
        lo, hi = (mid, hi) if _forearm_gap(j) < gap else (lo, mid)
    apply(hi)


def clear_arms(p, clearance=ARM_CLEARANCE, rest=(), signs=None):
    """Move each free arm just clear of the body (in place): hands and forearms at the head
    are pushed out from it; arms against the thighs, torso, or an upper arm against the
    head, are rotated about the shoulder."""
    for s in SIDES:
        if 'palm_' + s in p.contacts or _holds_prop(p, s):
            continue
        if not _carried(p, s):
            _push_from_head(p, s)
        for part in rest:
            _rest_on(p, s, part)
        if _arm_clearance(p.j, s, rest) < clearance:
            _abduct(p, s, clearance, rest, None if signs is None else signs.get(s))
    if not any('palm_' + s in p.contacts or _holds_prop(p, s) for s in SIDES):
        separate_forearms(p)
    return p


FOOT_FREE_HEIGHT = .10
# A lifting foot may be pulled toward its hip (to keep leg length) once it is this high.
FOOT_PULL_HEIGHT = .01


def _ramp(height, full):
    """Smootherstep from 0 on the floor to 1 at `full` metres up (C2 in height)."""
    t = max(0., min(1., height / full))
    return t * t * t * (t * (6 * t - 15) + 10)


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
    """C-infinity upper bound of max(0, x): never below it, within width / 2 of it."""
    return (x + sqrt(x * x + width * width)) / 2


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
        # Only planted legs ask for a drop (weighted by how planted they are); a lifting
        # leg that would overstretch is shortened at the foot instead (see _keep_length).
        span = vertical - sqrt(max(before * before - hx * hx - hy * hy, 1e-9))
        need.append(span * (1 - follow[s]))
    return _smooth_hinge(_smooth_max(*need))


def _keep_length(hip, ankle, length, follow, width=.004):
    """Pull a free foot toward the hip so the leg is no longer than `length`.

    Smooth minimum of the stretched and original length, applied in proportion to how far
    the foot has left the floor, so planted feet never slide and nothing jumps."""
    v = sub(ankle, hip)
    distance = norm(v)
    if distance < 1e-9:
        return (0., 0., 0.)
    shorter = length - _smooth_hinge(length - distance, width)
    target = add(hip, mul(v, min(distance, shorter) / distance))
    return mul(sub(target, ankle), follow)


def _pole(root, middle, end):
    """A pole that reproduces the current bend: the middle joint pushed out from the chord."""
    chord = mul(add(root, end), .5)
    away = sub(middle, chord)
    if norm(away) < 1e-6:
        return add(middle, (0., 0., -.01))
    return add(middle, away)


def shift_upper_body(p, dx, dy):
    """Move the body by (dx, dy): planted feet stay, free feet follow, legs are re-solved."""
    # No early return at zero shift: the smooth drop must be the same function everywhere.
    follow = {s: _follow(p, s) for s in SIDES}
    shift = (dx, dy, -_hip_drop(p, dx, dy, follow))
    original = dict(p.j)
    # Hands on a support (floor, wall, chair) stay where they are; the arm is re-solved.
    hands = {s: (p.j['wrist_' + s], p.j['palm_' + s]) for s in SIDES if 'palm_' + s in p.contacts}
    lengths = {s: norm(sub(p.j['hip_' + s], p.j['ankle_' + s])) for s in SIDES}
    feet = {s: {k: add(p.j[f'{k}_{s}'], mul(shift, follow[s])) for k in ('ankle', 'heel', 'toe')} for s in SIDES}
    for s in SIDES:
        height = min(p.j[f'heel_{s}'][2], p.j[f'toe_{s}'][2])
        free = 0. if f'knee_{s}' in p.contacts else _ramp(height, FOOT_PULL_HEIGHT)
        pull = _keep_length(add(p.j['hip_' + s], shift), feet[s]['ankle'], lengths[s], free)
        feet[s] = {k: add(v, pull) for k, v in feet[s].items()}
    for k, v in list(p.j.items()):
        side = k[-1] if k[-2:] in ('_l', '_r') else None
        if side and k[:-2] in LEG_JOINTS[1:]:
            continue
        p.j[k] = add(v, shift)
    # Knees and elbows keep bending the way the original pose bends them (a spiderman
    # knee swings out to the side; a push-up elbow points back), not toward a fixed pole.
    knee_poles = {s: _pole(original[f'hip_{s}'], original[f'knee_{s}'], original[f'ankle_{s}']) for s in SIDES}
    elbow_poles = {s: _pole(original[f'shoulder_{s}'], original[f'elbow_{s}'], original[f'wrist_{s}']) for s in SIDES}
    for s in SIDES:
        for k, v in feet[s].items():
            p.j[f'{k}_{s}'] = v
        p.leg(s, feet[s]['ankle'], pole=add(knee_poles[s], shift))
    for s, (wrist, palm) in hands.items():
        p.arm(s, wrist, pole=add(elbow_poles[s], shift), palm=palm, contact=True)
    # Carried props move with the body; contacts are fixed in the world.
    for prop in p.props:
        if prop.get('type') in ('kettlebell', 'dumbbell', 'band') and 'center' in prop:
            prop['center'] = list(add(prop['center'], shift))
    return p


def shift_hips(p, dx, dy):
    """Planks: the hips move by (dx, dy) while the chest stays over the planted hands.

    The pelvis swings about the chest at fixed trunk length; hip joints and a lifted leg
    follow it, so no straight arm is stretched. A planted straight leg takes up the
    resulting (millimetre) change in length at the foot."""
    j = p.j
    original = dict(j)
    chest, pelvis = j['chest'], j['pelvis']
    length = norm(sub(pelvis, chest))
    follow = {s: _follow(p, s) for s in SIDES}
    legs = {s: norm(sub(original['hip_' + s], original['ankle_' + s])) for s in SIDES}
    moved = add(chest, mul(unit(sub(add(pelvis, (dx, dy, 0.)), chest)), length))
    delta = sub(moved, pelvis)
    j['pelvis'] = moved
    for s in SIDES:
        j['hip_' + s] = add(original['hip_' + s], delta)
        for k in ('ankle', 'heel', 'toe'):
            j[f'{k}_{s}'] = add(original[f'{k}_{s}'], mul(delta, follow[s]))
        # Plank legs are straight and nearly horizontal, so moving the hips can only be
        # absorbed by the foot: it slides toward the hip by the (millimetre) stretch, plus
        # 1 mm so the leg is never exactly at the IK reach limit.
        v = sub(j['ankle_' + s], j['hip_' + s])
        stretch = _smooth_hinge(norm(v) - (legs[s] - .001))
        slide = mul(unit(v), -stretch)
        for k in ('ankle', 'heel', 'toe'):
            j[f'{k}_{s}'] = add(j[f'{k}_{s}'], slide)
        if follow[s] >= 1.:
            j['knee_' + s] = add(original['knee_' + s], delta)
        else:
            p.leg(s, j['ankle_' + s], pole=add(_pole(original['hip_' + s], original['knee_' + s], original['ankle_' + s]), delta))
    return p


UPPER_BODY = ('chest', 'neck', 'head', 'face', 'shoulder_l', 'shoulder_r', 'elbow_l', 'elbow_r',
              'wrist_l', 'wrist_r', 'palm_l', 'palm_r')
LEAN_PER_METRE = 4.  # radians of trunk flexion per metre of balance offset (0.2 m limit: 46 deg)


def lean_trunk(p, dx):
    """Balance by leaning the trunk (sit-to-stand): rotate the upper body about the pelvis,
    forward for dx > 0. Hips, legs, feet and the seat stay where they are, which is how a
    person brings the weight over the feet before the hips leave the chair."""
    j = p.j
    left = unit(sub(j['shoulder_l'], j['shoulder_r']))
    angle = dx * LEAN_PER_METRE
    # Rotating about +left by a positive angle tips +z toward +x (forward) for this rig.
    sign = 1. if _rotate(add(j['pelvis'], (0., 0., 1.)), j['pelvis'], left, .1)[0] > j['pelvis'][0] else -1.
    for k in UPPER_BODY:
        if k in j:
            j[k] = _rotate(j[k], j['pelvis'], left, sign * angle)
    return p


def hang_under_grip(p):
    """Hanging from a bar the body is a pendulum: rotate the whole body rigidly about the
    bar (the line through both hands) so the centre of mass sits directly below it. The
    hands lie on that line, so they stay on the bar and no bone changes length. Hanging
    moves are left-right symmetric, so no sideways correction is needed."""
    try:
        from .body import centre_of_mass
    except ImportError:
        from v2.body import centre_of_mass
    grip = mul(add(p.j['palm_l'], p.j['palm_r']), .5)
    bar = unit(sub(p.j['palm_l'], p.j['palm_r']))
    com = centre_of_mass(p.result())[0]
    rel = sub(com, grip)
    # Component of the COM offset perpendicular to the bar, in the vertical plane.
    forward = unit(cross(bar, (0., 0., 1.)))
    ahead, below = dot(rel, forward), -rel[2]
    if below <= 1e-6:
        return p
    angle = math.atan2(ahead, below)
    for k, v in list(p.j.items()):
        p.j[k] = _rotate(v, grip, bar, angle)
    if abs(dot(sub(centre_of_mass(p.result())[0], grip), forward)) > abs(ahead):
        for k, v in list(p.j.items()):
            p.j[k] = _rotate(v, grip, bar, -2 * angle)
    return p


def _area(hull):
    if len(hull) < 3:
        return 0.
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(hull, hull[1:] + hull[:1]))) / 2


def _nearest_inside(point, hull, keep):
    """Nearest point to `point` that is at least `keep` inside the convex hull.

    Projects onto the hull's edges moved inward by `keep` (alternating projection onto the
    violated half-planes, which converges for a convex polygon). If the hull is too thin
    for that margin, the margin is halved until it fits. Unlike stepping toward the
    centroid, this moves the target straight across a long, thin support (one hand and two
    feet), sideways rather than along it."""
    if len(hull) < 3:
        return point
    ccw = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(hull, hull[1:] + hull[:1])) > 0
    edges = []
    for a, b in zip(hull, hull[1:] + hull[:1]):
        ex, ey = b[0] - a[0], b[1] - a[1]
        length = sqrt(ex * ex + ey * ey) or 1e-9
        nx, ny = (-ey / length, ex / length) if ccw else (ey / length, -ex / length)  # inward
        edges.append((a, nx, ny))
    centre = (sum(q[0] for q in hull) / len(hull), sum(q[1] for q in hull) / len(hull))
    while keep > 1e-4:
        if all((centre[0] - a[0]) * nx + (centre[1] - a[1]) * ny >= keep for a, nx, ny in edges):
            break
        keep /= 2
    x, y = point
    for _ in range(200):
        moved = False
        for a, nx, ny in edges:
            depth = (x - a[0]) * nx + (y - a[1]) * ny
            if depth < keep - 1e-7:
                x, y = x + (keep - depth) * nx, y + (keep - depth) * ny
                moved = True
        if not moved:
            break
    return (x, y)


def _inside(point, hull, keep=.02):
    """Keep a ground point at least `keep` inside the hull (nearest such point)."""
    if len(hull) < 3 or margin(point, hull) >= keep:
        return point
    return _nearest_inside(point, hull, keep)


SAFE_KEEP = .06  # preferred balance margin inside the support (as framework.SAFE_MARGIN)


class Wrapped(Lift):
    """A legacy motion as a v2 Lift: balance-solved hip shift plus arm clearance.

    holds: [(legacy_phase, seconds)] inserts a pause at that point of the legacy motion,
    typically in double support before a foot leaves the floor, so the balance solver has
    time to move the body over the standing foot (people shift their weight before they
    lift a leg). Legacy reps start and end at rest, so a pause there adds no velocity jump.
    """

    def __init__(self, name, legacy, duration, balance='xy', mirror=False, clear=True, holds=(), iterations=3, hang=False,
                 grip=False, hips=False, rest=(), lean=False):
        """grip: the hands hold a fixed support (doorframe) and are declared contacts.
        hips: balance by moving the hips only (planks), not the whole body."""
        self.legacy, self.clear, self.iterations, self.hang, self.grip = legacy, clear, iterations, hang, grip
        self.hips = hips
        self.rest = tuple(rest)  # body parts the hands rest on (not cleared)
        self.lean = lean  # balance by trunk lean only (seated starts)
        # Thin supports (one hand and two feet) cannot hold the standing margin.
        self.keep = .015 if hips else SAFE_KEEP
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

    SIGN_SAMPLES = 240

    @cached_property
    def abduct_table(self):
        """Rotation direction per arm, per stretch of the loop that needs a correction.

        Inside a stretch where an arm must be moved clear of the body, one direction is used
        throughout (the one needing the least total rotation there), so the arm cannot flip
        sides mid-stretch. Between stretches no correction is applied at all, so a change of
        direction there is seamless (an arm going overhead needs the opposite rotation to
        one hanging down)."""
        n = self.SIGN_SAMPLES
        table = {}
        for s in SIDES:
            need = []
            for k in range(n):
                p = self.legacy(self.name, self.legacy_phase(k / n))
                if 'palm_' + s in p.contacts or _holds_prop(p, s):
                    need.append(None)
                    continue
                if not _carried(p, s):
                    _push_from_head(p, s)
                for part in self.rest:
                    _rest_on(p, s, part)
                if _arm_clearance(p.j, s, self.rest) >= ARM_CLEARANCE:
                    need.append(None)
                    continue
                angles = {}
                for sign in (1., -1.):
                    q = self.legacy(self.name, self.legacy_phase(k / n))
                    if not _carried(q, s):
                        _push_from_head(q, s)
                    for part in self.rest:
                        _rest_on(q, s, part)
                    angles[sign] = _abduct(q, s, ARM_CLEARANCE, self.rest, sign, exact=True)
                need.append(angles)
            signs = [1.] * n
            k = 0
            while k < n and need[k] is not None:
                k += 1
            start = k % n if k < n else 0
            m = 0
            while m < n:
                i = (start + m) % n
                if need[i] is None:
                    m += 1
                    continue
                run = []
                while m < n and need[(start + m) % n] is not None:
                    run.append((start + m) % n)
                    m += 1
                totals = {sign: sum(need[r][sign] for r in run) for sign in (1., -1.)}
                best = min(totals, key=totals.get)
                for r in run:
                    signs[r] = best
            table[s] = signs
        return table

    def abduct_signs_at(self, phase):
        n = self.SIGN_SAMPLES
        k = int(round((phase % 1.) * n)) % n
        return {s: signs[k] for s, signs in self.abduct_table.items()}

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
            # Near a single-leg phase the target glides from or to the standing foot; in the
            # middle of a long double support (the bottom of a lunge) it relaxes to the usual
            # target anywhere safely inside both feet.
            ramp = max(1, round(.3 / self.duration * n))
            for m in range(length):
                index = (first + start + m) % n
                w = minjerk((m + 1) / (length + 1))
                glide = tuple(x + (y - x) * w for x, y in zip(before, after))
                edge = min(m + 1, length - m)
                keep = minjerk(max(0., 1 - (edge - 1) / ramp))
                pose = poses[index]
                com = centre_of_mass(pose)[0]
                free = _inside((com[0], com[1]), convex_hull(support_points(pose)), SAFE_KEEP)
                targets[index] = tuple(f + (g - f) * keep for f, g in zip(free, glide))
        return targets

    TARGET_SMOOTHING = .3  # seconds: the balance target anticipates support changes

    @cached_property
    def smooth_targets(self):
        """The balance target per solver sample, low-pass filtered over the loop.

        A support change (heels lifting, a hand leaving the floor) makes the raw target jump;
        a centred minimum-jerk-shaped window lets the body start moving before it."""
        n = max(48, round(self.duration * SAMPLES_PER_SECOND))
        n += n % 2
        table = self.stance_targets
        if table is None:
            table = []
            for i in range(n):
                pose = self.raw(i / n).result()
                com = centre_of_mass(pose)[0]
                table.append(_inside((com[0], com[1]), convex_hull(support_points(pose)), self.keep))
        half = max(1, round(self.TARGET_SMOOTHING / 2 / self.duration * n))
        weights = [minjerk(1 - abs(k) / (half + 1)) for k in range(-half, half + 1)]
        total = sum(weights)
        smooth = [tuple(sum(w * table[(i + k) % n][d] for w, k in zip(weights, range(-half, half + 1))) / total
                        for d in range(2)) for i in range(n)]
        # Keep the smoothed target inside the smallest support nearby in time (the ball of the
        # foot while the heels are up), so anticipation never aims outside a narrow support.
        # Every support in the window pulls the target inside it, weighted by closeness in
        # time (zero at the window edge), so constraints fade in and out instead of
        # switching: the target, and the hip shift solved from it, stay smooth.
        hulls = [convex_hull(support_points(self.raw(i / n).result())) for i in range(n)]
        stride = max(1, half // 8)
        ks = sorted(range(-half, half + 1, stride), key=abs, reverse=True)
        out = []
        for i in range(n):
            q = smooth[i]
            for k in ks:
                w = minjerk(1 - abs(k) / (half + 1))
                inside = _inside(q, hulls[(i + k) % n])
                q = (q[0] + w * (inside[0] - q[0]), q[1] + w * (inside[1] - q[1]))
            out.append(_inside(q, hulls[i]))
        return out

    def balance_target(self, phase, pose, com):
        table = self.smooth_targets
        return table[int(round(phase * len(table))) % len(table)]

    def _build(self, name, phase, st, dx, dy):
        p = self.legacy(name, self.legacy_phase(phase))
        if self.grip:
            for side in SIDES:
                p.contacts['palm_' + side] = p.j['palm_' + side]
        if self.hang:
            hang_under_grip(p)
            if self.clear:
                clear_arms(p, rest=self.rest, signs=self.abduct_signs_at(phase))
            return p
        if not self.balance:
            pass  # no balance solving (lying, plank, seated moves): keep the authored body
        elif self.lean:
            lean_trunk(p, dx)
        elif self.hips:
            shift_hips(p, dx, dy)
        else:
            shift_upper_body(p, dx, dy)
        if self.clear:
            clear_arms(p, rest=self.rest, signs=self.abduct_signs_at(phase))
        return p

    def authored(self, phase, dx=0., dy=0.):
        pose = self.build(self.name, phase, {}, dx, dy)
        pose.view = dict(pose.view)
        return pose


def weight_shift_holds(legacy, name, seconds=.5, samples=480, hands=False):
    """Pauses for Wrapped(holds=...): the middle of each double-support stretch of the
    legacy motion that borders a single-support stretch (a foot, or with hands=True a hand,
    about to leave or just back on the floor). Moves that never lift one get none."""
    def single(phase):
        p = legacy(name, phase)
        if hands:
            return sum(('palm_' + s) in p.contacts for s in SIDES) == 1
        j = p.j
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
