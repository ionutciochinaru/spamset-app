"""v2 halo: the tuned arm and horn path of the original halo, now carrying a 16 kg bell.

The bell circles the head, so the body counters it: the Lift balance solver shifts the
whole upper body (pelvis up) over the planted feet, opposite the bell, and the legs are
re-solved to reach the moved hips (knees soft rather than locked).
"""
try:
    from ..rig import SIDES, side_sign, add, ANKLE_HEIGHT
    from ..kettlebell import kb_halo as _legacy
    from .common import BELL
    from .framework import Lift
except ImportError:
    from rig import SIDES, side_sign, add, ANKLE_HEIGHT
    from kettlebell import kb_halo as _legacy
    from v2.common import BELL
    from v2.framework import Lift

LEGS = ('hip', 'knee', 'ankle', 'heel', 'toe')
SOFT = .006          # hips this much lower than the locked legacy stance: soft knees


def _build(name, phase, st, dx, dy):
    p = _legacy(name, phase)
    shift = (dx, dy, -SOFT)
    for k, v in list(p.j.items()):
        if not k.startswith(tuple(l + '_' for l in LEGS)):
            p.j[k] = add(v, shift)
    for s in SIDES:
        p.j['hip_' + s] = add(p.j['hip_' + s], shift)
        p.leg(s, p.j['ankle_' + s], pole=add(p.j['hip_' + s], (1., side_sign(s) * .1, 0.)))
    for prop in p.props:
        prop['mass'] = BELL['mass']
        prop['center'] = list(add(prop['center'], shift))
        prop['handle'] = [list(add(h, shift)) for h in prop['handle']]
        prop['horns'] = [[list(add(a, shift)), list(add(b, shift))] for a, b in prop['horns']]
        prop['grips'] = {s: list(add(g, shift)) for s, g in prop['grips'].items()}
    return p


class Halo(Lift):
    def state(self, phase):
        return {}

    def authored(self, phase, dx=0., dy=0.):
        pose = self.build(self.name, phase, {}, dx, dy)
        view = dict(pose.view)
        pose.view = view
        return pose


# 8 s loop: one circle each way (the legacy path alternates direction at phase 0.5).
HALO = Halo('kb-halo', 9., [(0., {}, True)], _build, None, balance='xy', mirror=True, look=False)
