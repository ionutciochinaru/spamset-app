"""Offline-only deterministic stick-person rig. World: x forward, y left, z up (m).

No dependencies. Fixed segment lengths and analytic two-link inverse kinematics.
Authored unreachable targets are reported in pose['qa']['ik_errors']; never hidden.
"""
from math import sin, cos, sqrt, acos, pi

THIGH = 0.44
SHIN = 0.43
UPPER_ARM = 0.295
FOREARM = 0.265
TORSO = 0.43
NECK = 0.105
HEAD = 0.14
HIP_HALF = 0.10
SHOULDER_HALF = 0.19
ANKLE_HEIGHT = 0.085
SIDES = ('l', 'r')

def add(a, b): return tuple(x+y for x,y in zip(a,b))
def sub(a, b): return tuple(x-y for x,y in zip(a,b))
def mul(a, s): return tuple(x*s for x in a)
def dot(a, b): return sum(x*y for x,y in zip(a,b))
def norm(a): return sqrt(dot(a,a))
def unit(a):
    n=norm(a)
    if n < 1e-10: raise ValueError('Cannot normalize zero vector')
    return mul(a, 1/n)
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def lerp(a,b,t): return add(a,mul(sub(b,a),t))
def clamp(t,a=0.,b=1.): return min(b,max(a,t))
def smooth(t):
    t=clamp(t);return t*t*(3-2*t)
def pulse(t): return (1-cos(2*pi*t))/2
def radians(d): return d*pi/180
def side_sign(side): return 1 if side=='l' else -1
def rotate_y(p,a): return (p[0]*cos(a)+p[2]*sin(a),p[1],-p[0]*sin(a)+p[2]*cos(a))

def solve_two_bone(root, target, a, b, pole, errors, name):
    """Circle intersection in plane root/target/pole; keep lengths when clamped.

    Returns (joint, solved_target). Clamps only numerical/unreachable targets and
    emits every meaningful correction. Authoring/QA must reject emitted errors.
    """
    v=sub(target,root);d=norm(v)
    if d < 1e-9: raise ValueError(f'{name}: root and target coincide')
    axis=unit(v);desired=d;d=clamp(d,abs(a-b)+1e-7,a+b-1e-7)
    if abs(desired-d)>1e-5:
        errors.append({'chain':name,'error_m':abs(desired-d),'requested':list(target)})
    target=add(root,mul(axis,d))
    pole_dir=sub(pole,root);normal=sub(pole_dir,mul(axis,dot(pole_dir,axis)))
    if norm(normal)<1e-8:
        trial=(0,1,0) if abs(axis[1])<.9 else (1,0,0)
        normal=cross(axis,trial)
    normal=unit(normal)
    along=(a*a-b*b+d*d)/(2*d)
    height=sqrt(max(0,a*a-along*along))
    return add(add(root,mul(axis,along)),mul(normal,height)),target

class Pose:
    def __init__(self, exercise_id, phase):
        self.id=exercise_id;self.phase=phase%1.;self.j={};self.props=[];self.contacts={};self.errors=[]
        self.view={'azimuth':68,'elevation':10}
        self.up=(0,0,1);self.forward=(1,0,0)
    def torso(self,pelvis,lean=0.,up=None):
        self.up=unit(up) if up is not None else (sin(lean),0,cos(lean))
        self.forward=unit(cross((0,1,0),self.up))
        self.j['pelvis']=tuple(pelvis)
        self.j['chest']=add(pelvis,mul(self.up,TORSO))
        self.j['neck']=add(self.j['chest'],mul(self.up,NECK))
        self.j['head']=add(self.j['neck'],mul(self.up,HEAD))
        for s in SIDES:
            v=side_sign(s)
            self.j['hip_'+s]=add(pelvis,(0,v*HIP_HALF,0))
            self.j['shoulder_'+s]=add(self.j['chest'],(0,v*SHOULDER_HALF,0))
        self.j['face']=add(self.j['head'],mul(self.forward,.075))
        return self
    def foot(self,s,ankle=None,toe=None,pitch=0.,contact=True):
        """Pitch rotates about forefoot. Positive pitch raises heel; toe may lock."""
        toe_from_ankle=rotate_y((.16,0,-ANKLE_HEIGHT),pitch)
        if ankle is None: ankle=sub(toe,toe_from_ankle)
        heel=add(ankle,rotate_y((-.075,0,-ANKLE_HEIGHT),pitch))
        toe=add(ankle,toe_from_ankle)
        self.j['ankle_'+s]=tuple(ankle);self.j['heel_'+s]=heel;self.j['toe_'+s]=toe
        # Re-placing a foot replaces its contacts: a lifted foot leaves no stale floor contact.
        self.contacts.pop('toe_'+s,None);self.contacts.pop('heel_'+s,None)
        if contact:
            self.contacts['toe_'+s]=toe
            if abs(pitch)<1e-7:self.contacts['heel_'+s]=heel
        return ankle
    def leg(self,s,ankle,pole=None):
        root=self.j['hip_'+s]
        pole=pole or add(root,(1,0,0))
        knee,end=solve_two_bone(root,ankle,THIGH,SHIN,pole,self.errors,'leg_'+s)
        self.j['knee_'+s]=knee;self.j['ankle_'+s]=end
        return self
    def straight_leg(self,s,ankle,direction):
        """Useful for aligned plank: ankle -> knee -> hip has exact fixed lengths."""
        self.j['ankle_'+s]=tuple(ankle)
        self.j['knee_'+s]=add(ankle,mul(direction,SHIN))
        self.j['hip_'+s]=add(ankle,mul(direction,SHIN+THIGH))
    def arm(self,s,wrist,pole=None,palm=None,contact=False):
        root=self.j['shoulder_'+s]
        pole=pole or add(root,(-.3,side_sign(s)*.2,-.3))
        elbow,end=solve_two_bone(root,wrist,UPPER_ARM,FOREARM,pole,self.errors,'arm_'+s)
        self.j['elbow_'+s]=elbow;self.j['wrist_'+s]=end
        self.j['palm_'+s]=tuple(palm) if palm is not None else add(end,mul(unit(sub(end,elbow)),.065))
        if contact:self.contacts['palm_'+s]=self.j['palm_'+s]
        return self
    def arm_fk(self,s,shoulder_angle=0.,elbow_flex=0.,outward=0.):
        """Sagittal shoulder angle from down; positive elbow flex curls forwards."""
        sg=side_sign(s);root=self.j['shoulder_'+s]
        u=unit((sin(shoulder_angle),sg*outward,-cos(shoulder_angle)))
        f=unit((sin(shoulder_angle+elbow_flex),sg*outward,-cos(shoulder_angle+elbow_flex)))
        elbow=add(root,mul(u,UPPER_ARM));wrist=add(elbow,mul(f,FOREARM))
        self.j['elbow_'+s]=elbow;self.j['wrist_'+s]=wrist;self.j['palm_'+s]=add(wrist,mul(f,.065))
        return self
    def result(self):
        return {'id':self.id,'phase':self.phase,'joints':{k:list(v) for k,v in self.j.items()},
                'props':self.props,'contacts':{k:list(v) for k,v in self.contacts.items()},'view':self.view,
                'qa':{'ik_errors':self.errors}}

def standing(exercise_id,phase,pelvis=(0,0,.945),lean=0.,foot_y=.15):
    p=Pose(exercise_id,phase).torso(pelvis,lean)
    for s in SIDES:
        ankle=p.foot(s,ankle=(0,side_sign(s)*foot_y,ANKLE_HEIGHT))
        p.leg(s,ankle);p.arm_fk(s,elbow_flex=.08)
    return p

SEGMENTS={
    'pelvis_chest':('pelvis','chest',TORSO),'chest_neck':('chest','neck',NECK),
    'neck_head':('neck','head',HEAD),
    **{f'{part}_{s}':(f'{a}_{s}',f'{b}_{s}',length)
       for s in SIDES for part,a,b,length in [
           ('thigh','hip','knee',THIGH),('shin','knee','ankle',SHIN),
           ('upper_arm','shoulder','elbow',UPPER_ARM),('forearm','elbow','wrist',FOREARM)]}}
