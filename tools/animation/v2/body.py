"""Segment masses, whole-body centre of mass, support polygon and ZMP.

Mass fractions and segment COM locations follow de Leva (1996), adjusted
Zatsiorsky-Seluyanov parameters for adult males, applied to a 75 kg body.
The trunk is lumped pelvis->chest; head+neck sits at the head joint.
"""
from math import sqrt

BODY_MASS = 75.0
G = 9.81

# (proximal joint, distal joint, mass fraction, COM fraction from proximal)
SEGMENTS = [
    ('pelvis', 'chest', .4346, .55),
    ('neck', 'head', .0694, 1.0),
    *[(f'{a}_{s}', f'{b}_{s}', m, c) for s in 'lr' for a, b, m, c in [
        ('shoulder', 'elbow', .0271, .5772),
        ('elbow', 'wrist', .0162, .4574),
        ('wrist', 'palm', .0061, .79),
        ('hip', 'knee', .1416, .4095),
        ('knee', 'ankle', .0433, .4459),
        ('heel', 'toe', .0137, .44),
    ]],
]


def centre_of_mass(pose):
    """Whole-body + load COM (m) and total mass (kg) for a pose_for() result."""
    j = pose['joints']
    total = 0.
    acc = [0., 0., 0.]
    for a, b, fraction, c in SEGMENTS:
        mass = fraction * BODY_MASS
        point = [pa + (pb - pa) * c for pa, pb in zip(j[a], j[b])]
        for k in range(3):
            acc[k] += mass * point[k]
        total += mass
    for prop in pose['props']:
        mass = prop.get('mass', 0.)
        if mass and 'center' in prop:
            for k in range(3):
                acc[k] += mass * prop['center'][k]
            total += mass
    return tuple(v / total for v in acc), total


def support_points(pose, floor=.03):
    """Ground-plane support points: sole outlines of planted feet plus floor contacts."""
    j = pose['joints']
    points = []
    for s in 'lr':
        heel, toe = j[f'heel_{s}'], j[f'toe_{s}']
        if heel[2] < floor and toe[2] < floor:
            dx, dy = toe[0] - heel[0], toe[1] - heel[1]
            n = sqrt(dx * dx + dy * dy) or 1.
            ox, oy = -dy / n * .045, dx / n * .045
            points += [(heel[0] + ox, heel[1] + oy), (heel[0] - ox, heel[1] - oy),
                       (toe[0] + ox * 1.2, toe[1] + oy * 1.2), (toe[0] - ox * 1.2, toe[1] - oy * 1.2)]
        elif toe[2] < floor:
            points.append((toe[0], toe[1]))
    for name, p in pose.get('contacts', {}).items():
        if p[2] < floor and not name.startswith(('heel_', 'toe_')):
            points.append((p[0], p[1]))
    # Any drawn body part resting on the floor also supports (lying, rolling, sitting):
    # sample each capsule and keep points whose surface is within 2 cm of the floor.
    try:
        from .collide import PARTS
    except ImportError:
        from v2.collide import PARTS
    for part, (a, b, radius) in PARTS.items():
        if part.startswith(('hand_', 'forearm_')) or a not in j or b not in j:
            continue
        pa, pb = j[a], j[b]
        for k in range(6):
            q = [x + (y - x) * k / 5 for x, y in zip(pa, pb)]
            if q[2] - radius < .02:
                points.append((q[0], q[1]))
    return points


def convex_hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) > 1 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) > 1 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def margin(point, hull):
    """Signed distance (m) from a ground point to the hull edge; positive = inside."""
    if len(hull) < 3:
        return -1.
    best = 1e9
    inside = True
    for a, b in zip(hull, hull[1:] + hull[:1]):
        ex, ey = b[0] - a[0], b[1] - a[1]
        length = sqrt(ex * ex + ey * ey) or 1e-9
        side = (ex * (point[1] - a[1]) - ey * (point[0] - a[0])) / length
        if side < 0:
            inside = False
        t = max(0., min(1., ((point[0] - a[0]) * ex + (point[1] - a[1]) * ey) / (length * length)))
        cx, cy = a[0] + ex * t, a[1] + ey * t
        best = min(best, sqrt((point[0] - cx) ** 2 + (point[1] - cy) ** 2))
    return best if inside else -best


def balance_report(poses, duration):
    """Per-sample static COM margin and dynamic ZMP margin over a looping clip."""
    n = len(poses)
    dt = duration / n
    coms = [centre_of_mass(p)[0] for p in poses]
    rows = []
    for i, pose in enumerate(poses):
        hull = convex_hull(support_points(pose))
        c0, c1, c2 = coms[i - 1], coms[i], coms[(i + 1) % n]
        acc = [(c2[k] - 2 * c1[k] + c0[k]) / (dt * dt) for k in range(3)]
        scale = c1[2] / max(1e-6, G + acc[2])
        zmp = (c1[0] - scale * acc[0], c1[1] - scale * acc[1])
        rows.append({'com_margin': margin((c1[0], c1[1]), hull), 'zmp_margin': margin(zmp, hull)})
    return rows
