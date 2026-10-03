"""v2 Turkish get-up (bell in the left hand; right hand, heel and knee support).

Stages: lie -> roll to the elbow (forearm pinned to the floor) -> post on the
hand -> high bridge -> sweep the straight leg low under the hips to a kneel ->
the shin lands pointing back, passing under the hips inside the posted hand ->
push off the hand to an upright half-kneel -> stand tall into a split stance
with the back toes planted; then the same steps in reverse. The top is a split
stance: with this leg length the back foot cannot step up without single-leg
support outside the balance margin, so both feet stay down. Every floor contact is pinned while declared,
and the bell arm stays vertical over its shoulder throughout.
"""
from math import sin, cos, pi, sqrt, radians, acos, atan2

try:
    from ..rig import (solve_two_bone, Pose, SIDES, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM, THIGH, SHIN, HIP_HALF,
                       side_sign, add, sub, mul, unit, norm, cross, dot, smooth, clamp)
    from .common import MAX_REACH, foot, toe_from, one_hand, tall, gaze
    from .framework import Lift, minjerk
except ImportError:
    from rig import (solve_two_bone, Pose, SIDES, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM, THIGH, SHIN, HIP_HALF,
                     side_sign, add, sub, mul, unit, norm, cross, dot, smooth, clamp)
    from v2.common import MAX_REACH, foot, toe_from, one_hand, tall, gaze
    from v2.framework import Lift, minjerk

BELL_SIDE, SUPPORT = 'l', 'r'
FLOOR_PELVIS = .10
FOOT_L = (.40, .17, ANKLE_HEIGHT)            # bell-side foot, planted until standing
STRAIGHT_ANKLE = (.655, -.672, .075)           # straight support leg at ~45 deg, heel down, knee long
HAND = (-.36, -.56, .032)                    # posted support hand (wrist), level with the chest
HAND_PALM = (-.305, -.575, .02)
KNEE = (-.16, -.34, .048)                    # support knee after the sweep, in line behind the hand
KNEEL_PITCH = radians(58)                    # toes tucked, heel up, foot behind the knee
RIB_POLE = (.3, -.1, .4)                     # posted arm: elbow bends back toward the ribs, above the floor
SWEEP_WAY = (.30, .40, .12)                   # shin direction halfway through the sweep (low: the foot slides under the hips)
BLADE_ROLL = .12                             # support shoulder blade rolls on the floor until this high
STAND_R = (.40, -.17, ANKLE_HEIGHT)


def rotate_about(v, axis, angle):
    c, s = cos(angle), sin(angle)
    return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))


def trunk(p, pelvis, up, twist):
    p.torso(pelvis, up=up)
    up = p.up
    lateral = unit(sub((0., 1., 0.), mul(up, dot((0., 1., 0.), up))))
    lateral = rotate_about(lateral, up, twist)
    for s in SIDES:
        p.j['shoulder_' + s] = add(p.j['chest'], mul(lateral, side_sign(s) * SHOULDER_HALF))
    p.forward = unit(cross(lateral, up))
    p.j['face'] = add(p.j['head'], mul(p.forward, .075))


def elbow_point():
    """Forearm on the floor: the elbow lies FOREARM from the hand, toward the hips."""
    return add(HAND, mul(unit((.40, .92, 0.)), FOREARM))[:2] + (.035,)


ELBOW = elbow_point()


def _elbow_up():
    """Trunk tilt that puts the right shoulder exactly UPPER_ARM from the grounded elbow."""
    base = (-.86, -.28, .43)

    def gap(t):
        up = unit((base[0], base[1] * t, base[2] * t))
        p = Pose('s', 0)
        trunk(p, (0., 0., FLOOR_PELVIS), up, radians(-22))
        return norm(sub(p.j['shoulder_r'], ELBOW)) - UPPER_ARM
    lo, hi = .2, 2.5
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if gap(mid) > 0 else (lo, mid)
    t = (lo + hi) / 2
    return unit((base[0], base[1] * t, base[2] * t))


ELBOW_UP = _elbow_up()


def _planted_elbow():
    """Floor point (5 cm up) one forearm from the hand and one upper arm from the lying
    shoulder, on the hip side: the elbow rests here from lying through the elbow stage."""
    p = Pose('s', 0)
    trunk(p, (0., 0., FLOOR_PELVIS), (-1., 0., 0.), 0.)
    (sx, sy, sz), (hx, hy, hz), rest = p.j['shoulder_' + SUPPORT], HAND, .05
    ra2, rb2 = UPPER_ARM ** 2 - (sz - rest) ** 2, FOREARM ** 2 - (hz - rest) ** 2
    dx, dy = hx - sx, hy - sy
    d = sqrt(dx * dx + dy * dy)
    along = (ra2 - rb2 + d * d) / (2 * d)
    h = sqrt(max(0., ra2 - along * along))
    mx, my = sx + dx * along / d, sy + dy * along / d
    options = [(mx - dy * h / d, my + dx * h / d, rest), (mx + dy * h / d, my - dx * h / d, rest)]
    return max(options, key=lambda q: q[0])


PLANTED = _planted_elbow()


def _twist_for_planted(pelvis, up, twist):
    """Twist nearest `twist` that keeps the support shoulder one upper arm from PLANTED."""
    def gap(t):
        q = Pose('s', 0)
        trunk(q, pelvis, up, t)
        return norm(sub(q.j['shoulder_' + SUPPORT], PLANTED)) - UPPER_ARM
    best = None
    grid = [twist + k * .02 for k in range(-60, 61)]
    for t0, t1 in zip(grid, grid[1:]):
        g0, g1 = gap(t0), gap(t1)
        if g0 == 0 or g0 * g1 < 0:
            lo, hi = t0, t1
            for _ in range(40):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if gap(mid) * g0 > 0 else (lo, mid)
            root = (lo + hi) / 2
            if best is None or abs(root - twist) < abs(best - twist):
                best = root
    return twist if best is None else best


def _up_for_planted(pelvis, up, twist, reference=None):
    """Same heading as `up`, with the elevation that keeps the elbow planted."""
    from math import atan2, asin
    heading = atan2(up[1], up[0])

    def with_elevation(e):
        return (cos(e) * cos(heading), cos(e) * sin(heading), sin(e))

    def gap(e):
        q = Pose('s', 0)
        trunk(q, pelvis, with_elevation(e), twist)
        return norm(sub(q.j['shoulder_' + SUPPORT], PLANTED)) - UPPER_ARM
    current = asin(max(-1., min(1., unit(reference or up)[2])))
    grid = [k * .01 for k in range(0, 141)]
    values = [gap(e) for e in grid]
    roots = []
    for (e0, g0), (e1, g1) in zip(zip(grid, values), zip(grid[1:], values[1:])):
        if g0 == 0 or g0 * g1 < 0:
            lo, hi = e0, e1
            for _ in range(40):
                mid = (lo + hi) / 2
                lo, hi = (mid, hi) if gap(mid) * g0 > 0 else (lo, mid)
            roots.append((lo + hi) / 2)
    if not roots:
        return up
    # The rise nearest the interpolated pose keeps the roll continuous.
    return with_elevation(min(roots, key=lambda e: abs(e - current)))


def kneel_pelvis(thigh):
    hip = add(KNEE, mul(unit(thigh), THIGH))
    return sub(hip, (0., side_sign(SUPPORT) * HIP_HALF, 0.))


def _k(name, **params):
    params.setdefault('twist', 0.)
    return (name, params)


# Stage poses below were chosen with v2/getup_tune.py (reach, contacts, COM margin).
LIE = _k('lie', pelvis=(0., 0., FLOOR_PELVIS), up=(-1., 0., 0.), leg='straight', hand='lie_arm')
ELB = _k('elbow', pelvis=(0., 0., FLOOR_PELVIS), up=unit((-.45, -.834, .319)), twist=-.385, leg='straight', hand='forearm')
POST = _k('post', pelvis=(0., 0., FLOOR_PELVIS), up=unit((.115, -.713, .692)), twist=-.552, leg='straight', hand='floor')
BRIDGE = _k('bridge', pelvis=(.07, .002, .334), up=unit((-.343, -.799, .494)), twist=-.278, leg='straight', hand='floor')
SWEEP = _k('sweep', thigh=(.318, .395, .862), up=unit((.176, -.882, .437)), twist=-.245, leg='kneel',
           shin=(-1., -.02, .325), hand='floor')
# Push off the hand: trunk rises over the knee and front foot before the hand lifts.
PUSH = _k('push', thigh=(0.337, 0.369, 0.866), up=unit((-0.703, -0.534, 0.470)), twist=-0.054, leg='kneel', shin=(-1., -.02, .325), hand='floor')
# Upright on the knee with the shin still out to the side: the hand leaves the floor
# before the back shin swings behind (so it never passes under the hand).
KNEEL_SIDE = _k('kneel_side', thigh=(0.238, 0.236, 0.942), up=unit((0.132, 0.058, 0.989)), leg='kneel', shin=(.35, -.90, .33), hand='free')
KNEEL = _k('kneel', twist=0.000, thigh=(0.238, 0.236, 0.942), up=unit((0.132, 0.058, 0.989)), leg='kneel', shin=(-1., -.02, .325), hand='free')
TOP = _k('top', twist=0.000, pelvis=(0.066, -0.057, 0.742), up=unit((0.188, 0.012, 0.982)), leg='toes', hand='free')
# Standing tall, feet together under the hips, bell locked out overhead.
STAND = _k('stand', twist=0.000, pelvis=(0.42, 0., 0.947), up=unit((.03, .0, 1.)), leg='stand',
           hand='free')

# Stage times in seconds (the descent reverses them with the same timing).
STEP_S = 3.8                   # lunge -> standing (STEP_KEYS below)
_ASCENT_S = [(0.00, LIE), (0.50, LIE), (2.10, ELB), (2.50, ELB), (3.78, POST), (5.22, BRIDGE), (7.74, SWEEP),
             (9.18, PUSH), (10.78, KNEEL), (11.18, KNEEL), (12.78, TOP), (12.78 + STEP_S, STAND),
             (12.78 + STEP_S + .8, STAND)]
LOOP = 2 * _ASCENT_S[-2][0] + (_ASCENT_S[-1][0] - _ASCENT_S[-2][0])   # rise, hold, same-speed descent
ASCENT = [(t / LOOP, k) for t, k in _ASCENT_S]
# The roll onto the elbow (and back) rides on rotational momentum the point-mass balance
# model does not capture; the validator reports these windows instead of checking them.
ROLL = (_ASCENT_S[1][0] / LOOP, _ASCENT_S[2][0] / LOOP)
MOMENTUM_WINDOWS = [ROLL, (1 - ROLL[1], 1 - ROLL[0])]


# The roll and elbow stages are exactly planted-elbow poses (the roll solve passes through them).
ELB[1]['up'] = _up_for_planted(ELB[1]['pelvis'], ELB[1]['up'], ELB[1]['twist'])


def _support_shoulder(pelvis, up, twist):
    q = Pose('s', 0)
    trunk(q, pelvis, up, twist)
    return q.j['shoulder_' + SUPPORT]


def _roll_trunk(p, t):
    """Roll with the elbow planted: the support shoulder moves along the circle where the
    sphere around the pelvis (fixed shoulder distance) meets the sphere around the planted
    elbow (upper-arm length); the trunk's spin about the pelvis->shoulder line is interpolated."""
    pelvis = LIE[1]['pelvis']
    s0 = _support_shoulder(pelvis, LIE[1]['up'], LIE[1]['twist'])
    s1 = _support_shoulder(pelvis, ELB[1]['up'], ELB[1]['twist'])
    axis = unit(sub(PLANTED, pelvis))
    centre = add(pelvis, mul(axis, dot(sub(s0, pelvis), axis)))
    r0, r1 = sub(s0, centre), sub(s1, centre)
    e1 = unit(r0)
    e2 = unit(cross(axis, e1))
    ang = atan2(dot(r1, e2), dot(r1, e1))
    radius = norm(r0)
    shoulder = add(centre, add(mul(e1, radius * cos(ang * t)), mul(e2, radius * sin(ang * t))))

    def frame(d):
        d = unit(d)
        a = cross(axis, d) if norm(cross(axis, d)) > 1e-6 else cross((0., 0., 1.), d)
        a = unit(a)
        return d, a, cross(d, a)

    def coords(up, f):
        """Trunk up as (component along the shoulder line, spin angle about it)."""
        return dot(up, f[0]), atan2(dot(up, f[2]), dot(up, f[1]))

    c0, psi0 = coords(unit(LIE[1]['up']), frame(sub(s0, pelvis)))
    c1, psi1 = coords(unit(ELB[1]['up']), frame(sub(s1, pelvis)))
    psi = psi0 + ((psi1 - psi0 + pi) % (2 * pi) - pi) * t
    c = c0 + (c1 - c0) * t
    f = frame(sub(shoulder, pelvis))
    up = unit(add(mul(f[0], c), mul(add(mul(f[1], cos(psi)), mul(f[2], sin(psi))), sqrt(max(0., 1 - c * c)))))
    p.torso(pelvis, up=up)
    chest = p.j['chest']
    # Shoulders: the support shoulder exactly on the circle; the other mirrored through the chest.
    lateral = unit(sub(chest, shoulder))
    lateral = unit(sub(lateral, mul(up, dot(lateral, up))))
    for sd in SIDES:
        p.j['shoulder_' + sd] = add(chest, mul(lateral, side_sign(sd) * SHOULDER_HALF))
    p.forward = unit(cross(lateral, up))
    p.j['face'] = add(p.j['head'], mul(p.forward, .075))


def _keys():
    top = ASCENT[-1][0]
    rise = ASCENT[-2][0]
    span = 1. - top
    descent = [(top + span * (rise - t) / rise, k) for t, k in reversed(ASCENT[:-1])]
    return ASCENT + descent[1:-1]


KEYS = _keys()

# Back toes stay here from the kneel until the step.
_kneel_ankle = add(KNEE, mul(unit(KNEEL[1]['shin']), SHIN))
TOES = add(_kneel_ankle, (0., 0., 0.))
_toe_vec = (.16 * cos(KNEEL_PITCH) - .085 * sin(KNEEL_PITCH), 0., -.16 * sin(KNEEL_PITCH) - .085 * cos(KNEEL_PITCH))
TOES = add(_kneel_ankle, _toe_vec)


def _pelvis(params):
    return kneel_pelvis(params['thigh']) if 'thigh' in params else params['pelvis']


# Lunge -> standing, in seconds. The back leg is already long in the lunge, so the
# lifter drops and drives the hips forward while the back toes push (double support),
# lifts the back foot and decelerates over the front foot while it swings through
# (single support), lands it beside the front foot and centres the hips.
STEP_KEYS = [  # (time s, pelvis, unused velocity)
    (0.00, (0.066, -0.057, 0.742), (0., 0., 0.)),
    (1.30, (0.270, .125, .72), (0., 0., 0.)),     # sink over the front foot, back toes down
    (1.60, (0.270, .125, .72), (0., 0., 0.)),     # back foot lifts
    (2.60, (0.310, .125, .72), (0., 0., 0.)),     # ... and lands beside the front foot
    (3.80, (0.420, 0.000, 0.947), (0., 0., 0.)),     # stand up tall
]
STEP_LEAN = [0., .55, .55, .40, 0.]
TOE_SLIDE = (.32, .20, 0.)             # back toes slide in (on the floor) as the weight comes forward
STEP_TIME = STEP_KEYS[-1][0]
assert abs(STEP_TIME - STEP_S) < 1e-9
LIFT_T, LAND_T = STEP_KEYS[2][0] / STEP_TIME, STEP_KEYS[3][0] / STEP_TIME


def _step_pelvis(t):
    """Pelvis at fraction t of the step: minimum-jerk between STEP_KEYS (zero velocity and
    acceleration at each key; a controlled grind)."""
    time = t * STEP_TIME
    for (t0, p0, _), (t1, p1, _) in zip(STEP_KEYS, STEP_KEYS[1:]):
        if time <= t1 + 1e-12:
            w = minjerk((time - t0) / (t1 - t0))
            return tuple(a + (b - a) * w for a, b in zip(p0, p1))
    return STEP_KEYS[-1][1]


def _step_up(t):
    """Trunk up during the step: TOP -> STAND, plus a forward lean that carries the chest
    and the overhead bell over the front foot (smoothstep between keys)."""
    time = t * STEP_TIME
    lean = STEP_LEAN[-1]
    for (t0, *_), (t1, *_), l0, l1 in zip(STEP_KEYS, STEP_KEYS[1:], STEP_LEAN, STEP_LEAN[1:]):
        if time <= t1 + 1e-12:
            u = (time - t0) / (t1 - t0)
            lean = l0 + (l1 - l0) * minjerk(u)
            break
    base = unit(tuple(x + (y - x) * minjerk(t) for x, y in zip(TOP[1]['up'], STAND[1]['up'])))
    return unit(add(base, (sin(lean), 0., 0.)))


def _mix(a, b, u):
    if {a['leg'], b['leg']} == {'toes', 'stand'}:
        t = u if a['leg'] == 'toes' else 1 - u
        return {'twist': 0., 'up': _step_up(t), 'pelvis': _step_pelvis(t)}
    out = {'twist': a['twist'] + (b['twist'] - a['twist']) * u, 'up': unit(tuple(x + (y - x) * u for x, y in zip(a['up'], b['up'])))}
    if 'thigh' in a and 'thigh' in b:
        out['thigh'] = unit(tuple(x + (y - x) * u for x, y in zip(a['thigh'], b['thigh'])))
        out['pelvis'] = kneel_pelvis(out['thigh'])
    else:
        pa, pb = _pelvis(a), _pelvis(b)
        out['pelvis'] = tuple(x + (y - x) * u for x, y in zip(pa, pb))
    if 'shin' in a and 'shin' in b:
        out['shin'] = _swing_shin(a['shin'], b['shin'], u)
    return out


def _swing_shin(a, b, u):
    """Rotate the shin about the vertical through the knee, keeping its height (toes stay down)."""
    from math import atan2
    a, b = unit(a), unit(b)
    z = a[2] + (b[2] - a[2]) * u
    ang_a, ang_b = atan2(a[1], a[0]), atan2(b[1], b[0])
    delta = (ang_b - ang_a + pi) % (2 * pi) - pi
    ang = ang_a + delta * u
    h = sqrt(max(0., 1 - z * z))
    return (h * cos(ang), h * sin(ang), z)


def _clearance(pitch):
    """Lowest ankle height that keeps heel and toe on or above the floor at this pitch."""
    lowest = min(-.16 * sin(pitch) - .085 * cos(pitch), .075 * sin(pitch) - .085 * cos(pitch))
    return -lowest + .003


def _support_leg(p, a, b, u, out):
    s = SUPPORT
    hip = p.j['hip_' + s]
    modes = (a['leg'], b['leg'])
    if modes == ('straight', 'straight'):
        ankle = foot(p, s, STRAIGHT_ANKLE, 0., -pi / 2, contact=False)
        p.contacts['heel_' + s] = p.j['heel_' + s]
        p.leg(s, STRAIGHT_ANKLE, pole=add(hip, (0., 0., 1.)))
        return
    if modes == ('kneel', 'kneel'):
        ankle = add(KNEE, mul(out['shin'], SHIN))
        foot(p, s, ankle, 0., KNEEL_PITCH, contact=False)
        p.leg(s, ankle, pole=KNEE)
        p.contacts['knee_' + s] = p.j['knee_' + s]
        if u > 1 - 1e-9 or 'shin' in b and b['shin'] == a['shin']:
            p.contacts['toe_' + s] = p.j['toe_' + s]
        elif p.j['toe_' + s][2] < .02:
            # Windshield wiper: the tucked toes drag round on the floor.
            p.contacts['roll_toe'] = (p.j['toe_' + s][0], p.j['toe_' + s][1], 0.)
        return
    if modes == ('stand', 'stand'):
        foot(p, s, STAND_R)
        p.leg(s, STAND_R)
        return
    if set(modes) == {'straight', 'kneel'}:
        # Sweep low along the floor: the thigh rotates about the hip, the knee stays near the floor.
        # Start from the knee the planted straight leg actually has (no jump into the sweep).
        errors = []
        knee0, _ = solve_two_bone(hip, STRAIGHT_ANKLE, THIGH, SHIN, add(hip, (0., 0., 1.)), errors, 'sweep')
        straight_dir = unit(sub(knee0, hip))
        kneel_dir = unit(sub(KNEE, hip))
        t = u if modes[0] == 'straight' else 1 - u
        thigh_dir = unit(tuple(x + (y - x) * t for x, y in zip(straight_dir, kneel_dir)))
        knee = add(hip, mul(thigh_dir, THIGH))
        if knee[2] < .045 and t > 0:
            knee = (knee[0], knee[1], max(knee[2], .045 * min(1., t * 20)))
        shin_start = unit(sub(STRAIGHT_ANKLE, knee0))
        shin_end = unit(out.get('shin') or (a.get('shin') or b.get('shin')))
        # The knee bends and the foot comes up and back under the hips (through a raised
        # shin) instead of swinging wide around the posted hand.
        # One smooth curve (quadratic Bezier on the shin direction) through a low bent-knee
        # waypoint: the foot slides under the hips close to the floor.
        raised = unit(SWEEP_WAY)
        # Turn the shin about the vertical through the waypoint's heading (blending the vectors
        # directly from forward to backward passed through vertical: the shin flipped up).
        def heading_of(d):
            return atan2(d[1], d[0])
        a0 = heading_of(shin_start)
        am = a0 + ((heading_of(raised) - a0 + pi) % (2 * pi) - pi)
        a1 = am + ((heading_of(shin_end) - am + pi) % (2 * pi) - pi)
        ang = (1 - t) ** 2 * a0 + 2 * t * (1 - t) * am + t ** 2 * a1
        zc = (1 - t) ** 2 * shin_start[2] + 2 * t * (1 - t) * raised[2] + t ** 2 * shin_end[2]
        flat = sqrt(max(0., 1 - zc * zc))
        shin_dir = (flat * cos(ang), flat * sin(ang), zc)
        ankle = add(knee, mul(shin_dir, SHIN))
        pitch = -pi / 2 + (KNEEL_PITCH + pi / 2) * t
        ankle = (ankle[0], ankle[1], max(ankle[2], _clearance(pitch)))
        # The foot turns with the shin as the leg rotates under the body (a fixed heading
        # twisted the knee ~135 deg against the foot); zero at both ends of the sweep.
        def heading(d):
            return atan2(d[1], d[0])
        h0, h1, h = heading(shin_start), heading(shin_end), heading(shin_dir)
        span = (h1 - h0 + pi) % (2 * pi) - pi
        turn = (h - (h0 + span * t) + pi) % (2 * pi) - pi
        foot(p, s, ankle, side_sign(s) * turn, pitch, contact=False)
        p.leg(s, ankle, pole=knee)
        if p.j['knee_' + s][2] < .06:
            # The knee lands and slides into place under the hips.
            p.contacts['roll_knee'] = (p.j['knee_' + s][0], p.j['knee_' + s][1], 0.)
        return
    if set(modes) == {'kneel', 'toes'}:
        # Knee lifts; the tucked toes stay planted.
        t = u if modes[0] == 'kneel' else 1 - u
        pitch = KNEEL_PITCH + (radians(62) - KNEEL_PITCH) * t
        ankle = toe_from(s, TOES, 0., pitch)
        foot(p, s, ankle, 0., pitch, contact=False)
        p.contacts['toe_' + s] = TOES
        # The knee lifts straight off its floor spot (pole blends from the kneeling knee).
        pole = tuple(a + (b - a) * smooth(t) for a, b in zip(KNEE, add(hip, (.3, 0., -1.))))
        p.leg(s, ankle, pole=pole)
        return
    if modes == ('toes', 'toes'):
        ankle = toe_from(s, TOES, 0., radians(62))
        foot(p, s, ankle, 0., radians(62), contact=False)
        p.contacts['toe_' + s] = TOES
        p.leg(s, ankle, pole=add(hip, (.4, 0., -1.)))
        return
    # toes <-> stand: the back toes push until the leg is long, then the foot steps up
    # beside the front foot.
    t = u if modes[0] == 'toes' else 1 - u
    # As the weight moves onto the front leg the unloaded back toes slide in behind it.
    slide = minjerk(min(1., t / (.65 * STEP_KEYS[1][0] / STEP_TIME)))   # the toes lead the hips
    toes = add(TOES, mul(TOE_SLIDE, slide))
    start = toe_from(s, toes, 0., radians(62))
    if t <= LIFT_T:
        foot(p, s, start, 0., radians(62), contact=False)
        p.contacts['roll_toe' if 0. < slide < 1. else 'toe_' + s] = toes
        p.leg(s, start, pole=add(hip, (.4, 0., -1.)))
        return
    k = minjerk(min(1., (t - LIFT_T) / (LAND_T - LIFT_T)))
    ankle = add(tuple(x + (y - x) * k for x, y in zip(start, STAND_R)), (0., 0., .09 * sin(pi * k)))
    pitch = radians(62) * (1 - k)
    foot(p, s, ankle, 0., pitch, contact=k > 1 - 1e-9)
    # The knee drives forward as the foot swings through (pole blends from the push-off).
    p.leg(s, ankle, pole=add(hip, tuple(x + (y - x) * k for x, y in zip((.4, 0., -1.), (1., 0., -.2)))))


def _arm_on_floor(p, s, shoulder, rest=.05, near=None):
    """Hand on HAND; elbow on the floor (height `rest`) on the hip side when the arm
    geometry allows it: the intersection of the upper-arm and forearm spheres with
    that plane. Otherwise the elbow swings down toward the floor as far as it can."""
    a, b = UPPER_ARM, FOREARM
    (sx, sy, sz), (hx, hy, hz) = shoulder, HAND
    # In the plane z = rest: circles of radius ra (around shoulder) and rb (around hand).
    ra2, rb2 = a * a - (sz - rest) ** 2, b * b - (hz - rest) ** 2
    best = None
    if ra2 > 0 and rb2 > 0:
        dx, dy = hx - sx, hy - sy
        d = sqrt(dx * dx + dy * dy)
        ra, rb = sqrt(ra2), sqrt(rb2)
        if abs(ra - rb) < d < ra + rb:
            along = (ra2 - rb2 + d * d) / (2 * d)
            h = sqrt(max(0., ra2 - along * along))
            mx, my = sx + dx * along / d, sy + dy * along / d
            options = [(mx - dy * h / d, my + dx * h / d, rest), (mx + dy * h / d, my - dx * h / d, rest)]
            # Stay on the branch nearest the continuous rib-side elbow (no flips).
            best = min(options, key=lambda q: norm(sub(q, near or ELBOW)))
    pole = best or add(shoulder, (.35, -.8, -.4))
    p.arm(s, HAND, pole=pole, palm=HAND_PALM, contact=True)


def _elbow_arc(p, s, shoulder, pole_a, pole_b, t):
    """Pole that places the elbow at angle-interpolated position between the elbows that
    pole_a and pole_b give, rotating about the shoulder-hand axis the way that stays higher."""
    axis = unit(sub(HAND, shoulder))

    def elbow_dir(pole):
        p.arm(s, HAND, pole=pole, palm=HAND_PALM, contact=True)
        v = sub(p.j['elbow_' + s], shoulder)
        return unit(sub(v, mul(axis, dot(v, axis))))
    ea, eb = elbow_dir(pole_a), elbow_dir(pole_b)
    ortho = cross(axis, ea)
    angle_b = __import__('math').atan2(dot(eb, ortho), dot(eb, ea))
    candidates = [angle_b, angle_b - 2 * pi if angle_b > 0 else angle_b + 2 * pi]

    def direction(theta):
        return add(mul(ea, cos(theta)), mul(ortho, sin(theta)))
    # Prefer the rotation whose halfway point is higher (away from the floor).
    angle = max(candidates, key=lambda ang: direction(ang / 2)[2])
    d = direction(angle * t)
    return add(shoulder, add(mul(axis, .2), mul(d, .5)))


def _support_arm(p, a, b, u):
    s = SUPPORT
    shoulder = p.j['shoulder_' + s]
    modes = (a['hand'], b['hand'])
    free_pole = add(shoulder, (-.3, -.3, -.3))
    if set(modes) <= {'lie_arm', 'forearm'}:
        # Lying and the elbow hold: forearm on the floor, elbow planted. During the roll the
        # forearm rests on the floor and slides into place (a rolling contact).
        p.arm(s, HAND, pole=PLANTED, palm=HAND_PALM, contact=True)
        if norm(sub(p.j['elbow_' + s], PLANTED)) < 1e-6:
            p.contacts['elbow_' + s] = PLANTED
        return
    if 'free' not in modes:
        rib = add(shoulder, RIB_POLE)
        if 'forearm' in modes:
            # Elbow to post: the elbow lifts up off the floor, then swings toward the ribs.
            t = u if modes[1] == 'floor' else 1 - u
            # The elbow rotates about the shoulder-hand axis from the planted spot to its
            # rib-side post position, going over the top (never under the floor).
            pole = _elbow_arc(p, s, shoulder, PLANTED, rib, smooth(t))
        else:
            pole = rib
        p.arm(s, HAND, pole=pole, palm=HAND_PALM, contact=True)
        if p.j['elbow_' + s][2] < .07:
            p.contacts['roll_elbow'] = (p.j['elbow_' + s][0], p.j['elbow_' + s][1], 0.)
        return
    rest = Pose('tmp', 0).torso(p.j['pelvis'])
    rest.j['shoulder_' + s] = shoulder
    rest.arm_fk(s, shoulder_angle=radians(15), elbow_flex=radians(14), outward=.30)
    free = rest.j['wrist_' + s]
    if modes == ('free', 'free'):
        p.arm(s, free, pole=free_pole)
        return
    t = u if modes[0] == 'floor' else 1 - u
    target = add(tuple(x + (y - x) * smooth(t) for x, y in zip(HAND, free)), (0., 0., .10 * sin(pi * t)))
    offset = sub(target, shoulder)
    d = norm(offset)
    if d > MAX_REACH:
        target = add(shoulder, mul(offset, MAX_REACH / d))
    # Starts from the posted arm's rib-side elbow, so lifting the hand does not jump the elbow.
    rib = add(shoulder, RIB_POLE)
    p.arm(s, target, pole=tuple(x + (y - x) * smooth(t) for x, y in zip(rib, free_pole)))
    w = p.j['wrist_' + s]
    rest_dir = mul(unit(sub(w, p.j['elbow_' + s])), .065)
    # Rigid hand: blend the direction, keep the length.
    hand_dir = unit(tuple(x + (y - x) * smooth(t) for x, y in zip(unit(sub(HAND_PALM, HAND)), unit(rest_dir))))
    p.j['palm_' + s] = add(w, mul(hand_dir, .065))


def _build(name, phase, st, dx, dy):
    a, b, u = st['a'], st['b'], st['u']
    out = _mix(a, b, u)
    roll = {id(a), id(b)} == {id(LIE[1]), id(ELB[1])}
    p = Pose(name, phase)
    if roll:
        _roll_trunk(p, u if b is ELB[1] else 1 - u)
    else:
        trunk(p, out['pelvis'], out['up'], out['twist'])
    # Lying on the back: the hips rest on the floor; the upper back rolls off it
    # (a rolling contact, not pinned) until the chest has lifted.
    if out['pelvis'][2] <= FLOOR_PELVIS + 1e-9:
        p.contacts['buttock'] = (out['pelvis'][0], out['pelvis'][1], 0.)
        # Both shoulder blades roll on the floor until their side lifts off.
        if p.j['chest'][2] <= FLOOR_PELVIS + 1e-9:
            p.contacts['upper_back'] = (p.j['chest'][0], p.j['chest'][1], 0.)
        for s in SIDES:
            blade = tuple(c + (q - c) * .6 for c, q in zip(p.j['chest'], p.j['shoulder_' + s]))
            # The support-side blade rolls along the floor until the elbow takes the weight.
            if blade[2] < FLOOR_PELVIS + (BLADE_ROLL if s == SUPPORT else .05):
                p.contacts['roll_blade_' + s] = (blade[0], blade[1], 0.)
    ankle = foot(p, BELL_SIDE, FOOT_L)
    p.leg(BELL_SIDE, FOOT_L, pole=add(p.j['hip_' + BELL_SIDE], (.3, .2, 1.)))
    _support_leg(p, a, b, u, out)
    _support_arm(p, a, b, u)
    shoulder = p.j['shoulder_' + BELL_SIDE]
    wrist = add(shoulder, (0., 0., MAX_REACH))
    one_hand(p, BELL_SIDE, wrist, (-.6, .25, -.6), pole=add(shoulder, (-.3, .3, .1)))
    # Eyes on the bell on the floor; standing, the gaze drops toward the horizon.
    high = min(1., max(0., (out['pelvis'][2] - .45) / .4))
    target = add(p.j['wrist_' + BELL_SIDE], (0., 0., .1))
    target = tuple(x + (y - x) * high for x, y in zip(target, add(p.j['head'], (2., 0., .6))))
    gaze(p, target, limit=radians(70), gain=.85)
    return p


class GetUp(Lift):
    """Key interpolation with named stage modes (no hip-shift balance; balance is authored)."""

    def state(self, phase):
        phase %= 1.
        i = max(k for k in range(len(KEYS)) if KEYS[k][0] <= phase)
        t0, (_, a) = KEYS[i]
        t1, (_, b) = KEYS[(i + 1) % len(KEYS)]
        if i == len(KEYS) - 1:
            t1 += 1.
        u = (phase - t0) / (t1 - t0)
        if {a['leg'], b['leg']} == {'toes', 'stand'}:
            return {'a': a, 'b': b, 'u': u}         # the step has its own time law
        return {'a': a, 'b': b, 'u': minjerk(u)}


# The bell is held firmly overhead; it settles behind the forearm. A 32 s loop damps out in one pass.
GETUP = GetUp('kb-getup', LOOP, None, _build, {'azimuth': -40, 'elevation': 24}, balance='',
              bell={'stiffness': 150., 'damping': .8, 'loops': 2}, look=False)
