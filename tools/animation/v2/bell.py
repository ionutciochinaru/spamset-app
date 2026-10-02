"""A one-hand bell swinging on its handle.

The bell is a point mass one handle-to-centre length from the grip. Each step it
is driven by gravity and the hand's acceleration, held lightly toward the
authored direction (grip torque), damped (the grip and the wrist absorb
energy), and stopped by the body: it may rest against the forearm, thighs,
torso or upper arm but never pass through them. The loop is simulated until it repeats, so the bell swings,
lags and settles the way a real one does instead of snapping between keys.

Hand paths are taken before the balance hip shift (they differ by a smooth
centimetre-scale offset), which keeps the solve order bell -> balance.
"""
from math import asin, cos, sin, sqrt

try:
    from ..rig import add, sub, mul, unit, dot, norm, cross
    from .body import G
    from .common import BELL, REST_GAP, place_bell
    from .collide import PARTS
except ImportError:
    from v2.collide import PARTS
    from rig import add, sub, mul, unit, dot, norm, cross
    from v2.body import G
    from v2.common import BELL, REST_GAP, place_bell

LENGTH = BELL['handle_to_center']
REST = asin(min(1., REST_GAP / LENGTH))     # closest the bell gets to the forearm line
SKIN = .004
OBSTACLES = ['head', 'torso', *[f'{part}_{s}' for s in 'lr' for part in ('upper_arm', 'thigh', 'shin')]]


def obstacles(pose, s):
    """Body capsules the bell held in hand `s` can hit (its own forearm is the cone stop)."""
    out = []
    for name in OBSTACLES:
        a, b, r = PARTS[name]
        out.append((pose.j[a], pose.j[b], r + BELL['radius'] + SKIN))
    return out


def _closest(point, a, b):
    d = sub(b, a)
    dd = dot(d, d)
    t = 0. if dd < 1e-12 else max(0., min(1., dot(sub(point, a), d) / dd))
    return add(a, mul(d, t))


CUSHION = .05      # skin and clothing: contact force builds over this band
CUSHION_ACC = 80.   # m/s^2 at full compression
CUSHION_DAMP = 30.  # 1/s on the approach speed inside the band


def _cushion(hand, u, v, capsules, band=CUSHION):
    """Acceleration (on the bell centre) from soft contact with nearby body parts."""
    total = (0., 0., 0.)
    centre = add(hand, mul(u, LENGTH))
    velocity = mul(v, LENGTH)
    for a, b, reach in capsules:
        off = sub(centre, _closest(centre, a, b))
        d = norm(off)
        depth = reach + band - d
        if depth <= 0 or d < 1e-9:
            continue
        normal = mul(off, 1 / d)
        k = min(1., depth / band)
        push = CUSHION_ACC * k * k
        approach = dot(velocity, normal)
        if approach < 0:
            push -= CUSHION_DAMP * k * approach
        total = add(total, mul(normal, push))
    return total


def _push(hand, u, v, capsules):
    """Move the bell out of any capsule it entered; drop velocity into it."""
    for _ in range(3):
        moved = False
        for a, b, reach in capsules:
            centre = add(hand, mul(u, LENGTH))
            q = _closest(centre, a, b)
            off = sub(centre, q)
            d = norm(off)
            if d >= reach or d < 1e-9:
                continue
            normal = mul(off, 1 / d)
            u = unit(sub(add(q, mul(normal, reach)), hand))
            tangent = sub(normal, mul(u, dot(normal, u)))
            if norm(tangent) > 1e-9:
                tangent = unit(tangent)
                into = dot(v, tangent)
                if into < 0:
                    v = sub(v, mul(tangent, into))
            moved = True
        if not moved:
            break
    return u, sub(v, mul(u, dot(v, u)))


def single_grip(pose):
    """(prop index, side) of the bell held in one hand, or None."""
    for i, prop in enumerate(pose.props):
        if prop.get('type') == 'kettlebell' and 'horns' not in prop and len(prop.get('grips', {})) == 1:
            return i, next(iter(prop['grips']))
    return None


def _lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _stop(u, v, arm, fallback):
    """Keep u at least REST from the line back down the forearm; drop velocity into it."""
    axis = mul(arm, -1.)
    c = dot(u, axis)
    if c <= cos(REST):
        return u, v
    perp = sub(u, mul(axis, c))
    if norm(perp) < 1e-9:
        perp = sub(fallback, mul(axis, dot(fallback, axis)))
    perp = unit(perp)
    u = add(mul(axis, cos(REST)), mul(perp, sin(REST)))
    away = add(mul(axis, -sin(REST)), mul(perp, cos(REST)))
    toward = dot(v, away)
    if toward < 0:
        v = sub(v, mul(away, toward))
    v = sub(v, mul(u, dot(v, u)))
    return u, v


def simulate(hands, arms, targets, duration, stiffness=25., damping=.6, grips=None, bodies=None, loops=5, substeps=8,
             cushion=CUSHION):
    """Periodic bell directions at the sample times.

    hands, arms, targets: per-sample wrist position, unit forearm direction (elbow ->
    wrist) and the authored bell direction, evenly spaced over one loop; grips (0..1)
    scales the grip stiffness per sample; bodies gives per-sample obstacle capsules
    (a, b, reach of the bell centre).
    """
    n = len(hands)
    grips = grips or [1.] * n
    dt = duration / n
    h = dt / substeps
    acc = [mul(add(sub(hands[(i + 1) % n], mul(hands[i], 2.)), hands[i - 1]), 1 / dt ** 2) for i in range(n)]
    u, v = unit(targets[0]), (0., 0., 0.)
    out = [u] * n
    for loop in range(loops):
        for i in range(n):
            if loop == loops - 1:
                out[i] = u
            j = (i + 1) % n
            for k in range(substeps):
                t = k / substeps
                a = _lerp(acc[i], acc[j], t)
                arm = unit(_lerp(arms[i], arms[j], t))
                target = unit(_lerp(targets[i], targets[j], t))
                k_grip = stiffness * (grips[i] + (grips[j] - grips[i]) * t)
                c = 2 * damping * sqrt(G / LENGTH + k_grip)
                force = add(add(mul(sub((0., 0., -G), a), 1 / LENGTH), mul(target, k_grip)), mul(v, -c))
                if bodies:
                    hand = _lerp(hands[i], hands[j], t)
                    capsules = [(_lerp(a0, a1, t), _lerp(b0, b1, t), r) for (a0, b0, r), (a1, b1, _) in zip(bodies[i], bodies[j])]
                    force = add(force, mul(_cushion(hand, u, v, capsules, cushion), 1 / LENGTH))
                force = sub(force, mul(u, dot(force, u)))
                v = add(v, mul(force, h))
                u = unit(add(u, mul(v, h)))
                v = sub(v, mul(u, dot(v, u)))
                u, v = _stop(u, v, arm, target)
                if bodies:
                    u, v = _push(hand, u, v, capsules)
                    u, v = _stop(u, v, arm, target)
    return _compliant(out, duration)


COMPLIANCE = .06     # s: the hand and wrist soak up contact jolts (periodic Gaussian smoothing)


def _compliant(table, duration):
    n = len(table)
    sigma = COMPLIANCE / 2 / (duration / n)
    if sigma < .5:
        return table
    reach = int(3 * sigma) + 1
    from math import exp
    weights = [exp(-.5 * (k / sigma) ** 2) for k in range(-reach, reach + 1)]
    out = []
    for i in range(n):
        acc = (0., 0., 0.)
        for k, w in zip(range(-reach, reach + 1), weights):
            acc = add(acc, mul(table[(i + k) % n], w))
        out.append(unit(acc))
    return out


def sample(table, phase):
    """Periodic Catmull-Rom between table directions."""
    n = len(table)
    x = (phase % 1.) * n
    i, t = int(x) % n, x - int(x)
    p0, p1, p2, p3 = table[i - 1], table[i], table[(i + 1) % n], table[(i + 2) % n]
    return unit(tuple(.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
                      for a, b, c, d in zip(p0, p1, p2, p3)))


def handle_axes(table, lefts, settle=.02):
    """Handle direction for each bell direction in `table`. The handle turns as little as
    possible from sample to sample (parallel transport, like a real handle with inertia) and
    is gently drawn back to lie side to side across the body (the hand holds it overhand),
    `settle` per sample. Two passes make the loop steady; the small twist left where the
    loop closes is spread evenly over it."""
    from math import atan2
    n = len(table)

    def across(i):
        u, left = table[i], lefts[i]
        return sub(left, mul(u, dot(left, u)))

    sign = [1.]

    def step(a, i):
        u = table[i]
        a = unit(sub(a, mul(u, dot(a, u))))
        pull = across(i)
        # A handle has no front or back: keep pulling toward the same end over time (never
        # flip-flopping when the handle sits crosswise, which would stall the settling).
        if dot(pull, a) * sign[0] < -.5 * norm(pull):
            sign[0] = -sign[0]
        return unit(add(a, mul(pull, settle * sign[0])))

    a = unit(across(0))
    for i in range(n):
        a = step(a, i)
    axes = []
    for i in range(n):
        a = step(a, i)
        axes.append(a)
    u0 = table[0]
    end = unit(sub(axes[-1], mul(u0, dot(axes[-1], u0))))
    if dot(end, axes[0]) < 0:
        end = mul(end, -1.)              # either end of the handle closes the loop
    twist = atan2(dot(cross(axes[0], end), u0), dot(axes[0], end))
    out = []
    for i, (u, a) in enumerate(zip(table, axes)):
        angle = -twist * (i + 1) / n
        out.append(unit(add(add(mul(a, cos(angle)), mul(cross(u, a), sin(angle))), mul(u, dot(u, a) * (1 - cos(angle))))))
    return out


def swing(pose, direction, across=None):
    """Re-hang the one-hand bell of `pose` along `direction` (handle along `across`)."""
    found = single_grip(pose)
    if found is None:
        return pose
    index, s = found
    pose.props[index] = place_bell(pose, s, direction, across)
    return pose
