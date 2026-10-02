"""Physics-driven two-hand kettlebell swing.

The arms and bell form a physical pendulum hanging from the shoulders. The
body moves the pivot: a hip hinge/snap controller that behaves like a lifter
(stay tall while the bell floats, hinge as the arms reach the body, snap the
hips at the end of the backswing). Gravity and the pivot's acceleration do the
rest, so the float, the acceleration through the bottom and the cycle time come
out of the simulation. The bell also swings on its handle, driven by the grip's
acceleration, and the elbows soften when arm tension drops at the float.

Every step the hips shift so the combined body + bell centre of mass stays over
mid-foot. The snap strength is tuned so the bell floats to about chest height.
The steady-state cycle (backswing to backswing) becomes the loop.
"""
from functools import lru_cache
from math import sin, cos, pi, sqrt, radians, degrees

try:
    from ..rig import (Pose, SIDES, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM,
                       side_sign, add, sub, mul, unit, clamp, smooth)
    from .body import centre_of_mass, BODY_MASS, G
    from .common import tall, look_ahead
except ImportError:
    from rig import (Pose, SIDES, ANKLE_HEIGHT, SHOULDER_HALF, UPPER_ARM, FOREARM,
                     side_sign, add, sub, mul, unit, clamp, smooth)
    from v2.body import centre_of_mass, BODY_MASS, G
    from v2.common import tall, look_ahead

# A 16 kg cast-iron bell (dimensions from common manufacturer specs).
BELL = {'mass': 16., 'radius': .105, 'handle_to_center': .165, 'handle_half': .095}
GRIP_HALF = .045              # hands side by side on the handle
STANCE = .25                  # ankle distance from the midline
TOE_OUT = radians(14)
MAX_REACH = UPPER_ARM + FOREARM - .0012     # elbow ~173 deg: a locked-out arm
MID_FOOT_X = .04              # heel -0.075 .. toe +0.16 around the ankle
ARM_MASS = 2 * (.0271 + .0162 + .0061) * BODY_MASS

THETA_FLOAT = radians(78)     # target float: arms a little below horizontal
HINGE_TRIGGER = radians(30)   # arms reach the body: lats connect, hips go back
HINGE_OMEGA = 9.
SNAP_OMEGA = 14.  # unused by the min-jerk hip planner; kept for the simulate() signature
HINGE_TIME = .36
SNAP_TIME = .46
CATCH_TIME = .1
LAT_STIFFNESS = 60.
LAT_DAMPING = 8.
BACK_STOP = radians(-52)      # forearms meet the inner thighs: the hike ends here
DT = 1 / 1000
TALL = tall(STANCE, .14)           # standing and at the float: knees ~166 degrees


def pelvis_for(h, dx):
    """Hinge h in [0, 1]: hips well back and only slightly down, trunk forward (a hinge, not a squat)."""
    return (-.32 * h + dx, 0., TALL - (TALL - .88) * h), radians(68) * h


def foot(p, s):
    """Planted foot turned out by TOE_OUT; heel and toe both on the floor."""
    sg = side_sign(s)
    ankle = (0., sg * STANCE, ANKLE_HEIGHT)
    yaw = sg * TOE_OUT
    heel = add(ankle, (-.075 * cos(yaw), -.075 * sin(yaw), -ANKLE_HEIGHT))
    toe = add(ankle, (.16 * cos(yaw), .16 * sin(yaw), -ANKLE_HEIGHT))
    p.j['ankle_' + s], p.j['heel_' + s], p.j['toe_' + s] = ankle, heel, toe
    p.contacts['heel_' + s], p.contacts['toe_' + s] = heel, toe
    return ankle, (cos(yaw), sin(yaw), 0.)


def build(name, phase, h, theta, phi, soft, pack, dx):
    """Pose from the simulation state. Deterministic; used by the sim and by export."""
    pelvis, lean = pelvis_for(h, dx)
    p = Pose(name, phase).torso(pelvis, lean)
    # Shoulder packing: clavicles rotate down under load (length stays exact).
    for s in SIDES:
        sg = side_sign(s)
        p.j['shoulder_' + s] = add(p.j['chest'], (0., sg * SHOULDER_HALF * cos(pack), -SHOULDER_HALF * sin(pack)))
    for s in SIDES:
        ankle, toe_dir = foot(p, s)
        # Knees track over the turned-out toes.
        p.leg(s, ankle, pole=add(p.j['hip_' + s], add(mul(toe_dir, 1.), (0, side_sign(s) * .25, 0))))
    # Dynamics pivot at the chest; shoulder packing only changes the drawn pose.
    pivot = p.j['chest']
    lateral = abs(p.j['shoulder_l'][1] - GRIP_HALF)
    drop = pivot[2] - p.j['shoulder_l'][2]
    reach = MAX_REACH - soft
    rod = (sin(theta), 0., -cos(theta))
    # |rod*L + (0, lateral, drop)| = reach, solved for the grip distance L.
    b = drop * rod[2]
    length = -b + sqrt(max(1e-9, b * b - (lateral * lateral + drop * drop - reach * reach)))
    grip = add(pivot, mul(rod, length))
    grips = {s: add(grip, (0., side_sign(s) * GRIP_HALF, 0.)) for s in SIDES}
    for s in SIDES:
        sg = side_sign(s)
        # Elbow creases face forward: pole behind and outside the arm.
        p.arm(s, grips[s], pole=add(p.j['shoulder_' + s], add(mul(rod, .1), (-.35 * cos(theta), sg * .25, -.35 * sin(theta)))),
              palm=grips[s])
    bell_dir = (sin(phi), 0., -cos(phi))
    handle = [add(grip, (0., BELL['handle_half'], 0.)), add(grip, (0., -BELL['handle_half'], 0.))]
    p.props.append({'type': 'kettlebell', 'center': list(add(grip, mul(bell_dir, BELL['handle_to_center']))),
                    'handle': [list(x) for x in handle], 'radius': BELL['radius'], 'mass': BELL['mass'],
                    'grips': {s: list(grips[s]) for s in SIDES}})
    look_ahead(p)
    p.view = {'azimuth': 62, 'elevation': 10}
    return p, pivot, grip, length


def balanced(h, theta, phi, soft, pack):
    """Shift the hips so the combined COM sits over mid-foot (secant on dx)."""
    dx0, dx1 = 0., -.05
    f0 = centre_of_mass(build('s', 0, h, theta, phi, soft, pack, dx0)[0].result())[0][0] - MID_FOOT_X
    for _ in range(4):
        f1 = centre_of_mass(build('s', 0, h, theta, phi, soft, pack, dx1)[0].result())[0][0] - MID_FOOT_X
        if abs(f1 - f0) < 1e-12:
            break
        dx0, dx1, f0 = dx1, dx1 - f1 * (dx1 - dx0) / (f1 - f0), f1
        if abs(f1) < 2e-4:
            break
    return dx1


def solve_cyclic(a, b, c, d):
    """Solve a periodic tridiagonal system: a[i] x[i-1] + b[i] x[i] + c[i] x[i+1] = d[i] (indices wrap).

    Thomas algorithm with the Sherman-Morrison correction for the corner terms.
    """
    n = len(d)
    gamma = -b[0]
    bb = list(b)
    bb[0] -= gamma
    bb[-1] -= c[-1] * a[0] / gamma

    def thomas(rhs):
        cp, dp = [0.] * n, [0.] * n
        cp[0], dp[0] = c[0] / bb[0], rhs[0] / bb[0]
        for i in range(1, n):
            denom = bb[i] - a[i] * cp[i - 1]
            cp[i] = c[i] / denom if i < n - 1 else 0.
            dp[i] = (rhs[i] - a[i] * dp[i - 1]) / denom
        x = [0.] * n
        x[-1] = dp[-1]
        for i in range(n - 2, -1, -1):
            x[i] = dp[i] - cp[i] * x[i + 1]
        return x

    y = thomas(d)
    u = [0.] * n
    u[0], u[-1] = gamma, c[-1]
    z = thomas(u)
    fact = (y[0] + a[0] * y[-1] / gamma) / (1 + z[0] + a[0] * z[-1] / gamma)
    return [yi - fact * zi for yi, zi in zip(y, z)]


def quintic(h0, v0, a0, h1, t0, span):
    """Hip plan from the current position, velocity and acceleration to rest at h1 (C2)."""
    d, v, a = h1 - h0, v0 * span, a0 * span * span
    return (h0, v, a / 2, 10 * d - 6 * v - 1.5 * a, -15 * d + 8 * v + 1.5 * a, 6 * d - 3 * v - .5 * a), t0, span


def simulate(snap_omega, seconds=10., record=False, adapt=True):
    """Integrate the swing. Returns (float peak angles per cycle, samples).

    Like a lifter, the hinge depth for the next rep is corrected after each
    float until the bell settles at THETA_FLOAT.
    """
    depth = .8
    theta, dtheta = radians(55), 0.
    phi, dphi = theta, 0.
    h, dh = 0., 0.
    mode = 'tall'
    plan = ((0.,), 0., 1.)
    a_piv_f, a_grip_f = [0., 0., 0.], [0., 0., 0.]
    ddh = 0.
    connect_angle, connect_time = HINGE_TRIGGER, -1.
    history = []            # pivot and grip positions for finite-difference accelerations
    peaks, samples = [], []
    tension_ratio = 1.
    t = 0.
    prev_dtheta = 0.
    soft, pack = 0., 0.
    while t < seconds:
        # Elbows soften as the bell goes weightless; shoulders pack under load (smoothed, 80 ms).
        k = min(1., DT / .08)
        soft += (.006 * clamp(1 - tension_ratio, 0., 1.) - soft) * k
        pack += (radians(6) * clamp(tension_ratio - .6, 0., 1.4) - pack) * k
        # The pendulum's pivot comes from the hinge only; balance is applied afterwards.
        dx = 0.
        _, pivot, grip, length = build('s', 0, h, theta, phi, soft, pack, dx)
        history.append((pivot, grip, length, dx))
        if len(history) >= 3:
            (p0, g0, *_), (p1, g1, *_), (p2, g2, *_) = history[-3:]
            a_piv = [(p2[k] - 2 * p1[k] + p0[k]) / DT ** 2 for k in range(3)]
            a_grip = [(g2[k] - 2 * g1[k] + g0[k]) / DT ** 2 for k in range(3)]
        else:
            a_piv = a_grip = [0., 0., 0.]
        # Hand and wrist compliance: accelerations reach the bell smoothed over ~25 ms.
        f = min(1., DT / .025)
        a_piv_f = [a + (clamp(b, -60., 60.) - a) * f for a, b in zip(a_piv_f, a_piv)]
        a_grip_f = [a + (clamp(b, -80., 80.) - a) * f for a, b in zip(a_grip_f, a_grip)]
        a_piv, a_grip = a_piv_f, a_grip_f

        # Arm + bell physical pendulum about the shoulders.
        l_bell = length + BELL['handle_to_center']
        l_arm = length * .45
        inertia = ARM_MASS * (l_arm ** 2 + length ** 2 / 12) + BELL['mass'] * (l_bell ** 2 + .4 * BELL['radius'] ** 2)
        moment = ARM_MASS * l_arm + BELL['mass'] * l_bell
        gz = G + a_piv[2]
        torque = -moment * (gz * sin(theta) + a_piv[0] * cos(theta)) - .6 * dtheta
        # Forearm-to-inner-thigh contact: stiff, well-damped stop (only pushes forward).
        if theta < BACK_STOP:
            torque += moment * (120. * (BACK_STOP - theta)) - (8. * dtheta if dtheta < 0 else 0.)
        # Shoulders cannot let the bell loop over the head: stiff stop near vertical.
        if theta > radians(100):
            torque -= moment * (150. * (theta - radians(100))) + (8. * dtheta if dtheta > 0 else 0.)
        # Lats connect the arms to the trunk while the hips hinge and snap: the arm
        # angle follows the trunk (theta + lean = constant), so hip extension throws
        # the bell. In the float the arms are relaxed and the bell is a free pendulum.
        if mode in ('hinge', 'snap'):
            lean, lean_rate = radians(68) * h, radians(68) * dh
            target, target_rate = connect_angle - lean, -lean_rate
            # Catch the bell softly: the connection ramps in over 0.2 s.
            ramp = smooth((t - connect_time) / CATCH_TIME)
            drive = ramp * (-moment * LAT_STIFFNESS * (theta - target) - moment * LAT_DAMPING * (dtheta - target_rate))
            # During the snap the hips can only push the bell forward, never hold it back.
            torque += max(0., drive) if mode == 'snap' else drive
        ddtheta = torque / inertia
        tension = BELL['mass'] * (l_bell * dtheta ** 2 + gz * cos(theta) - a_piv[0] * sin(theta))
        tension_ratio = max(0., tension / (BELL['mass'] * G))

        # Bell on its handle: pendulum about the grip, damped toward the arm line.
        d = BELL['handle_to_center']
        i_bell = BELL['mass'] * (d * d + .4 * BELL['radius'] ** 2)
        ddphi = (-BELL['mass'] * d * ((G + a_grip[2]) * sin(phi) + a_grip[0] * cos(phi))
                 - 12. * (dphi - dtheta) - 150. * (phi - theta)
                 - 900. * max(0., abs(phi - theta) - radians(18)) * (1 if phi > theta else -1)) / i_bell

        # Lifter's hip planner: minimum-jerk hinge and snap (bounded, human-like accelerations).
        if mode == 'tall' and dtheta < 0 and theta < HINGE_TRIGGER:
            mode, plan = 'hinge', quintic(h, dh, ddh, depth, t, HINGE_TIME)
            connect_angle, connect_time = theta + radians(68) * h, t
        elif mode == 'hinge' and prev_dtheta < 0 <= dtheta:
            mode, plan = 'snap', quintic(h, dh, ddh, 0., t, SNAP_TIME)
        elif mode == 'snap' and t - plan[1] >= plan[2]:
            mode = 'tall'

        if prev_dtheta > 0 >= dtheta and theta > 0:
            peaks.append((t, theta))
            if adapt:
                depth = clamp(depth + .3 * (THETA_FLOAT - theta), .3, 1.)
        prev_dtheta = dtheta
        dtheta += ddtheta * DT
        theta += dtheta * DT
        dphi += ddphi * DT
        phi += dphi * DT
        if mode in ('hinge', 'snap'):
            coeffs, t0, span = plan
            u = clamp((t + DT - t0) / span, 0., 1.)
            new_h = sum(c * u ** k for k, c in enumerate(coeffs))
            new_dh = sum(k * c * u ** (k - 1) for k, c in enumerate(coeffs) if k) / span
            ddh = (new_dh - dh) / DT
            h, dh = new_h, new_dh
        else:
            h, dh, ddh = 0., 0., 0.
        if record:
            samples.append({'t': t, 'h': h, 'theta': theta, 'phi': phi, 'soft': soft, 'pack': pack, 'dx': dx,
                            'dtheta': dtheta, 'tension': tension_ratio, 'mode': mode})
        t += DT
    return peaks, samples


@lru_cache(maxsize=1)
def cycle():
    """Run to a steady rhythm (hinge depth self-corrects) and cut one backswing-to-backswing loop."""
    peaks, samples = simulate(SNAP_OMEGA, seconds=14., record=True)
    omega = SNAP_OMEGA
    # Backswing extremes: dtheta crosses from negative to positive.
    turns = [i for i in range(1, len(samples)) if samples[i - 1]['dtheta'] < 0 <= samples[i]['dtheta']]
    start, end = turns[-2], turns[-1]
    loop = samples[start:end]
    # Distribute the tiny residual so the loop closes exactly.
    first, last = samples[start], samples[end]
    keys = ('h', 'theta', 'phi', 'soft', 'pack')
    n = len(loop)
    fixed = []
    for i, s in enumerate(loop):
        u = i / n
        fixed.append({k: s[k] - (last[k] - first[k]) * u for k in keys} | {'tension': s['tension']})
    # Dynamic balance: solve the looping hip shift dx(t) that keeps the zero-moment
    # point (ZMP) at mid-foot, using the cart-table model on the whole-body COM:
    #   x_com - z_com / (g + z_com'') * x_com'' = MID_FOOT_X,  x_com = x0 + k * dx.
    m = n
    dt = DT
    x0, z0, k = [], [], []
    for st in fixed:
        args = [st[key] for key in keys]
        c0 = centre_of_mass(build('s', 0, *args, 0.)[0].result())[0]
        c1 = centre_of_mass(build('s', 0, *args, .01)[0].result())[0]
        x0.append(c0[0]); z0.append(c0[2]); k.append((c1[0] - c0[0]) / .01)
    zdd = [(z0[(i + 1) % m] - 2 * z0[i] + z0[i - 1]) / dt ** 2 for i in range(m)]
    sc = [z0[i] / max(2., G + zdd[i]) for i in range(m)]
    xdd = [(x0[(i + 1) % m] - 2 * x0[i] + x0[i - 1]) / dt ** 2 for i in range(m)]
    rhs = [MID_FOOT_X - x0[i] + sc[i] * xdd[i] for i in range(m)]
    off = [-sc[i] * k[i] / dt ** 2 for i in range(m)]
    diag = [k[i] - 2 * off[i] for i in range(m)]
    dxs = solve_cyclic(off, diag, off, rhs)
    for i in range(n):
        fixed[i]['dx'] = clamp(dxs[i], -.2, .2)
    period = n * DT
    return {'omega': omega, 'period': period, 'states': fixed,
            'float_deg': degrees(max(s['theta'] for s in loop)),
            'back_deg': degrees(min(s['theta'] for s in loop))}


def state_at(phase):
    states = cycle()['states']
    n = len(states)
    x = (phase % 1.) * n
    i = int(x) % n
    u = x - int(x)
    a, b = states[i], states[(i + 1) % n]
    return {k: a[k] + (b[k] - a[k]) * u for k in ('h', 'theta', 'phi', 'soft', 'pack', 'dx')}


def kb_swing(name, phase):
    s = state_at(phase)
    return build(name, phase, s['h'], s['theta'], s['phi'], s['soft'], s['pack'], s['dx'])[0]


def duration():
    return cycle()['period']
