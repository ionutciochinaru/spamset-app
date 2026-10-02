"""v2 single-arm lifts (left arm): clean, press, snatch.

Hand targets are authored relative to the chest, so the load-aware hip shift
and the hinge carry the arm with the trunk. Flowing lifts use a periodic
Hermite spline (continuous velocity; 'hold' keys stop exactly).
Baseline fixes: the backswing runs through the midline between the knees with
the hand at the groin; the clean pulls the elbow back and in; the rack forearm
is vertical with the elbow under the wrist; the press keeps the wrist stacked
over the elbow; the snatch punch-through passes wide of the head.
"""
from math import sin, cos, radians

try:
    from ..rig import SIDES, SHOULDER_HALF, side_sign, add, sub, mul, unit, norm
    from .common import MAX_REACH, tall, trunk, stance, one_hand
    from .framework import Lift
except ImportError:
    from rig import SIDES, SHOULDER_HALF, side_sign, add, sub, mul, unit, norm
    from v2.common import MAX_REACH, tall, trunk, stance, one_hand
    from v2.framework import Lift

ARM, FREE = 'l', 'r'
STANCE, YAW = .30, radians(18)
PACK = radians(6)
TALL = tall(STANCE, .13)
# Bell on the handle: flowing lifts let it swing; a grind holds it firmly and damps it.
SWING = {'stiffness': 150., 'damping': .6}
GRIND = {'stiffness': 300., 'damping': 1.1}


def _pelvis(h):
    return (-.25 * h, 0., TALL - (TALL - .83) * h), radians(64) * h


def _build(name, phase, st, dx, dy):
    (px, py, pz), lean = _pelvis(st['hinge'])
    p = trunk(name, phase, (px + dx, py + dy, pz), lean, pack=(PACK * st['pack'], radians(2)))
    stance(p, STANCE, YAW)
    chest = p.j['chest']
    shoulder = p.j['shoulder_' + ARM]
    wrist = add(chest, st['wrist'])
    if st['long'] > 0:
        # A long arm swings in an arc about the shoulder: push the hand out to full reach.
        d = sub(wrist, shoulder)
        length = norm(d)
        wrist = add(shoulder, mul(d, (length + (MAX_REACH - length) * min(1., st['long'])) / length))
    pole = add(shoulder, st['pole'])
    # The bell points where gravity or its momentum takes it (authored per key) and
    # settles against the forearm when it would otherwise pass through it.
    arm = unit(sub(wrist, shoulder))
    down = max(0., -arm[2])
    bell = add(unit(st['bell']), mul(arm, 1.4 * down))
    one_hand(p, ARM, wrist, bell, pole)
    # Free arm hangs plumb and slightly out, following the hinge.
    p.arm_fk(FREE, shoulder_angle=radians(6), elbow_flex=radians(14), outward=.20)
    return p


def key(t, hinge, wrist, pole, bell, pack=1., hold=False, grip=0., long=0.):
    return (t, {'hinge': hinge, 'wrist': wrist, 'pole': pole, 'bell': bell, 'pack': pack, 'grip': grip, 'long': long},
            hold)


# Chest-relative targets (m). Standing chest is ~1.33 m high; shoulder at +0.19 y.
# Rack: forearm vertical with the hand at the collarbone, elbow tucked on the ribs; the bell
# nests in the V between forearm and upper arm, against the chest.
RACK = dict(wrist=(.08, .09, -.02), pole=(.05, -.10, -.80), bell=(-.60, .40, -.70), grip=1.)
LOCK_DIR = unit((.02, -.15, 1.))                # arm by the ear, hand over the shoulder
LOCK_PACK = -1.2                              # shoulder raised at lockout (times PACK)
_lock_shoulder = (0., SHOULDER_HALF * cos(PACK * LOCK_PACK), -SHOULDER_HALF * sin(PACK * LOCK_PACK))
LOCKOUT = dict(wrist=add(_lock_shoulder, mul(LOCK_DIR, MAX_REACH)), pole=(-.35, .30, .10), long=1.,
               bell=(-.55, .35, -.75), grip=1.)             # resting behind and outside the forearm
# Hike: the arm long (straight) and pointing down and back, hand deep between the thighs.
BACK = dict(wrist=(-.30, .021, -.46), pole=(-.35, .10, .10), bell=(-.55, .12, -.85), long=1.)
# Bottom of the arc after the hike: the arm stays long as the hand passes under the hips,
# reaching only ~20 cm in front of them at the hip snap (no cast); the grip guides the bell
# so it trails under the hand instead of floating out.
LOW = dict(wrist=(.04, .06, -.56), pole=(-.35, .10, .10), bell=(-.30, 0., -1.), grip=.3, long=1.)
DRIVE = dict(wrist=(.16, .08, -.54), pole=(-.35, .08, -.05), bell=(0., 0., -1.), grip=.3, long=1.)


def _k(t, hinge, spec, pack=1., hold=False, **override):
    s = dict(spec, **override)
    return key(t, hinge, s['wrist'], s['pole'], s['bell'], pack, hold, s.get('grip', 0.), s.get('long', 0.))


CLEAN = Lift('kb-clean', 2.6, [
    _k(0.00, 0., RACK, 0., True), _k(0.14, 0., RACK, 0., True),
    # Uncurl close to the body into the hinge.
    _k(0.30, .45, dict(wrist=(.18, .04, -.42), pole=(-.3, .08, .05), bell=(.05, 0., -1.))),
    _k(0.45, 1., BACK, 1., True),
    _k(0.53, .62, LOW),
    # Hip snap: the arm is still long but the elbow starts to draw back straight away.
    _k(0.61, .14, dict(DRIVE, wrist=(.13, .08, -.50), long=.3)),
    # Elbow back and in, hand up the body ("zip up the jacket"); the bell stays close.
    _k(0.69, 0., dict(wrist=(.14, .10, -.22), pole=(-.35, .02, -.35), bell=(-.10, .10, -1.), grip=.5)),
    # Hand comes around the bell and the bell lands in the rack (a quick catch, then settle).
    _k(0.77, 0., dict(wrist=(.11, .10, -.07), pole=(.05, -.1, -.75), bell=(-.4, .3, -.85), grip=.8), .5),
    _k(0.83, 0., RACK, 0., True),
], _build, {'azimuth': 40, 'elevation': 10}, smooth='hermite', bell=SWING)


# Mid-press: upper arm 50 deg in front of the frontal plane and 20 deg below horizontal, the
# forearm vertical above the elbow.
MID_PRESS = dict(wrist=(.212, .367, .165), pole=(.72, .60, -.34), bell=(-.85, .10, -.5), grip=1.)

PRESS = Lift('kb-press', 4.4, [
    # A strict grind: ~1.4 s up at an even speed, a pause at lockout, ~2 s down.
    _k(0.00, 0., RACK, 0., True), _k(0.10, 0., RACK, 0., True),
    # Wrist stacked over the elbow; elbow ~40 degrees in front of the frontal plane.
    _k(0.245, 0., MID_PRESS, 0.),
    # Overhead the shoulder blade rotates up: the shoulder rises a little (negative pack).
    _k(0.42, 0., LOCKOUT, LOCK_PACK, True), _k(0.54, 0., LOCKOUT, LOCK_PACK, True),
    # Lowering: the elbow comes down and out under the bell, then tucks into the rack.
    _k(0.83, 0., dict(MID_PRESS, wrist=(.16, .32, .12)), 0.),
], _build, {'azimuth': 36, 'elevation': 8}, bell=GRIND, smooth='catmull')   # keeps moving through mid-press


SNATCH = Lift('kb-snatch', 2.8, [
    _k(0.00, 0., LOCKOUT, LOCK_PACK, True), _k(0.04, 0., LOCKOUT, LOCK_PACK, True),
    # Turn the bell over in front of the shoulder and let it drop close to the body, arm long.
    # Turn the bell over in front of the shoulder (elbow soft), then let the arm lengthen as it falls.
    _k(0.17, .05, dict(wrist=(.30, .24, .18), pole=(-.3, .35, .05), bell=(-.3, .3, -.9), grip=.4, long=.4)),
    _k(0.28, .15, dict(wrist=(.46, .17, -.42), pole=(-.3, .25, .0), bell=(0., .15, -1.), long=1.)),
    _k(0.44, 1., dict(BACK, bell=(-.55, .10, -.85)), 1., True),
    _k(0.52, .62, LOW),
    _k(0.61, .14, dict(DRIVE, pole=(-.25, .40, .20))),   # elbow already set to bend up and out
    # High pull: elbow up and back, bell hanging close below the hand.
    _k(0.70, 0., dict(wrist=(.22, .27, .02), pole=(-.2, .50, .25), bell=(.10, .35, -1.), grip=.3)),
    # Punch through beside the head as the bell floats over onto the back of the forearm.
    _k(0.80, 0., dict(wrist=(.10, .33, .36), pole=(-.3, .50, .1), bell=(-.45, .55, -.7), grip=.7)),
    # ... and lock out quickly (a punch, not a press), then hold.
    _k(0.87, 0., LOCKOUT, LOCK_PACK, True),
], _build, {'azimuth': 40, 'elevation': 10}, smooth='hermite', bell=SWING)


SINGLE_ARM = {lift.name: lift for lift in (CLEAN, PRESS, SNATCH)}
