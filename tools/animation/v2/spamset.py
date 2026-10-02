"""Every Spamset exercise as a v2 motion.

The kettlebell lifts already have hand-built v2 motions (lifts, single_arm, halo, swing).
Every other Spamset exercise wraps its legacy watch motion (bodyweight.Wrapped):
- standing moves (only the feet support the body) get the balance solver, automatic
  weight-shift pauses and arm clearance;
- floor, plank, kneeling, seated, wall and hanging moves keep their position (shifting a
  lying body sideways is meaningless) and get arm clearance only.
The catalog (ids, names, groups) is tools/animation/spamset-catalog.json, copied from the
Spamset app's exercise data.
"""
import json
from pathlib import Path

from math import sin, pi, radians

try:
    from .bodyweight import Wrapped, weight_shift_holds
    from ..rig import Pose, add, side_sign
    from ..bodyweight_standing import stance, guard, twist, stage, mix_point, FRONT_VIEW
except ImportError:
    from v2.bodyweight import Wrapped, weight_shift_holds
    from rig import Pose, add, side_sign
    from bodyweight_standing import stance, guard, twist, stage, mix_point, FRONT_VIEW


def punches(name, phase):
    """Legacy punches with each punch starting from that hand's own guard position.

    The legacy cross started 5 cm in front of the rear hand's guard, so the arm snapped
    between the guard pose and the punch when a punch began and ended."""
    jab = sin(pi * stage(phase, .05, .40))
    cross_ = sin(pi * stage(phase, .45, .85))
    p = stance(Pose(name, phase))
    twist(p, -radians(22) * cross_ + radians(6) * jab)
    guard(p)
    for s, amount, lead in (('l', jab, True), ('r', cross_, False)):
        sg = side_sign(s)
        start = add(p.j['chest'], (.20 if lead else .15, sg * .10, .16))
        fist = mix_point(start, add(p.j['shoulder_' + s], (.54, -sg * .14, .02)), amount)
        p.arm(s, fist, pole=add(p.j['shoulder_' + s], (-.1, sg * .4, -.5)))
    p.view = dict(FRONT_VIEW, azimuth=75, elevation=10)
    return p


def sit_stand(name, phase):
    """Legacy sit-to-stand with the arms clear of the chair.

    The legacy arms hung straight down while seated, so the hands sank into the seat (now
    visible in 3D). Seated, the arms rest forward over the knees; they reach forward as the
    trunk leans (counterbalance) and lower to the sides once standing. No arm support."""
    try:
        from ..motions import chair_prop
        from ..rig import clamp, pulse, smooth, ANKLE_HEIGHT, SIDES
    except ImportError:
        from motions import chair_prop
        from rig import clamp, pulse, smooth, ANKLE_HEIGHT, SIDES
    t = clamp((pulse(phase) - .06) / .94)
    rise = smooth((t - .30) / .70)
    forward = smooth(t / .30) * (1 - rise)
    p = Pose(name, phase).torso((-.27 + .41 * rise, 0, .55 + .395 * rise), lean=radians(38) * forward)
    reach = radians(60 + 30 * forward) * (1 - rise) + radians(5) * rise
    for s in SIDES:
        ankle = p.foot(s, ankle=(.14, side_sign(s) * .15, ANKLE_HEIGHT))
        p.leg(s, ankle)
        p.arm_fk(s, reach, elbow_flex=radians(12))
    p.props.append(chair_prop())
    if rise < 1e-8:
        p.contacts['seat'] = (-.27, 0, .515)
    p.view = {'azimuth': 67, 'elevation': 10}
    return p


# Seated starts balanced by leaning the trunk forward (lean_trunk). Sit-to-stand needs its arms
# swinging forward as it leans (the legacy arms hang into the thighs), so it is to be
# re-authored as a v2 Lift; empty until then.
LEAN = set()
# Body parts the hands rest on by design (pushed onto the surface, not cleared away).
REST = {'hamstring-stretch': ('thigh_l', 'thigh_r'), 'quad-stretch': ('thigh_l', 'thigh_r')}
# v2 replacements for legacy motions with a defect of their own.
REPLACEMENTS = {'punches': punches, 'sit-stand': sit_stand}
# Slower demonstration tempo where the legacy rhythm is physically too fast for a planted
# body (climbers: each foot strike decelerated the body faster than gravity).
TEMPO = {'climbers': 1.6, 'reverse-lunge': 1.4}

CATALOG = json.loads((Path(__file__).resolve().parents[1] / 'spamset-catalog.json').read_text())
PROFILES = json.loads((Path(__file__).resolve().parents[1] / 'profiles.json').read_text())
# Alternating moves whose second half mirrors the first (validate.BILATERAL plus Spamset's).
BILATERAL = {'standing-knee', 'reverse-lunge', 'bird-dog', 'seated-knee', 'side-step', 'fly-steps',
             'side-leg-raises', 'alt-arm-leg-plank', 'shoulder-taps', 'spiderman-pushup',
             'raised-leg-pushup', 'bicycle-crunches', 'climbers', 'punches', 'side-to-side-chops',
             'side-neck', 'side-bend', 'oblique-twist', 'reclined-twist'}
STATIC_SECONDS = 2.


# Planks where one hand leaves the floor: the body shifts over the supporting hand.
# Planks where one hand leaves the floor. Shifting the hips sideways over the supporting hand
# (shift_hips) needed 14-18 cm swings and still failed; these two are to be re-authored as
# v2 Lifts (wider stance, slower tempo). Empty: they keep the legacy motion for now.
PLANK_SHIFT = set()
# Suspended from a bar: the body hangs as a pendulum under the grip.
HANGING = {'chin-ups', 'pull-ups'}
# Held by the hands although only the feet are declared contacts (hands on the frame).
HAND_SUPPORTED = {'doorframe-rows'}


def _standing(legacy, name, samples=24):
    """The feet, and only the feet, support the body in every sample (hanging moves have no
    contacts at all; lying, kneeling, seated and plank moves have other contacts)."""
    if name in HAND_SUPPORTED:
        return False
    for i in range(samples):
        p = legacy(name, i / samples)
        if not any(k.startswith(('heel_', 'toe_')) for k in p.contacts):
            return False
        if any(not k.startswith(('heel_', 'toe_')) for k in p.contacts) or p.j['pelvis'][2] < .3:
            return False
    return True


def build(motions, skip):
    """{id: Wrapped} for every catalog exercise without its own v2 motion."""
    wrapped = {}
    for entry in CATALOG:
        name = entry['id']
        if name in skip or name not in motions:
            continue
        legacy = REPLACEMENTS.get(name, motions[name])
        profile = PROFILES.get(name, {})
        duration = profile['frames'] / profile['fps'] if profile.get('fps') else STATIC_SECONDS
        duration *= TEMPO.get(name, 1.)
        standing = _standing(legacy, name)
        shifting = standing or name in PLANK_SHIFT
        # Mirroring averages the two halves; only valid if the legacy loop really alternates.
        wrapped[name] = Wrapped(
            name, legacy, duration,
            # Planks shift the hips sideways only: along the body, moving the hips just
            # raises or lowers them (a pike), it barely moves the centre of mass.
            balance='x' if name in LEAN else 'y' if name in PLANK_SHIFT else 'xy' if shifting else '',
            mirror=shifting and name in BILATERAL,
            lean=name in LEAN,
            holds=weight_shift_holds(legacy, name) if standing
            else weight_shift_holds(legacy, name, hands=True) if name in PLANK_SHIFT else (),
            iterations=3 if shifting or name in LEAN else 1,
            hang=name in HANGING,
            grip=name in HAND_SUPPORTED,
            hips=name in PLANK_SHIFT,
            rest=REST.get(name, ()))
    return wrapped
