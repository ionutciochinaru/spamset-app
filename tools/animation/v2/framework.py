"""Keyed lifts with load-aware balance.

A Lift is authored as key states (phase -> parameters). Between keys the state
follows a periodic monotone cubic: velocity is continuous through pass-through
keys (no robotic stop at every key) and zero only at 'hold' keys and turning
points; it never overshoots a key. smooth='minjerk' stops at every key instead. A build function turns a state into a pose,
applying a hip shift (dx, dy) to the pelvis only; feet and floor contacts stay
put, and everything carried by the trunk moves with it.

Balance: over the whole loop we solve the smooth, periodic hip shift that keeps
the zero-moment point (ZMP) of body + bell at the centre of the current support
area (cart-table model). With a 16 kg bell this produces the counter-lean and
hip shift a lifter makes to carry the load, and it anticipates support changes
(e.g. shifting over the front foot before the rear foot leaves the floor).
"""
from functools import cached_property

try:
    from ..rig import sub, unit
except ImportError:
    from rig import sub, unit

try:
    from .body import centre_of_mass, support_points, convex_hull, margin, G
    from .swing import solve_cyclic
    from . import bell as bell_sim
    from .common import look_ahead
except ImportError:
    from v2.common import look_ahead
    from v2.body import centre_of_mass, support_points, convex_hull, margin, G
    from v2.swing import solve_cyclic
    from v2 import bell as bell_sim

SAMPLES_PER_SECOND = 240


def minjerk(u):
    u = min(1., max(0., u))
    return u * u * u * (10 - 15 * u + 6 * u * u)


def _lerp(a, b, t):
    if isinstance(a, (tuple, list)):
        return tuple(x + (y - x) * t for x, y in zip(a, b))
    return a + (b - a) * t


def _hermite_scalar(keys, phase, param, monotone=True):
    """Periodic non-uniform cubic through the keys; 'hold' keys have zero slope."""
    n = len(keys)
    times = [k[0] for k in keys]

    def value(i):
        return keys[i % n][1][param]

    def time(i):
        return times[i % n] + (i // n)

    def slope(i):
        """Catmull-Rom slope, limited so the curve never overshoots a key (monotone
        cubic): zero at holds and at turning points, capped at 3x the neighbouring secants."""
        if keys[i % n][2]:
            return 0.
        before = (value(i) - value(i - 1)) / (time(i) - time(i - 1))
        after = (value(i + 1) - value(i)) / (time(i + 1) - time(i))
        if not monotone:
            return (value(i + 1) - value(i - 1)) / (time(i + 1) - time(i - 1))
        if before * after <= 0:
            return 0.
        m = (value(i + 1) - value(i - 1)) / (time(i + 1) - time(i - 1))
        cap = 3 * min(abs(before), abs(after))
        return max(-cap, min(cap, m))

    i = max((k for k in range(n) if times[k] <= phase), default=-1)
    t0, t1 = (time(i), time(i + 1)) if i >= 0 else (times[-1] - 1, times[0])
    h = t1 - t0
    u = (phase - t0) / h
    if keys[i % n][2] and keys[(i + 1) % n][2]:
        # Hold to hold: minimum jerk, so the move eases out of the hold without a jolt.
        return value(i) + (value(i + 1) - value(i)) * minjerk(u)
    h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
    return h00 * value(i) + h10 * h * slope(i) + h01 * value(i + 1) + h11 * h * slope(i + 1)


SAFE_MARGIN = .06


def _safe_target(pose, com):
    """Where the balance point should be: the COM itself if it is at least SAFE_MARGIN
    inside the support, otherwise the nearest point toward the support centre that is."""
    hull = convex_hull(support_points(pose))
    centre = _support_centre(pose)
    if not hull or centre is None:
        return com
    point = (com[0], com[1])
    if margin(point, hull) >= SAFE_MARGIN:
        return point
    lo, hi = 0., 1.
    if margin(centre, hull) < SAFE_MARGIN:
        return centre
    for _ in range(30):
        mid = (lo + hi) / 2
        q = (point[0] + (centre[0] - point[0]) * mid, point[1] + (centre[1] - point[1]) * mid)
        lo, hi = (lo, mid) if margin(q, hull) >= SAFE_MARGIN else (mid, hi)
    return (point[0] + (centre[0] - point[0]) * hi, point[1] + (centre[1] - point[1]) * hi)


def _support_centre(pose):
    hull = convex_hull(support_points(pose))
    if not hull:
        return None
    area = cx = cy = 0.
    for (x0, y0), (x1, y1) in zip(hull, hull[1:] + hull[:1]):
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(area) < 1e-9:
        return sum(p[0] for p in hull) / len(hull), sum(p[1] for p in hull) / len(hull)
    return cx / (3 * area), cy / (3 * area)


class Lift:
    def __init__(self, name, duration, keys, build, view, balance='xy', smooth='hermite', mirror=False, bell=None, look=True):
        """keys: [(phase, {param: value}, hold)] with phase ascending from 0; loops back to keys[0].

        bell: for a one-hand bell, {'stiffness', 'damping'} of its swing on the handle
        (v2/bell.py); the authored bell direction becomes the grip's target. An optional
        'grip' state parameter (0..1) scales the stiffness: firm when the lifter sets the
        bell (rack, lockout), loose while it is thrown."""
        self.name, self.duration, self.keys, self.build = name, duration, keys, build
        self.view, self.balance, self.smooth, self.mirror = view, balance, smooth, mirror
        self.bell, self.look = bell, look

    def state(self, phase):
        phase %= 1.
        keys = self.keys
        if self.smooth in ('hermite', 'catmull'):
            monotone = self.smooth == 'hermite'
            params = keys[0][1].keys()
            out = {}
            for p in params:
                if isinstance(keys[0][1][p], (tuple, list)):
                    dims = len(keys[0][1][p])
                    comps = []
                    for d in range(dims):
                        sub = [(t, {p: v[p][d]}, hold) for t, v, hold in keys]
                        comps.append(_hermite_scalar(sub, phase, p, monotone))
                    out[p] = tuple(comps)
                else:
                    out[p] = _hermite_scalar(keys, phase, p, monotone)
            return out
        i = max(k for k in range(len(keys)) if keys[k][0] <= phase)
        t0, a, _ = keys[i]
        t1, b, _ = keys[(i + 1) % len(keys)]
        if i == len(keys) - 1:
            t1 += 1.
        w = minjerk((phase - t0) / (t1 - t0))
        return {p: _lerp(a[p], b[p], w) for p in a}

    def authored(self, phase, dx=0., dy=0.):
        pose = self.build(self.name, phase, self.state(phase), dx, dy)
        if self.look:
            look_ahead(pose)
        pose.view = dict(self.view)
        return pose

    def raw(self, phase, dx=0., dy=0.):
        pose = self.authored(phase, dx, dy)
        if self.bell is not None:
            directions, axes = self.bell_table
            bell_sim.swing(pose, bell_sim.sample(directions, phase), bell_sim.sample(axes, phase))
        return pose

    @cached_property
    def bell_table(self):
        n = max(48, round(self.duration * SAMPLES_PER_SECOND))
        hands, arms, targets, grips, bodies, lefts = [], [], [], [], [], []
        for i in range(n):
            pose = self.authored(i / n)
            grips.append(max(0., min(1., self.state(i / n).get('grip', 1.))))
            index, s = bell_sim.single_grip(pose)
            bodies.append(bell_sim.obstacles(pose, s))
            w = pose.j['wrist_' + s]
            lefts.append(unit(sub(pose.j['shoulder_l'], pose.j['shoulder_r'])))
            hands.append(w)
            arms.append(unit(sub(w, pose.j['elbow_' + s])))
            targets.append(unit(sub(tuple(pose.props[index]['center']), w)))
        directions = bell_sim.simulate(hands, arms, targets, self.duration, grips=grips, bodies=bodies, **self.bell)
        # Handle: turns as little as possible, settling side to side across the body.
        return directions, bell_sim.handle_axes(directions, lefts)

    @cached_property
    def offsets(self):
        n = max(48, round(self.duration * SAMPLES_PER_SECOND))
        n += n % 2
        dt = self.duration / n
        result = [[0., 0.] for _ in range(n)]
        for axis_index, axis in enumerate('xy'):
            if axis not in self.balance:
                continue
            base, zs, gains, targets = [], [], [], []
            for i in range(n):
                phase = i / n
                shift = [0., 0.]
                pose0 = self.raw(phase).result()
                c0 = centre_of_mass(pose0)[0]
                shift[axis_index] = .01
                c1 = centre_of_mass(self.raw(phase, *shift).result())[0]
                base.append(c0[axis_index])
                zs.append(c0[2])
                gains.append((c1[axis_index] - c0[axis_index]) / .01)
                targets.append(_safe_target(pose0, c0)[axis_index])
            zdd = [(zs[(i + 1) % n] - 2 * zs[i] + zs[i - 1]) / dt ** 2 for i in range(n)]
            scale = [zs[i] / max(2., G + zdd[i]) for i in range(n)]
            bdd = [(base[(i + 1) % n] - 2 * base[i] + base[i - 1]) / dt ** 2 for i in range(n)]
            rhs = [targets[i] - base[i] + scale[i] * bdd[i] for i in range(n)]
            off = [-scale[i] * gains[i] / dt ** 2 for i in range(n)]
            diag = [gains[i] - 2 * off[i] for i in range(n)]
            solved = solve_cyclic(off, diag, off, rhs)
            for i in range(n):
                result[i][axis_index] = max(-.2, min(.2, solved[i]))
        if self.mirror:
            # Alternating lifts: the second half is the first half mirrored left-right.
            half = n // 2
            for i in range(half):
                a, b = result[i], result[i + half]
                x, y = (a[0] + b[0]) / 2, (a[1] - b[1]) / 2
                result[i], result[i + half] = [x, y], [x, -y]
        return result

    def pose(self, phase):
        phase %= 1.
        table = self.offsets
        n = len(table)
        x = phase * n
        i = int(x) % n
        u = x - int(x)
        # Periodic Catmull-Rom: smooth second derivative, so the ZMP check sees no kinks.
        p0, p1, p2, p3 = table[i - 1], table[i], table[(i + 1) % n], table[(i + 2) % n]
        dx, dy = (.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3)
                  for a, b, c, d in zip(p0, p1, p2, p3))
        return self.raw(phase, dx, dy)

    def __call__(self, name, phase):
        return self.pose(phase)
