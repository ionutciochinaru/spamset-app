"""v2 grinds and holds: deadlift, goblet squat, lunges, rows, side bend, curl.

Every lift carries a 16 kg bell with real proportions; the Lift framework adds
the load-aware hip shift. Fixes follow the baseline reviews (54e441838d09):
arms inside the knees, hanging loads plumb, bells close to the body, elbows at
the flank in curls, deeper side bends and lunges, weight-shift before a foot
leaves the floor.
"""
from math import sin, cos, sqrt, radians

try:
    from ..rig import SIDES, side_sign, add, sub, mul, unit, norm, smooth, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM, THIGH, SHIN, HIP_HALF
    from .common import (BELL, MAX_REACH, tall, attach_bell, trunk, foot, toe_from, stance, leg, reach, handle_grip, one_hand,
                         horns_grip, hang_free)
    from .framework import Lift
except ImportError:
    from rig import SIDES, side_sign, add, sub, mul, unit, norm, smooth, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM, THIGH, SHIN, HIP_HALF
    from v2.common import (BELL, MAX_REACH, tall, attach_bell, trunk, foot, toe_from, stance, leg, reach, handle_grip, one_hand,
                           horns_grip, hang_free)
    from v2.framework import Lift

PACK = radians(7)
LATERAL = SHOULDER_HALF - .045           # shoulder to hand, sideways, for a two-hand handle grip
PLUMB = sqrt(MAX_REACH ** 2 - LATERAL ** 2)


def _elbows_back(p):
    return {s: add(p.j['shoulder_' + s], (-.4, 0., -.1)) for s in SIDES}


def reach_height(px, py, ankles, target, soft=.012, fraction=.985):
    """Pelvis height at (px, py): `target`, lowered smoothly so no leg straightens past
    `fraction` of its length (ankles: {side: (x, y)}). Keeps legs long without locking."""
    from math import exp, log
    long = (THIGH + SHIN) * fraction
    caps = [target]
    for s, (ax, ay) in ankles.items():
        hx, hy = px, py + side_sign(s) * HIP_HALF
        caps.append(ANKLE_HEIGHT + sqrt(max(0., long ** 2 - (hx - ax) ** 2 - (hy - ay) ** 2)))
    low = min(caps)
    return low - soft * log(sum(exp(-(c - low) / soft) for c in caps))


# ---------------------------------------------------------------- deadlift
DL_STANCE, DL_YAW = .26, radians(16)
# The bell travels straight up and down under the hips, between the feet (mid-foot).
DL_FLOOR = (.07, 0., .8 * BELL['radius'] + BELL['handle_to_center'])      # handle when the bell sits on the floor
HAND = .075                                  # wrist to the middle of the palm (the grip)
DL_WRIST = (0., .015, HAND)                  # hook grip: hands hang straight down from the wrists


DL_LOCK_X, DL_LOCK_Z = .20, .62                    # handle in front of the thighs at lockout


def _dl_path_x(z):
    """Bell path: straight up from mid-foot, easing forward onto the front of the thighs as the
    hips come through (it cannot stay under the hips once the legs are straight)."""
    t = max(0., min(1., (z - DL_FLOOR[2]) / (DL_LOCK_Z - DL_FLOOR[2])))
    return DL_FLOOR[0] + (DL_LOCK_X - DL_FLOOR[0]) * smooth(t)


def _dl_grip(p):
    """Long arms, hands hanging from the wrists, to the bell's path; the floor stops it."""
    mid = mul(add(p.j['shoulder_l'], p.j['shoulder_r']), .5)
    lateral = SHOULDER_HALF - .045 - DL_WRIST[1]
    x, z = DL_FLOOR[0], DL_FLOOR[2]
    for _ in range(12):
        dx = x - mid[0]
        drop = sqrt(max(0., (MAX_REACH - .002) ** 2 - lateral ** 2 - dx * dx)) + HAND
        # Smooth floor stop: the bell settles onto the floor rather than stopping dead.
        free, soft = mid[2] - drop - DL_FLOOR[2], .015
        z = DL_FLOOR[2] + (free + sqrt(free * free + soft * soft)) / 2 if free > -8 * soft else DL_FLOOR[2]
        x = _dl_path_x(z)
    return (x, 0., z)


def _dl_build(name, phase, st, dx, dy):
    px, pz = st['pelvis']
    p = trunk(name, phase, (px + dx, dy, pz), st['lean'], pack=(st['pack'], st['pack']))
    stance(p, DL_STANCE, DL_YAW, out=.25)      # knees pushed out: the arms hang inside them
    grip = _dl_grip(p)
    wrists = {s: (DL_WRIST[0], side_sign(s) * DL_WRIST[1], DL_WRIST[2]) for s in SIDES}
    handle_grip(p, grip, (0., 0., -1.), poles=_elbows_back(p), wrists=wrists)
    if grip[2] <= DL_FLOOR[2] + .002:
        p.contacts['kettlebell'] = (DL_FLOOR[0], 0., 0.)
    return p


# Bottom: the bell reached with arms straight; hips back, shoulders over the bell.
_dl_bottom = {'pelvis': (-.34, .72), 'lean': radians(72), 'pack': PACK}   # hinge: hips back and high, shins near vertical
_dl_mid = {'pelvis': (-.20, .81), 'lean': radians(45), 'pack': PACK}
_dl_top = {'pelvis': (0., tall(DL_STANCE)), 'lean': 0., 'pack': PACK}
DEADLIFT = Lift('kb-deadlift', 3.6, [
    (0.00, _dl_bottom, True), (0.10, _dl_bottom, True), (0.30, _dl_mid, False),
    (0.48, _dl_top, True), (0.60, _dl_top, True), (0.82, _dl_mid, False),
], _dl_build, {'azimuth': 30, 'elevation': 10}, balance='x')


# ---------------------------------------------------------------- goblet hold helpers
def _goblet(p):
    up, forward = p.up, p.forward
    center = add(add(p.j['chest'], mul(forward, .205)), mul(up, -.13))
    horns_grip(p, center, up=(0., 0., 1.), across=(0., 1., 0.), height=.55,
               poles={s: add(p.j['shoulder_' + s], (.12, side_sign(s) * .02, -.6)) for s in SIDES})


# ---------------------------------------------------------------- goblet squat
GS_STANCE, GS_YAW = .21, radians(18)


def _gs_build(name, phase, st, dx, dy):
    px, pz = st['pelvis']
    p = trunk(name, phase, (px + dx, dy, pz), st['lean'])
    stance(p, GS_STANCE, GS_YAW)
    _goblet(p)
    return p


_gs_top = {'pelvis': (0., tall(GS_STANCE)), 'lean': radians(4)}
_gs_bottom = {'pelvis': (-.19, .53), 'lean': radians(30)}
GOBLET_SQUAT = Lift('goblet-squat', 3.4, [
    (0.00, _gs_top, True), (0.10, _gs_top, True), (0.46, _gs_bottom, True), (0.54, _gs_bottom, True),
], _gs_build, {'azimuth': 50, 'elevation': 10}, balance='x')


# ---------------------------------------------------------------- reverse lunge (goblet)
RL_WIDTH = .13
RL_TOE_BACK = -.62
RL_PITCH = radians(66)


def _rl_build(name, phase, st, dx, dy):
    rear = 'l' if phase < .5 else 'r'
    front = 'r' if rear == 'l' else 'l'
    sg = side_sign(rear)
    px, pz = st['pelvis']
    p = trunk(name, phase, (px + dx, sg * st['pelvis_y'] + dy, pz), st['lean'])
    front_ankle = (0., side_sign(front) * RL_WIDTH, ANKLE_HEIGHT)
    # Front knee tracks straight over the (straight) front foot.
    leg(p, front, foot(p, front, front_ankle), out=.02)
    step, lift, pitch = st['step'], st['lift'], st['pitch']
    home_toe = add(front_ankle, (0., 0., 0.))
    home_toe = (.16, sg * RL_WIDTH, 0.)
    back_toe = (RL_TOE_BACK, sg * RL_WIDTH, 0.)
    toe = (home_toe[0] + (back_toe[0] - home_toe[0]) * step, sg * RL_WIDTH, lift)
    ankle = toe_from(rear, toe, 0., pitch)
    planted = lift < 1e-9 and (step < 1e-9 or step > 1 - 1e-9)
    direction = foot(p, rear, ankle, 0., pitch, contact=planted)
    # Rear knee turns down toward the floor as the leg steps back; standing, both knees
    # use the same over-the-toes rule (so the side switch at the loop seam is seamless).
    w = smooth(min(1., step * 2.))
    front_pole = add(p.j['hip_' + rear], add(direction, (0., side_sign(rear) * .02, 0.)))
    down_pole = add(p.j['hip_' + rear], (.25, 0., -1.))
    leg(p, rear, direction, pole=tuple(x + (y - x) * w for x, y in zip(front_pole, down_pole)))
    _goblet(p)
    return p


_rl = lambda pelvis, y, lean, step, lift, pitch: {'pelvis': pelvis, 'pelvis_y': y, 'lean': lean, 'step': step,
                                                   'lift': lift, 'pitch': pitch}
# pelvis_y is measured toward the stepping (rear) leg; negative = over the front foot.
_rl_stand = _rl((0., tall(RL_WIDTH)), 0., radians(3), 0., 0., 0.)
_rl_shift = _rl((.01, .925), -.16, radians(5), 0., 0., 0.)   # weight over the front foot first (no dip)
_rl_air = _rl((-.06, tall(RL_WIDTH, .17) - .02), -.16, radians(12), .5, .07, radians(22))
_rl_land = _rl((-.14, .83), -.05, radians(18), 1., 0., RL_PITCH)
_rl_bottom = _rl((-.19, .52), -.035, radians(14), 1., 0., RL_PITCH)
# Per side: weight onto the front foot, the rear foot peels off and reaches back, a lowered
# pause, then drive up and bring the foot home.
_rl_half = [(0.00, _rl_stand, True), (0.01, _rl_stand, True), (0.07, _rl_shift, False), (0.13, _rl_air, False),
            (0.18, _rl_land, False), (0.245, _rl_bottom, True), (0.295, _rl_bottom, True), (0.36, _rl_land, False),
            (0.41, _rl_air, False), (0.46, _rl_shift, False)]
REVERSE_LUNGE = Lift('kb-reverse-lunge', 7.4, _rl_half + [(t + .5, s, h) for t, s, h in _rl_half],
                     _rl_build, {'azimuth': 60, 'elevation': 10}, balance='xy', mirror=True)


# ---------------------------------------------------------------- side lunge (goblet)
SL_WIDTH, SL_YAW = .48, radians(18)
SL_TALL = tall(SL_WIDTH, .0)
SL_LOW = (-.17, .36)       # hips back and over the working foot (height from the legs)


def _sl_build(name, phase, st, dx, dy):
    """Wide stance; sit the hips back and over one foot, that knee tracking the toes, while
    the other leg stays long with the foot flat; return to standing tall in the middle."""
    side = 'l' if phase < .5 else 'r'
    sg = side_sign(side)
    k = st['shift']
    px, py = SL_LOW[0] * k + dx, sg * SL_LOW[1] * k + dy
    # Hips as high as both legs reach (knees ~170 deg at most), never above standing: sliding
    # the hips sideways lowers them, and the trailing leg stays long.
    z = reach_height(px, py, {sd: (0., side_sign(sd) * SL_WIDTH) for sd in SIDES}, SL_TALL, fraction=.996)
    pelvis = (px, py, z)
    p = trunk(name, phase, pelvis, radians(32) * k, bend=0., twist=sg * radians(6) * k)
    for s in SIDES:
        ankle = (0., side_sign(s) * SL_WIDTH, ANKLE_HEIGHT)
        working = s == side
        direction = foot(p, s, ankle, SL_YAW)
        leg(p, s, direction, out=.05 + (.03 if working else -.03) * k)      # knee over the foot
    _goblet(p)
    return p


_sl_half = [(0.00, {'shift': 0.}, True), (0.05, {'shift': 0.}, True), (0.24, {'shift': 1.}, True),
            (0.29, {'shift': 1.}, True)]
SIDE_LUNGE = Lift('kb-side-lunge', 5.4, _sl_half + [(t + .5, s, h) for t, s, h in _sl_half],
                  _sl_build, {'azimuth': 20, 'elevation': 10}, balance='xy', mirror=True)


# ---------------------------------------------------------------- upright row
UR_STANCE = .14


def _ur_build(name, phase, st, dx, dy):
    """Overhand grip on the handle, palms on it and wrists a hand-length above (knuckles
    down). The elbows lead up and out to about shoulder height; the bell rises close to
    the body to mid-chest, forearms and hands sloping down to it in a V."""
    k = st['row']
    p = trunk(name, phase, (dx, dy, tall(UR_STANCE)), radians(2), pack=(PACK * (1 - k), PACK * (1 - k)))
    stance(p, UR_STANCE, radians(10))
    chest = p.j['chest']
    hand = .075                                           # wrist to the middle of the palm
    # Bottom: arms hang straight from the (packed) shoulders, bell against the front of the thighs.
    sh = p.j['shoulder_l']
    down = unit((0., .2, 1.))                              # hand hanging from the wrist
    fx, lat = chest[0] + .19 - sh[0], sh[1] - (.03 + hand * down[1])
    bottom = (chest[0] + .19, 0., sh[2] - sqrt(max(.01, (MAX_REACH - .002) ** 2 - fx ** 2 - lat ** 2)) - hand * down[2])
    top = (chest[0] + .16, 0., chest[2] - .13)
    grip = tuple(a + (b - a) * k for a, b in zip(bottom, top))
    # Hands hang straight down from the wrists at the bottom and angle in toward the handle
    # as the elbows flare at the top.
    flared = unit((-.1, .8, .6))
    offset = mul(unit(tuple(a + (b - a) * k for a, b in zip(down, flared))), hand)   # rigid hand length
    wrists = {s: (offset[0], side_sign(s) * offset[1], offset[2]) for s in SIDES}
    poles = {s: add(p.j['shoulder_' + s], (-.15 - .35 * k, side_sign(s) * (.55 + .45 * k), -.3 + .9 * k)) for s in SIDES}
    handle_grip(p, grip, (0., 0., -1.), spacing=.03, poles=poles, wrists=wrists)
    return p


UPRIGHT_ROW = Lift('kb-upright-row', 3.0, [
    (0.00, {'row': 0.}, True), (0.10, {'row': 0.}, True), (0.45, {'row': 1.}, True), (0.55, {'row': 1.}, True),
], _ur_build, {'azimuth': 35, 'elevation': 10}, balance='x')


# One-hand bells hang from the handle: gravity dominates, the grip only steadies them.
HANG = {'stiffness': 20., 'damping': .8, 'cushion': .012}   # slow: a thin contact band, so it rests on the leg


# ---------------------------------------------------------------- bent-over row
# Staggered: right foot forward, left (row side) back and out, so the feet frame the hanging bell.
BR_FRONT, BR_BACK = (.28, -.10), (-.36, .30)
BR_PELVIS = (-.04, .90)          # hips back over the long rear leg, front knee bent (balanced as authored)
BR_LEAN = radians(55)


def _br_build(name, phase, st, dx, dy):
    """Single-arm row (left), staggered stance: right foot forward with the right hand resting
    on that thigh, flat back hinged toward horizontal, neck long. The elbow drives back and
    the bell finishes at the hip; the shoulder stays down."""
    k = st['row']
    px, py = BR_PELVIS[0] + dx, dy
    pz = reach_height(px, py, {'r': BR_FRONT, 'l': BR_BACK}, BR_PELVIS[1])
    p = trunk(name, phase, (px, py, pz), BR_LEAN, pack=(PACK * (1 - .5 * k), radians(3)))
    for s, (x, y), yaw in (('r', BR_FRONT, radians(8)), ('l', BR_BACK, radians(14))):
        ankle = (x, y, ANKLE_HEIGHT)
        leg(p, s, foot(p, s, ankle, yaw))
    up, forward = p.up, p.forward
    shoulder = p.j['shoulder_l']
    hang = (shoulder[0] + .03, shoulder[1] - .06, shoulder[2] - MAX_REACH + .02)
    hip = add(add(add(p.j['pelvis'], mul(forward, .10)), mul(up, .10)), (0., .23, 0.))   # at the hip crest
    # The hand rises first and travels back late (the elbow leads), so it clears the thigh.
    rise, back = 1 - (1 - k) ** 2, k * k
    grip = (hang[0] + (hip[0] - hang[0]) * back, hang[1] + (hip[1] - hang[1]) * rise, hang[2] + (hip[2] - hang[2]) * rise)
    one_hand(p, 'l', grip, (0., 0., -1.), pole=add(shoulder, (-.45, .08, .3 * k - .1)), rest_side=(-.3, .95, 0.))
    # Free hand rests on the front thigh just above the knee.
    thigh = add(p.j['hip_r'], mul(sub(p.j['knee_r'], p.j['hip_r']), .78))
    along = unit(sub(p.j['knee_r'], p.j['hip_r']))
    rest = add(thigh, (-.02, -.02, .17))
    p.arm('r', rest, pole=add(p.j['shoulder_r'], (-.2, -.5, .1)), palm=add(rest, mul(along, .065)))
    return p


BENT_ROW = Lift('kb-bent-row', 3.0, [
    (0.00, {'row': 0.}, True), (0.10, {'row': 0.}, True), (0.42, {'row': 1.}, True), (0.52, {'row': 1.}, True),
], _br_build, {'azimuth': 64, 'elevation': 12}, balance='', bell=HANG)


# ---------------------------------------------------------------- side bend (bell in the left hand)
SB_STANCE = .13


def _sb_build(name, phase, st, dx, dy):
    k = st['bend']
    # The hips drift a little away from the bell as the trunk bends toward it.
    p = trunk(name, phase, (dx, dy - .025 * k, tall(SB_STANCE, .07)), radians(1), bend=radians(32) * k, pack=(radians(10), radians(-2)))
    stance(p, SB_STANCE, radians(8))
    shoulder = p.j['shoulder_l']
    # The loaded arm hangs long with the hand on the outside of the thigh: as the trunk bends
    # the hand slides down the thigh toward the knee (the bell hangs against the leg).
    hip, knee = p.j['hip_l'], p.j['knee_l']
    outside = (0., .073 + BELL['radius'] + .004, .02)    # bell hangs plumb, resting on the outer thigh

    def on_thigh(t):
        return add(add(hip, mul(sub(knee, hip), t)), outside)
    reach_arm = MAX_REACH
    lo, hi = 0., 1.
    if norm(sub(on_thigh(1.), shoulder)) <= reach_arm:
        wrist = on_thigh(1.)
    else:
        for _ in range(40):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if norm(sub(on_thigh(mid), shoulder)) < reach_arm else (lo, mid)
        wrist = on_thigh(lo)
    one_hand(p, 'l', wrist, (0., .12, -1.), pole=add(shoulder, (-.3, .3, 0.)))
    # Free hand on the hip crest (palm on it, wrist above), elbow out to the side.
    crest = add(add(p.j['pelvis'], mul(unit(sub(p.j['hip_r'], p.j['pelvis'])), .15)), (0., 0., .10))  # on the pelvis
    p.arm('r', add(crest, (-.02, -.035, .065)), pole=add(p.j['shoulder_r'], (-.2, -.6, -.2)), palm=crest)
    return p


SIDE_BEND = Lift('kb-side-bend', 3.4, [
    (0.00, {'bend': 0.}, True), (0.10, {'bend': 0.}, True), (0.42, {'bend': 1.}, True), (0.50, {'bend': 1.}, True),
], _sb_build, {'azimuth': 12, 'elevation': 8}, balance='xy', bell=HANG, look=False)   # head in line


# ---------------------------------------------------------------- curl (two hands on the horns)
CU_STANCE = .14
CU_HORN_UP, CU_HORN_ACROSS = .126, .0815     # hands on the horns (height .55), from the bell centre


def _cu_build(name, phase, st, dx, dy):
    """Two-hand horn curl: upper arms still at the sides with the elbows just in front of
    the hips; the forearms swing the bell up to the chest, thumbs up, bell upright."""
    k = st['curl']
    p = trunk(name, phase, (dx, dy, tall(CU_STANCE)), radians(0), pack=(radians(6), radians(6)))
    stance(p, CU_STANCE, radians(10))
    shoulder = mul(add(p.j['shoulder_l'], p.j['shoulder_r']), .5)
    # Elbow line (between the two elbows) and the hands' arc around it.
    # At the bottom the upper arms tip slightly forward (the bell rests against the thighs)
    # so the elbows straighten; they come back to the flank as the curl starts.
    reach_fwd = radians(14) * (1 - k) ** 2
    pivot = (shoulder[0] + .03 + UPPER_ARM * sin(reach_fwd), 0., shoulder[2] - UPPER_ARM * cos(reach_fwd) + .012)
    elbow_y = SHOULDER_HALF - .01
    radius = sqrt(FOREARM ** 2 - (elbow_y - CU_HORN_ACROSS) ** 2) - .004
    flex = radians(12) + radians(130) * k
    hands = add(pivot, (radius * sin(flex), 0., -radius * cos(flex)))
    # Near the bottom the whole arm hangs straight from the shoulder to the horn, angled in
    # slightly and forward so the bell rests against the front of the thighs.
    lateral = SHOULDER_HALF - CU_HORN_ACROSS
    long = sqrt(MAX_REACH ** 2 - lateral ** 2)
    straight = add(shoulder, (long * sin(radians(15)), 0., -long * cos(radians(15))))
    w = max(0., 1 - k / .3) ** 2
    hands = tuple(a + (b - a) * w for a, b in zip(hands, straight))
    # The bell stays upright; near the top it tips back a little toward the chest.
    up = unit((-.25 * k, 0., 1.))
    centre = sub(hands, mul(up, CU_HORN_UP))
    poles = {s: add(p.j['shoulder_' + s], (-.35, side_sign(s) * .12, -.25)) for s in SIDES}
    horns_grip(p, centre, up=up, height=.55, poles=poles)
    return p


CURL = Lift('kb-curl', 3.6, [
    # Up in ~1.2 s, a brief squeeze, down slower (~1.6 s).
    (0.00, {'curl': 0.}, True), (0.06, {'curl': 0.}, True), (0.40, {'curl': 1.}, True), (0.47, {'curl': 1.}, True),
], _cu_build, {'azimuth': 70, 'elevation': 10}, balance='x')


# ---------------------------------------------------------------- standing pullover
PO_STANCE = .16
_GRIP_UP, _GRIP_ACROSS = .126, .0815          # horn grip offsets from the bell centre


def _po_build(name, phase, st, dx, dy):
    """Hands on the horns beside the handle, the bell upside down (base up) at the chest. It
    rises straight up in front to the face, where the lifter lets it tip back: gravity takes
    the base over toward the head and on over it (one continuous backward rotation) as the
    bent arms carry it over the head and lower it behind; then back the same way."""
    a, e, tilt, back = st['arm'], st['elbow'], st['tilt'], st['back']
    # Counter the bell: a slight lean back while it is out in front (ribs stay down).
    p = trunk(name, phase, (dx, dy, tall(PO_STANCE)), radians(1) - radians(5) * sin(a), pack=(0., 0.))
    stance(p, PO_STANCE, radians(10))
    chest = p.j['chest']
    upper = (sin(a), 0., -cos(a))
    fore = (sin(a + e), 0., -cos(a + e))
    lateral = SHOULDER_HALF - _GRIP_ACROSS
    reach2 = sqrt(max(.01, norm(add(mul(upper, .295), mul(fore, .265))) ** 2 - lateral ** 2))
    hands = add(chest, mul(unit(add(mul(upper, .295), mul(fore, .265))), reach2))
    # back: how far the upside-down bell's base has tipped back toward the head (0 = straight
    # up). tilt blends that toward hanging along the forearms (behind the head).
    base = (-sin(back), 0., cos(back))
    up = unit(add(mul(base, -(1 - tilt)), mul(fore, -tilt)))
    center = add(hands, mul(up, -_GRIP_UP))
    poles = {s: add(add(p.j['shoulder_' + s], mul(upper, .3)), (0., side_sign(s) * .06, 0.)) for s in SIDES}
    horns_grip(p, center, up=up, across=(0., 1., 0.), height=.55, poles=poles)
    return p


_po_chest = {'arm': radians(14), 'elbow': radians(130), 'tilt': 0., 'back': 0.}          # upside down at the chest
_po_face = {'arm': radians(70), 'elbow': radians(94), 'tilt': 0., 'back': radians(45)}   # at the face, tipping back
_po_over = {'arm': radians(140), 'elbow': radians(35), 'tilt': 0., 'back': radians(100)} # falling over the head
_po_behind = {'arm': radians(162), 'elbow': radians(115), 'tilt': 0., 'back': radians(105)}  # hanging behind the head
PULLOVER = Lift('kb-pullover', 7.5, [
    (0.00, _po_chest, True), (0.07, _po_chest, True), (0.19, _po_face, False), (0.31, _po_over, False),
    (0.44, _po_behind, True), (0.54, _po_behind, True), (0.67, _po_over, False), (0.80, _po_face, False),
    (0.93, _po_chest, True),
], _po_build, {'azimuth': 55, 'elevation': 8}, balance='x')


LIFTS = {lift.name: lift for lift in (PULLOVER, DEADLIFT, GOBLET_SQUAT, REVERSE_LUNGE, SIDE_LUNGE, UPRIGHT_ROW, BENT_ROW,
                                        SIDE_BEND, CURL)}
