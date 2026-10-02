"""Offline kettlebell choreography on the existing fixed-length stick rig.

Exact paths/cameras are production choices. Source-backed variants and coaching
cues live in docs/animation-review/kettlebell-research.md. No watch-side code.
"""
from math import sin, cos, pi, sqrt
try:
    from .rig import *
except ImportError:
    from rig import *


def bell(p, center, left, right, radius=.095, grips=None):
    p.props.append({'type':'kettlebell','center':list(center),
                    'handle':[list(left),list(right)],'radius':radius,
                    'grips':{side:list(point) for side,point in (grips or {
                        'l':p.j['wrist_l'],'r':p.j['wrist_r']}).items()}})


def bilateral_grip(p, center, half_width=.07, pole=(-.20,.22,-.22)):
    grips={s:add(center,(0,side_sign(s)*half_width,0)) for s in SIDES}
    for s in SIDES:
        p.arm(s,grips[s],pole=add(p.j['shoulder_'+s],
              (pole[0],side_sign(s)*pole[1],pole[2])),palm=grips[s])
    return grips


def goblet(p):
    center=add(add(p.j['chest'],mul(p.forward,.20)),mul(p.up,-.085))
    grips={s:add(center,(0,side_sign(s)*.085,.13)) for s in SIDES}
    for s in SIDES:
        p.arm(s,grips[s],pole=add(p.j['shoulder_'+s],(.06,side_sign(s)*.09,-.6)),palm=grips[s])
    bell(p,center,grips['l'],grips['r'])
    return p


def kb_swing(name,phase):
    # Hips finish opening before the bell floats toward chest height; the
    # arms retain their long reach instead of curling or pressing the load.
    lift=pulse(phase);hinge=1-smooth(min(1.,lift/.75))
    p=standing(name,phase,pelvis=(-.20*hinge,0,.945-.17*hinge),
               lean=radians(65)*hinge,foot_y=.22)
    angle=radians(-25+105*lift);direction=(sin(angle),0,-cos(angle))
    reach=sqrt(.555**2-(SHOULDER_HALF-.07)**2)
    grip_center=add(p.j['chest'],mul(direction,reach))
    grips=bilateral_grip(p,grip_center,pole=(-.18,.12,-.25))
    center=add(grip_center,mul(direction,.13))
    bell(p,center,grips['l'],grips['r'])
    p.view={'azimuth':32,'elevation':12}
    return p


def kb_reverse_lunge(name,phase):
    # Reuse the accepted step, planted front foot, lowering and return.
    try:
        from .motions import reverse_lunge
    except ImportError:
        from motions import reverse_lunge
    p=goblet(reverse_lunge(name,phase));p.view={'azimuth':58,'elevation':12}
    return p


def kb_upright_row(name,phase):
    p=standing(name,phase,foot_y=.18);t=pulse(phase)
    lower=p.j['chest'][2]-sqrt(.555**2-.20**2-(SHOULDER_HALF-.065)**2)
    grip_center=(.20,0,lower+(1.30-lower)*t)
    grips=bilateral_grip(p,grip_center,.065,pole=(-.06,.42,.12))
    bell(p,add(grip_center,(0,0,-.13)),grips['l'],grips['r'])
    p.view={'azimuth':26,'elevation':12}
    return p


def kb_bent_row(name,phase):
    p=standing(name,phase,pelvis=(-.16,0,.79),lean=radians(55),foot_y=.22)
    t=pulse(phase);reach=sqrt(.55**2-.045**2-(SHOULDER_HALF-.065)**2)
    start=(p.j['chest'][0]+.045,0,p.j['chest'][2]-reach)
    grip_center=lerp(start,(.13,0,.86),t)
    grips=bilateral_grip(p,grip_center,.065,pole=(-.38,.30,.15))
    bell(p,add(grip_center,(0,0,-.13)),grips['l'],grips['r'])
    p.view={'azimuth':64,'elevation':13}
    return p


def kb_side_lunge(name,phase):
    active='l' if phase<.5 else 'r';t=pulse((phase*2)%1);sg=side_sign(active)
    p=Pose(name,phase).torso((-.12*t,sg*.24*t,.89-.16*t),lean=radians(15)*t)
    for s in SIDES:
        ankle=p.foot(s,ankle=(0,side_sign(s)*.42,ANKLE_HEIGHT))
        p.leg(s,ankle)
    goblet(p);p.view={'azimuth':18,'elevation':10}
    return p


def transfer_phase(phase):
    """Each half-loop: center handoff, take load, one rep, return to center."""
    side='l' if phase<.5 else 'r';local=(phase*2)%1
    spread=smooth((local-.04)/.14)*(1-smooth((local-.82)/.14))
    action=pulse(clamp((local-.18)/.64)) if .18<=local<=.82 else 0.
    return side,local,spread,action


def single_with_transfer(p,side,spread,desired,rest):
    # Transfer at a shared stationary handle. The receiving hand slides from
    # an end toward the center while taking the load; the other hand releases.
    handoff=(.27,0,.95);sg=side_sign(side)
    handle_center=lerp(handoff,desired,spread)
    # Pass in front of the thigh while changing hands, not diagonally through
    # the pant leg. The arc vanishes at both endpoints and during the rep.
    handle_center=add(handle_center,(.08*sin(pi*spread),0,0))
    active=add(handle_center,(0,sg*.065*(1-spread),0))
    opposite='r' if side=='l' else 'l'
    free=lerp(add(handoff,(0,-sg*.065,0)),rest,spread)
    elbows={s:p.j['elbow_'+s] for s in SIDES}
    for s,wrist in [(side,active),(opposite,free)]:
        # Use the authored FK elbow as the pole. At full spread this exactly
        # preserves the fixed upper arm during a curl, including transitions.
        p.arm(s,wrist,pole=elbows[s],palm=wrist)
    handle=[add(handle_center,(0,.075,0)),add(handle_center,(0,-.075,0))]
    grips={side:active}
    if spread<1e-9:grips[opposite]=free
    bell(p,add(handle_center,(0,0,-.13)),*handle,grips=grips)


def kb_side_bend(name,phase):
    side,local,spread,action=transfer_phase(phase);sg=side_sign(side)
    angle=sg*radians(14)*action
    up=(0,sin(angle),cos(angle));lateral=(0,cos(angle),-sin(angle))
    p=Pose(name,phase).torso((0,0,.945),up=up)
    # Level planted pelvis, tilted shoulder girdle perpendicular to the trunk.
    for s in SIDES:
        p.j['shoulder_'+s]=add(p.j['chest'],mul(lateral,side_sign(s)*SHOULDER_HALF))
        ankle=p.foot(s,ankle=(0,side_sign(s)*.18,ANKLE_HEIGHT));p.leg(s,ankle)
        p.arm_fk(s,shoulder_angle=.12,elbow_flex=.065,outward=.30)
    desired=p.j['wrist_'+side];opposite='r' if side=='l' else 'l'
    single_with_transfer(p,side,spread,desired,p.j['wrist_'+opposite])
    p.view={'azimuth':12,'elevation':8}
    return p


def kb_curl(name,phase):
    side,local,spread,action=transfer_phase(phase)
    p=standing(name,phase,foot_y=.18)
    for s in SIDES:
        p.arm_fk(s,shoulder_angle=.12,elbow_flex=radians(10+105*action) if s==side else radians(10),outward=.30)
    opposite='r' if side=='l' else 'l'
    single_with_transfer(p,side,spread,p.j['wrist_'+side],p.j['wrist_'+opposite])
    p.view={'azimuth':72,'elevation':10}
    return p


# Nine anatomical checkpoints guide each orbit; the renderer samples the
# smooth curve at 16 fps. These are production coordinates, not prescribed ROM.
_HALO_POLES = [
    ((.13,.30,1.10),(.13,-.30,1.10)),
    ((.10,.40,1.42),(.40,-.35,1.60)),
    ((.00,.44,1.55),(.22,-.50,1.85)),
    ((.02,.36,1.72),(-.15,-.40,1.85)),
    ((.04,.30,1.77),(.04,-.30,1.77)),
    ((-.15,.40,1.85),(.02,-.36,1.72)),
    ((.22,.50,1.85),(.00,-.44,1.55)),
    ((.40,.35,1.60),(.10,-.40,1.42)),
    ((.13,.30,1.10),(.13,-.30,1.10)),
]


def _halo_checkpoint(values, t):
    # Catmull-Rom preserves authored poses with continuous first derivatives.
    position=clamp(t)*8;index=min(7,int(position));u=position-index
    a,b,c,d=[values[max(0,min(8,k))] for k in (index-1,index,index+1,index+2)]
    return tuple(.5*((2*y)+(-x+z)*u+(2*x-5*y+4*z-w)*u*u+
                     (-x+3*y-3*z+w)*u*u*u) for x,y,z,w in zip(a,b,c,d))


def kb_halo(name,phase):
    local=(phase*2)%1;direction=1 if phase<.5 else -1
    progress=smooth((local-.025)/.95);theta=2*pi*progress
    p=standing(name,phase,foot_y=.18)
    around=(1-cos(theta))/2
    elevation=.070*smooth(min(1.,around/.35))
    for s in SIDES:
        p.j['shoulder_'+s]=add(p.j['chest'],(0,side_sign(s)*sqrt(SHOULDER_HALF**2-elevation**2),elevation))
    front=max(0.,cos(theta))**2   # front reset: bell at the chin, not over the face
    center=(.29*cos(theta)+.06*sin(theta)**2-.04*front,.20*sin(theta),1.49+.12*around+.16*sin(theta)**2-.08*front)
    # Base up in front, rearward at BOTH sides, down behind. The horn axis
    # rolls so the cross-body hand passes above the crown at each side.
    tilt=pi*around;roll=-pi/4*sin(theta)
    base=(-sin(tilt),0,cos(tilt))
    across=(sin(roll)*cos(tilt),cos(roll),sin(roll)*sin(tilt))
    handle_center=sub(center,mul(base,.145))
    handle=[add(handle_center,mul(across,sg*.067)) for sg in (1,-1)]
    attachments=[add(sub(center,mul(base,.035)),mul(across,sg*.056)) for sg in (1,-1)]
    # Each palm wraps the middle of its horn, never the top crossbar.
    grips={s:lerp(attachments[i],handle[i],.62) for i,s in enumerate(SIDES)}
    def mirror(point):return (point[0],point[1]*direction,point[2])
    center=mirror(center);handle=list(map(mirror,handle));attachments=list(map(mirror,attachments))
    mirrored_grips={}
    for i,s in enumerate(SIDES):
        source=i if direction>0 else 1-i
        grip=mirror(grips[SIDES[source]])
        pole=mirror(_halo_checkpoint([row[source] for row in _HALO_POLES],progress))
        # Solve to the palm with a rigid 65 mm hand continuing the forearm.
        # Deriving wrist from this chain guarantees a neutral wrist in 3D.
        elbow,palm=solve_two_bone(p.j['shoulder_'+s],grip,UPPER_ARM,FOREARM+.065,
                                 pole,p.errors,'halo_'+s)
        wrist=add(elbow,mul(unit(sub(palm,elbow)),FOREARM))
        p.j['elbow_'+s]=elbow;p.j['wrist_'+s]=wrist;p.j['palm_'+s]=palm
        mirrored_grips[s]=grip
    p.props.append({'type':'kettlebell','center':list(center),'radius':.090,
        'handle':[list(v) for v in handle],
        'horns':[[list(a),list(b)] for a,b in zip(attachments,handle)],
        'grip_joint':'palm','grips':{s:list(v) for s,v in mirrored_grips.items()},
        'grip_style':'horns'})
    p.view={'azimuth':38,'elevation':12,'local_arm_depth':True,'crop_below':.96}
    return p


KB_MOTIONS={'kb-swing':kb_swing,'kb-reverse-lunge':kb_reverse_lunge,
            'kb-upright-row':kb_upright_row,'kb-bent-row':kb_bent_row,
            'kb-side-lunge':kb_side_lunge,'kb-side-bend':kb_side_bend,
            'kb-curl':kb_curl,'kb-halo':kb_halo}
