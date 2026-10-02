"""Reproducible geometry checks for offline demonstrations (not form approval).

python3 tools/animation/validate.py --output docs/animation-review/revision-2/geometry.json
Checks dense motion samples, actual joint positions, declared supports, prop grips,
floor clearance, loop continuity, and bilateral mirror contracts. No third-party deps.
"""
import argparse
import hashlib
import json
from pathlib import Path
from math import sqrt
try:
    from .motions import IDS, pose_for, DURATIONS, ALLOWED_CONTACT
    from .v2 import body as v2body, collide as v2collide
    from .rig import SEGMENTS, norm, sub, SIDES, HIP_HALF, SHOULDER_HALF, ANKLE_HEIGHT
except ImportError:
    from motions import IDS, pose_for, DURATIONS, ALLOWED_CONTACT
    from v2 import body as v2body, collide as v2collide
    from rig import SEGMENTS, norm, sub, SIDES, HIP_HALF, SHOULDER_HALF, ANKLE_HEIGHT

ROOT=Path(__file__).resolve().parents[2]
BILATERAL={'march','standing-knee','reverse-lunge','bird-dog','seated-knee',
           'kb-reverse-lunge','kb-side-lunge','kb-halo'}
EXPECTED_BONES=dict(SEGMENTS)
for s in SIDES:
    for name,a,b,d in [('hip','pelvis','hip_'+s,HIP_HALF),
                       ('clavicle','chest','shoulder_'+s,SHOULDER_HALF),
                       ('heel','ankle_'+s,'heel_'+s,sqrt(.075**2+ANKLE_HEIGHT**2)),
                       ('toe','ankle_'+s,'toe_'+s,sqrt(.16**2+ANKLE_HEIGHT**2))]:
        EXPECTED_BONES[name+'_'+s]=(a,b,d)

def mirror_name(name):
    if name.endswith('_l'):return name[:-2]+'_r'
    if name.endswith('_r'):return name[:-2]+'_l'
    return name

def max_joint_difference(a,b):
    return max(norm(sub(a['joints'][k],b['joints'][k])) for k in a['joints'])

def segment_distance(point,a,b):
    direction=sub(b,a);denominator=sum(v*v for v in direction)
    t=max(0.,min(1.,sum(x*y for x,y in zip(sub(point,a),direction))/denominator)) if denominator else 0.
    return norm(sub(point,tuple(x+t*y for x,y in zip(a,direction))))

PROFILES=json.loads((Path(__file__).parent/'profiles.json').read_text())
PENETRATION_TOLERANCE=.005
# Loop-phase windows where balance relies on momentum (not checked; listed in the report).
try:
    from .v2.getup import MOMENTUM_WINDOWS as _GETUP_WINDOWS
except ImportError:
    from v2.getup import MOMENTUM_WINDOWS as _GETUP_WINDOWS
MOMENTUM_WINDOWS={'kb-getup':_GETUP_WINDOWS}
# Suspended from a bar: no floor support, so instead of the ZMP the centre of mass must
# hang under the hands (a pendulum), within HANG_SWAY.
HANGING={'chin-ups','pull-ups'}
HANG_SWAY=.12
# With no support at all the body is in flight (clapping push-up, jump): it is accepted
# only if it is ballistic, i.e. the centre of mass falls at g within FLIGHT_TOLERANCE.
FLIGHT_TOLERANCE=2.5
STATIC_HOLD_SECONDS=2.


def check_v2(name,samples=240):
    """Validator v2: whole-body collisions (drawn radii) and dynamic balance (ZMP).

    Sampled at least 30 times per second of motion, so long loops cannot hide a pass-through.
    Hanging moves check the centre of mass against the grip instead of the floor; frames
    with no support at all must be ballistic flight."""
    profile=PROFILES.get(name,{})
    duration=DURATIONS[name]() if name in DURATIONS else (profile['frames']/profile['fps'] if profile.get('fps') else STATIC_HOLD_SECONDS)
    samples=max(samples,int(duration*30))
    poses=[pose_for(name,i/samples) for i in range(samples)]
    worst=v2collide.worst(poses,ALLOWED_CONTACT.get(name))
    pair,(clearance,phase,raw)=min(worst.items(),key=lambda kv:kv[1][0])
    balance=v2body.balance_report(poses,duration)
    # Momentum phases (e.g. the get-up's roll onto the elbow) rely on rotational momentum
    # that the point-mass ZMP model does not capture; they are excluded and reported.
    windows=MOMENTUM_WINDOWS.get(name,[])
    checked=[(i,r) for i,r in enumerate(balance) if not any(a<=i/samples<b for a,b in windows)]
    failures=[]
    if clearance < -PENETRATION_TOLERANCE:failures.append(f'interpenetration {pair} {raw:.3f} m at {phase:.3f}')
    zmp=com=None;flight=0;hang_sway=None
    if name in HANGING:
        for i,r in checked:
            j=poses[i]['joints'];grip=[(j['palm_l'][k]+j['palm_r'][k])/2 for k in range(2)]
            sway=sqrt((r['com'][0]-grip[0])**2+(r['com'][1]-grip[1])**2)
            hang_sway=sway if hang_sway is None else max(hang_sway,sway)
        if hang_sway>HANG_SWAY:failures.append(f'hanging: centre of mass {hang_sway:.3f} m from under the grip')
    else:
        supported=[]
        for i,r in checked:
            if r['supports']>=3:supported.append(r);continue
            flight+=1
            if abs(r['acc'][2]+v2body.G)>FLIGHT_TOLERANCE:
                failures.append(f'unsupported and not ballistic at {i/samples:.3f} (vertical acceleration {r["acc"][2]:.1f} m/s2)');break
        if supported:
            zmp=min(r['zmp_margin'] for r in supported);com=min(r['com_margin'] for r in supported)
            if zmp < 0:failures.append(f'dynamic balance: ZMP {-zmp:.3f} m outside support')
    return {'worst_clearance_pair':pair,'worst_clearance_m':raw,'worst_clearance_phase':phase,
            'min_com_margin_m':com,'min_zmp_margin_m':zmp,'balance_not_checked':windows,
            'flight_samples':flight,'max_hang_sway_m':hang_sway},failures


def validate(samples=360):
    report={'schema':1,'reviewer':'anatomy-and-motion implementation agent',
        'scope':'Deterministic geometry only. Does not establish proper technique, visual clarity, collision-free meshes, or hardware playback.',
        'samples_per_cycle':samples,'source_sha256':{},'exercises':[]}
    for name in ['rig.py','motions.py','kettlebell.py']:
        if not (Path(__file__).parent/name).exists():continue
        report['source_sha256'][name]=hashlib.sha256((Path(__file__).parent/name).read_bytes()).hexdigest()
    for name in IDS:
        poses=[pose_for(name,i/samples) for i in range(samples)]
        max_bone=0.;max_support_drift=0.;max_support_joint_error=0.;max_grip=0.;min_z=100.;min_prop_z=100.;mirror=0.;ik=[]
        min_halo_head_gap=100.;min_halo_hand_gap=100.;min_halo_bell_gap=100.;min_halo_handle_gap=100.;max_wrist_bend=0.;max_hand_error=0.;max_elbow_step=0.
        for i,p in enumerate(poses):
            j=p['joints'];ik+=p['qa']['ik_errors']
            if name=='kb-halo':
                # Halo regression: conservative sphere encloses the shaped head;
                # capsules include the thick upper arm and narrower forearm.
                # This checks these specific overlaps, not every body surface.
                for side in SIDES:
                    for start,end,radius in [('shoulder','elbow',.066),('elbow','wrist',.040)]:
                        gap=segment_distance(j['head'],j[start+'_'+side],j[end+'_'+side])-.110-radius
                        min_halo_head_gap=min(min_halo_head_gap,gap)
                    min_halo_hand_gap=min(min_halo_hand_gap,segment_distance(j['head'],j['wrist_'+side],j['palm_'+side])-.110-.038)
                    forearm=sub(j['wrist_'+side],j['elbow_'+side]);hand=sub(j['palm_'+side],j['wrist_'+side])
                    cosine=sum(a*b for a,b in zip(forearm,hand))/(norm(forearm)*norm(hand))
                    max_wrist_bend=max(max_wrist_bend,abs(1-cosine))
                    max_hand_error=max(max_hand_error,abs(norm(hand)-.065))
                    max_elbow_step=max(max_elbow_step,norm(sub(j['elbow_'+side],poses[(i-1)%samples]['joints']['elbow_'+side])))
                for prop in p['props']:
                    min_halo_bell_gap=min(min_halo_bell_gap,norm(sub(j['head'],prop['center']))-.110-prop['radius'])
                    lines=prop['horns']+[prop['handle']]
                    for a,b in lines:min_halo_handle_gap=min(min_halo_handle_gap,segment_distance(j['head'],a,b)-.110-.018)
            for a,b,length in EXPECTED_BONES.values():max_bone=max(max_bone,abs(norm(sub(j[a],j[b]))-length))
            min_z=min(min_z,min(v[2] for k,v in j.items() if k!='face'))
            # Literal joint supports (toe/heel/palm/elbow/knee) must match rendered joint positions.
            for k,v in p['contacts'].items():
                if k in j:max_support_joint_error=max(max_support_joint_error,norm(sub(v,j[k])))
            prev=poses[(i-1)%samples]
            # Rolling contacts (roll_*) move along the floor by design; pinned ones may not.
            for k in {c for c in p['contacts'].keys() & prev['contacts'].keys() if not c.startswith('roll_')}:
                max_support_drift=max(max_support_drift,norm(sub(p['contacts'][k],prev['contacts'][k])))
            for prop in p['props']:
                if prop['type']=='kettlebell':
                    grips=prop.get('grips',dict(zip(SIDES,prop['handle'])))
                    if not grips or any(s not in SIDES for s in grips):
                        raise ValueError(f'{name}: invalid kettlebell grip declaration')
                    for s,grip in grips.items():
                        joint=prop.get('grip_joint','wrist')+'_'+s
                        segments=prop.get('horns',[prop['handle']])
                        max_grip=max(max_grip,norm(sub(grip,j[joint])),
                                     min(segment_distance(grip,*segment) for segment in segments))
                    # Cast-iron bells stand on a flat base at 0.8 radius below the centre.
                    min_prop_z=min(min_prop_z,prop['center'][2]-.8*prop['radius'])
                elif prop['type']=='dumbbell':
                    midpoint=[(a+b)/2 for a,b in zip(*prop['handle'])]
                    max_grip=max(max_grip,min(norm(sub(midpoint,j['wrist_'+s])) for s in SIDES))
                    min_prop_z=min(min_prop_z,prop['center'][2]-prop['radius'])
                elif prop['type']=='band':
                    for s,grip in zip(SIDES,prop['points']):max_grip=max(max_grip,norm(sub(grip,j['wrist_'+s])))
            if name in BILATERAL:
                opposite=pose_for(name,(i/samples+.5)%1.)['joints']
                for k,v in j.items():
                    mirrored=(v[0],-v[1],v[2]);other=opposite[mirror_name(k)]
                    mirror=max(mirror,norm(sub(mirrored,other)))
        eps=1e-5;before=pose_for(name,1-eps);zero=pose_for(name,0);after=pose_for(name,eps)
        seam=max_joint_difference(before,after)
        velocity_jump=max(norm(sub([(zero['joints'][k][d]-before['joints'][k][d])/eps for d in range(3)],
                                   [(after['joints'][k][d]-zero['joints'][k][d])/eps for d in range(3)])) for k in zero['joints'])
        prop_seam=0.;prop_velocity=0.
        for pre,mid,post in zip(before['props'],zero['props'],after['props']):
            if 'center' not in mid:continue
            prop_seam=max(prop_seam,norm(sub(pre['center'],post['center'])))
            prop_velocity=max(prop_velocity,norm(tuple((c-2*b+a)/eps for a,b,c in zip(pre['center'],mid['center'],post['center']))))
        row={'id':name,'max_bone_length_error_m':max_bone,'ik_correction_count':len(ik),
             'max_declared_support_drift_m_per_sample':max_support_drift,
             'max_support_to_rendered_joint_error_m':max_support_joint_error,
             'min_joint_center_z_m':min_z,'min_weight_bottom_z_m':None if min_prop_z==100 else min_prop_z,
             'max_grip_error_m':max_grip,'loop_near_seam_displacement_m':seam,
             'loop_velocity_jump_m_per_normalized_cycle':velocity_jump,
             'prop_loop_near_seam_displacement_m':prop_seam,
             'prop_loop_velocity_jump_m_per_normalized_cycle':prop_velocity,
             'bilateral_mirror_error_m':mirror if name in BILATERAL else None,
             'halo_min_head_to_arm_capsule_gap_m':min_halo_head_gap if name=='kb-halo' else None,
             'halo_min_head_to_hand_capsule_gap_m':min_halo_hand_gap if name=='kb-halo' else None,
             'halo_min_head_to_bell_sphere_gap_m':min_halo_bell_gap if name=='kb-halo' else None,
             'halo_min_head_to_handle_capsule_gap_m':min_halo_handle_gap if name=='kb-halo' else None,
             'halo_max_straight_wrist_cosine_error':max_wrist_bend if name=='kb-halo' else None,
             'halo_max_hand_length_error_m':max_hand_error if name=='kb-halo' else None,
             'halo_max_elbow_step_m_per_sample':max_elbow_step if name=='kb-halo' else None}
        failures=[]
        if max_bone>1e-6:failures.append('bone length')
        if ik:failures.append('unreachable target corrections')
        if max_support_drift>1e-6:failures.append('support slides')
        if max_support_joint_error>1e-6:failures.append('support disagrees with joint')
        if min_z < -1e-6:failures.append('joint below floor')
        if min_prop_z < -1e-6:failures.append('weight below floor')
        if max_grip>1e-6:failures.append('grip detaches')
        if seam>.001:failures.append('loop pose jump')
        if velocity_jump>.02:failures.append('loop velocity discontinuity')
        if prop_seam>.001:failures.append('weight loop position jump')
        if prop_velocity>.02:failures.append('weight loop velocity discontinuity')
        if mirror>1e-6:failures.append('asymmetric alternating cycle')
        if min_halo_head_gap < 0:failures.append('halo arm intersects head envelope')
        if min(min_halo_hand_gap,min_halo_bell_gap,min_halo_handle_gap)<0:failures.append('halo hand or equipment intersects head envelope')
        if max_wrist_bend>1e-6 or max_hand_error>1e-6:failures.append('halo wrist bends or hand changes length')
        v2row,v2failures=check_v2(name)
        row.update(v2row);failures+=v2failures
        row['failures']=failures;report['exercises'].append(row)
    report['passed']=all(not r['failures'] for r in report['exercises'])
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output');parser.add_argument('--samples',type=int,default=360)
    args=parser.parse_args();report=validate(args.samples);payload=json.dumps(report,indent=2)+'\n'
    if args.output:
        path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(payload)
        print(f"Geometry checks: {'PASS' if report['passed'] else 'FAIL'} — {len(report['exercises'])} exercises × {args.samples} samples; {path}")
        for row in report['exercises']:
            if row['failures']:print(row['id'],', '.join(row['failures']))
    else:print(payload,end='')
    raise SystemExit(0 if report['passed'] else 1)
