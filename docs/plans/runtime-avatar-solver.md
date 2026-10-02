# Plan: runtime avatar solver

**Status:** proposal, 2026-10-02. Nothing implemented yet.

## Goal

The avatar performs a move from instructions, solved on the phone each frame. Today it only plays back baked joint tracks.

- **Today:**
  - `export_3d.py` samples the Python rig at 30 Hz and writes 77 clips, 3.2 MB of JSON (about 0.47 MB gzipped).
  - `samplePose(clip, t)` interpolates those samples.
  - `Figure.update(pose)` draws the figure live with three.js.
- **Target:** `solvePose(spec, t, params)` builds the same `Pose` from a compact motion spec. Examples:
  - "push-up, hands wide, 2 s down / 1 s up";
  - "reverse lunge, left side first, shallow";
  - "goblet squat with a 16 kg bell".

  `Figure` keeps drawing the result as it does today.

Storage is not the reason to do this: 0.47 MB compressed is already small. The reasons are:

- **Variations without re-export:** tempo, depth, side, stance width, bell size, rep count.
- **Responsive demos:** slow down, pause at the bottom, mirror to the other side, match the user's set.
- **One source for every surface:** the same spec drives the watch PNGs, the phone avatar and later the Wear OS app.

## What exists to build on

- **The rendering seam is already clean.** `figure-viewer.tsx` calls `samplePose(clip, time)` and passes the `Pose` to `figure.update`. A solver returning the same `Pose` type (joints, bells, hands, equipment, bar grips) needs no renderer changes.
- **The Python rig is small and deterministic:**
  - `rig.py`: fixed segment lengths, analytic two-bone IK with explicit poles, foot pitch about the forefoot, contacts.
  - Motion helpers in about 2,600 lines (`motions.py`, `stretches.py`, `pushups.py`, `bodyweight_*.py`, `kettlebell.py`, `kb_advanced.py`): plank_body, plant_hands, supine, articulate, set_head, hold_cycle, alternating and others.
- **Rig v2 adds physics and checks offline** (`v2/`, about 3,500 lines): bell pendulum, balance (ZMP), collision clearance, weight-shift pauses. That's expensive. It runs for minutes over the library, so it is not a runtime candidate as it stands.
- **The validators exist:** `validate.py` (geometry) and `check_v2` (collisions, dynamic balance). They are the acceptance gate and stay offline.

## Approach

Three layers. Each one can be tested separately.

1. **Motion spec (data).** A declarative JSON description per exercise:
   - phases with durations and easing;
   - effector targets for the pelvis, chest direction, hands, feet and head, relative to body landmarks or props;
   - contacts per phase (which hand or foot is planted where);
   - pole hints for elbows and knees;
   - mirroring and alternation;
   - props and grips;
   - **parameters with safe ranges:** depth, stance width, tempo, side, bell size.
2. **Solver (TypeScript, runtime).** A port of `rig.py` plus the spec interpreter. It turns spec + time + params into joint positions with exact bone lengths:
   - two-bone IK for each limb;
   - spine articulation;
   - the head on a still neck;
   - planted contacts held fixed in world space;
   - props attached to grips.

   Pure functions, no three.js imports, so it is unit-testable in Jest like `src/core`.
3. **Offline gate (Python, unchanged role).** The Python rig interprets the same spec. It runs the validators and the three-reviewer process over a grid of parameter values, and records which ranges pass. Only validated ranges ship. The watch PNG export reads the spec too.

### Why a spec, not a straight port of the Python functions

Porting the roughly 80 motion functions to TypeScript gives a runtime avatar quickly. But every motion would then exist twice and drift. A spec read by both runtimes keeps one source of truth, makes parameters explicit and range-checked, and is what "giving the avatar instructions" means. The Python functions become the reference the specs are checked against during migration.

### Physics at runtime

- **Not in the first version.** v2's balance solver, pendulum bell and collision clearance stay offline.
- **What the phone gets instead:** the baked results of v2 where they matter, as spec keyframes. Examples:
  - the hip shift that counterbalances a bell;
  - the hang time at the top of a swing.
- **Optional later milestone:** a cheap runtime balance term that moves the pelvis to keep the centre of mass over the support polygon. It's a few vector operations per frame; validate it against `check_v2` offline.
- **Kettlebell lifts whose motion comes from the pendulum** (swing, clean, snatch) stay baked until a spec can reproduce them within tolerance.

## Milestones

### M0: Spec format and reference interpreter (Python)

- Define the spec schema (JSON Schema in `tools/animation/spec/schema.json`) from what the push-up family needs.
- Write a Python interpreter on top of `rig.py`.
- Express the 10 push-up variations (`pushups.py`) as specs.
- **Acceptance:** for every push-up variant, spec poses match the current Python motion within 1 mm per joint at 240 samples, and `validate.py` results are unchanged.

### M1: TypeScript solver and parity fixtures

- Port `rig.py` (vector helpers, `solve_two_bone`, `Pose.torso/foot/leg/arm`, `straight_leg`) and the spec interpreter to `src/animation/solver/`.
- Python writes golden fixtures (spec + params + t → joints) for the push-up specs. A Jest test checks the TypeScript solver against them. This is the same approach as the Wear OS parity tests in trex-workout.
- **Acceptance:** max joint error at most 1 mm across fixtures; no IK branch flips. Poles are deterministic, and fixtures include the near-degenerate frames.

### M2: Runtime playback behind a flag

- `figure-viewer` uses `solvePose` for exercises that have a spec, and falls back to the baked clip otherwise.
- `/debug/animations` shows the solved and baked versions side by side, with a toggle.
- Measure solve time per frame on a mid-range Android phone and an iPhone. **Budget:** under 1 ms per frame at 60 fps. Record the measured numbers; don't assume them.
- **Acceptance:** you review the push-up family on the device and see no visible difference from baked, and the frame budget is met.

### M3: Parameters

- Expose tempo, depth, side and width on the push-ups. Python validates a parameter grid offline and stores the passing ranges in the spec.
- The workout runner passes the user's prescription (tempo, side) to the avatar.
- **Acceptance:** every shipped parameter combination is inside a validated range. Out-of-range requests clamp to the nearest validated value instead of solving freely.

### M4: Migrate the library

- **Order:**
  1. Floor and plank moves.
  2. Standing bodyweight moves.
  3. Stretches.
  4. Chair, wall, bar and band moves.
  5. Kettlebell lifts without pendulum dynamics: goblet squat, rows, curl, halo, side bend, press.
- **For each family:** write the specs, check Python parity with the current motion, add fixtures, run the three reviews and your review, then switch it from baked to solved.
- Baked clips remain as the fallback until every spec in a family is accepted.

### M5: Physics-driven lifts (optional)

- Swing, clean, snatch, get-up. Either keep them baked permanently, or add the runtime balance and bell-pendulum terms and validate them against v2 offline.
- Decide after M4 based on how they compare.

### M6: Retire baked clips

- Remove the baked JSON for every exercise solved at runtime. Keep the export only for the review pipeline and the watch.

## Later, not in this plan

- **Generated specs:** text such as "slow tempo, pause at the bottom" turned into a spec by a model. It must pass the same offline gate before it ships. Solving model output live on the device without validation would bypass every check this project relies on.
- **Wear OS:** the solver is plain TypeScript math, so a Kotlin port could follow the same fixtures. The Zepp watch stays on pre-rendered images, since it cannot run real-time 3D.

## Decisions needed

1. **Spec vs straight port:** declarative spec read by both runtimes (recommended), or port the Python motion functions to TypeScript first and specify later.
2. **First parameters:** tempo and side are the most useful and the safest; depth and width need more validation.
3. **Runtime balance:** leave it out until M5 (recommended), or attempt it in M3.
4. **Kettlebell pendulum lifts:** keep them baked indefinitely, or plan M5.

## Risks

- **Parity drift between Python and TypeScript.** Mitigation: golden fixtures in CI on both sides; any rig change regenerates fixtures.
- **IK branch flips at runtime** for parameter values that were never sampled. Mitigation: explicit poles in every spec, validated parameter grids, clamping.
- **Spec expressiveness.** Some motions (twists, the get-up, the halo) use custom geometry. Mitigation: the schema allows a small set of named helper operations (articulate, set_head, plank_body), implemented identically in both interpreters, rather than arbitrary code.
- **Review cost.** Every parameter range is a new thing to review. Mitigation: ship few parameters, review the extremes of each range, keep the defaults identical to today's accepted clips.
- **Device performance is unmeasured.** Analytic IK for about 20 joints should be cheap, but this plan claims nothing until M2 measures it on real phones.
