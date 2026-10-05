"""Done-state celebrations: hero, anime and movie victory poses for the app's figure.

Not exercises: shown after a spam set and on Today once you are caught up. Each is
keyframed on the same rig (feet, pelvis, trunk, head, wrists) and loops from a
neutral stand into the pose, holds it with a little life, and back. No watch
renderer use; exported with export_3d.py next to the exercises.
"""
from math import sin, cos, pi
try:
    from .rig import *
    from .stretches import set_head, stage, twist
except ImportError:
    from rig import *
    from stretches import set_head, stage, twist

# Authoring timeline length (s); a clip plays its first `end` share once.
DURATION = 4.0
FRONT = {'azimuth': 28, 'elevation': 8}

# Wrist offsets are from the shoulder (m, rig axes: x forward, y left, z up); poles are
# where each elbow or knee points, from its root.
HANG = (.03, .03, -.548)
NEUTRAL = {
    'pelvis': (0., 0., .945), 'lean': 0., 'roll': 0., 'twist': 0., 'head': (0., 0., 0.),
    'toe_l': (.16, .15, 0.), 'toe_r': (.16, -.15, 0.), 'pitch_l': 0., 'pitch_r': 0.,
    'wrist_l': HANG, 'wrist_r': (HANG[0], -HANG[1], HANG[2]),
    'pole_l': (-.3, .25, -.3), 'pole_r': (-.3, -.25, -.3),
    'knee_l': (1., 0., 0.), 'knee_r': (1., 0., 0.),
    # Blend a wrist onto its own knee, or onto a floor point (0 = shoulder offset only).
    'onknee_l': 0., 'onknee_r': 0., 'floor_l': 0., 'floor_r': 0.,
    'floor_pt_l': (.35, .10, .10), 'floor_pt_r': (.35, -.10, .10),
}


def L(x, y, z):
    """A left-side offset and its mirror for the right."""
    return (x, y, z), (x, -y, z)


def pose(**changes):
    key = dict(NEUTRAL)
    for name, value in changes.items():
        if name.endswith('_both'):
            base = name[:-5]
            key[base+'_l'], key[base+'_r'] = L(*value) if isinstance(value, tuple) else (value, value)
        else:
            key[name] = value
    return key


def mirror(key):
    """The same pose on the other side (left and right swapped, y negated)."""
    out = {}
    for name, value in key.items():
        other = name[:-2]+('_r' if name.endswith('_l') else '_l') if name[-2:] in ('_l', '_r') else name
        if name in ('pelvis',) or name.startswith(('wrist_', 'pole_', 'knee_', 'toe_', 'floor_pt_')):
            value = (value[0], -value[1], value[2])
        elif name in ('roll', 'twist'):
            value = -value
        elif name == 'head':
            value = (value[0], -value[1], -value[2])
        out[other] = value
    return out


def mix(a, b, t):
    if isinstance(a, tuple):
        return tuple(x+(y-x)*t for x, y in zip(a, b))
    return a+(b-a)*t


def sample(keys, phase):
    """Eased interpolation through (time, key) pairs; the first and last keys are NEUTRAL."""
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t0 <= phase <= t1:
            t = smooth((phase-t0)/(t1-t0)) if t1 > t0 else 1.
            return {k: mix(a[k], b[k], t) for k in a}
    return dict(keys[-1][1])


def build(name, phase, k):
    lean, roll = k['lean'], k['roll']
    up = unit((sin(lean)*cos(roll), sin(roll), cos(lean)*cos(roll)))
    p = Pose(name, phase).torso(k['pelvis'], up=up)
    if k['twist']:
        twist(p, k['twist'])
    pitch, head_roll, yaw = k['head']
    set_head(p, pitch=pitch, roll=head_roll, yaw=yaw)
    for s in SIDES:
        ankle = p.foot(s, toe=k['toe_'+s], pitch=k['pitch_'+s], contact=k['toe_'+s][2] < .004)
        p.leg(s, ankle, pole=add(p.j['hip_'+s], k['knee_'+s]))
        shoulder = p.j['shoulder_'+s]
        wrist = add(shoulder, k['wrist_'+s])
        wrist = mix(wrist, add(p.j['knee_'+s], (.05, 0., .08)), k['onknee_'+s])
        wrist = mix(wrist, k['floor_pt_'+s], k['floor_'+s])
        # Mid-transition a knee or floor target can be out of reach: reach toward it instead.
        reach = UPPER_ARM+FOREARM-.004
        if norm(sub(wrist, shoulder)) > reach:
            wrist = add(shoulder, mul(unit(sub(wrist, shoulder)), reach))
        p.arm(s, wrist, pole=add(shoulder, k['pole_'+s]))
    p.view = dict(FRONT)
    return p


def motion(keys, view=None, extra=None, strike=0., end=1.):
    """A celebration played once: into the pose (struck at `strike`), through its moving hold, and
    stopping on the pose at `end`. Keys after `end` (back to standing) are for authoring only."""
    def run(name, phase):
        phase = min(1., phase)*end
        k = sample(keys, phase)
        if extra:
            extra(k, phase)
        p = build(name, phase, k)
        if view:
            p.view = dict(view)
        return p
    run.duration = DURATION*end
    # Where in the clip (0..1) the pose lands: the app bursts the aura there.
    run.strike = strike/end
    return run


def held(phase, start=.22, end=.82):
    """0..1 through the hold, 0 outside it."""
    return min(1., max(0., (phase-start)/(end-start))) if start <= phase <= end else 0.


def in_hold(phase, start=.22, end=.82):
    """Weight of the hold's extra motion: fades in and out at its edges."""
    return smooth((phase-start)/.06)*smooth((end-phase)/.06) if start < phase < end else 0.


def breathe(k, phase, depth=.012, rate=3):
    w = in_hold(phase)
    k['pelvis'] = add(k['pelvis'], (0, 0, depth*w*sin(2*pi*rate*phase)))


# 1. Superhero landing: drop from a jump into the three-point landing, fist on the floor,
# then look up.
_LAND = pose(pelvis=(-.08, 0, .43), lean=radians(48), head=(radians(40), 0, 0),
             toe_l=(.34, .16, 0.), toe_r=(-.62, -.13, 0.), pitch_r=radians(58),
             knee_l=(1., .3, 0.), knee_r=(.6, 0., -1.),
             wrist_r=(.12, .02, -.535), pole_r=(-.3, -.3, 0.),
             wrist_l=(-.30, .42, .02), pole_l=(-.4, .5, .3))
_AIR = pose(pelvis=(0, 0, 1.12), lean=radians(-6), head=(radians(-10), 0, 0),
            toe_l=(.14, .16, .30), toe_r=(.10, -.16, .24), pitch_l=radians(20), pitch_r=radians(20),
            wrist_both=(-.10, .40, .05), pole_both=(-.3, .4, .2))
_DIP = pose(pelvis=(-.08, 0, .80), lean=radians(20), wrist_both=(-.32, .08, -.45))
hero_landing = motion([
    (0., NEUTRAL), (.08, _DIP), (.17, _AIR), (.27, _LAND),
    (.42, _LAND), (.55, dict(_LAND, head=(radians(-12), 0, 0))), (.82, dict(_LAND, head=(radians(-12), 0, 0))),
    (1., NEUTRAL)], view={'azimuth': 40, 'elevation': 10}, extra=breathe, strike=0.55, end=0.82)

# 2. Power-up: feet planted wide, fists clenched low and out from the hips, trembling as it charges.
def _tremble(k, phase):
    w = in_hold(phase, .18, .86)
    k['pelvis'] = add(k['pelvis'], (.004*w*sin(phase*260), .006*w*sin(phase*210), -.015*w*held(phase, .18, .86)))
    for s, v in (('l', 1), ('r', -1)):
        x, y, z = k['wrist_'+s]
        k['wrist_'+s] = (x, y+v*.008*w*sin(phase*240+v), z)


_POWERUP = pose(pelvis=(0, 0, .915), toe_both=(.16, .25, 0.), knee_both=(1., .4, 0.),
                wrist_both=(.06, .31, -.43), pole_both=(-.3, .6, 0.), head=(radians(6), 0, 0))
power_up = motion([(0., NEUTRAL), (.16, _POWERUP), (.86, _POWERUP), (1., NEUTRAL)], view={'azimuth': 4, 'elevation': -14}, extra=_tremble, strike=0.2, end=0.86)

# 3. Knee-up power stance: one knee drawn high, fists clenched out at the hips, chest proud.
_KNEE = pose(pelvis=(0, -.05, .935), roll=radians(3), head=(radians(4), 0, 0),
             toe_r=(.16, -.10, 0.), toe_l=(.30, .12, .44), pitch_l=radians(-20), knee_l=(1., 0., .4),
             wrist_both=(.06, .26, -.40), pole_both=(-.1, .8, 0.))
knee_power = motion([(0., NEUTRAL), (.18, _KNEE), (.84, _KNEE), (1., NEUTRAL)],
                    view={'azimuth': 0, 'elevation': 2}, extra=breathe, strike=0.2, end=0.84)


# 4. Levitate: rise off the floor, one knee up, the hanging foot pointed, arms spread wide.
def _hover(k, phase):
    w = in_hold(phase, .26, .78)
    k['pelvis'] = add(k['pelvis'], (0, 0, .03*w*sin(2*pi*2*phase)))
    for s in SIDES:
        x, y, z = k['toe_'+s]
        k['toe_'+s] = (x, y, z+.03*w*sin(2*pi*2*phase))


_FLOAT = pose(pelvis=(0, 0, 1.10), head=(radians(-4), 0, 0),
              toe_l=(.18, .11, .17), pitch_l=radians(55),
              toe_r=(.06, -.04, .60), pitch_r=radians(65), knee_r=(1., -.3, .2),
              wrist_both=(.02, .53, -.12), pole_both=(-.2, .2, -.6))
levitate = motion([(0., NEUTRAL), (.26, _FLOAT), (.78, _FLOAT), (1., NEUTRAL)], view={'azimuth': 0, 'elevation': 5}, extra=_hover, strike=0.3, end=0.78)

# 5. Hand seal: hands locked together in front of the chest, elbows out, a fierce grin up.
_SEAL = pose(pelvis=(0, 0, .94), toe_both=(.16, .17, 0.), head=(radians(-10), 0, 0),
             wrist_l=(.30, -.17, -.10), pole_l=(-.1, .7, -.1),
             wrist_r=(.31, .17, -.06), pole_r=(-.1, -.7, -.1))
hand_seal = motion([(0., NEUTRAL), (.14, _SEAL), (.86, _SEAL), (1., NEUTRAL)],
                   view={'azimuth': 6, 'elevation': -6}, extra=breathe, strike=0.18, end=0.86)

# 6. Gear crouch: deep wide squat, one hand on the knee, the other fist on the ground, eyes up.
_GEAR = pose(pelvis=(-.10, 0, .36), lean=radians(58), head=(radians(-50), 0, 0),
             toe_both=(.22, .36, 0.), knee_both=(1., .9, 0.),
             onknee_l=1., wrist_l=(.1, .1, -.5), pole_l=(-.2, .6, .2),
             floor_r=1., floor_pt_r=(.36, -.12, .09), pole_r=(-.2, -.6, .3))
gear_crouch = motion([(0., NEUTRAL), (.22, _GEAR), (.84, _GEAR), (1., NEUTRAL)],
                     view={'azimuth': 4, 'elevation': 4}, extra=breathe, strike=0.26, end=0.84)

# 7. One fist up: a fist punched straight at the sky, the other arm down, chin tucked.
_FIST = mirror(pose(pelvis=(0, 0, .94), toe_both=(.16, .16, 0.), head=(radians(18), 0, radians(-8)), twist=radians(-10),
                    wrist_r=(.03, .02, .535), pole_r=(-.2, -.3, .2),
                    wrist_l=(.02, .10, -.53)))
_FIST_RISE = dict(_FIST, wrist_l=(.42, .04, .05), pole_l=(-.3, .3, -.2))
fist_up = motion([(0., NEUTRAL), (.07, _FIST_RISE), (.14, _FIST), (.86, _FIST),
                  (.93, _FIST_RISE), (1., NEUTRAL)],
                 view={'azimuth': 25, 'elevation': -22}, extra=breathe, strike=0.18, end=0.86)

# 8. Energy blast: cupped hands drawn back to the hip, charge, then thrust both palms forward.
_CHARGE = pose(pelvis=(0, 0, .82), toe_l=(.30, .26, 0.), toe_r=(-.18, -.24, 0.),
               twist=radians(-40), lean=radians(6), head=(radians(5), 0, radians(35)),
               knee_l=(1., .4, 0.), knee_r=(1., -.4, 0.),
               wrist_l=(-.10, -.20, -.38), wrist_r=(-.12, .10, -.40),
               pole_l=(-.2, .3, -.3), pole_r=(-.4, -.2, -.2))
_BLAST = pose(pelvis=(.05, 0, .84), toe_l=(.30, .26, 0.), toe_r=(-.18, -.24, 0.),
              twist=radians(5), lean=radians(12), head=(radians(-4), 0, 0),
              knee_l=(1., .4, 0.), knee_r=(1., -.4, 0.),
              wrist_l=(.52, -.15, -.02), wrist_r=(.52, .15, -.02),
              pole_l=(0., .4, -.6), pole_r=(0., -.4, -.6))


def _shake(k, phase):
    w = 1. if .18 < phase < .44 else 0.
    k['pelvis'] = add(k['pelvis'], (0, .006*w*sin(phase*190), .004*w*sin(phase*230)))


energy_blast = motion([(0., NEUTRAL), (.18, _CHARGE), (.44, _CHARGE), (.52, _BLAST), (.84, _BLAST), (1., NEUTRAL)],
                      view={'azimuth': 65, 'elevation': 9}, extra=_shake, strike=0.56, end=0.84)


# 9. Ninja run: leaning sprint in place, arms swept straight back.
def _run(k, phase):
    w = in_hold(phase, .18, .86)
    if not w:
        return
    for i, s in enumerate(SIDES):
        cycle = (phase*8+.5*i) % 1.
        lift = max(0., sin(2*pi*cycle))
        x, y, _ = k['toe_'+s]
        k['toe_'+s] = (x+.10*sin(2*pi*cycle)*w - .05*w, y, .20*lift*w)
        k['pitch_'+s] += radians(30)*lift*w
    k['pelvis'] = add(k['pelvis'], (0, 0, .02*w*abs(sin(8*pi*phase))))


_NINJA = pose(pelvis=(-.06, 0, .86), lean=radians(30), head=(radians(-28), 0, 0),
              knee_both=(1., .1, 0.), wrist_both=(-.48, .10, -.24), pole_both=(0., .2, -.6))
ninja_run = motion([(0., NEUTRAL), (.18, _NINJA), (.86, _NINJA), (1., NEUTRAL)],
                   view={'azimuth': 62, 'elevation': 9}, extra=_run, strike=0.22, end=0.86)

# 10. Sky punch: dip, launch off the floor with one fist driving up at the sky, legs trailing.
def _rise(k, phase):
    w = in_hold(phase, .26, .76)
    k['pelvis'] = add(k['pelvis'], (0, 0, .04*w*sin(2*pi*2*phase)))
    for s in SIDES:
        x, y, z = k['toe_'+s]
        k['toe_'+s] = (x, y, z+.04*w*sin(2*pi*2*phase))


_CROUCH = pose(pelvis=(-.08, 0, .78), lean=radians(22), wrist_both=(-.30, .10, -.46), head=(radians(-10), 0, 0))
_LAUNCH = pose(pelvis=(0, 0, 1.28), lean=radians(8), head=(radians(-8), 0, 0),
               toe_l=(.10, .12, .34), toe_r=(-.02, -.13, .28), pitch_both=radians(55), knee_both=(1., .1, -.2),
               wrist_r=(.24, .02, .48), pole_r=(-.3, -.4, .1),
               wrist_l=(-.08, .14, -.52))
_PUNCH_RISE = dict(_LAUNCH, wrist_r=(.42, -.04, .05), pole_r=(-.3, -.3, -.2))
sky_punch = motion([(0., NEUTRAL), (.12, _CROUCH), (.18, _PUNCH_RISE), (.26, _LAUNCH), (.76, _LAUNCH),
                    (.84, _PUNCH_RISE), (.90, _CROUCH), (1., NEUTRAL)],
                   view={'azimuth': 8, 'elevation': 55}, extra=_rise, strike=0.3, end=0.76)

# 11. Menacing walk: mid-stride and unhurried, leaning back a touch, arms loose with open
# hands, seen from low behind as it advances.
_MENACE = pose(pelvis=(.02, 0, .915), lean=radians(-6), head=(radians(-4), 0, 0),
               toe_l=(.40, .11, 0.), toe_r=(-.22, -.11, 0.), pitch_r=radians(30),
               wrist_l=(-.10, .13, -.52), pole_l=(-.4, .4, -.2),
               wrist_r=(.14, -.12, -.51), pole_r=(-.4, -.4, -.2))
_MENACE_MID = dict(_MENACE, toe_l=(.24, .11, .06), pitch_l=radians(-8))
menacing = motion([(0., NEUTRAL), (.10, _MENACE_MID), (.20, _MENACE), (.86, _MENACE), (1., NEUTRAL)],
                  view={'azimuth': 200, 'elevation': -12}, strike=0.2, end=0.86)

# 12. Best-friend flex: one arm flexed high, the other hand gripping its biceps, a big grin.
_FLEX = mirror(pose(pelvis=(0, 0, .935), toe_both=(.16, .20, 0.), twist=radians(-15), head=(radians(-8), 0, radians(10)),
                    wrist_r=(.06, -.10, .30), pole_r=(0., -.8, .1),
                    wrist_l=(.12, -.47, .06), pole_l=(-.1, .4, -.4)))
best_friend = motion([(0., NEUTRAL), (.16, _FLEX), (.86, _FLEX), (1., NEUTRAL)],
                     view={'azimuth': 12, 'elevation': 3}, extra=breathe, strike=0.2, end=0.86)


# 13. Heart salute: heels together, a fist struck to the heart, the other arm behind the back.
def _strike(k, phase):
    hit = stage(phase, .16, .22) - stage(phase, .22, .26)
    x, y, z = k['wrist_r']
    k['wrist_r'] = (x+.04*hit, y, z)


_HEART = pose(toe_both=(.16, .10, 0.), head=(radians(-10), 0, 0),
              wrist_r=(.13, .25, -.07), pole_r=(0., -.5, -.6),
              wrist_l=(-.20, -.12, -.42), pole_l=(-.2, .5, -.2))
heart_salute = motion([(0., NEUTRAL), (.18, _HEART), (.86, _HEART), (1., NEUTRAL)],
                      view={'azimuth': 0, 'elevation': 2}, extra=_strike, strike=0.28, end=0.86)

# 14. Ginyu pose: wide low stance, one arm flung up and out, the other pointing down across.
_GINYU = pose(pelvis=(0, 0, .70), toe_both=(.15, .40, 0.), knee_both=(1., .8, 0.),
              lean=radians(20), twist=radians(20), roll=radians(-6), head=(radians(-25), 0, radians(-15)),
              wrist_l=(.10, .30, .45), pole_l=(-.2, .5, 0.),
              wrist_r=(.45, -.05, -.30), pole_r=(-.2, -.5, .2))
ginyu = motion([(0., NEUTRAL), (.18, _GINYU), (.86, _GINYU), (1., NEUTRAL)],
               view={'azimuth': 8, 'elevation': 12}, extra=breathe, strike=0.22, end=0.86)

CELEBRATION_MOTIONS = {
    'power-up': power_up,
    'knee-power': knee_power,
    'levitate': levitate,
    'hand-seal': hand_seal,
    'gear-crouch': gear_crouch,
    'fist-up': fist_up,
    'hero-landing': hero_landing,
    'energy-blast': energy_blast,
    'ninja-run': ninja_run,
    'sky-punch': sky_punch,
    'menacing': menacing,
    'best-friend': best_friend,
    'heart-salute': heart_salute,
    'ginyu': ginyu,
}
# Names for the review page.
CELEBRATION_NAMES = {
    'power-up': 'Power-up', 'knee-power': 'Knee-up power stance', 'levitate': 'Levitate', 'hand-seal': 'Hand seal',
    'gear-crouch': 'Gear crouch', 'fist-up': 'One fist up', 'hero-landing': 'Hero landing',
    'energy-blast': 'Energy blast', 'ninja-run': 'Ninja run', 'sky-punch': 'Sky punch',
    'menacing': 'Menacing walk', 'best-friend': 'Best-friend flex', 'heart-salute': 'Heart salute', 'ginyu': 'Ginyu pose',
}
# Closed fists (hand state 3) for the whole clip; the seal's locked hands read as fists too.
CELEBRATION_FISTS = {'power-up', 'knee-power', 'hand-seal', 'gear-crouch', 'fist-up', 'hero-landing', 'sky-punch', 'best-friend', 'heart-salute'}
