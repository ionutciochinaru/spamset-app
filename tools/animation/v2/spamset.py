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

try:
    from .bodyweight import Wrapped, weight_shift_holds
except ImportError:
    from v2.bodyweight import Wrapped, weight_shift_holds

CATALOG = json.loads((Path(__file__).resolve().parents[1] / 'spamset-catalog.json').read_text())
PROFILES = json.loads((Path(__file__).resolve().parents[1] / 'profiles.json').read_text())
# Alternating moves whose second half mirrors the first (validate.BILATERAL plus Spamset's).
BILATERAL = {'standing-knee', 'reverse-lunge', 'bird-dog', 'seated-knee', 'side-step', 'fly-steps',
             'side-leg-raises', 'alt-arm-leg-plank', 'shoulder-taps', 'spiderman-pushup',
             'raised-leg-pushup', 'bicycle-crunches', 'climbers', 'punches', 'side-to-side-chops',
             'side-neck', 'side-bend', 'oblique-twist', 'reclined-twist'}
STATIC_SECONDS = 2.


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
        legacy = motions[name]
        profile = PROFILES.get(name, {})
        duration = profile['frames'] / profile['fps'] if profile.get('fps') else STATIC_SECONDS
        standing = _standing(legacy, name)
        # Mirroring averages the two halves; only valid if the legacy loop really alternates.
        wrapped[name] = Wrapped(
            name, legacy, duration,
            balance='xy' if standing else '',
            mirror=standing and name in BILATERAL,
            holds=weight_shift_holds(legacy, name) if standing else (),
            iterations=3 if standing else 1,
            hang=name in HANGING,
            grip=name in HAND_SUPPORTED)
    return wrapped
