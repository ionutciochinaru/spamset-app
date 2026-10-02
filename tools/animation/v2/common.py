"""Shared v2 body, feet, leg and kettlebell-grip builders.

Bells use real 16 kg cast-iron proportions and carry their mass, so balance and
the drawn model agree. Grips are exact: wrists sit on the handle (or horns) and
the validator checks it.
"""
from math import sin, cos, sqrt, radians

try:
    from ..rig import (Pose, SIDES, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM, HIP_HALF, THIGH, SHIN,
                       side_sign, add, sub, mul, unit, cross, dot, norm, rotate_y)
except ImportError:
    from rig import (Pose, SIDES, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM, HIP_HALF, THIGH, SHIN,
                     side_sign, add, sub, mul, unit, cross, dot, norm, rotate_y)

BELL = {'mass': 16., 'radius': .105, 'handle_to_center': .165, 'handle_half': .095}
MAX_REACH = UPPER_ARM + FOREARM - .0012     # elbow ~173 deg: a locked-out arm
HORN_ROOT = (.62, .74)        # horn root on the body, in bell radii (across, up)


def tall(width, slack=.06):
    """Pelvis height for standing tall on ankles `width` from the midline: knees at about
    174 degrees, leaving room for a hip shift of `slack` without overreaching."""
    from math import sqrt as _sqrt, cos as _cos, radians as _rad
    leg = _sqrt(THIGH ** 2 + SHIN ** 2 + 2 * THIGH * SHIN * _cos(_rad(6)))
    return ANKLE_HEIGHT + _sqrt(max(0., leg ** 2 - (width - HIP_HALF) ** 2 - slack ** 2))


def trunk(name, phase, pelvis, lean=0., bend=0., twist=0., pack=(0., 0.)):
    """Torso: sagittal lean (forward +), lateral bend (toward +y = left), twist about the trunk.

    pack[side] rotates that clavicle down (radians); lengths stay exact.
    """
    up = unit((sin(lean) * cos(bend), sin(bend), cos(lean) * cos(bend)))
    p = Pose(name, phase).torso(pelvis, up=up)
    up = p.up
    base = sub((0., 1., 0.), mul(up, dot((0., 1., 0.), up)))
    lateral = unit(base)
    if twist:
        c, s = cos(twist), sin(twist)
        lateral = add(add(mul(lateral, c), mul(cross(up, lateral), s)), mul(up, dot(up, lateral) * (1 - c)))
    for i, s in enumerate(SIDES):
        a = pack[i]
        direction = add(mul(lateral, side_sign(s) * cos(a)), mul(up, -sin(a)))
        p.j['shoulder_' + s] = add(p.j['chest'], mul(direction, SHOULDER_HALF))
    p.forward = unit(cross(lateral, up))
    p.j['face'] = add(p.j['head'], mul(p.forward, .075))
    return p


def _rotate(v, axis, angle):
    c, s = cos(angle), sin(angle)
    return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))


def gaze(p, target, limit=radians(35), gain=.6):
    """Turn the head about the neck so the face turns toward `target`: the head rotates by
    part of the angle between the trunk's forward and the line of sight (the eyes do the
    rest), at most `limit`. Neck length is unchanged."""
    from math import acos
    neck, head = p.j['neck'], p.j['head']
    up = unit(sub(head, neck))
    front = unit(sub(p.forward, mul(up, dot(p.forward, up))))
    look = unit(sub(target, head))
    angle = acos(max(-1., min(1., dot(front, look))))
    axis = cross(front, look)
    if angle < 1e-6 or norm(axis) < 1e-9:
        return
    axis = unit(axis)
    turn = min(limit, angle * gain)
    p.j['head'] = add(neck, mul(_rotate(up, axis, turn), norm(sub(head, neck))))
    p.j['face'] = add(p.j['head'], mul(_rotate(front, axis, turn), .075))


def look_ahead(p, distance=2.5):
    """Standing lifts: eyes on the floor `distance` ahead when hinged, on the horizon when
    upright (a long, neutral neck rather than a head that drops with the trunk)."""
    head = p.j['head']
    up = unit(sub(p.j['chest'], p.j['pelvis']))
    sagittal = up[2] / max(1e-9, sqrt(up[0] ** 2 + up[2] ** 2))      # side bends don't count
    upright = max(0., min(1., (sagittal - .5) / .5))
    floor = (head[0] + distance, head[1], 0.)
    horizon = (head[0] + distance, head[1], head[2] - .15)
    gaze(p, tuple(a + (b - a) * upright for a, b in zip(floor, horizon)), limit=radians(30))


def foot(p, s, ankle, yaw=0., pitch=0., contact=True):
    """Foot with toe-out yaw (outward +) and pitch about the forefoot (heel up +)."""
    sg = side_sign(s)
    yaw = sg * yaw

    def place(v):
        v = rotate_y(v, pitch)
        return (v[0] * cos(yaw) - v[1] * sin(yaw), v[0] * sin(yaw) + v[1] * cos(yaw), v[2])
    toe = add(ankle, place((.16, 0., -ANKLE_HEIGHT)))
    heel = add(ankle, place((-.075, 0., -ANKLE_HEIGHT)))
    p.j['ankle_' + s], p.j['toe_' + s], p.j['heel_' + s] = tuple(ankle), toe, heel
    if contact:
        p.contacts['toe_' + s] = toe
        if abs(pitch) < 1e-7:
            p.contacts['heel_' + s] = heel
    return (cos(yaw), sin(yaw), 0.)


def toe_from(s, toe, yaw=0., pitch=0.):
    """Ankle position that puts the toe exactly at `toe` (for a planted forefoot)."""
    sg = side_sign(s)
    y = sg * yaw
    v = rotate_y((.16, 0., -ANKLE_HEIGHT), pitch)
    v = (v[0] * cos(y) - v[1] * sin(y), v[0] * sin(y) + v[1] * cos(y), v[2])
    return sub(toe, v)


def stance(p, width, yaw=radians(14), x=0., out=.08):
    """Both feet planted, ankles `width` from the midline; knees track over the toes
    (`out` pushes them further out, e.g. to make room for the arms in a deadlift)."""
    for s in SIDES:
        ankle = (x, side_sign(s) * width, ANKLE_HEIGHT)
        direction = foot(p, s, ankle, yaw)
        leg(p, s, direction, out=out)


def leg(p, s, toe_direction, out=.08, pole=None):
    hip = p.j['hip_' + s]
    pole = pole or add(hip, add(toe_direction, (0., side_sign(s) * out, 0.)))
    p.leg(s, p.j['ankle_' + s], pole=pole)


def reach(shoulder, target, limit=MAX_REACH):
    offset = sub(target, shoulder)
    d = norm(offset)
    return target if d <= limit else add(shoulder, mul(offset, limit / d))


def _bell(center, handle, grips, horns=None, grip_joint='wrist'):
    prop = {'type': 'kettlebell', 'center': list(center), 'handle': [list(h) for h in handle],
            'radius': BELL['radius'], 'mass': BELL['mass'], 'grips': {s: list(g) for s, g in grips.items()}}
    if horns:
        prop['horns'] = [[list(a), list(b)] for a, b in horns]
    if horns or grip_joint != 'wrist':
        prop['grip_joint'] = grip_joint
    return prop


def handle_grip(p, grip, bell_dir, across=(0., 1., 0.), spacing=.045, poles=None, wrists=None):
    """Both hands side by side on the handle; the bell hangs from it along bell_dir.

    wrists: optional {side: offset of the wrist from its grip point}. The palm then holds
    the handle a hand-length from the wrist (the hand bridges the gap), instead of the
    wrist joint sitting on the handle."""
    across = unit(across)
    bell_dir = unit(bell_dir)
    grips = {s: add(grip, mul(across, side_sign(s) * spacing)) for s in SIDES}
    for s in SIDES:
        pole = (poles or {}).get(s) or add(p.j['shoulder_' + s], (-.3, side_sign(s) * .25, -.25))
        wrist = add(grips[s], wrists[s]) if wrists else grips[s]
        p.arm(s, wrist, pole=pole, palm=grips[s])
    handle = [add(grip, mul(across, BELL['handle_half'])), add(grip, mul(across, -BELL['handle_half']))]
    p.props.append(_bell(add(grip, mul(bell_dir, BELL['handle_to_center'])), handle, grips,
                         grip_joint='palm' if wrists else 'wrist'))


REST_GAP = BELL['radius'] + .027 + .006     # bell body + forearm radius + a little skin


def settle(bell_dir, arm, rest_side):
    """A bell pivots freely on its handle. It points along `bell_dir` (gravity or its
    momentum) unless that would put it through the forearm; then it rests against the
    forearm on `rest_side` (e.g. outside the forearm in the rack, behind it overhead)."""
    from math import asin, acos
    toward_elbow = mul(arm, -1.)
    v = unit(bell_dir)
    need = asin(min(1., REST_GAP / BELL['handle_to_center']))
    angle = acos(max(-1., min(1., dot(v, toward_elbow))))
    if angle >= need:
        return v
    # Which way it falls off the forearm: gravity's sideways part, biased toward rest_side
    # more as gravity lines up with the forearm. The bias is zero at the resting angle,
    # so the result is continuous and the bell never flips sides.
    side = unit(rest_side)
    w = (need - angle) / need
    perp = add(sub(v, mul(toward_elbow, dot(v, toward_elbow))),
               mul(sub(side, mul(toward_elbow, dot(side, toward_elbow))), w))
    perp = unit(perp)
    return unit(add(mul(toward_elbow, cos(need)), mul(perp, sin(need))))


def place_bell(p, s, bell_dir, across=None):
    """Bell prop hanging from the hand at wrist_s along bell_dir (no forearm check).

    across: the handle direction (from the bell simulation, which keeps it steady over
    time). Without it the handle runs side to side across the body, perpendicular to the hang."""
    w = p.j['wrist_' + s]
    bell_dir = unit(bell_dir)
    if across is None:
        left = unit(sub(p.j['shoulder_l'], p.j['shoulder_r']))
        across = sub(left, mul(bell_dir, dot(left, bell_dir)))
        if norm(across) < 1e-6:
            across = cross(bell_dir, (0., 1., 0.))
    across = unit(sub(across, mul(bell_dir, dot(across, bell_dir))))
    handle = [add(w, mul(across, BELL['handle_half'])), add(w, mul(across, -BELL['handle_half']))]
    return _bell(add(w, mul(bell_dir, BELL['handle_to_center'])), handle, {s: w})


def attach_bell(p, s, bell_dir, rest_side=None):
    """Bell on the hand already placed at wrist_s, settled against the forearm if needed.

    This is the authored (static) direction; lifts with a bell simulation replace it
    with the swinging one (v2/bell.py)."""
    arm = unit(sub(p.j['wrist_' + s], p.j['elbow_' + s]))
    bell_dir = settle(bell_dir, arm, rest_side or (-.55, side_sign(s) * .85, 0.))
    p.props.append(place_bell(p, s, bell_dir))


def one_hand(p, s, wrist, bell_dir, pole, rest_side=None):
    """Single-hand grip at the handle centre."""
    wrist = reach(p.j['shoulder_' + s], wrist)
    p.arm(s, wrist, pole=pole, palm=wrist)
    attach_bell(p, s, bell_dir, rest_side)


def horns_grip(p, center, up=(0., 0., 1.), across=(0., 1., 0.), height=.62, poles=None):
    """Bell held by the horns (goblet): upright, base down, hands around the horns.

    `height` places each hand along its horn from root (0) to handle corner (1).
    """
    r = BELL['radius']
    up, across = unit(up), unit(across)
    handle = [add(add(center, mul(up, BELL['handle_to_center'])), mul(across, sg * BELL['handle_half'])) for sg in (1, -1)]
    roots = [add(add(center, mul(up, HORN_ROOT[1] * r)), mul(across, sg * HORN_ROOT[0] * r)) for sg in (1, -1)]
    grips = {}
    for i, s in enumerate(SIDES):
        grips[s] = add(roots[i], mul(sub(handle[i], roots[i]), height))
        pole = (poles or {}).get(s) or add(p.j['shoulder_' + s], (.05, side_sign(s) * .12, -.6))
        p.arm(s, grips[s], pole=pole, palm=grips[s])
    p.props.append(_bell(center, handle, grips, horns=list(zip(roots, handle))))


def hang_free(p, s, angle=radians(6), elbow=radians(10), outward=.12):
    p.arm_fk(s, shoulder_angle=angle, elbow_flex=elbow, outward=outward)
