"""Offline push-up variations (P18 batch 2) on the existing fixed-length rig.

Built like motions.pushup: feet on their toes, a straight body line pivoting
about the feet, hands planted. Sources S5, S6, S30-S36 in
docs/animation-review/form-research.md. No watch-side code.
"""
from math import sin, cos, pi, sqrt, atan2
try:
    from .rig import *
    from .stretches import rotate, mix_point, stage, set_head
except ImportError:
    from rig import *
    from stretches import rotate, mix_point, stage, set_head

TOP, BOTTOM = radians(18.8), radians(8.0)
SIDE_VIEW = {'azimuth': 73, 'elevation': 12}
HANDS_VIEW = {'azimuth': 38, 'elevation': 30}


def plank_body(p, angle, feet=None, toe_x=-1., foot_y=HIP_HALF, toe_z=0.):
    """Toes planted, straight body from the ankles at `angle` above horizontal."""
    u = (cos(angle), 0, sin(angle))
    feet = feet or {s: (toe_x, side_sign(s)*foot_y, toe_z) for s in SIDES}
    ankles = {s: p.foot(s, toe=feet[s], pitch=radians(60)) for s in SIDES}
    center = mul(add(ankles['l'], ankles['r']), .5)
    p.torso(add(center, mul(u, THIGH+SHIN)), up=u)
    for s in SIDES:
        p.straight_leg(s, ankles[s], u)
    return u, ankles


def plant_hands(p, hands, elbows='out', reverse=False):
    """hands: {side: (x, y)} on the floor. elbows 'out' flare, 'in' stay by the ribs."""
    for s in SIDES:
        sg = side_sign(s)
        x, y = hands[s]
        wrist = (x, y, .05)
        palm = (x-.05 if reverse else x+.05, y, .014)
        pole = (-.4, sg*.3, -.15) if elbows == 'out' else (-.45, sg*.04, .05)
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], pole), palm=palm, contact=True)
    return p


def press_angle(t):
    return TOP+(BOTTOM-TOP)*t


def pushup_variant(name, phase, hands, elbows='out', reverse=False, view=SIDE_VIEW, top=TOP):
    t = pulse(phase)
    p = Pose(name, phase)
    plank_body(p, top+(BOTTOM-top)*t)
    plant_hands(p, hands, elbows, reverse)
    p.view = dict(view)
    return p


def wide_pushup(name, phase):
    """S30: hands farther apart than the shoulders."""
    return pushup_variant(name, phase, {s: (.18, side_sign(s)*.37) for s in SIDES}, view=HANDS_VIEW, top=radians(17.3))


def close_pushup(name, phase):
    """S30 (diamond/close): hands close together under the chest, elbows by the sides."""
    return pushup_variant(name, phase, {s: (.20, side_sign(s)*.07) for s in SIDES}, elbows='in', view=HANDS_VIEW, top=radians(18))


def staggered_pushup(name, phase):
    """S34: one hand a little forward, the other a little wider."""
    # ~28 cm stagger (one hand by the forehead line, one by the ribs): 13 cm read as a plain push-up.
    return pushup_variant(name, phase, {'l': (.38, .24), 'r': (.10, -.28)}, top=radians(17.8), view=HANDS_VIEW)


def stacked_feet_pushup(name, phase):
    """Chart-defined: one foot rests on the other; S5/S6 body line and press."""
    t = pulse(phase)
    p = Pose(name, phase)
    feet = {'l': (-1., 0., 0.), 'r': (-1.02, 0., .10)}
    # Arms straight at the top (~160 deg, as the standard push-up); same bottom.
    angle = TOP-radians(2.3)+(BOTTOM-radians(4)-(TOP-radians(2.3)))*t
    u = (cos(angle), 0, sin(angle))
    ankles = {'l': p.foot('l', toe=feet['l'], pitch=radians(60))}
    # The top foot rests squarely on the lower one, toes off the floor.
    ankles['r'] = p.foot('r', ankle=add(ankles['l'], (-.02, 0., .095)), pitch=radians(70), contact=False)
    center = mul(add(ankles['l'], ankles['r']), .5)
    p.torso(add(center, mul(u, THIGH+SHIN)), up=u)
    for s in SIDES:
        hip = p.j['hip_'+s]
        p.j['knee_'+s] = mix_point(hip, ankles[s], THIGH/(THIGH+SHIN))
        p.j['ankle_'+s] = add(hip, mul(unit(sub(ankles[s], hip)), THIGH+SHIN))
    plant_hands(p, {s: (.22, side_sign(s)*.225) for s in SIDES})
    # Low side view: one foot visibly on top of the other.
    p.view = {'azimuth': 80, 'elevation': 6}
    return p


def two_reps(phase):
    """(side, local phase): two repetitions per loop, left then right."""
    return ('l' if phase < .5 else 'r'), (phase*2) % 1.


def raised_leg_pushup(name, phase):
    """S35 (user sequence): lift one straight leg, do the push-up with it raised, lower it; switch sides."""
    side, local = two_reps(phase)
    lift = stage(local, 0, .18)*(1-stage(local, .82, 1.))
    t = pulse(stage(local, .18, .82)) if .18 < local < .82 else 0.
    p = Pose(name, phase)
    u, ankles = plank_body(p, press_angle(t))
    hip = p.j['hip_'+side]
    down = rotate(mul(u, -1), (0, 1, 0), radians(24)*lift)
    ankle = add(hip, mul(down, THIGH+SHIN))
    p.j['knee_'+side] = add(hip, mul(down, THIGH))
    p.j['ankle_'+side] = ankle
    p.foot(side, ankle=ankle, pitch=radians(60), contact=lift < 1e-6)
    plant_hands(p, {s: (.24, side_sign(s)*.225) for s in SIDES})
    p.view = {'azimuth': 62, 'elevation': 14}
    return p


def knee_drive(p, side, amount, target, pole):
    """Bring one foot off the floor toward `target` (relative to its hip)."""
    hip = p.j['hip_'+side]
    planted = p.j['ankle_'+side]
    # Eased: near full extension a millimetre of leg shortening moves the knee centimetres, so
    # a linear start made the knee pop out in one frame.
    ankle = mix_point(planted, add(hip, target), smooth(amount))
    p.leg(side, ankle, pole=add(hip, pole))
    p.foot(side, ankle=p.j['ankle_'+side], pitch=radians(60+40*amount), contact=amount < 1e-6)


def spiderman_pushup(name, phase):
    """Chart-defined: as you lower, bring one knee out to the same-side elbow; alternate."""
    side, local = two_reps(phase)
    t = pulse(local)
    sg = side_sign(side)
    p = Pose(name, phase)
    plank_body(p, press_angle(t))
    knee_drive(p, side, t, (.04, sg*.40, -.08), (.8, sg*.9, .2))
    plant_hands(p, {s: (.24, side_sign(s)*.26) for s in SIDES})
    p.view = {'azimuth': 40 if side == 'l' else 40, 'elevation': 40}
    return p


def explosive(name, phase, clap):
    """S32: lower, press explosively so the hands leave the floor (clap in the air), land softly."""
    hands = {s: (.24, side_sign(s)*.26) for s in SIDES}
    if phase < .35:
        angle, air = press_angle(smooth(phase/.35)), 0.
    elif phase < .60:
        k = smooth((phase-.35)/.25)
        angle, air = BOTTOM+(radians(27)-BOTTOM)*k, stage(phase, .45, .60)
    elif phase < .78:
        k = smooth((phase-.60)/.18)
        angle, air = radians(27)+(TOP-radians(27))*k, 1-stage(phase, .66, .78)
    else:
        angle, air = TOP, 0.
    p = Pose(name, phase)
    plank_body(p, angle)
    if air < 1e-6:
        plant_hands(p, hands)
    else:
        # Clap: palms stop where they meet and stay together a moment (they crossed through
        # each other for two frames). Power: the hands lift higher and stay wide.
        gap = .045 if clap else .22
        clap_in = min(1., 1.6*sin(pi*stage(phase, .46, .74))) if clap else 0.
        for s in SIDES:
            sg = side_sign(s)
            floor = (hands[s][0], hands[s][1], .05)
            below = add(p.j['shoulder_'+s], (.10, -sg*(SHOULDER_HALF-gap)*clap_in, -.40 if clap else -.30))
            wrist = mix_point(floor, below, air)
            p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.4, sg*.3, -.15)))
    p.view = dict(SIDE_VIEW, azimuth=60, elevation=16)
    return p


def clapping_pushup(name, phase):
    return explosive(name, phase, True)


def power_pushup(name, phase):
    return explosive(name, phase, False)


def decline_pushup(name, phase):
    """S33: feet on a chair seat, hands on the floor, straight body; lower and press."""
    try:
        from .motions import chair_prop
    except ImportError:
        from motions import chair_prop
    t = pulse(phase)
    seat = .45
    p = Pose(name, phase)
    angle = radians(-2)+(radians(-13)-radians(-2))*t
    plank_body(p, angle, toe_x=-1.02, toe_z=seat+.004)
    plant_hands(p, {s: (.22, side_sign(s)*.24) for s in SIDES})
    p.props.append(chair_prop(x=-1.05, z=seat))
    p.contacts['seat'] = (-1.05, 0, seat)
    p.view = dict(SIDE_VIEW, azimuth=70, elevation=10)
    return p


def pike_pushup(name, phase):
    """S31: from an inverted V, bend the elbows to lower the head toward the floor; press back."""
    t = pulse(phase)
    hip_z = .80
    back = sqrt((THIGH+SHIN-.006)**2-(hip_z-ANKLE_HEIGHT-.036)**2)
    reach = TORSO+UPPER_ARM+FOREARM-.07
    front = sqrt(reach**2-(hip_z-.03)**2)
    top = atan2(hip_z-.03, front)
    # The trunk keeps its angle; hips and head lower together toward the hands.
    u = unit((cos(top), 0, -sin(top)))
    p = Pose(name, phase).torso((.08*t, 0, hip_z-.11*t), up=u)
    for s in SIDES:
        ankle = p.foot(s, ankle=(-back, side_sign(s)*HIP_HALF, ANKLE_HEIGHT+.036), pitch=radians(14))
        p.leg(s, ankle, pole=add(p.j['hip_'+s], (1, 0, 0)))
    top_u = unit((cos(top), 0, -sin(top)))
    for s in SIDES:
        sg = side_sign(s)
        shoulder_top = add(add((0, 0, hip_z), mul(top_u, TORSO)), (0, sg*SHOULDER_HALF, 0))
        # Hands an arm's length ahead of the top shoulders: straight arms in the inverted V.
        rise = shoulder_top[2]-.03
        wrist = (shoulder_top[0]+sqrt(.55**2-rise**2-.05**2), shoulder_top[1]+sg*.05, .03)
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.2, sg*.6, .4)), palm=add(wrist, (.065, 0, -.016)), contact=True)
    set_head(p, pitch=radians(15))
    p.view = {'azimuth': 66, 'elevation': 22}
    return p


PUSHUP_MOTIONS = {
    'wide-pushup': wide_pushup,
    'close-pushup': close_pushup,
    'staggered-pushup': staggered_pushup,
    'stacked-pushup': stacked_feet_pushup,
    'raised-leg-pushup': raised_leg_pushup,
    'spiderman-pushup': spiderman_pushup,
    'decline-pushup': decline_pushup,
    'clapping-pushup': clapping_pushup,
    'power-pushup': power_pushup,
    'pike-pushup': pike_pushup,
}
