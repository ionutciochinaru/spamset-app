"""Offline original exercise choreography on a constrained stick-person skeleton.

pose_for(exercise_id, phase) takes normalized periodic phase [0,1).
The rig is baked to PNG frames; none of this code is shipped/executed on a watch.
"""
from math import sin, cos, pi, sqrt, asin, atan2
try:
    from .rig import *
except ImportError:
    from rig import *

IDS=['squat','wall-pushup','calf-raise','shoulder-circle','reverse-lunge',
     'pushup','standing-knee','side-step','glute-bridge','bird-dog','plank',
     'sit-stand','seated-knee','kb-deadlift','goblet-squat','db-curl','band-pull']

def held_pulse(phase,low_hold=0.,high_hold=0.):
    """Cosine transitions with explicit bottom/top dwell, preserving the path."""
    phase=phase%1.
    if phase<low_hold/2 or phase>1-low_hold/2:return 0.
    if .5-high_hold/2<=phase<=.5+high_hold/2:return 1.
    local=phase if phase<.5 else 1-phase
    progress=(local-low_hold/2)/(.5-(low_hold+high_hold)/2)
    return (1-cos(pi*progress))/2

def squat(name,phase):
    t=pulse(phase)
    p=standing(name,phase,pelvis=(-.22*t,0,.945-.40*t),lean=radians(38)*t)
    for s in SIDES:p.arm_fk(s,radians(84)*t,elbow_flex=radians(9))
    p.view={'azimuth':64,'elevation':9}
    return p

def pushup(name,phase):
    t=pulse(phase);angle=radians(18.8-10.8*t)
    u=(cos(angle),0,sin(angle));pitch=radians(60)
    p=Pose(name,phase)
    ankles={s:p.foot(s,toe=(-1,side_sign(s)*HIP_HALF,0),pitch=pitch) for s in SIDES}
    center=mul(add(ankles['l'],ankles['r']),.5)
    p.torso(add(center,mul(u,THIGH+SHIN)),up=u)
    for s in SIDES:
        sg=side_sign(s);p.straight_leg(s,ankles[s],u)
        p.arm(s,(.24,sg*.225,.05),pole=add(p.j['shoulder_'+s],(-.4,sg*.3,-.15)),
              palm=(.29,sg*.225,.014),contact=True)
    p.view={'azimuth':73,'elevation':12}
    return p

def calf_raise(name,phase):
    t=held_pulse(phase,high_hold=.12);pitch=radians(26)*t
    p=Pose(name,phase)
    ankles={s:p.foot(s,toe=(.16,side_sign(s)*.15,0),pitch=pitch) for s in SIDES}
    center=mul(add(ankles['l'],ankles['r']),.5)
    p.torso((center[0],0,.945+center[2]-ANKLE_HEIGHT))
    for s in SIDES:p.leg(s,ankles[s]);p.arm_fk(s,elbow_flex=.08)
    p.view={'azimuth':55,'elevation':7}
    return p

def side_step(name,phase):
    segment=int(phase*4)%4;t=phase*4-segment;v=smooth(t)
    positions=[(.13,-.13),(.45,-.13),(.45,.19),(.45,-.13),(.13,-.13)]
    old=positions[segment];new=positions[segment+1]
    ys=[a+(b-a)*v for a,b in zip(old,new)]
    moving=0 if segment in (0,3) else 1
    # Small root shift toward stance foot supplies visible loading while swing clears.
    center=sum(ys)/2 + (-.05 if moving==0 else .05)*sin(pi*t)**2
    p=Pose(name,phase).torso((0,center,.918-.012*sin(pi*t)**2))
    for i,s in enumerate(SIDES):
        z=ANKLE_HEIGHT+(.07*sin(pi*t)**2 if i==moving else 0)
        ankle=p.foot(s,ankle=(0,ys[i],z),contact=i!=moving or t==0.)
        p.leg(s,ankle);p.arm_fk(s,elbow_flex=.12)
    p.view={'azimuth':18,'elevation':8}
    return p

def db_curl(name,phase):
    p=standing(name,phase);flex=radians(10+115*pulse(phase))
    for s in SIDES:
        p.arm_fk(s,shoulder_angle=.025,elbow_flex=flex)
        grip=p.j['wrist_'+s]
        # A real dumbbell (~15 cm handle) in each hand: two separate weights, not one bar.
        p.props.append({'type':'dumbbell','center':list(grip),
            'handle':[list(add(grip,(0,-.075,0))),list(add(grip,(0,.075,0)))],'radius':.055})
    # Front three-quarter: the two dumbbells stand apart instead of lining up.
    p.view={'azimuth':30,'elevation':10}
    return p

def wall_pushup(name,phase):
    angle=radians(7.25+12.75*pulse(phase));u=(sin(angle),0,cos(angle))
    p=Pose(name,phase)
    ankles={s:p.foot(s,ankle=(0,side_sign(s)*HIP_HALF,ANKLE_HEIGHT)) for s in SIDES}
    p.torso(add((0,0,ANKLE_HEIGHT),mul(u,THIGH+SHIN)),up=u)
    for s in SIDES:
        sg=side_sign(s);p.straight_leg(s,ankles[s],u)
        p.arm(s,(.705,sg*.23,1.255),pole=add(p.j['shoulder_'+s],(-.1,sg*.3,-.5)),
              palm=(.73,sg*.23,1.315),contact=True)
    p.props.append({'type':'wall','corners':[[.73,-.42,0],[.73,.42,0],[.73,.42,1.76],[.73,-.42,1.76]]})
    p.view={'azimuth':75,'elevation':7}
    return p

def marching(name,phase):
    active='l' if phase<.5 else 'r';local=(phase*2)%1.;t=pulse(local);sg=side_sign(active)
    p=Pose(name,phase).torso((0,-sg*.045*t,.945))
    angle=radians(64 if name=='march' else 96)*t
    for s in SIDES:
        if s==active:
            hip=p.j['hip_'+s];base_ankle=(0,side_sign(s)*.15,ANKLE_HEIGHT)
            p.leg(s,base_ankle);base_knee=p.j['knee_'+s]
            thigh=rotate_y(sub(base_knee,hip),-angle)
            shin=sub(base_ankle,base_knee)
            shin=rotate_y(shin,atan2(shin[0],-shin[2])*t)
            knee=add(hip,thigh);ankle=add(knee,shin)
            p.j['knee_'+s]=knee;p.foot(s,ankle=ankle,contact=t<1e-9)
        else:
            ankle=p.foot(s,ankle=(0,side_sign(s)*.15,ANKLE_HEIGHT));p.leg(s,ankle)
        swing=radians(20)*t*(-1 if s==active else 1)
        p.arm_fk(s,swing,elbow_flex=radians(24))
    p.view={'azimuth':65,'elevation':8}
    return p

def shoulder_circle(name,phase):
    p=standing(name,phase)
    # A modest ellipse stays readable at 280x156 without turning the relaxed
    # shoulder roll into an arm circle. The clavicle radius remains fixed.
    theta=phase*2*pi;x=.055*cos(theta);z=.065*sin(theta)
    side=sqrt(SHOULDER_HALF**2-x*x-z*z)
    for s in SIDES:
        p.j['shoulder_'+s]=add(p.j['chest'],(x,side_sign(s)*side,z))
        p.arm_fk(s,elbow_flex=.065)
    # A more frontal view keeps the far arm visible beside the broad shirt.
    p.view={'azimuth':60,'elevation':7,'crop_below':1.00}
    return p

def reverse_lunge(name,phase):
    active='l' if phase<.5 else 'r';u=(phase*2)%1.
    if u<.22:
        stride=smooth(u/.22);bend=0.;air=sin(pi*u/.22)**2
    elif u<.44:
        stride=1.;bend=smooth((u-.22)/.22);air=0.
    elif u<.52:
        stride=1.;bend=1.;air=0.
    elif u<.74:
        stride=1.;bend=1-smooth((u-.52)/.22);air=0.
    else:
        stride=1-smooth((u-.74)/.26);bend=0.;air=sin(pi*(u-.74)/.26)**2
    p=Pose(name,phase).torso((-.13*stride,0,.945-.145*stride-.19*bend),lean=radians(10)*bend)
    for s in SIDES:
        if s==active:
            toe=(.16-.68*stride,side_sign(s)*.15,.08*air)
            ankle=p.foot(s,toe=toe,pitch=radians(40)*stride,contact=air<1e-8)
        else:ankle=p.foot(s,ankle=(0,side_sign(s)*.15,ANKLE_HEIGHT))
        p.leg(s,ankle);p.arm_fk(s,.12,elbow_flex=radians(56))
    p.view={'azimuth':64,'elevation':9}
    return p

def glute_bridge(name,phase):
    chest=(-.45,0,.052);foot_x=.50
    d=sqrt((foot_x-chest[0])**2+(ANKLE_HEIGHT-chest[2])**2)
    beta_top=acos((d*d+(TORSO+THIGH)**2-SHIN**2)/(2*d*(TORSO+THIGH)))+asin((ANKLE_HEIGHT-chest[2])/d)
    beta=beta_top*held_pulse(phase,high_hold=.12);u=(cos(beta),0,sin(beta))
    pelvis=add(chest,mul(u,TORSO))
    p=Pose(name,phase).torso(pelvis,up=mul(u,-1))
    # Head and upper back remain supported; cervical orientation is independent of hip extension.
    p.j['neck']=add(chest,(-sqrt(NECK**2-.028**2),0,.028))
    p.j['head']=add(p.j['neck'],(-sqrt(HEAD**2-.020**2),0,.020));p.j['face']=add(p.j['head'],(0,0,.075))
    p.contacts['upper_back']=(chest[0],0,0);p.contacts['head_ground']=(p.j['head'][0],0,0)
    for s in SIDES:
        sg=side_sign(s);ankle=p.foot(s,ankle=(foot_x,sg*HIP_HALF,ANKLE_HEIGHT))
        p.leg(s,ankle,pole=add(p.j['hip_'+s],(0,0,1)))
        wrist=(chest[0]+.551,sg*.21,.030)
        p.arm(s,wrist,pole=add(p.j['shoulder_'+s],(.2,sg*.30,0)),
              palm=(wrist[0]+sqrt(.065**2-.004**2),wrist[1],.026),contact=True)
    p.view={'azimuth':75,'elevation':10}
    return p

def bird_dog(name,phase):
    active_arm='l' if phase<.5 else 'r';active_leg='r' if active_arm=='l' else 'l'
    t=pulse((phase*2)%1.);angle=radians(12);u=(cos(angle),0,sin(angle))
    p=Pose(name,phase).torso((-.35,0,.485),up=u)
    for s in SIDES:
        hip=p.j['hip_'+s]
        if s==active_leg:
            thigh_angle=radians(78)*t;shin_angle=radians(90-12*t)
            knee=add(hip,(-THIGH*sin(thigh_angle),0,-THIGH*cos(thigh_angle)))
            ankle=add(knee,(-SHIN*sin(shin_angle),0,-SHIN*cos(shin_angle)))
            pitch=radians(152-12*t)
        else:
            knee=add(hip,(0,0,-THIGH));ankle=add(knee,(-SHIN,0,0));pitch=radians(152)
            p.contacts['knee_'+s]=knee
        p.j['knee_'+s]=knee;p.foot(s,ankle=ankle,pitch=pitch,contact=False)
        shoulder=p.j['shoulder_'+s];a=radians(10+92*t) if s==active_arm else radians(10)
        direction=(sin(a),0,-cos(a));wrist=add(shoulder,mul(direction,.548))
        hand_direction=unit(lerp((1,0,-.30),u,t if s==active_arm else 0.))
        palm=add(wrist,mul(hand_direction,.065))
        p.arm(s,wrist,pole=add(shoulder,(-.15,side_sign(s)*.05,-.3)),palm=palm,contact=s!=active_arm)
    # Separate the extended forearm from the head while showing both supports.
    p.view={'azimuth':68,'elevation':25}
    return p

def plank(name,phase):
    p=Pose(name,phase)
    ankles={s:p.foot(s,toe=(-1,side_sign(s)*HIP_HALF,0),pitch=radians(60)) for s in SIDES}
    center=mul(add(ankles['l'],ankles['r']),.5)
    angle=asin((.035+UPPER_ARM-center[2])/(THIGH+SHIN+TORSO));u=(cos(angle),0,sin(angle))
    p.torso(add(center,mul(u,THIGH+SHIN)),up=u)
    for s in SIDES:
        p.straight_leg(s,ankles[s],u)
        elbow=add(p.j['shoulder_'+s],(0,0,-UPPER_ARM));wrist=add(elbow,(FOREARM,0,0));palm=add(wrist,(.065,0,0))
        p.j['elbow_'+s]=elbow;p.j['wrist_'+s]=wrist;p.j['palm_'+s]=palm
        p.contacts['elbow_'+s]=elbow;p.contacts['palm_'+s]=palm
    p.view={'azimuth':73,'elevation':10}
    return p

def chair_prop(x=-.27,z=.515):
    rear=x-.21;front=x+.19;w=.25
    seat=[[rear,-w,z],[front,-w,z],[front,w,z],[rear,w,z]]
    legs=[[v,[v[0],v[1],0]] for v in seat]
    back=[[[rear,-w,z],[rear,-w,z+.43]],[[rear,w,z],[rear,w,z+.43]],
          [[rear,-w,z+.40],[rear,w,z+.40]]]
    return {'type':'chair','seat':seat,'legs':legs,'back':back}

def sit_stand(name,phase):
    t=clamp((pulse(phase)-.06)/.94);rise=smooth((t-.30)/.70)
    forward=smooth(t/.30)*(1-rise)
    p=Pose(name,phase).torso((-.27+.41*rise,0,.55+.395*rise),lean=radians(38)*forward)
    for s in SIDES:
        ankle=p.foot(s,ankle=(.14,side_sign(s)*.15,ANKLE_HEIGHT));p.leg(s,ankle)
        p.arm_fk(s,radians(44)*forward,elbow_flex=radians(15))
    p.props.append(chair_prop())
    if rise<1e-8:p.contacts['seat']=(-.27,0,.515)
    p.view={'azimuth':67,'elevation':10}
    return p

def seated_knee(name,phase):
    active='l' if phase<.5 else 'r';t=pulse((phase*2)%1.)
    p=Pose(name,phase).torso((-.27,0,.55));p.props.append(chair_prop());p.contacts['seat']=(-.27,0,.515)
    for s in SIDES:
        ankle=(.14,side_sign(s)*.15,ANKLE_HEIGHT)
        p.leg(s,ankle);hip=p.j['hip_'+s];knee=p.j['knee_'+s]
        if s==active:
            angle=-radians(25)*t
            thigh=rotate_y(sub(knee,hip),angle);shin=rotate_y(sub(ankle,knee),angle)
            knee=add(hip,thigh);ankle=add(knee,shin);p.j['knee_'+s]=knee
        p.foot(s,ankle=ankle,contact=s!=active)
        p.arm_fk(s,.02,elbow_flex=radians(83))
    p.view={'azimuth':44,'elevation':10}
    return p

def kettlebell_prop(center,left,right,radius=.105):
    return {'type':'kettlebell','center':list(center),'handle':[list(left),list(right)],'radius':radius}

def goblet_squat(name,phase):
    p=squat(name,phase)
    center=add(add(p.j['chest'],mul(p.forward,.20)),mul(p.up,-.085))
    grips={s:add(center,(0,side_sign(s)*.085,.13)) for s in SIDES}
    for s in SIDES:p.arm(s,grips[s],pole=add(p.j['shoulder_'+s],(.06,side_sign(s)*.09,-.6)),palm=grips[s])
    p.props.append(kettlebell_prop(center,grips['l'],grips['r'],radius=.095))
    p.view={'azimuth':57,'elevation':10}
    return p

def kb_deadlift(name,phase):
    hinge=1-held_pulse(phase,low_hold=.12);lean=radians(72)*hinge
    standing_progress=1-hinge
    # Keep the load ahead of the knees/thighs instead of pulling it through
    # their plane at lockout. The smooth offset starts at zero on the floor,
    # clears the knee passage early, and finishes only .16 m ahead of shoulders.
    forward=.16*standing_progress+.05*sin(pi*standing_progress)**2
    floor_reach=sqrt(.555**2-(SHOULDER_HALF-.08)**2)
    reach=sqrt(floor_reach**2-forward**2)
    low_height=.105+.13+floor_reach-TORSO*cos(radians(72))
    p=standing(name,phase,pelvis=(-.26*hinge,0,.945-(.945-low_height)*hinge),lean=lean,foot_y=.22)
    load_x=p.j['chest'][0]+forward
    grips={s:(load_x,side_sign(s)*.08,p.j['chest'][2]-reach) for s in SIDES}
    for s in SIDES:p.arm(s,grips[s],pole=add(p.j['shoulder_'+s],(-.15,side_sign(s)*.1,-.2)),palm=grips[s])
    center=(load_x,0,grips['l'][2]-.13)
    p.props.append(kettlebell_prop(center,grips['l'],grips['r']))
    if hinge>.999999:p.contacts['kettlebell']=(center[0],0,0)
    p.view={'azimuth':28,'elevation':10}
    return p

def band_pull(name,phase):
    p=standing(name,phase);angle=radians(78)*pulse(phase)
    for s in SIDES:
        sg=side_sign(s);upper=(cos(angle),sg*sin(angle),0);fore=(cos(angle+.10),sg*sin(angle+.10),0)
        elbow=add(p.j['shoulder_'+s],mul(upper,UPPER_ARM));wrist=add(elbow,mul(fore,FOREARM))
        p.j['elbow_'+s]=elbow;p.j['wrist_'+s]=wrist;p.j['palm_'+s]=wrist
    p.props.append({'type':'band','points':[list(p.j['wrist_l']),list(p.j['wrist_r'])]})
    # Show the forward reach and opening plane more clearly while preserving
    # both planted feet. This is a camera change, not a different pull-apart.
    p.view={'azimuth':30,'elevation':26}
    return p

MOTIONS={'squat':squat,'pushup':pushup,'calf-raise':calf_raise,'side-step':side_step,'db-curl':db_curl,
         'wall-pushup':wall_pushup,'standing-knee':marching,'shoulder-circle':shoulder_circle,
         'reverse-lunge':reverse_lunge,'glute-bridge':glute_bridge,'bird-dog':bird_dog,'plank':plank,
         'sit-stand':sit_stand,'seated-knee':seated_knee,'goblet-squat':goblet_squat,
         'kb-deadlift':kb_deadlift,'band-pull':band_pull}

try:
    from .kettlebell import KB_MOTIONS
except ImportError:
    from kettlebell import KB_MOTIONS
MOTIONS.update(KB_MOTIONS)
IDS.extend(KB_MOTIONS)

try:
    from .stretches import STRETCH_MOTIONS
except ImportError:
    from stretches import STRETCH_MOTIONS
MOTIONS.update(STRETCH_MOTIONS)
IDS.extend(STRETCH_MOTIONS)

try:
    from .pushups import PUSHUP_MOTIONS
except ImportError:
    from pushups import PUSHUP_MOTIONS
MOTIONS.update(PUSHUP_MOTIONS)
IDS.extend(PUSHUP_MOTIONS)

try:
    from .bodyweight_floor import FLOOR_MOTIONS
    from .bodyweight_standing import STANDING_MOTIONS
except ImportError:
    from bodyweight_floor import FLOOR_MOTIONS
    from bodyweight_standing import STANDING_MOTIONS
MOTIONS.update(FLOOR_MOTIONS)
IDS.extend(FLOOR_MOTIONS)
MOTIONS.update(STANDING_MOTIONS)
IDS.extend(STANDING_MOTIONS)

def pose_for(exercise_id,phase):
    phase=float(phase)%1.
    if exercise_id not in MOTIONS: raise ValueError(f'Unimplemented exercise: {exercise_id}')
    return MOTIONS[exercise_id](exercise_id,phase).result()

try:
    from .kb_advanced import ADVANCED_MOTIONS
except ImportError:
    from kb_advanced import ADVANCED_MOTIONS
MOTIONS.update(ADVANCED_MOTIONS)
IDS.extend(ADVANCED_MOTIONS)

# Rig v2: physics-driven motions replace their keyframed versions.
try:
    from .v2.swing import kb_swing as kb_swing_v2, duration as swing_duration
except ImportError:
    from v2.swing import kb_swing as kb_swing_v2, duration as swing_duration
try:
    from .v2.lifts import LIFTS
    from .v2.single_arm import SINGLE_ARM
    from .v2.getup import GETUP
    from .v2.halo import HALO
except ImportError:
    from v2.lifts import LIFTS
    from v2.single_arm import SINGLE_ARM
    from v2.getup import GETUP
    from v2.halo import HALO
MOTIONS['kb-swing'] = kb_swing_v2
V2_LIFTS = {**LIFTS, **SINGLE_ARM, GETUP.name: GETUP, HALO.name: HALO}
MOTIONS.update(V2_LIFTS)
try:
    from .v2.spamset import build as _build_spamset
except ImportError:
    from v2.spamset import build as _build_spamset
# Every other Spamset exercise: its legacy motion wrapped for balance and arm clearance.
SPAMSET_V2 = _build_spamset(MOTIONS, {'kb-swing', *V2_LIFTS})
V2_LIFTS = {**V2_LIFTS, **SPAMSET_V2}
MOTIONS.update(SPAMSET_V2)
V2_MOTIONS = {'kb-swing', *V2_LIFTS}
# Loop length in seconds for motions whose timing comes from simulation or v2 authoring.
DURATIONS = {'kb-swing': swing_duration, **{name: (lambda d=lift.duration: d) for name, lift in V2_LIFTS.items()}}
# Intended contacts per motion: (pair substring, tolerance m).
_GOBLET = {'bell0|forearm': .02, 'bell0|hand': .02}
ALLOWED_CONTACT = {
    'kb-swing': {'forearm_l|thigh_l': .025, 'forearm_r|thigh_r': .025},
    # Forearms and hands hug the bell in goblet holds and the halo.
    'goblet-squat': _GOBLET, 'kb-reverse-lunge': _GOBLET, 'kb-side-lunge': _GOBLET, 'kb-halo': _GOBLET,
    # A hanging bell rests against the outer thigh.
    'kb-side-bend': {'bell0|thigh_l': .02, 'hand_l|thigh_l': .02, 'forearm_l|thigh_l': .01},
    # Arms hang long with the forearms and bell against the front of the thighs.
    'kb-curl': {**_GOBLET, 'forearm_l|thigh_l': .02, 'forearm_r|thigh_r': .02, 'bell0|thigh_l': .02, 'bell0|thigh_r': .02},
    # The bell rides up against the belly in the upright row.
    'kb-upright-row': {'bell0|torso': .02},
    # The free hand rests on the front thigh in the staggered row.
    'kb-bent-row': {'hand_r|thigh_r': .02, 'forearm_r|thigh_r': .02, 'bell0|thigh_l': .01},
    # Forearm brushes the belly and the inner thigh at the hike (long arm, high hike).
    'kb-clean': {'forearm_l|torso': .01, 'forearm_l|thigh_l': .025, 'upper_arm_l|thigh_l': .01},
    'kb-snatch': {'forearm_l|torso': .01, 'forearm_l|thigh_l': .025, 'upper_arm_l|thigh_l': .015},
    # Hanging arms rest against the front of the thighs at lockout.
    # ... and the arms brush the inner thighs at the bottom (arms inside the knees).
    # Spamset bodyweight moves whose technique presses body parts together (the drawn
    # limbs are thick, so touching surfaces overlap by a few centimetres).
    # Knee drawn up to the elbow on each side.
    'spiderman-pushup': {'upper_arm_l|thigh_l': .025, 'upper_arm_r|thigh_r': .025},
    # Feet stacked: the legs lie against each other.
    'stacked-pushup': {'thigh_l|thigh_r': .04, 'shin_l|shin_r': .04, 'shin_l|thigh_r': .03, 'shin_r|thigh_l': .03},
    # Knees together, rolled side to side.
    'reclined-twist': {'shin_l|shin_r': .03, 'thigh_l|thigh_r': .03},
    # The hand wraps the ankle and pulls the heel toward the bottom.
    # Both hands rest on the straight front thigh.
    'hamstring-stretch': {'hand_l|thigh_l': .01, 'hand_r|thigh_l': .01, 'forearm_l|thigh_l': .01, 'forearm_r|thigh_l': .01,
                          'hand_r|thigh_r': .01, 'hand_l|thigh_r': .01},
    # Knees stay together.
    'quad-stretch': {'hand_l|shin_l': .065, 'hand_r|shin_r': .065, 'forearm_l|shin_l': .03, 'forearm_r|shin_r': .03,
                     'thigh_l|thigh_r': .015},
    # The free hand presses the straight arm across the chest.
    'cross-body-shoulder': {'forearm_l|forearm_r': .03, 'hand_l|forearm_r': .02, 'hand_r|forearm_l': .02},
    'kb-deadlift': {'forearm_l|thigh_l': .02, 'forearm_r|thigh_r': .02, 'hand_l|thigh_l': .02, 'hand_r|thigh_r': .02,
                    'upper_arm_l|thigh_l': .02, 'upper_arm_r|thigh_r': .02},
}
