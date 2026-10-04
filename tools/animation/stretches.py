"""Offline stretching choreography on the existing fixed-length stick rig.

Source-backed variants live in docs/animation-review/form-research.md (S15-S29).
Helpers here only reposition joints after the rig's own solvers, so rig.py and
every earlier clip stay byte-identical. No watch-side code.

Revision 2 follows the batch-1 form, visual and anatomy reviews
(docs/animation-review/p18-batch-1-review-*.json): an articulated two-part
spine, lateral arm paths, pelvis-rolled knee rolls, weight over the stance foot,
and views that keep the faceless figure's direction readable.
"""
from math import sin, cos, pi, sqrt, asin, acos
try:
    from .rig import *
except ImportError:
    from rig import *


def rotate(v, axis, angle):
    """Rodrigues rotation of v about a unit axis."""
    c, s = cos(angle), sin(angle)
    return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v)*(1-c)))


def acos_clamped(x):
    return acos(max(-1., min(1., x)))


def mix_point(a, b, t):
    return tuple(x+(y-x)*t for x, y in zip(a, b))


def hold_cycle(phase, into=.25, hold=.35):
    """Ease into a position, hold it, ease out. 0 at rest, 1 in the stretch."""
    phase = phase % 1.
    if phase < into:
        return smooth(phase/into)
    if phase < into+hold:
        return 1.
    out = min(1., (phase-into-hold)/max(1e-9, 1-into-hold-.10))
    return 1-smooth(out)


def alternating(phase, into=.25, hold=.35):
    """(side, amount): the first half stretches left, the second half right."""
    side = 'l' if phase < .5 else 'r'
    return side, hold_cycle((phase*2) % 1., into, hold)


def body_axes(p):
    up = p.up
    forward = p.forward
    side = unit(cross(up, forward))
    return up, forward, side


def sagittal(angle):
    """Unit direction in the x-z plane, `angle` above the forward horizontal."""
    return (cos(angle), 0, sin(angle))


def articulate(p, lower, upper, pelvis=None):
    """Two-part spine: pelvis -> mid-back along `lower`, mid-back -> chest along `upper`.

    The renderer draws one continuous tapered torso through the three points,
    so the back can round (cat, roll-down) or arch (cow, back bend).
    """
    pelvis = pelvis or p.j['pelvis']
    half = TORSO/2
    mid = add(pelvis, mul(unit(lower), half))
    chest = add(mid, mul(unit(upper), half))
    p.j['spine_mid'] = mid
    p.j['chest'] = chest
    p.up = unit(upper)
    p.forward = unit(cross((0, 1, 0), p.up))
    p.j['neck'] = add(chest, mul(p.up, NECK))
    p.j['head'] = add(p.j['neck'], mul(p.up, HEAD))
    p.j['face'] = add(p.j['head'], mul(p.forward, .075))
    for s in SIDES:
        p.j['shoulder_'+s] = add(chest, (0, side_sign(s)*SHOULDER_HALF, 0))
    return p


def set_head(p, pitch=0., roll=0., yaw=0., glide=0.):
    """Move only the head; the neck stays still on the shoulders (user, rev3 votes).

    pitch > 0 nods forward (chin to chest), roll > 0 tilts toward the left
    shoulder, yaw > 0 turns the face left: the skull turns about the top of the
    neck. glide > 0 draws the upright head straight back (chin tuck).
    """
    up, forward, side = body_axes(p)
    neck = add(p.j['chest'], mul(up, NECK))
    p.j['neck'] = neck
    head_dir = rotate(rotate(up, side, pitch), forward, -roll)
    head = add(neck, mul(head_dir, HEAD))
    if glide:
        head = add(head, mul(forward, -glide))
        p.j['head_axis'] = head_dir
    p.j['head'] = head
    face = rotate(rotate(forward, side, pitch), forward, -roll)
    face = rotate(face, head_dir, yaw)
    p.j['face'] = add(head, mul(face, .075))
    return p


def set_head_rev3(p, pitch=0., roll=0., yaw=0., glide=0.):
    """Revision-3 head helper, kept only for clips the user approved (10/10).

    pitch > 0 bends forward (chin to chest), roll > 0 tilts toward the left
    shoulder, yaw > 0 turns the face left, glide > 0 draws the head straight back.
    The head turns about the top of a short neck: the neck takes a quarter of a
    bend, so the head tilts rather than swinging out on a stalk.
    """
    up, forward, side = body_axes(p)
    chest = p.j['chest']

    def orient(v, fraction):
        v = rotate(v, side, pitch*fraction)
        v = rotate(v, forward, -roll*fraction)
        return v

    neck_dir = orient(up, .25)
    if pitch:
        # Nod about the top of the neck: the neck base counter-tilts so the head
        # turns nearly in place instead of travelling forward or back on a stalk.
        counter = asin(max(-.95, min(.95, .75*HEAD*sin(pitch)/NECK)))
        neck_dir = rotate(orient(up, 0.), side, -counter)
        neck_dir = rotate(neck_dir, forward, -roll*.25)
    if roll and not pitch:
        counter = asin(max(-.95, min(.95, .6*HEAD*sin(roll)/NECK)))
        neck_dir = rotate(up, forward, counter)
    if glide:
        # Chin retraction: the lower neck leans back, the head stays level.
        neck_dir = unit(add(neck_dir, mul(forward, -glide/NECK)))
    p.j['neck'] = add(chest, mul(neck_dir, NECK))
    head_dir = orient(up, 1.)
    p.j['head'] = add(p.j['neck'], mul(head_dir, HEAD))
    face = orient(forward, 1.)
    face = rotate(face, head_dir, yaw)
    p.j['face'] = add(p.j['head'], mul(face, .075))
    return p


def twist(p, angle):
    """Rotate the shoulder line about the spine; hips stay square."""
    up, forward, side = body_axes(p)
    for s in SIDES:
        offset = rotate(mul(side, side_sign(s)*SHOULDER_HALF), up, angle)
        p.j['shoulder_'+s] = add(p.j['chest'], offset)
    p.forward = rotate(forward, up, angle)
    p.j['face'] = add(p.j['head'], mul(p.forward, .075))
    return p


def side_lean(p, angle):
    """Tilt the trunk toward the left (angle > 0) over level hips."""
    pelvis = p.j['pelvis']
    up = (0, sin(angle), cos(angle))
    p.up = up
    # Curved through the mid-back (the lower spine takes a third of the bend), not one rod
    # hinged at the pelvis.
    lower = (0, sin(angle/3), cos(angle/3))
    p.j['spine_mid'] = add(pelvis, mul(lower, TORSO/2))
    p.j['chest'] = add(p.j['spine_mid'], mul(up, TORSO/2))
    p.j['neck'] = add(p.j['chest'], mul(up, NECK))
    p.j['head'] = add(p.j['neck'], mul(up, HEAD))
    side = unit(cross(up, p.forward))
    for s in SIDES:
        p.j['shoulder_'+s] = add(p.j['chest'], mul(side, side_sign(s)*SHOULDER_HALF))
    p.j['face'] = add(p.j['head'], mul(p.forward, .075))
    return p


def relaxed_arms(p, flex=.08):
    for s in SIDES:
        p.arm_fk(s, elbow_flex=flex)
    return p


def stand_on(p, stance, pelvis_x=0., pelvis_z=.945, lean=0.):
    """One-leg stance with the pelvis shifted over the standing foot."""
    sg = side_sign(stance)
    p.torso((pelvis_x, sg*.07, pelvis_z), lean=lean)
    ankle = p.foot(stance, ankle=(0, sg*HIP_HALF, ANKLE_HEIGHT))
    p.leg(stance, ankle)
    return p


def ease_hold(phase):
    """Animated hold: ease into the stretch, hold it, ease back to rest."""
    return hold_cycle(phase, into=.30, hold=.40)


def stage(t, start, end):
    """0..1 progress of t through [start, end], eased."""
    return smooth((t-start)/(end-start)) if end > start else float(t >= end)


def rest_wrist(p, s):
    shoulder = p.j['shoulder_'+s]
    return add(shoulder, (.02, side_sign(s)*.03, -.54))


def abducted(p, s, angle, reach=.545):
    """Wrist for an arm raised out to its own side in the frontal plane."""
    return add(p.j['shoulder_'+s], mul((.03, side_sign(s)*sin(angle), -cos(angle)), reach))


NECK_VIEW = {'azimuth': 72, 'elevation': 8, 'crop_below': 1.00, 'still_neck': True}
FRONT_NECK_VIEW = {'azimuth': 18, 'elevation': 8, 'crop_below': 1.00, 'still_neck': True}
UPPER_VIEW = {'azimuth': 38, 'elevation': 10, 'crop_below': .98}


def neck_flexion(name, phase):
    """S15/S16: chin gently toward the chest."""
    p = relaxed_arms(standing(name, phase))
    set_head(p, pitch=radians(48)*hold_cycle(phase))
    p.view = dict(NECK_VIEW)
    return p


def neck_extension(name, phase):
    """S15: take the head slowly back to look at the ceiling."""
    p = relaxed_arms(standing(name, phase))
    set_head(p, pitch=-radians(42)*hold_cycle(phase))
    p.view = dict(NECK_VIEW)
    return p


def side_neck(name, phase):
    """S15-S17: ear toward the shoulder without shrugging."""
    side, t = alternating(phase)
    p = relaxed_arms(standing(name, phase))
    set_head(p, roll=side_sign(side)*radians(36)*t)
    p.view = dict(FRONT_NECK_VIEW)
    return p


def overhead_reach(name, phase):
    """S27/S28: arms rise out to the sides and overhead, fingers interlace; hold; lower."""
    # Slower release than ease_hold (the arms came down at ~6 m/s).
    t = hold_cycle(phase, into=.30, hold=.30)
    p = standing(name, phase)
    # Hands meet just within reach of straight arms (the midline is farther from each shoulder).
    top = add(p.j['chest'], (.04, 0, .512))  # nearly straight arms (they stayed bent ~40 deg)
    rise, join = stage(t, 0, .80), stage(t, .80, 1.)
    for s in SIDES:
        sg = side_sign(s)
        # At rest the arms hang slightly out from the sides, clear of the thighs.
        arc = abducted(p, s, radians(8+160*rise))
        # The hands meet (fingers interlaced) instead of stopping 7 cm apart.
        wrist = mix_point(arc, add(top, (0, sg*.012, 0)), join)
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.3, sg*.4, 0)))
    # Whole body: the crop at the shins cut the shoes off.
    p.view = {'azimuth': 30, 'elevation': 6}
    return p

def behind_back_clasp(name, phase):
    """S18 #14 / S19: hands swing back, fingers interlink, straight arms lift."""
    t = hold_cycle(phase, into=.30, hold=.30)  # slower release (the hands snapped apart)
    lift = stage(t, .55, 1.)
    p = standing(name, phase, lean=-radians(5)*lift)
    reach = UPPER_ARM+FOREARM-.008
    for s in SIDES:
        shoulder = p.j['shoulder_'+s]
        dy = -side_sign(s)*(SHOULDER_HALF-.05)  # two clasped fists side by side, not overlapping
        low_dx, high_dx = -.16, -.36
        dx = low_dx+(high_dx-low_dx)*lift
        clasp = add(shoulder, (dx, dy, -sqrt(reach**2-dx*dx-dy*dy)))
        wrist = mix_point(rest_wrist(p, s), clasp, stage(t, 0, .55)) if lift == 0 else clasp
        p.arm(s, wrist, pole=add(shoulder, (.2, side_sign(s)*.3, 0)))
    set_head(p, pitch=-radians(6)*lift)
    p.view = {'azimuth': 52, 'elevation': 8}
    return p

def hands_on_low_back(p):
    for s in SIDES:
        sg = side_sign(s)
        wrist = add(p.j['pelvis'], (-.12, sg*.12, .08))
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], (-.4, sg*.5, 0)),
              palm=add(wrist, (.02, -sg*.02, -.05)))
    return p


def torso_extension(name, phase):
    """S20: hands support the low back; lean back and return without holding."""
    t = pulse(phase)
    p = standing(name, phase, pelvis=(.04*t, 0, .945))
    articulate(p, sagittal(radians(90+10*t)), sagittal(radians(90+30*t)))
    hands_on_low_back(p)
    set_head_rev3(p, pitch=-radians(8)*t)
    p.view = {'azimuth': 66, 'elevation': 8}
    return p


def side_bend(name, phase):
    """S17/S20/S21: one arm reaches up its own side and over; the other slides down the thigh."""
    side, t = alternating(phase, into=.3, hold=.25)
    sg = side_sign(side)
    p = standing(name, phase)
    side_lean(p, sg*radians(24)*t)
    reach = 'r' if side == 'l' else 'l'
    for s in SIDES:
        shoulder = p.j['shoulder_'+s]
        ss = side_sign(s)
        if s == reach:
            # Abduct in the frontal plane: out to its own side, then overhead.
            angle = radians(165)*t
            direction = (0, ss*sin(angle), -cos(angle))
            # ...and over the head toward the bending side.
            direction = rotate(direction, (1, 0, 0), -sg*radians(48)*t)
            p.arm(s, add(shoulder, mul(direction, .545)), pole=add(shoulder, (-.3, ss*.3, 0)))
        else:
            # From the same hanging rest as the reaching arm (they swap roles at the switch).
            thigh = mix_point(p.j['hip_'+s], p.j['knee_'+s], .25+.25*t)
            wrist = mix_point(add(shoulder, (0, 0, -.545)), add(thigh, (.02, ss*.10, 0)), smooth(t))
            pole = mix_point(add(shoulder, (-.3, ss*.3, 0)), add(shoulder, (-.2, ss*.5, 0)), smooth(t))
            p.arm(s, wrist, pole=pole)
    set_head_rev3(p, roll=sg*radians(10)*t)
    p.view = {'azimuth': 10, 'elevation': 8}
    return p


def oblique_twist(name, phase):
    """S21 #1 (standing): hands clasped at chest height, elbows out; rotate, hips square."""
    side, t = alternating(phase, into=.3, hold=.25)
    p = standing(name, phase)
    twist(p, side_sign(side)*radians(50)*t)  # within a thoracic twist on square hips
    up, forward, _ = body_axes(p)
    across = unit(cross(up, forward))
    # Hands at chest height stay clear of the head from the viewing angle.
    hands = add(add(p.j['chest'], mul(forward, .26)), (0, 0, -.02))
    for s in SIDES:
        sg = side_sign(s)
        wrist = add(hands, mul(across, sg*.03))
        p.arm(s, wrist, pole=add(p.j['shoulder_'+s], add(mul(across, sg*.5), (0, 0, -.1))))
    set_head(p, yaw=side_sign(side)*radians(35)*t)
    p.view = {'azimuth': 0, 'elevation': 44}
    return p

def kneel_on_all_fours(p, pelvis=(-.35, 0, .497)):  # knees rest on the mat, not 1 cm into it
    p.torso(pelvis, up=sagittal(radians(12)))
    for s in SIDES:
        hip = p.j['hip_'+s]
        knee = add(hip, (0, 0, -THIGH))
        ankle = add(knee, (-SHIN, 0, 0))
        p.j['knee_'+s] = knee
        p.foot(s, ankle=ankle, pitch=radians(152), contact=False)
        p.contacts['knee_'+s] = knee
    return p


def hands_under_shoulders(p):
    for s in SIDES:
        shoulder = p.j['shoulder_'+s]
        wrist = (shoulder[0], shoulder[1], .03)
        p.arm(s, wrist, pole=add(shoulder, (-.2, side_sign(s)*.05, -.1)),
              palm=add(wrist, (.065, 0, -.016)), contact=True)
    return p


def cat_cow(name, phase):
    """S22/S20: round the back up and tuck the head (cat); let the belly sink and look up (cow).

    Hands, knees, pelvis and chest stay put; only the mid-back and head move.
    """
    cat = hold_cycle((phase*2) % 1., into=.35, hold=.25) if phase < .5 else 0.
    cow = hold_cycle((phase*2) % 1., into=.35, hold=.25) if phase >= .5 else 0.
    p = Pose(name, phase)
    kneel_on_all_fours(p)
    pelvis, chest = p.j['pelvis'], p.j['chest']
    normal = mul(p.forward, -1)  # the torso's forward is the belly side; the back is opposite
    # Each spine half keeps its length: as the back rounds or sags the chest draws toward the
    # pelvis (a fixed chest stretched both halves by ~17 mm). Hands are placed after this.
    bow = .085*cat-.07*cow
    axis = unit(sub(chest, pelvis))
    chord = 2*sqrt(max(0., (TORSO/2)**2-bow*bow))
    shift = mul(axis, chord-TORSO)
    for k in ('chest', 'neck', 'head', 'face', 'shoulder_l', 'shoulder_r'):
        p.j[k] = add(p.j[k], shift)
    p.j['spine_mid'] = add(add(pelvis, mul(axis, chord/2)), mul(normal, bow))
    hands_under_shoulders(p)
    set_head(p, pitch=radians(55)*cat-radians(40)*cow)
    p.view = {'azimuth': 84, 'elevation': 8}
    return p


def quad_stretch(name, phase):
    """S18 #9: lift the heel toward the bottom, catch the ankle, knees together, hips forward."""
    # Longer lift and release than ease_hold: the leg came down at ~8 m/s.
    t = hold_cycle(phase, into=.36, hold=.26)
    shift = stage(t, 0, .25)
    # Weight well over the standing foot before the heel lifts.
    p = Pose(name, phase).torso((0, -.09*shift, .945))
    ankle_r = p.foot('r', ankle=(0, -HIP_HALF, ANKLE_HEIGHT))
    p.leg('r', ankle_r)
    hip = p.j['hip_l']
    knee = add(hip, (-.02*t, -.03*t, -THIGH+.012))
    bend = stage(t, .10, .70)
    down, up = (0, 0, -1), unit((-.20, 0, .38))
    angle = bend*acos_clamped(dot(down, up))
    shin = rotate(down, (0, 1, 0), angle)
    ankle = add(knee, mul(shin, SHIN))
    p.j['knee_l'] = knee
    p.j['ankle_l'] = ankle
    # The foot only turns once the ankle has left the floor (pitching it low drove the toe in).
    p.foot('l', ankle=ankle, pitch=radians(215)*stage(bend, .15, 1.), contact=bend < 1e-6)
    catch = stage(t, .45, .80)
    p.arm('l', mix_point(rest_wrist(p, 'l'), add(ankle, (-.01, .065, .01)), catch), pole=add(p.j['shoulder_l'], (-.2, .4, 0)))
    # The free arm hangs a little out from the side so the hand clears the thigh.
    p.arm_fk('r', radians(70)*shift, elbow_flex=.1, outward=.08+.35*shift)
    p.view = {'azimuth': 72, 'elevation': 8}
    return p

HAMSTRING_HEEL = (.4023, .2, 0.)


def hamstring_stretch(name, phase):
    """S18 #11: front heel down, toes up, knee straight; bend the back knee and lean forward."""
    t = ease_hold(phase)
    lean = radians(38)*t
    # Soft knees at the start (pelvis 2 cm lower), the same hinged pose at the end.
    p = Pose(name, phase).torso((-.10*t, 0, .88-.065*t), lean=lean)
    back = p.foot('r', ankle=(-.18, -.20, ANKLE_HEIGHT))
    p.leg('r', back, pole=add(p.j['hip_r'], (1, -.3, 0)))
    # The front heel stays planted where the stretch ends (it slid 20 cm forward); the foot
    # pivots on it, toes up, and the leg straightens as the hips hinge back.
    pitch = -radians(42)*t
    ankle = sub(HAMSTRING_HEEL, rotate_y((-.075, 0, -ANKLE_HEIGHT), pitch))
    # Sink the hips just enough that the planted heel stays within a straight leg's reach.
    hip = p.j['hip_l']
    reach = THIGH+SHIN-.004
    flat = (ankle[0]-hip[0])**2+(ankle[1]-hip[1])**2
    highest = ankle[2]+sqrt(max(0., reach*reach-flat))
    if hip[2] > highest:
        pelvis = add(p.j['pelvis'], (0, 0, highest-hip[2]))
        p.torso(pelvis, lean=lean)
        p.leg('r', back, pole=add(p.j['hip_r'], (1, -.3, 0)))
    p.foot('l', ankle=ankle, pitch=pitch, contact=False)
    p.leg('l', ankle, pole=add(p.j['hip_l'], (1, 0, .3)))
    p.contacts['heel_l'] = p.j['heel_l']
    for s in SIDES:
        rest = add(mix_point(p.j['hip_l'], p.j['knee_l'], .6), (0, side_sign(s)*.07-.02, .07))
        p.arm(s, mix_point(rest_wrist(p, s), rest, stage(t, .2, 1.)), pole=add(p.j['shoulder_'+s], (-.3, side_sign(s)*.3, 0)))
    set_head(p, pitch=radians(10)*t)
    p.view = {'azimuth': 48, 'elevation': 10}
    return p

def hip_flexor_lunge(name, phase):
    """S25: back knee under the hip, front knee over the ankle; shift forward into the front hip."""
    t = ease_hold(phase)
    back_knee = (-.06, HIP_HALF, .05)
    pelvis_x = -.02+.12*t
    dx = pelvis_x-back_knee[0]
    pelvis_z = back_knee[2]+sqrt(THIGH**2-dx*dx)
    p = Pose(name, phase).torso((pelvis_x, 0, pelvis_z), lean=-radians(2))
    p.j['knee_l'] = back_knee
    p.contacts['knee_l'] = back_knee
    back_ankle = add(back_knee, (-sqrt(SHIN**2-.03**2), 0, .03))
    p.foot('l', ankle=back_ankle, pitch=radians(160), contact=False)
    p.j['ankle_l'] = back_ankle
    front = p.foot('r', ankle=(.52, -HIP_HALF, ANKLE_HEIGHT))
    p.leg('r', front)
    for s in SIDES:
        rest = add(mix_point(p.j['hip_r'], p.j['knee_r'], .6), (0, side_sign(s)*.06, .07))
        p.arm(s, rest, pole=add(p.j['shoulder_'+s], (-.3, side_sign(s)*.3, 0)))
    p.view = {'azimuth': 78, 'elevation': 8}
    return p

def supine(p, pelvis_x=-.02):
    """Lying on the back, head toward -x."""
    # Resting on the drawn body: pelvis and back on the mat, the back of the skull on it too
    # (the head centre sat ~5 cm low, sinking the skull into the floor).
    chest = (pelvis_x-TORSO, 0, .07)
    p.torso((pelvis_x, 0, .07), up=(-1, 0, 0))
    p.j['neck'] = add(p.j['chest'], (-NECK, 0, .0))
    p.j['head'] = add(p.j['neck'], (-HEAD, 0, .035))
    p.j['face'] = add(p.j['head'], (0, 0, .075))
    p.contacts['upper_back'] = (chest[0], 0, 0)
    p.contacts['head_ground'] = (p.j['head'][0], 0, 0)
    return p


def reclined_twist(name, phase):
    """S20 knee rolls: knees together roll side to side, shoulders stay flat.

    The pelvis rolls with the knees; fixed-length legs are re-solved from the
    rolled hips to feet that stay on the floor.
    """
    side, t = alternating(phase, into=.35, hold=.15)
    p = supine(Pose(name, phase))
    pivot = p.j['pelvis']
    angle = side_sign(side)*radians(45)*t
    axis = (1, 0, 0)
    knee_up = rotate((0, 0, 1), axis, angle)
    for s in SIDES:
        p.j['hip_'+s] = add(pivot, rotate(sub(p.j['hip_'+s], pivot), axis, angle))
    # Roll on the floor, not about a fixed centre: the lower hip stays at resting height (it
    # sank 9 cm into the floor) and the pelvis rides up between the hips.
    rise = max(0., pivot[2]-min(p.j['hip_'+s][2] for s in SIDES))
    for s in SIDES:
        p.j['hip_'+s] = add(p.j['hip_'+s], (0, 0, rise))
    p.j['pelvis'] = mix_point(p.j['hip_l'], p.j['hip_r'], .5)
    # The feet roll onto their outer edges rather than sliding across the mat.
    shift = side_sign(side)*.04*t
    for s in SIDES:
        foot = (.34, side_sign(s)*.05+shift, ANKLE_HEIGHT)
        p.foot(s, ankle=foot, pitch=radians(8)*t)
        p.leg(s, foot, pole=add(p.j['hip_'+s], add(mul(knee_up, 1), (.3, 0, 0))))
        shoulder = p.j['shoulder_'+s]
        wrist = (shoulder[0]-.05, shoulder[1]+side_sign(s)*.53, .03)
        p.arm(s, wrist, pole=add(shoulder, (0, 0, 1)), contact=True)
    p.view = {'azimuth': 12, 'elevation': 22}
    return p


STRETCH_MOTIONS = {
    'neck-flexion': neck_flexion,
    'neck-extension': neck_extension,
    'side-neck': side_neck,
    'overhead-reach': overhead_reach,
    'behind-back-clasp': behind_back_clasp,
    'torso-extension': torso_extension,
    'side-bend': side_bend,
    'oblique-twist': oblique_twist,
    'cat-cow': cat_cow,
    'quad-stretch': quad_stretch,
    'hamstring-stretch': hamstring_stretch,
    'hip-flexor-lunge': hip_flexor_lunge,
    'reclined-twist': reclined_twist,
}
