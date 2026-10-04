"""Export rig poses as 3D joint tracks for the app's live three.js character.

python3 tools/animation/export_3d.py

The same deterministic rig, motions and kettlebell choreography that produce the
watch PNGs are sampled densely and written as compact JSON. The app draws the
figure in 3D from these tracks, so the look follows render.py (tapered limbs,
shirt, pants, cuffs, shoes, head, bell) while the viewer can orbit freely.

Coordinates are converted from the rig (x forward, y left, z up) to three.js
(x = rig y, y = rig z, z = rig x); the mapping has determinant +1, so no mirror.
Values are stored in millimetres as integers.
"""
import argparse
import hashlib
import json
from pathlib import Path

try:
    from .motions import pose_for, DURATIONS, V2_MOTIONS
    from .validate import check_v2
    from .v2.spamset import CATALOG as SPAMSET
except ImportError:
    from motions import pose_for, DURATIONS, V2_MOTIONS
    from validate import check_v2
    from v2.spamset import CATALOG as SPAMSET

ROOT = Path(__file__).resolve().parents[2]
PROFILES = json.loads((Path(__file__).parent / 'profiles.json').read_text())
CONTRACTS = json.loads((Path(__file__).parent / 'contracts.json').read_text())

EXERCISES = ['kb-swing', 'kb-deadlift', 'goblet-squat', 'kb-reverse-lunge',
             'kb-side-lunge', 'kb-upright-row', 'kb-bent-row', 'kb-side-bend',
             'kb-curl', 'kb-halo', 'kb-clean', 'kb-press', 'kb-snatch', 'kb-getup',
             'kb-pullover']
JOINTS = ['pelvis', 'spine_mid', 'chest', 'neck', 'head', 'face',
          *[f'{name}_{side}' for side in ('l', 'r')
            for name in ('hip', 'knee', 'ankle', 'heel', 'toe',
                         'shoulder', 'elbow', 'wrist', 'palm')]]
SAMPLE_FPS = 30


def to_three(point):
    x, y, z = point
    return [round(y * 1000), round(z * 1000), round(x * 1000)]


# Equipment colours follow render.py: wall, chair seat/legs, bar default, band and dumbbell plates.
# Dumbbell plates in light iron: orange plates merged with the orange shirt.
# The band is lime (watch design tokens): orange vanished against the shirt.
WALL, CHAIR_SEAT, CHAIR_FRAME, BAR, BAND, PLATE = '#6b6a62', '#aaa99f', '#838279', '#aaa99f', '#d0fc79', '#b4b1a6'
# A hand this close (m) to a bar, dumbbell handle or band end holds it.
GRIP_REACH = .06
# Underhand (supinated) bar grips; every other bar grip is overhand.
UNDERHAND = {'chin-ups'}
# Free hands closed into fists (hand state 3).
FISTS = {'punches'}
# Clasped or interlaced hands read as closed hands while they are together.
CLASPS = {'behind-back-clasp', 'side-to-side-chops', 'overhead-reach'}


def tube(points, width, color):
    """A round bar through points; width is the watch stroke width (m), stored as radius in mm."""
    return {'k': 'tube', 'pts': [to_three(p) for p in points], 'r': round(width * 500), 'c': color}


def equipment(pose):
    """Every non-kettlebell prop as tubes, slabs and dumbbells (three.js mm)."""
    shapes = []
    for prop in pose['props']:
        kind = prop['type']
        if kind == 'wall':
            shapes.append({'k': 'slab', 'pts': [to_three(p) for p in prop['corners']], 't': 40, 'c': WALL})
        elif kind == 'chair':
            shapes.append({'k': 'slab', 'pts': [to_three(p) for p in prop['seat']], 't': 30, 'c': CHAIR_SEAT})
            shapes += [tube(segment, .026, CHAIR_FRAME) for segment in prop.get('legs', []) + prop.get('back', [])]
        elif kind == 'lines':
            shapes += [tube(segment, prop.get('width', .03), prop.get('color', BAR)) for segment in prop['segments']]
        elif kind == 'band':
            shapes.append(tube(prop['points'], .035, BAND))
        elif kind == 'dumbbell':
            shapes.append({'k': 'db', 'h': [to_three(p) for p in prop['handle']], 'c': PLATE})
    return shapes


def _closest(point, a, b):
    ab = [y - x for x, y in zip(a, b)]
    t = sum((q - x) * d for q, x, d in zip(point, a, ab)) / max(1e-12, sum(d * d for d in ab))
    t = max(0., min(1., t))
    c = [x + d * t for x, d in zip(a, ab)]
    return c, sum((q - x) ** 2 for q, x in zip(point, c)) ** .5, ab


def equipment_grips(exercise, pose):
    """Hands holding a bar, dumbbell handle or band end: grip point and bar direction per side."""
    bars = []  # (a, b, hanging bar): a horizontal bar overhead is gripped overhand or underhand.
    for prop in pose['props']:
        if prop['type'] == 'lines':
            bars += [(a, b, abs(a[2] - b[2]) < .01) for a, b in prop['segments']]
        elif prop['type'] == 'dumbbell':
            bars.append((*prop['handle'], False))
        elif prop['type'] == 'band':
            bars.append((*prop['points'], False))
    grips = {}
    j = pose['joints']
    for s in ('l', 'r'):
        best = None
        for a, b, hanging in bars:
            for joint in ('wrist_' + s, 'palm_' + s):
                point, distance, axis = _closest(j[joint], a, b)
                if distance < GRIP_REACH and (best is None or distance < best[1]):
                    best = (point, distance, axis, hanging)
        if best:
            # w: palm facing for a hanging bar, 1 overhand (palms forward), -1 underhand (toward the face).
            mode = (-1 if exercise in UNDERHAND else 1) if best[3] else 0
            grips[s] = {'p': to_three(best[0]), 'a': to_three(best[2]), **({'w': mode} if mode else {})}
    return grips


def palm_surfaces(pose):
    """Palms planted on a wall: the wall's normal toward the body, per side (the floor is the default)."""
    out = {}
    for prop in pose['props']:
        if prop['type'] != 'wall':
            continue
        c = prop['corners']
        u = [b - a for a, b in zip(c[0], c[1])]
        v = [b - a for a, b in zip(c[0], c[3])]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        size = sum(x * x for x in n) ** .5
        n = [x / size for x in n]
        pelvis = pose['joints']['pelvis']
        if sum((pp - cc) * nn for pp, cc, nn in zip(pelvis, c[0], n)) < 0:
            n = [-x for x in n]
        for s in ('l', 'r'):
            palm = pose['joints']['palm_' + s]
            if 'palm_' + s in pose['contacts'] and abs(sum((pp - cc) * nn for pp, cc, nn in zip(palm, c[0], n))) < .05:
                out[s] = to_three(n)  # unit normal in thousandths (to_three scales by 1000)
    return out


def export(exercise, review=False):
    """One clip. review=True records IK and validator failures in the clip instead of raising."""
    profile = PROFILES[exercise]
    duration = DURATIONS[exercise]() if exercise in DURATIONS else profile['frames'] / profile['fps']
    samples = max(24, round(duration * SAMPLE_FPS))
    frames, errors, view = [], 0, None
    for index in range(samples):
        pose = pose_for(exercise, index / samples)
        errors += len(pose['qa']['ik_errors'])
        view = view or pose['view']
        joints = dict(pose['joints'])
        # Mid-back: only articulated spines (cat-cow, curls, arches) author it; elsewhere straight.
        joints.setdefault('spine_mid', [(a + c) / 2 for a, c in zip(joints['pelvis'], joints['chest'])])
        missing = [name for name in JOINTS if name not in joints]
        if missing:
            raise ValueError(f'{exercise}: missing joints {missing}')
        bells = []
        for prop in pose['props']:
            if prop['type'] != 'kettlebell':
                continue
            bells.append({'c': to_three(prop['center']),
                          'h': [to_three(p) for p in prop['handle']],
                          'r': round(prop.get('radius', .10) * 1000),
                          **({'horns': [to_three(h[0]) for h in prop['horns']]}
                             if 'horns' in prop else {}),
                          # Where each gripping hand holds this bell (the renderer wraps it there).
                          **({'g': {s: to_three(g) for s, g in prop['grips'].items()}}
                             if prop.get('grips') else {})})
        # Hand state per side, left then right: 0 free, 1 gripping a bell or bar, 2 flat on a
        # surface, 3 a fist.
        held = equipment_grips(exercise, pose)
        gripping = {s for prop in pose['props'] for s in prop.get('grips', {})} | set(held)
        together = sum((a - b) ** 2 for a, b in zip(pose['joints']['palm_l'], pose['joints']['palm_r'])) ** .5 < .12
        free = 3 if exercise in FISTS or (exercise in CLASPS and together) else 0
        hands = [1 if s in gripping else 2 if 'palm_' + s in pose['contacts'] else free for s in ('l', 'r')]
        frame = {'j': [coord for name in JOINTS for coord in to_three(joints[name])], 'b': bells, 'hs': hands}
        shapes = equipment(pose)
        if shapes:
            frame['p'] = shapes
        if held:
            frame['g'] = held
        walls = palm_surfaces(pose)
        if walls:
            frame['pn'] = walls
        frames.append(frame)
    failures = [f'{errors} IK errors'] if errors else []
    if exercise in V2_MOTIONS:
        failures += check_v2(exercise)[1]
    if failures and not review:
        raise ValueError(f'{exercise}: {"; ".join(failures)}; fix the motion before export')
    # Equipment that never moves (bar, doorframe, chair, wall) is stored once for the clip.
    scene = None
    if frames and 'p' in frames[0] and all(f.get('p') == frames[0]['p'] for f in frames):
        scene = frames[0]['p']
        for f in frames:
            del f['p']
    return {**({'scene': scene} if scene else {}),'id': exercise, 'duration': round(duration, 3), 'joints': JOINTS,
            'view': {'azimuth': view.get('azimuth', 65), 'elevation': view.get('elevation', 8),
                     **({'cropBelow': view['crop_below']} if 'crop_below' in view else {})},
            'contract': CONTRACTS.get(exercise),
            **({'validator': {'passed': not failures, 'failures': failures}} if review else {}),
            'frames': frames}


def _export_one(args):
    exercise, review = args
    return exercise, export(exercise, review)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT / 'assets/animations'))
    parser.add_argument('--review', action='store_true',
                        help='export every Spamset exercise too, recording validator failures instead of stopping')
    parser.add_argument('--jobs', type=int, default=8)
    args = parser.parse_args()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    names = list(EXERCISES)
    if args.review:
        names += [e['id'] for e in SPAMSET if e['id'] not in names]
    from multiprocessing import Pool
    with Pool(args.jobs) as pool:
        results = dict(pool.imap_unordered(_export_one, [(e, args.review) for e in names]))
    index = []
    for exercise in names:
        clip = results[exercise]
        path = out / f'{exercise}.json'
        path.write_text(json.dumps(clip, separators=(',', ':')))
        index.append(exercise)
        status = '' if 'validator' not in clip else ' PASS' if clip['validator']['passed'] else ' FAIL ' + '; '.join(clip['validator']['failures'])
        print(f'{exercise}: {len(clip["frames"])} samples, {clip["duration"]}s, {path.stat().st_size // 1024} KB{status}')
    # Static require() map for Metro, which cannot bundle dynamic JSON paths.
    lines = ['// Generated by tools/animation/export_3d.py. Do not edit.',
             "import type { Clip } from '@/animation/types';", '',
             'export const clips: Record<string, Clip> = {']
    lines += [f"  '{e}': require('@/assets/animations/{e}.json'),"for e in index]
    lines += ['};', '']
    (ROOT / 'src/animation/clips.ts').write_text('\n'.join(lines))
    # Names and groups for the review page (Spamset catalog plus the bell-only lifts).
    catalog = {e['id']: e for e in SPAMSET}
    entries = [{'id': e, 'name': catalog[e]['name'] if e in catalog else e, 'group': catalog[e]['group'] if e in catalog else 'kettlebell'}
               for e in index]
    (ROOT / 'src/animation/review-catalog.ts').write_text(
        '// Generated by tools/animation/export_3d.py. Do not edit.\n'
        'export type ReviewEntry = { id: string; name: string; group: string };\n'
        f'export const REVIEW_CATALOG: ReviewEntry[] = {json.dumps(entries, indent=2)};\n')
    # Revision identity for reviews: hash of every exported clip, in order.
    digest = hashlib.sha256()
    for exercise in index:
        digest.update((out / f'{exercise}.json').read_bytes())
    revision = digest.hexdigest()[:12]
    (ROOT / 'src/animation/revision.ts').write_text(
        '// Generated by tools/animation/export_3d.py. Do not edit.\n'
        f"export const ANIMATION_REVISION = '{revision}';\n")
    print('revision', revision)


if __name__ == '__main__':
    main()
