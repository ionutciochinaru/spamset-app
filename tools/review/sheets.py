"""Contact sheets and geometry evidence for an animation review revision.

python3 tools/review/sheets.py docs/animation-review/<revision>

Reads frames captured by tools/review/capture.mjs and writes
  sheets/<exercise>.png   rows = camera views, columns = loop phases (labelled)
  geometry.json           validator results plus limb/bell clearance, per exercise
Clearance uses the 3D figure's rendered radii (src/animation/figure.ts), so a
negative value means two drawn body parts interpenetrate.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/animation'))
import validate  # noqa: E402
from motions import pose_for  # noqa: E402
from export_3d import EXERCISES  # noqa: E402
from rig import norm, sub  # noqa: E402

VIEWS = ['front', 'threequarter', 'left', 'right']
CELL = 200

# Radii (m) matching figure.ts widths / 2.
LIMBS = {
    'upper_arm': ('shoulder', 'elbow', .06),
    'forearm': ('elbow', 'wrist', .027),
    'hand': ('wrist', 'palm', .023),
    'thigh': ('hip', 'knee', .073),
    'shin': ('knee', 'ankle', .047),
}


def segment_distance(a0, a1, b0, b1, samples=12):
    best = 1e9
    for i in range(samples + 1):
        t = i / samples
        p = tuple(x + (y - x) * t for x, y in zip(a0, a1))
        d = sub(b1, b0)
        denom = sum(v * v for v in d)
        u = 0 if denom == 0 else max(0., min(1., sum(x * y for x, y in zip(sub(p, b0), d)) / denom))
        q = tuple(x + y * u for x, y in zip(b0, d))
        best = min(best, norm(sub(p, q)))
    return best


def clearance(exercise, samples=120):
    worst = {}
    for i in range(samples):
        phase = i / samples
        pose = pose_for(exercise, phase)
        j = pose['joints']
        pairs = []
        for arm_side in 'lr':
            for arm in ('upper_arm', 'forearm', 'hand'):
                for leg_side in 'lr':
                    for leg in ('thigh', 'shin'):
                        pairs.append((f'{arm}_{arm_side}', f'{leg}_{leg_side}'))
        for a, b in pairs:
            (sa, ea, ra), (sb, eb, rb) = LIMBS[a[:-2]], LIMBS[b[:-2]]
            gap = segment_distance(j[f'{sa}_{a[-1]}'], j[f'{ea}_{a[-1]}'], j[f'{sb}_{b[-1]}'], j[f'{eb}_{b[-1]}']) - ra - rb
            key = f'{a} vs {b}'
            if gap < worst.get(key, (1e9,))[0]:
                worst[key] = (gap, phase)
        for prop in pose['props']:
            if prop['type'] != 'kettlebell':
                continue
            for leg_side in 'lr':
                for leg in ('thigh', 'shin'):
                    s, e, r = LIMBS[leg]
                    gap = segment_distance(prop['center'], prop['center'], j[f'{s}_{leg_side}'], j[f'{e}_{leg_side}'], 1) - prop['radius'] - r
                    key = f'bell vs {leg}_{leg_side}'
                    if gap < worst.get(key, (1e9,))[0]:
                        worst[key] = (gap, phase)
    ranked = sorted(worst.items(), key=lambda kv: kv[1][0])
    return [{'pair': k, 'min_clearance_m': round(v[0], 4), 'phase': round(v[1], 3)} for k, v in ranked[:6]]


def sheet(frames, exercise, out):
    files = sorted(frames.glob(f'{exercise}__front__*.png'))
    phases = [f.stem.split('__')[2] for f in files]
    label_w, head_h = 110, 26
    img = Image.new('RGB', (label_w + CELL * len(phases), head_h + CELL * len(VIEWS)), '#101010')
    d = ImageDraw.Draw(img)
    for c, phase in enumerate(phases):
        d.text((label_w + c * CELL + 6, 7), f'phase {float(phase):.3f}', fill='#dddddd')
    for r, view in enumerate(VIEWS):
        d.text((8, head_h + r * CELL + CELL // 2 - 6), view, fill='#dddddd')
        for c, phase in enumerate(phases):
            frame = Image.open(frames / f'{exercise}__{view}__{phase}.png').convert('RGB')
            frame = frame.resize((CELL, CELL), Image.Resampling.LANCZOS)
            img.paste(frame, (label_w + c * CELL, head_h + r * CELL))
    img.save(out)


def main():
    root = Path(sys.argv[1])
    frames = root / 'frames'
    (root / 'sheets').mkdir(exist_ok=True)
    # Every captured clip (kettlebell lifts and the Spamset library); the legacy geometry
    # validator covers the kettlebell lifts, validator v2 results come from each exported clip.
    exercises = sorted({f.name.split('__')[0] for f in frames.glob('*__front__*.png')},
                       key=lambda e: (e not in EXERCISES, EXERCISES.index(e) if e in EXERCISES else 0, e))
    validate.IDS = [e for e in EXERCISES if e in exercises]
    report = validate.validate(240)
    rows = {row['id']: row for row in report['exercises']}
    geometry = {}
    for exercise in exercises:
        sheet(frames, exercise, root / 'sheets' / f'{exercise}.png')
        clip = json.loads((ROOT / 'assets/animations' / f'{exercise}.json').read_text())
        row = rows.get(exercise)
        geometry[exercise] = {
            **({'validator_v2': clip['validator']} if 'validator' in clip else {}),
            **({'validator_failures': row['failures'],
                'max_bone_length_error_m': row['max_bone_length_error_m'],
                'max_grip_error_m': row['max_grip_error_m'],
                'max_support_drift_m_per_sample': row['max_declared_support_drift_m_per_sample'],
                'min_joint_height_m': row['min_joint_center_z_m'],
                'loop_seam_m': row['loop_near_seam_displacement_m']} if row else {}),
            'worst_limb_and_bell_clearance': clearance(exercise),
        }
        print(exercise)
    (root / 'geometry.json').write_text(json.dumps(geometry, indent=1) + '\n')


if __name__ == '__main__':
    main()
