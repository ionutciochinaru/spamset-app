"""Offline floor and plank moves from the bodyweight chart (P18 batch 3).

Sources S37-S60 in docs/animation-review/form-research.md; chart-defined moves
are marked in their docstrings. Built on the fixed-length rig and the stretch /
push-up helpers. No watch-side code.
"""
from math import sin, cos, pi, sqrt, asin, acos
try:
    from .rig import *
    from .stretches import (rotate, mix_point, stage, set_head, hold_cycle, ease_hold,
                            alternating, articulate, supine, kneel_on_all_fours, hands_under_shoulders)
    from .pushups import plank_body, plant_hands, press_angle, knee_drive, two_reps, TOP
except ImportError:
    from rig import *
    from stretches import (rotate, mix_point, stage, set_head, hold_cycle, ease_hold,
                           alternating, articulate, supine, kneel_on_all_fours, hands_under_shoulders)
    from pushups import plank_body, plant_hands, press_angle, knee_drive, two_reps, TOP

def asin_clamped(x):
    return asin(max(-1., min(1., x)))


SUPINE_VIEW = {'azimuth': 78, 'elevation': 12}
PLANK_VIEW = {'azimuth': 66, 'elevation': 16}


def toward_head(angle):
    """Direction from the pelvis toward the head for a supine trunk lifted `angle` off the floor."""
    return (-cos(angle), 0, sin(angle))


def curl(p, lower, upper):
    """Supine trunk curl: lower/upper spine lift angles (radians) from the floor."""
    articulate(p, toward_head(lower), toward_head(upper))
    if upper > 1e-6:
        # Curled up: the upper back and head have left the floor.
        p.contacts.pop('upper_back', None)
        p.contacts.pop('head_ground', None)
    return p


def hands_behind_head(p):
    up, forward = p.up, p.forward
    side = unit(cross(up, forward))
    for s in SIDES:
        sg = side_sign(s)
        wrist = add(add(p.j['head'], mul(forward, -.07)), mul(side, sg*.07))
        # Lying flat, the hands cradle the head on the mat instead of passing under the floor.
        wrist = (wrist[0], wrist[1], max(wrist[2], .045))
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], add(mul(side, sg*.6), mul(forward, .1))))
    return p


def arms_along_floor(p):
    """Straight arms resting on the floor beside the body, palms down."""
    for s in SIDES:
        shoulder = p.j['shoulder_'+s]
        # Out beside the hips, clear of the legs.
        d = unit((1, side_sign(s)*.42, min(0., .035-shoulder[2])))
        p.j['elbow_'+s] = add(shoulder, mul(d, UPPER_ARM))
        wrist = add(shoulder, mul(d, UPPER_ARM+FOREARM))
        p.j['wrist_'+s] = (wrist[0], wrist[1], max(wrist[2], .03))
        p.j['palm_'+s] = add(p.j['wrist_'+s], mul(d, .065))
        p.contacts['palm_'+s] = p.j['palm_'+s]
    return p


def feet_planted(p, x=.36):
    for s in SIDES:
        ankle = p.foot(s, ankle=(x, side_sign(s)*HIP_HALF, ANKLE_HEIGHT))
        p.leg(s, ankle, pole=add(p.j['hip_'+s], (0, 0, 1)))
    return p


def leg_from_hip(p, s, direction, knee_bend=0., pole=(0, 0, 1)):
    """Place a leg from its hip along `direction`, with an optional knee bend (radians)."""
    hip = p.j['hip_'+s]
    d = unit(direction)
    if knee_bend < 1e-6:
        p.j['knee_'+s] = add(hip, mul(d, THIGH))
        ankle = add(hip, mul(d, THIGH+SHIN))
        p.j['ankle_'+s] = ankle
    else:
        knee = add(hip, mul(d, THIGH))
        axis = unit(cross(d, unit(pole)))
        shin = rotate(d, axis, knee_bend)
        p.j['knee_'+s] = knee
        ankle = add(knee, mul(shin, SHIN))
        p.j['ankle_'+s] = ankle
    p.foot(s, ankle=ankle, pitch=-radians(60), contact=False)
    return ankle


def sit_ups(name, phase):
    """S37: knees bent, hands behind the head, curl up toward the knees, lower with control."""
    t = pulse(phase)
    p = supine(Pose(name, phase))
    curl(p, radians(45)*t, radians(70)*t)
    set_head(p, pitch=radians(10)*t)
    hands_behind_head(p)
    feet_planted(p)
    p.contacts['feet'] = (.36, 0, 0)
    p.view = {'azimuth': 70, 'elevation': 18}  # user-approved (10/10); keep
    return p


def reverse_crunches(name, phase):
    """S38: arms at the sides, knees at 90 degrees; curl the knees toward the chest, lifting the hips."""
    t = pulse(phase)
    # The back and arms stay still on the floor; only the legs move (user note).
    p = supine(Pose(name, phase))
    arms_along_floor(p)
    # At the top the hips curl off the floor (posterior tilt); chest and shoulders stay put.
    lift = smooth(stage(t, .35, 1.))
    mid = mix_point(p.j['chest'], p.j['pelvis'], .5)
    pelvis = add(mid, rotate((TORSO/2, 0, 0), (0, 1, 0), -radians(28)*lift))
    p.j['pelvis'], p.j['spine_mid'] = pelvis, mid
    for s in SIDES:
        p.j['hip_'+s] = add(pelvis, (0, side_sign(s)*HIP_HALF, 0))
        thigh = rotate((0, 0, 1), (0, 1, 0), -radians(45+15*lift)*t)
        leg_from_hip(p, s, thigh, knee_bend=radians(90), pole=(1, 0, 0))
    set_head(p)
    p.view = dict(SUPINE_VIEW)
    return p


def bicycle_crunches(name, phase):
    """S39: one knee drives in as the other leg extends; rotate the opposite elbow toward it; alternate."""
    side = 'l' if phase < .5 else 'r'
    local = (phase*2) % 1.
    t = pulse(local)
    p = supine(Pose(name, phase))
    curl(p, radians(12), radians(38))
    for s in SIDES:
        drive = t if s == side else 0.
        bent = rotate((0, 0, 1), (0, 1, 0), -radians(40)*drive)
        long = rotate((1, 0, 0), (0, 1, 0), -radians(25))
        d = unit(mix_point(long, bent, max(drive, .15)))
        leg_from_hip(p, s, d, knee_bend=radians(10+95*drive), pole=(1, 0, 0))
    # Rotate the shoulders toward the driving knee; the opposite elbow leads across to meet it.
    up, forward = p.up, p.forward
    turn = side_sign(side)*radians(40)*t
    side_axis = rotate(unit(cross(up, forward)), up, turn)
    forward = rotate(forward, up, turn)
    lead = 'r' if side == 'l' else 'l'
    for s in SIDES:
        sg = side_sign(s)
        p.j['shoulder_'+s] = add(p.j['chest'], mul(side_axis, sg*SHOULDER_HALF))
        wrist = add(add(p.j['head'], mul(forward, -.07)), mul(side_axis, sg*.07))
        pole = add(p.j['shoulder_'+s], add(mul(side_axis, sg*.6), mul(forward, .1)))
        if s == lead:
            pole = mix_point(pole, p.j['knee_'+side], t)
        p.arm(s, wrist, pole=pole)
    # More side-on: each leading elbow reads crossing toward the opposite knee.
    p.view = {'azimuth': 70, 'elevation': 14}
    return p


def flutter_kicks(name, phase):
    """S40: head and shoulders slightly lifted, legs hover; small quick alternating kicks."""
    # Back flat on the mat, head down: reads unmistakably as lying face up (user note).
    p = supine(Pose(name, phase))
    arms_along_floor(p)
    for s in SIDES:
        kick = sin(2*pi*2*phase + (0 if s == 'l' else pi))
        d = rotate((1, 0, 0), (0, 1, 0), -radians(14+9*kick))
        leg_from_hip(p, s, d)
    p.view = dict(SUPINE_VIEW)
    return p


def leg_raises(name, phase):
    """S41: straight legs together rise to about 45 degrees and lower to hover above the floor."""
    t = pulse(phase)
    p = supine(Pose(name, phase))
    arms_along_floor(p)
    for s in SIDES:
        d = rotate((1, 0, 0), (0, 1, 0), -radians(8+37*t))
        leg_from_hip(p, s, d)
    p.view = dict(SUPINE_VIEW)
    return p


def prone(p, pelvis_x=-.02, lift=0., chest_lift=0.):
    """Face down, head toward -x; the person's left side is at -y."""
    # Pelvis 8 cm up: the drawn thighs and shirt rest on the floor instead of floating.
    p.torso((pelvis_x, 0, .08), up=(-1, 0, 0))
    lower = toward_head(radians(0))
    upper = toward_head(chest_lift)
    articulate(p, lower, upper)
    for s in SIDES:
        sg = side_sign(s)
        p.j['shoulder_'+s] = add(p.j['chest'], (0, -sg*SHOULDER_HALF, 0))
        p.j['hip_'+s] = add(p.j['pelvis'], (0, -sg*HIP_HALF, 0))
    p.forward = (0, 0, -1)
    p.j['face'] = add(p.j['head'], (0, 0, -.075))
    return p


def prone_legs(p, lift=0.):
    for s in SIDES:
        d = rotate((1, 0, 0), (0, 1, 0), -radians(12)*lift)
        hip = p.j['hip_'+s]
        p.j['knee_'+s] = add(hip, mul(d, THIGH))
        ankle = add(hip, mul(d, THIGH+SHIN))
        ankle = (ankle[0], ankle[1], max(ankle[2], .04))
        prone_foot(p, s, ankle)
    return p


def prone_foot(p, s, ankle, point=radians(45)):
    """Face down, foot pointed: toes extend away from the head and down toward the floor, the
    sole faces up and the top of the foot rests on the mat. (rig.foot only pitches about the
    side axis, so a sole-up foot folded its toes back onto the shin.)"""
    f = (cos(point), 0, -sin(point))
    n = (-sin(point), 0, -cos(point))  # from the sole toward the ankle (down)
    p.j['ankle_'+s] = tuple(ankle)
    p.j['toe_'+s] = add(ankle, add(mul(f, .16), mul(n, -ANKLE_HEIGHT)))
    p.j['heel_'+s] = add(ankle, add(mul(f, -.075), mul(n, -ANKLE_HEIGHT)))
    p.contacts.pop('toe_'+s, None)
    p.contacts.pop('heel_'+s, None)


def superman(name, phase):
    """S56: face down; lift arms, chest and legs together, reach long; hold; lower."""
    t = ease_hold(phase)
    p = prone(Pose(name, phase), chest_lift=radians(16)*t)
    prone_legs(p, lift=t)
    for s in SIDES:
        shoulder = p.j['shoulder_'+s]
        reach = rotate((-1, 0, 0), (0, 1, 0), radians(18)*t)
        wrist = add(shoulder, add(mul(reach, .54), (0, -side_sign(s)*.04, 0)))
        wrist = (wrist[0], wrist[1], max(wrist[2], .05))
        p.arm(s, wrist, pole=add(shoulder, (0, 0, 1)))
    set_head(p, pitch=radians(6))
    p.j['face'] = add(p.j['head'], (0, 0, -.075))
    p.view = {'azimuth': 72, 'elevation': 14}
    return p


def back_lifts(name, phase):
    """Chart-defined: face down, hands by the temples; lift the chest, lower with control."""
    t = pulse(phase)
    p = prone(Pose(name, phase), chest_lift=radians(24)*t)
    prone_legs(p)
    for s in SIDES:
        sg = side_sign(s)
        wrist = add(p.j['head'], (.02, -sg*.09, -.02))
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.2, -sg*.8, .2)))
    p.view = {'azimuth': 72, 'elevation': 14}
    return p


def high_plank(p, angle=TOP, hands=None):
    plank_body(p, angle)
    plant_hands(p, hands or {s: (.24, side_sign(s)*.225) for s in SIDES})
    return p


def alt_arm_leg_plank(name, phase):
    """Chart-defined: in a high plank, reach one arm forward and the opposite leg back; alternate."""
    side, local = two_reps(phase)
    t = hold_cycle(local, into=.3, hold=.3)
    p = Pose(name, phase)
    u, ankles = plank_body(p, TOP)
    leg = 'r' if side == 'l' else 'l'
    hip = p.j['hip_'+leg]
    d = rotate(mul(u, -1), (0, 1, 0), radians(22)*t)
    ankle = add(hip, mul(d, THIGH+SHIN))
    p.j['knee_'+leg] = add(hip, mul(d, THIGH))
    p.j['ankle_'+leg] = ankle
    p.foot(leg, ankle=ankle, pitch=radians(60), contact=t < 1e-6)
    for s in SIDES:
        sg = side_sign(s)
        planted = (.24, sg*.225, .05)
        if s == side and t > 0:
            reach = add(p.j['shoulder_'+s], (.54*cos(radians(10)), 0, .54*sin(radians(10))))
            wrist = mix_point(planted, reach, t)
            p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (0, sg*.3, -.5)))
        else:
            p.arm(s, planted, pole=add(p.j['shoulder_'+s], (-.4, sg*.3, -.15)), palm=(.29, sg*.225, .014), contact=True)
    p.view = dict(PLANK_VIEW)
    return p


def shoulder_taps(name, phase):
    """S59: high plank, feet hip-width; lift one hand to tap the opposite shoulder; alternate."""
    side, local = two_reps(phase)
    t = hold_cycle(local, into=.35, hold=.2)
    p = Pose(name, phase)
    plank_body(p, TOP, foot_y=.16)
    for s in SIDES:
        sg = side_sign(s)
        planted = (.24, sg*.225, .05)
        if s == side and t > 0:
            other = p.j['shoulder_'+('r' if s == 'l' else 'l')]
            # Around, not through, the neck: under the chest, then onto the front of the other shoulder.
            under = add(p.j['chest'], (.06, 0, -.20))
            tap = add(other, (.07, sg*.03, -.03))
            path = mix_point(planted, under, stage(t, 0, .5)) if t < .5 else mix_point(under, tap, stage(t, .5, 1.))
            p.arm(s, path, pole=add(p.j['shoulder_'+s], (-.1, sg*.5, -.6)))
        else:
            p.arm(s, planted, pole=add(p.j['shoulder_'+s], (-.4, sg*.3, -.15)), palm=(.29, sg*.225, .014), contact=True)
    p.view = {'azimuth': 40, 'elevation': 28}
    return p


PIKE = .08


def natural_foot_pitch(knee, ankle, angle=radians(110), near=radians(60)):
    """Foot pitch (rig.foot) giving the knee-ankle-toe angle `angle` for a free foot.

    Exact and continuous in the shin direction (a stepped search made the foot, and with it
    the centre of mass, jitter between samples). Of the two solutions, the one nearer `near`."""
    from math import atan2
    psi = atan2(knee[2]-ankle[2], knee[0]-ankle[0])   # ankle -> knee, in the x-z plane
    phi0 = atan2(-ANKLE_HEIGHT, .16)                    # toe direction at pitch 0
    # rig.foot's pitch turns the toe vector by -pitch in the x-z plane.
    candidates = [phi0-(psi-angle), phi0-(psi+angle)]
    def wrap(a):
        return (a-near+pi) % (2*pi)-pi+near
    return min((wrap(c) for c in candidates), key=lambda c: abs(c-near))


def climber_leg(q):
    """(progress back->front 0..1, clearance 0..1) for one leg's running stride; q in [0, 1)."""
    if q < .35:
        k = smooth(q/.35)
        return k, sin(pi*k)
    if q < .5:
        return 1., 0.
    if q < .85:
        k = smooth((q-.5)/.35)
        return 1-k, sin(pi*k)
    return 0., 0.


def climbers(name, phase):
    """S44: push-up position; drive the knees toward the chest alternately in a running rhythm.

    One knee drives in while the other foot pushes back; they pass each other
    in the air, then the front foot taps under the hips as the back foot plants.
    """
    p = Pose(name, phase)
    strides = {s: climber_leg((phase + (0 if s == 'l' else .5)) % 1.) for s in SIDES}
    plank_body(p, TOP)
    # While both feet are in the air the hips pike up a little (shoulders stay over the hands),
    # so the knees passing under the hips clear the floor.
    lift = PIKE*strides['l'][1]*strides['r'][1]  # smooth (a min() kink spiked the vertical acceleration)
    if lift:
        pelvis = add(p.j['pelvis'], (0, 0, lift))
        p.torso(pelvis, up=unit(sub(p.j['chest'], pelvis)))
    for s in SIDES:
        sg = side_sign(s)
        k, air = strides[s]
        toe = add(mix_point((-1.0, sg*HIP_HALF, 0.), (-.20, sg*HIP_HALF, 0.), k), (0, 0, .14*air))
        ankle = p.foot(s, toe=toe, pitch=radians(60), contact=air < 1e-6)
        p.leg(s, ankle, pole=add(p.j['hip_'+s], (1, 0, 0)))
        if air > 0:
            # In the air the foot turns with the shin (a natural ~110 deg ankle) instead of
            # keeping its floor pitch, which folded it up against the shin mid-swing.
            free = natural_foot_pitch(p.j['knee_'+s], p.j['ankle_'+s])
            p.foot(s, ankle=p.j['ankle_'+s], pitch=radians(60)*(1-air)+free*air, contact=False)
    plant_hands(p, {s: (.24, side_sign(s)*.225) for s in SIDES})
    p.view = dict(PLANK_VIEW)
    return p


def plank_jump_ins(name, phase):
    """S45: from a plank, jump both feet in to a crouch under the hips, then jump back out."""
    # Feet travel only while airborne: in over 0-.30, crouch, out over .45-.75, plank.
    t = stage(phase, 0, .30) if phase < .45 else 1-stage(phase, .45, .75)
    p = Pose(name, phase)
    hands = {s: (.24, side_sign(s)*.24) for s in SIDES}
    angle = TOP+radians(40)*t
    # Feet land about 30 cm behind the hands (they landed 73 cm back, reading as all fours).
    toe_x = -.99+.94*t
    # A real hop each way: both feet leave the floor (~12 cm) between takeoff and landing.
    airborne = sin(pi*stage(phase, 0, .30))+sin(pi*stage(phase, .45, .75))
    u, ankles = plank_body(p, TOP)
    # Crouch: feet under the hips, hips high, back nearly level so straight arms still reach.
    pelvis = mix_point(p.j['pelvis'], (-.20, 0, .50), t)
    lean = mix_point(u, unit((1, 0, .10)), t)
    p.torso(add(pelvis, (0, 0, .025*airborne)), up=unit(lean))
    for s in SIDES:
        sg = side_sign(s)
        # Feet together: the knees come in between the arms instead of through them.
        toe = (toe_x, sg*.06, .12*airborne)
        ankle = p.foot(s, toe=toe, pitch=radians(60), contact=airborne < 1e-9)
        p.leg(s, ankle, pole=add(p.j['hip_'+s], (1, sg*.05, 0)))
    plant_hands(p, hands)
    p.view = dict(PLANK_VIEW)
    return p


def plank_shoulder_z(z, toe_x=-1.02):
    """Body angle (pivoting on the toes) that puts the shoulders at height z."""
    low, high = radians(-5), radians(45)
    for _ in range(40):
        mid = (low+high)/2
        q = Pose('_', 0)
        plank_body(q, mid, toe_x=toe_x)
        low, high = (mid, high) if q.j['shoulder_l'][2] < z else (low, mid)
    return (low+high)/2


def tricep_extensions(name, phase):
    """S51: from a forearm plank, press up to a straight-arm plank and lower back to the forearms.

    The hands stay planted where the forearms lay flat: elbows on the floor under
    the shoulders at the bottom, arms straight (~160 deg) at the top.
    """
    t = pulse(phase)
    elbow_z = .045
    bottom = plank_shoulder_z(elbow_z+UPPER_ARM)
    q = Pose(name, 0)
    plank_body(q, bottom, toe_x=-1.02)
    hand_x = q.j['shoulder_l'][0]+FOREARM
    wrist_l = (hand_x, SHOULDER_HALF, elbow_z)
    # Top: the highest shoulders that keep the arm at 0.55 m (elbow ~160 deg).
    low, high = elbow_z+UPPER_ARM, .65
    for _ in range(40):
        mid = (low+high)/2
        q = Pose(name, 0)
        plank_body(q, plank_shoulder_z(mid), toe_x=-1.02)
        low, high = (mid, high) if norm(sub(q.j['shoulder_l'], wrist_l)) < .55 else (low, mid)
    shoulder_z = elbow_z+UPPER_ARM+(low-elbow_z-UPPER_ARM)*t
    p = Pose(name, phase)
    plank_body(p, plank_shoulder_z(shoulder_z), toe_x=-1.02)
    for s in SIDES:
        sg = side_sign(s)
        wrist = (hand_x, sg*SHOULDER_HALF, elbow_z)
        # Pole behind: the elbow folds back toward the feet and settles onto the floor.
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.6, 0, -.25)), palm=(hand_x+.06, sg*SHOULDER_HALF, .014), contact=True)
        if t < 1e-9:
            p.contacts['elbow_'+s] = p.j['elbow_'+s]
    p.view = dict(PLANK_VIEW)
    return p

ARM_REACH = .55  # shoulder to wrist with the elbow at about 160 degrees


def straight_arm_shoulder(hands_x, lean):
    """Shoulder (x, z) `lean` ahead of hands on the floor, arm at ARM_REACH."""
    return hands_x+lean, .05+sqrt(ARM_REACH**2-lean**2-.05**2)


def ankle_on_toe(toe, pitch):
    q = Pose('_', 0)
    return q.foot('l', toe=toe, pitch=pitch)


def planche_body(p, toe_x, shoulder):
    """Toes fixed; solve the ankle pitch so a straight body reaches `shoulder` (x, z)."""
    reach = THIGH+SHIN+TORSO
    low, high = radians(20), radians(120)
    for _ in range(40):
        mid = (low+high)/2
        a = ankle_on_toe((toe_x, 0, 0), mid)
        dist = sqrt((shoulder[0]-a[0])**2+(shoulder[1]-a[2])**2)
        # A larger pitch rolls the ankle forward over the toes, toward the shoulders.
        low, high = (mid, high) if dist > reach else (low, mid)
    pitch = (low+high)/2
    ankles = {s: p.foot(s, toe=(toe_x, side_sign(s)*HIP_HALF, 0.), pitch=pitch) for s in SIDES}
    a = ankles['l']
    u = unit((shoulder[0]-a[0], 0, shoulder[1]-a[2]))
    center = mul(add(ankles['l'], ankles['r']), .5)
    p.torso(add(center, mul(u, THIGH+SHIN)), up=u)
    for s in SIDES:
        p.straight_leg(s, ankles[s], u)
    return p


def pseudo_planche(name, phase):
    """Chart-defined: high plank with hands turned out beside the waist; lean the shoulders forward past the hands.

    Arms stay straight; the toes stay planted and the ankles roll forward over
    them as the shoulders travel past the hands.
    """
    t = hold_cycle(phase, into=.35, hold=.30)
    p = Pose(name, phase)
    hands_x = .06
    shoulder = straight_arm_shoulder(hands_x, .03+.16*t)
    planche_body(p, -1.04, shoulder)
    for s in SIDES:
        sg = side_sign(s)
        wrist = (hands_x, sg*(SHOULDER_HALF+.05), .05)
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.4, sg*.3, -.1)), palm=(hands_x, sg*(SHOULDER_HALF+.10), .014), contact=True)
    p.view = dict(PLANK_VIEW)
    return p


def tricep_dips(name, phase):
    """S50: seated, hands behind with fingers toward the feet, hips up; bend the elbows straight back and press."""
    t = pulse(phase)
    p = Pose(name, phase)
    pelvis = (-.10, 0, .24-.10*t)
    p.torso(pelvis, lean=-radians(35))
    for s in SIDES:
        sg = side_sign(s)
        ankle = p.foot(s, ankle=(.42, sg*.14, ANKLE_HEIGHT))
        p.leg(s, ankle, pole=add(p.j['hip_'+s], (0, 0, 1)))
        wrist = (-.40, sg*.20, .05)
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.6, sg*.1, .1)), palm=(-.35, sg*.20, .014), contact=True)
    p.view = {'azimuth': 72, 'elevation': 10}
    return p


FLOOR_MOTIONS = {
    'sit-ups': sit_ups,
    'reverse-crunches': reverse_crunches,
    'bicycle-crunches': bicycle_crunches,
    'flutter-kicks': flutter_kicks,
    'leg-raises': leg_raises,
    'superman': superman,
    'back-lifts': back_lifts,
    'alt-arm-leg-plank': alt_arm_leg_plank,
    'shoulder-taps': shoulder_taps,
    'climbers': climbers,
    'plank-jump-ins': plank_jump_ins,
    'tricep-extensions': tricep_extensions,
    'pseudo-planche': pseudo_planche,
    'tricep-dips': tricep_dips,
}
