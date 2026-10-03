"""Offline standing and equipment moves from the bodyweight chart (P18 batch 3).

Sources S42-S60 in docs/animation-review/form-research.md; chart-defined moves
are marked in their docstrings. Gear props (pull-up bar, doorframe, table) are
plain line props. No watch-side code.
"""
from math import sin, cos, pi, sqrt, atan2
try:
    from .rig import *
    from .stretches import rotate, mix_point, stage, set_head, hold_cycle, ease_hold, abducted, rest_wrist, twist, body_axes
except ImportError:
    from rig import *
    from stretches import rotate, mix_point, stage, set_head, hold_cycle, ease_hold, abducted, rest_wrist, twist, body_axes

STAND_VIEW = {'azimuth': 55, 'elevation': 8}
FRONT_VIEW = {'azimuth': 18, 'elevation': 8}


def planted(p, s, x=0., y=None, pitch=0.):
    y = side_sign(s)*HIP_HALF if y is None else y
    if pitch:
        # Heel raised: pivot about the ball of the foot on the floor (pitching about a fixed
        # ankle pushed the toes into the floor).
        ankle = p.foot(s, toe=(x+.16, y, 0.), pitch=pitch)
    else:
        ankle = p.foot(s, ankle=(x, y, ANKLE_HEIGHT), pitch=pitch)
    p.leg(s, ankle)
    return ankle


def guard(p, lead='l'):
    """Fighting stance hands: fists up by the chin."""
    for s in SIDES:
        sg = side_sign(s)
        fist = add(p.j['chest'], (.20 if s == lead else .15, sg*.10, .16))
        p.arm(s, fist, pole=add(p.j['shoulder_'+s], (-.1, sg*.4, -.5)))
    return p


def stance(p, lead='l', pelvis_z=.92):
    """Fighting stance: lead foot forward, feet apart, knees soft."""
    p.torso((0, 0, pelvis_z))
    planted(p, lead, x=.18, y=side_sign(lead)*.14)
    rear = 'r' if lead == 'l' else 'l'
    planted(p, rear, x=-.18, y=side_sign(rear)*.14, pitch=radians(15))
    return p


def punches(name, phase):
    """S53: fighting stance; jab with the lead hand, cross with the rear hand, back to guard."""
    jab = sin(pi*stage(phase, .05, .40))
    cross_ = sin(pi*stage(phase, .45, .85))
    p = stance(Pose(name, phase))
    twist(p, -radians(22)*cross_+radians(6)*jab)
    guard(p)
    for s, amount in (('l', jab), ('r', cross_)):
        if amount > 1e-6:
            sg = side_sign(s)
            fist = mix_point(add(p.j['chest'], (.20, sg*.10, .16)), add(p.j['shoulder_'+s], (.54, -sg*.14, .02)), amount)
            p.arm(s, fist, pole=add(p.j['shoulder_'+s], (-.1, sg*.4, -.5)))
    # Side-on: jab and cross extend across the screen.
    p.view = dict(FRONT_VIEW, azimuth=75, elevation=10)
    return p


def fly_steps(name, phase):
    """Chart-defined: arms out like wings, hinge forward on one leg while the other leg lifts back; return; switch."""
    side = 'l' if phase < .5 else 'r'
    t = hold_cycle((phase*2) % 1., into=.35, hold=.25)
    stand = 'r' if side == 'l' else 'l'
    p = Pose(name, phase).torso((-.10*t, -side_sign(side)*.05*t, .945-.02*t), lean=radians(55)*t)
    planted(p, stand, x=0., y=side_sign(stand)*.08)
    hip = p.j['hip_'+side]
    back = rotate((0, 0, -1), (0, 1, 0), radians(55)*t)
    p.j['knee_'+side] = add(hip, mul(back, THIGH))
    ankle = add(hip, mul(back, THIGH+SHIN))
    p.j['ankle_'+side] = ankle
    p.foot(side, ankle=ankle, pitch=radians(50)*t, contact=t < 1e-6)
    for s in SIDES:
        p.arm(s, abducted(p, s, radians(80)), pole=add(p.j['shoulder_'+s], (0, 0, 1)))
    p.view = dict(STAND_VIEW, azimuth=62)
    return p


def side_leg_raises(name, phase):
    """S49: stand tall, raise one straight leg out to the side, lower with control; alternate."""
    side = 'l' if phase < .5 else 'r'
    t = pulse((phase*2) % 1.)
    stand = 'r' if side == 'l' else 'l'
    sg = side_sign(side)
    p = Pose(name, phase).torso((0, -sg*.04*t, .945))
    planted(p, stand)
    hip = p.j['hip_'+side]
    d = (0, sg*sin(radians(40)*t), -cos(radians(40)*t))
    p.j['knee_'+side] = add(hip, mul(d, THIGH))
    ankle = add(hip, mul(d, THIGH+SHIN))
    p.j['ankle_'+side] = ankle
    p.foot(side, ankle=ankle, contact=t < 1e-6)
    for s in SIDES:
        p.arm(s, abducted(p, s, radians(25)), pole=add(p.j['shoulder_'+s], (-.3, 0, 0)))
    p.view = dict(FRONT_VIEW, azimuth=6)
    return p


def side_to_side_chops(name, phase):
    """S54: arms straight in front, hands together; swing in a level arc side to side, hips forward."""
    swing = sin(2*pi*phase)
    p = Pose(name, phase).torso((0, 0, .93))
    for s in SIDES:
        planted(p, s, y=side_sign(s)*.17)
    twist(p, radians(40)*swing)
    up, forward, _ = body_axes(p)
    hands = add(add(p.j['chest'], mul(forward, .50)), (0, 0, -.02))
    for s in SIDES:
        across = unit(cross(up, forward))
        p.arm(s, add(hands, mul(across, side_sign(s)*.025)), pole=add(p.j['shoulder_'+s], (0, 0, -1)))
    # From above and to the side: the straight arms sweep in a level arc in front of the body.
    p.view = {'azimuth': 80, 'elevation': 58}
    return p


def chest_expansions(name, phase):
    """S58: arms at shoulder height swing open wide, then cross in front; alternate the top arm."""
    cycle = (phase*2) % 1.
    top = 'l' if phase < .5 else 'r'
    opened = pulse(cycle+.5)
    p = relaxed_stand(Pose(name, phase))
    for s in SIDES:
        sg = side_sign(s)
        shoulder = p.j['shoulder_'+s]
        angle = radians(-25)+radians(115)*opened  # -25: crossed past the midline, 90: open wide
        d = (cos(angle), sg*sin(angle), 0.)
        wrist = add(shoulder, mul(unit(d), .54))
        if s == top:
            wrist = add(wrist, (0, 0, .03*(1-opened)))
        p.arm(s, wrist, pole=add(shoulder, (0, 0, -1)))
    p.view = {'azimuth': 20, 'elevation': 30}
    return p


def relaxed_stand(p):
    p.torso((0, 0, .945))
    for s in SIDES:
        planted(p, s, y=side_sign(s)*.15)
    return p


# Gear -------------------------------------------------------------------------

def bar_prop(x, z, half=.45):
    # A bar between two uprights to the floor (from the side the bar alone reads as nothing).
    return {'type': 'lines', 'segments': [[[x, -half, z], [x, half, z]],
                                          [[x, -half, z], [x, -half, 0.]], [[x, half, z], [x, half, 0.]]],
            'width': .03}


def hang_and_pull(name, phase, grip_half, underhand):
    """S55: hang with straight arms, pull the chin over the bar, lower with control."""
    t = hold_cycle(phase, into=.40, hold=.10)
    bar_z = 2.35
    p = Pose(name, phase)
    # The body hangs just behind the bar, so the head rises past it rather than through it.
    offset = .17
    shoulder_z_hang = bar_z-sqrt((UPPER_ARM+FOREARM-.02)**2-offset**2)
    chest_z = shoulder_z_hang+(bar_z-.12-shoulder_z_hang)*t
    pelvis = (-offset+.02, 0, chest_z-TORSO)
    p.torso(pelvis, lean=-radians(3))
    for s in SIDES:
        sg = side_sign(s)
        hip = p.j['hip_'+s]
        knee_dir = rotate((0, 0, -1), (0, 1, 0), -radians(25))
        p.j['knee_'+s] = add(hip, mul(knee_dir, THIGH))
        shin = rotate((0, 0, -1), (0, 1, 0), radians(40))
        ankle = add(p.j['knee_'+s], mul(shin, SHIN))
        p.j['ankle_'+s] = ankle
        p.foot(s, ankle=ankle, pitch=radians(35), contact=False)
        grip = (.02, sg*grip_half, bar_z)
        pole = (.35, sg*.2, -.4) if underhand else (-.05, sg*.7, -.3)
        p.arm(s, grip, pole=add(p.j['shoulder_'+s], pole), palm=add(grip, (0, 0, .03)))
    p.props.append(bar_prop(.02, bar_z))
    p.view = {'azimuth': 45 if underhand else 25, 'elevation': 6}
    return p


def chin_ups(name, phase):
    """Chart-defined grip on S55: palms toward you, hands shoulder-width; pull the chin over the bar."""
    return hang_and_pull(name, phase, .17, True)


def pull_ups(name, phase):
    """S55: palms away, hands slightly wider than the shoulders; pull the chin over the bar."""
    return hang_and_pull(name, phase, .30, False)


def doorframe_rows(name, phase):
    """Chart-defined: feet close to the doorframe, hold its edges at chest height, lean back on straight arms; pull the chest to the frame."""
    t = pulse(phase)
    frame_x = .40
    p = Pose(name, phase)
    lean = radians(20)*(1-t)+radians(6)*t
    for s in SIDES:
        sg = side_sign(s)
        ankle = p.foot(s, ankle=(.32, sg*.12, ANKLE_HEIGHT))
    # A straight body pivots on the heels.
    u = (-sin(lean), 0, cos(lean))
    center = mul(add(p.j['ankle_l'], p.j['ankle_r']), .5)
    p.torso(add(center, mul(u, THIGH+SHIN)), up=u)
    for s in SIDES:
        p.straight_leg(s, p.j['ankle_'+s], u)
    for s in SIDES:
        sg = side_sign(s)
        grip = (frame_x, sg*.26, 1.18)
        p.arm(s, grip, pole=add(p.j['shoulder_'+s], (-.2, sg*.6, -.3)))
    segments = [[[frame_x, sg*.30, 0], [frame_x, sg*.30, 2.05]] for sg in (-1, 1)]
    segments.append([[frame_x, -.30, 2.05], [frame_x, .30, 2.05]])
    p.props.append({'type': 'lines', 'segments': segments, 'width': .05, 'color': '#838279'})
    p.view = {'azimuth': 60, 'elevation': 8}
    return p


STANDING_MOTIONS = {
    'fly-steps': fly_steps,
    'side-leg-raises': side_leg_raises,
    'punches': punches,
    'side-to-side-chops': side_to_side_chops,
    'chest-expansions': chest_expansions,
    'chin-ups': chin_ups,
    'pull-ups': pull_ups,
    'doorframe-rows': doorframe_rows,
}
