"""Done-state celebrations: anime victory poses for the app's figure.

Not exercises: shown after a spam set and on Today once you are caught up. Each is
keyframed on the same rig (feet, pelvis, trunk, head, wrists): it plays once from a
neutral stand into the pose, then breathes in the pose in a seamless loop. No watch
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


# After the move, the pose breathes: two breaths in this loop (s), chest and hips rising.
IDLE = 4.0
BREATHS = 2


def idle(k, u, depth):
    """Breathing on the finished pose at loop position u (0..1); 0 at both ends, so it loops."""
    b = (1-cos(2*pi*BREATHS*u))/2
    k['pelvis'] = add(k['pelvis'], (0, 0, depth*b))
    k['lean'] -= radians(1.5)*b
    pitch, roll, yaw = k['head']
    k['head'] = (pitch-radians(2)*b, roll, yaw)


def motion(keys, view=None, extra=None, strike=0., end=1., depth=.008):
    """A celebration: into the pose (struck at `strike`) and through its hold once, up to `end`
    of the authored timeline, then the breathing loop on that pose. Keys after `end` (back to
    standing) are for authoring only."""
    intro = DURATION*end

    def run(name, phase):
        t = min(1., phase)*(intro+IDLE)
        if t < intro:
            at = t/DURATION
            k = sample(keys, at)
            if extra:
                extra(k, at)
        else:
            k = sample(keys, end)
            idle(k, (t-intro)/IDLE, depth)
        p = build(name, phase, k)
        if view:
            p.view = dict(view)
        return p
    run.duration = intro+IDLE
    # Where in the clip (0..1) the pose lands (the app bursts the aura there) and where the
    # breathing loop starts.
    run.strike = strike*DURATION/run.duration
    run.loop_from = intro/run.duration
    return run


# 1. Gear crouch: deep wide squat, one hand on the knee, the other fist on the ground, eyes up.
_GEAR = pose(pelvis=(-.10, 0, .36), lean=radians(58), head=(radians(-50), 0, 0),
             toe_both=(.22, .36, 0.), knee_both=(1., .9, 0.),
             onknee_l=1., wrist_l=(.1, .1, -.5), pole_l=(-.2, .6, .2),
             floor_r=1., floor_pt_r=(.36, -.12, .09), pole_r=(-.2, -.6, .3))
gear_crouch = motion([(0., NEUTRAL), (.22, _GEAR), (.84, _GEAR), (1., NEUTRAL)],
                     view={'azimuth': 4, 'elevation': 4}, strike=0.26, end=0.32, depth=.012)

# 2. Heart salute: heels together, a fist struck to the heart, the other arm behind the back.
def _strike(k, phase):
    hit = stage(phase, .16, .22) - stage(phase, .22, .26)
    x, y, z = k['wrist_r']
    k['wrist_r'] = (x+.04*hit, y, z)


_HEART = pose(toe_both=(.16, .10, 0.), head=(radians(-10), 0, 0),
              wrist_r=(.13, .25, -.07), pole_r=(0., -.5, -.6),
              wrist_l=(-.20, -.12, -.42), pole_l=(-.2, .5, -.2))
heart_salute = motion([(0., NEUTRAL), (.18, _HEART), (.86, _HEART), (1., NEUTRAL)],
                      view={'azimuth': 0, 'elevation': 2}, extra=_strike, strike=0.22, end=0.30)

# 3. Power scream: a crouched, trembling charge, then the explosion into the scream: feet
# planted, elbows bent out, fists clenched at shoulder height, chin up. Seen from low in front.
def _charge(k, phase):
    w = stage(phase, .02, .08)*(1-stage(phase, .17, .20))
    k['pelvis'] = add(k['pelvis'], (.004*w*sin(phase*900), .006*w*sin(phase*760), 0))


_GATHER = pose(pelvis=(0, 0, .86), toe_both=(.16, .24, 0.), knee_both=(1., .3, 0.), lean=radians(12),
               head=(radians(22), 0, 0), wrist_both=(.12, .05, -.40), pole_both=(-.3, .3, -.2))
_SCREAM = pose(pelvis=(0, 0, .92), toe_both=(.16, .24, 0.), knee_both=(1., .3, 0.), lean=radians(-4),
               head=(radians(-18), 0, 0), wrist_both=(.10, .27, -.13), pole_both=(-.1, .7, -.8))
power_scream = motion([(0., NEUTRAL), (.12, _GATHER), (.17, _GATHER), (.21, _SCREAM), (.86, _SCREAM), (1., NEUTRAL)],
                      view={'azimuth': 8, 'elevation': -10}, extra=_charge, strike=0.21, end=0.26, depth=.012)

CELEBRATION_MOTIONS = {
    'gear-crouch': gear_crouch,
    'heart-salute': heart_salute,
    'power-scream': power_scream,
}
# Names for the review page.
CELEBRATION_NAMES = {'gear-crouch': 'Gear crouch', 'heart-salute': 'Heart salute', 'power-scream': 'Power scream'}
# Closed fists (hand state 3) for the whole clip.
CELEBRATION_FISTS = {'gear-crouch', 'heart-salute', 'power-scream'}
