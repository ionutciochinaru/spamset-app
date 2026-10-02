"""Offline, depth-sorted stick figures. Only the resulting PNGs run on the watch.

Pillow performs antialiasing and palette encoding. The camera is fitted once to
the complete excursion, never independently per frame. No downloaded art.
"""
from __future__ import annotations

import json
from math import cos, sin, radians, hypot, sqrt, pi
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT, SS = 280, 156, 4
PALETTE = json.loads((Path(__file__).resolve().parents[2] / 'design/visual-tokens.json').read_text())['colors']
BLACK = PALETTE['bg']
INK = PALETTE['text']
FAR = '#8e9186'
PANTS = '#bcc0ae'
PANTS_FAR = '#7f887a'
CUFF = '#7f887a'
CUFF_FAR = '#586152'
ACCENT = PALETTE['accent']
PROP = '#aaa99f'


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def mix(a, b, t):
    return tuple(x+(y-x)*t for x,y in zip(a,b))


def unit(vector):
    length=sqrt(dot(vector,vector))
    return tuple(v/length for v in vector)


def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])


def convex_hull(points):
    """Projected flat garment outline; no shaded anatomical volumes."""
    points=sorted(set(points))
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower=[];upper=[]
    for p in points:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]


class Camera:
    def __init__(self, poses, view):
        az, el = radians(view.get('azimuth', 65)), radians(view.get('elevation', 8))
        self.depth = (cos(az)*cos(el), sin(az)*cos(el), sin(el))
        self.right = (sin(az), -cos(az), 0)
        self.up = (-cos(az)*sin(el), -sin(az)*sin(el), cos(el))
        # The camera-side limbs get the bright near tone. Decide from the body's
        # actual depth over the clip: prone poses put the person's left at -y.
        lean = sum(dot(pose['joints'][f'{part}_l'], self.depth)-dot(pose['joints'][f'{part}_r'], self.depth)
                   for pose in poses for part in ('hip', 'shoulder') if f'{part}_l' in pose['joints'])
        self.near = ('l' if sin(az) >= 0 else 'r') if abs(lean) < 1e-6 else ('l' if lean > 0 else 'r')
        self.crop_below = view.get('crop_below', -1e9)
        support = [p for pose in poses for p in pose['joints'].values() if p[2] < .13]
        for pose in poses:
            support += [p for p in pose.get('contacts',{}).values() if p[2] < .13]
            for prop in pose.get('props',[]):
                support += [p for segment in prop.get('legs',[]) for p in segment if p[2] < .13]
        self.ground = None
        if support and self.crop_below < 0:
            x0,x1=min(p[0] for p in support)-.13,max(p[0] for p in support)+.13
            y0,y1=min(p[1] for p in support)-.13,max(p[1] for p in support)+.13
            self.ground=[(x0,y0,0),(x1,y0,0),(x1,y1,0),(x0,y1,0)]
        points = []
        for pose in poses:
            points += list(pose['joints'].values())
            for prop in pose.get('props', []):
                points += prop.get('corners', []) + prop.get('seat', []) + prop.get('points', [])
                points += [p for line in prop.get('legs', []) + prop.get('back', []) + prop.get('segments', []) for p in line]
                if 'center' in prop:
                    c = prop['center']; radius = prop.get('radius', .1)
                    points += [(c[0]+dx*radius, c[1]+dy*radius, c[2]+dz*radius)
                               for dx in [-1, 1] for dy in [-1, 1] for dz in [-1, 1]]
                points += prop.get('handle', [])
        # Include the actual lower cut through the limbs in a focused halo view.
        # Filtering out knees alone would fit to the pelvis and clip the pants.
        if view.get('local_arm_depth'):
            for pose in poses:
                j=pose['joints']
                for start,end in [('pelvis','chest'),('hip_l','knee_l'),('hip_r','knee_r')]:
                    a,b=j[start],j[end]
                    if (a[2]-self.crop_below)*(b[2]-self.crop_below)<0:
                        points.append(mix(a,b,(self.crop_below-a[2])/(b[2]-a[2])))
        points += self.ground or []
        points = [p for p in points if p[2] >= self.crop_below]
        xy = [(dot(p, self.right), dot(p, self.up)) for p in points]
        lowx, highx = min(p[0] for p in xy)-.10, max(p[0] for p in xy)+.10
        lowy, highy = min(p[1] for p in xy)-.065, max(p[1] for p in xy)+.115
        self.scale = min((WIDTH-22)/(highx-lowx), (HEIGHT-18)/(highy-lowy))
        self.cx, self.cy = (lowx+highx)/2, (lowy+highy)/2

    def point(self, p):
        return ((WIDTH/2+(dot(p, self.right)-self.cx)*self.scale)*SS,
                (HEIGHT/2-(dot(p, self.up)-self.cy)*self.scale)*SS)


def draw_frame(pose, camera):
    canvas = Image.new('RGB', (WIDTH*SS, HEIGHT*SS), BLACK)
    d = ImageDraw.Draw(canvas)
    queued = []
    j = pose['joints']

    def stroke(points, color, width, outline=False):
        pts = [camera.point(p) for p in points]
        widths = list(width) if isinstance(width, (list, tuple)) else [width]*len(pts)
        if outline:
            stroke(points, BLACK, [w+.012 for w in widths])
        radii = [max(SS/2, w*camera.scale*SS/2) for w in widths]
        # One continuous silhouette, with a gentle taper toward wrists/ankles.
        # Outline the entire chain before filling it so joins remain connected.
        for (a,b,ra,rb) in zip(pts,pts[1:],radii,radii[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1]
            length=hypot(dx,dy)
            if length < 1e-6: continue
            nx,ny=-dy/length,dx/length
            d.polygon([(a[0]+nx*ra,a[1]+ny*ra),(b[0]+nx*rb,b[1]+ny*rb),
                       (b[0]-nx*rb,b[1]-ny*rb),(a[0]-nx*ra,a[1]-ny*ra)],fill=color)
        for (x,y),r in zip(pts,radii):
            d.ellipse((x-r,y-r,x+r,y+r), fill=color)

    def line(points, color, width, outline=False, offset=0, details=()):
        widths = list(width) if isinstance(width, (list, tuple)) else [width]*len(points)
        def paint(points,width):
            stroke(points,color,width,outline)
            for p,c,w in details:
                if min(v[2] for v in p)>=camera.crop_below:stroke(p,c,w)
        if min(p[2] for p in points) < camera.crop_below:
            chains=[];chain=[];chain_widths=[]
            for a,b,wa,wb in zip(points,points[1:],widths,widths[1:]):
                if max(a[2],b[2]) < camera.crop_below:
                    if chain:chains.append((chain,chain_widths));chain=[];chain_widths=[]
                    continue
                aa,bb=a,b
                w1,w2=wa,wb
                if a[2] < camera.crop_below:
                    t=(camera.crop_below-a[2])/(b[2]-a[2]);aa=tuple(x+t*(y-x) for x,y in zip(a,b))
                    w1=wa+t*(wb-wa)
                if b[2] < camera.crop_below:
                    t=(camera.crop_below-a[2])/(b[2]-a[2]);bb=tuple(x+t*(y-x) for x,y in zip(a,b))
                    w2=wa+t*(wb-wa)
                if chain and sum((x-y)**2 for x,y in zip(chain[-1],aa))<1e-12:
                    chain.append(bb);chain_widths.append(w2)
                else:
                    if chain:chains.append((chain,chain_widths))
                    chain=[aa,bb];chain_widths=[w1,w2]
            if chain:chains.append((chain,chain_widths))
            for path,weights in chains:
                queued.append((sum(dot(p,camera.depth) for p in path)/len(path)+offset,
                    lambda points=path,width=weights: paint(points,width)))
            return
        queued.append((sum(dot(p,camera.depth) for p in points)/len(points)+offset,
                       lambda points=points,width=width: paint(points,width)))

    def local_line(points,color,width,outline=True,offset=0):
        # Split at the head depth plane, retaining a continuous silhouette
        # on each side. Whole-arm means hide near wrists; per-bone outlines
        # leave artificial black seams at elbows and shoulder tapers.
        widths=list(width) if isinstance(width,(list,tuple)) else [width]*len(points)
        plane=dot(j['head'],camera.depth)
        chain=[points[0]];weights=[widths[0]]
        for a,b,wa,wb in zip(points,points[1:],widths,widths[1:]):
            da,db=dot(a,camera.depth)-plane,dot(b,camera.depth)-plane
            if da*db<0:
                t=da/(da-db);middle=mix(a,b,t);wm=wa+(wb-wa)*t
                chain.append(middle);weights.append(wm)
                line(chain,color,weights,outline,offset)
                chain=[middle];weights=[wm]
            chain.append(b);weights.append(wb)
        line(chain,color,weights,outline,offset)

    def ball(point, color, radius, outline=False):
        def draw():
            x,y = camera.point(point); r=radius*camera.scale*SS
            if outline:
                d.ellipse((x-r-SS,y-r-SS,x+r+SS,y+r+SS), fill=BLACK)
            d.ellipse((x-r,y-r,x+r,y+r), fill=color)
        queued.append((dot(point,camera.depth),draw))

    def garment(points,color,details=(),floor=None,soften=0.):
        # Flat silhouettes keep the original character's graphic personality.
        # Depth is used only for the existing painter order.
        cut=max(camera.crop_below,floor) if floor is not None else camera.crop_below
        if min(p[2] for p in points)<cut:
            clipped=[p for p in points if p[2]>=cut]
            for index,a in enumerate(points):
                for b in points[index+1:]:
                    if (a[2]-cut)*(b[2]-cut)<0:
                        clipped.append(mix(a,b,(cut-a[2])/(b[2]-a[2])))
            points=clipped
        if len(points)<3:return
        def draw():
            polygon=convex_hull([camera.point(p) for p in points])
            if soften:
                for _ in range(2):
                    polygon=[q for a,b in zip(polygon,polygon[1:]+polygon[:1])
                             for q in [mix(a,b,soften),mix(a,b,1-soften)]]
            d.polygon(polygon,fill=color)
            d.line(polygon+[polygon[0]],fill=BLACK,width=max(1,round(.009*camera.scale*SS)),joint='curve')
            for p,c,w in details:
                if min(v[2] for v in p)>=camera.crop_below:stroke(p,c,w)
        queued.append((sum(dot(p,camera.depth) for p in points)/len(points),draw))

    # A projected plane shares the same world space as feet and palms. A flat
    # screen-space line falsely makes far contacts appear to float.
    if camera.ground:
        d.polygon([camera.point(p) for p in camera.ground],fill='#191917')
        for point in pose.get('contacts',{}).values():
            if point[2] > .13: continue
            ellipse=[(point[0]+.07*cos(i*3.141592653589793/12),
                      point[1]+.045*sin(i*3.141592653589793/12),0) for i in range(24)]
            d.polygon([camera.point(p) for p in ellipse],fill='#30332b')

    for prop in pose.get('props', []):
        kind = prop['type']
        if kind == 'wall':
            corners=prop['corners']
            for a,b in zip(corners,corners[1:]+corners[:1]): line([a,b], '#6b6a62', .025)
        elif kind == 'chair':
            seat=prop['seat']
            for a,b in zip(seat,seat[1:]+seat[:1]): line([a,b],PROP,.028)
            for segment in prop.get('legs', [])+prop.get('back', []): line(segment,'#838279',.026)
        elif kind == 'lines':
            # P18 gear (pull-up bar, doorframe, table): plain structural strokes.
            for segment in prop['segments']: line(segment,prop.get('color',PROP),prop.get('width',.03))
        elif kind == 'band':
            # Orange equipment stays identifiable when it approaches an ivory
            # forearm at the fully open pose.
            line(prop['points'],ACCENT,.025,True, .008)
        elif kind in ('kettlebell','dumbbell'):
            center=prop['center']; handle=prop.get('handle', [])
            if kind == 'kettlebell':
                if handle:
                    # A bell has sloped shoulders below an open handle, rather
                    # than a sphere swallowing a tiny triangle at the wrists.
                    # Keep its body inside the authored radius/clearance envelope.
                    middle=mix(*handle,.5)
                    axis=unit(tuple(a-b for a,b in zip(middle,center)))
                    across=unit(tuple(a-b for a,b in zip(handle[0],handle[1])))
                    depth=unit(cross(axis,across));radius=prop.get('radius',.10)
                    body=[]
                    for height,width in [(-.99,.14),(-.90,.43),(-.50,.86),(0,.98),(.40,.86),(.64,.50)]:
                        for step in range(24):
                            angle=2*pi*step/24
                            body.append(tuple(center[i]+radius*(height*axis[i]+width*(cos(angle)*across[i]+sin(angle)*depth[i])) for i in range(3)))
                    garment(body,'#b4b1a6',soften=.08)
                    attachments=[tuple(center[i]+radius*(.4*axis[i]+sign*.64*across[i]) for i in range(3)) for sign in [1,-1]]
                    if prop.get('grip_style')=='horns':
                        attachments=[horn[0] for horn in prop['horns']]
                        local_line([attachments[0],handle[0],handle[1],attachments[1]],PROP,.024,True)
                    else:line([attachments[0],handle[0],handle[1],attachments[1]],INK,.024,True)
                else:ball(center,'#b4b1a6',prop.get('radius',.10),True)
            else:
                if handle:
                    # Round plates on the handle axis: solid discs rather than flat bars.
                    line(handle,PROP,.04,True)
                    axis=unit(tuple(b-a for a,b in zip(handle[0],handle[1])))
                    helper=(0,0,1) if abs(axis[2])<.9 else (1,0,0)
                    e1=unit(cross(axis,helper));e2=cross(axis,e1)
                    for end,sign in ((handle[0],-1),(handle[1],1)):
                        disc=[]
                        for offset in (-.028,.028):
                            base=tuple(end[i]+axis[i]*sign*.01+axis[i]*offset for i in range(3))
                            for step in range(20):
                                a=2*pi*step/20
                                disc.append(tuple(base[i]+.064*(cos(a)*e1[i]+sin(a)*e2[i]) for i in range(3)))
                        garment(disc,ACCENT,soften=.05)
                else: ball(center,ACCENT,.055,True)

    up=tuple(b-a for a,b in zip(j['pelvis'],j['chest']))
    size=sqrt(dot(up,up));up=tuple(v/size for v in up)
    sideways=unit(tuple(a-b for a,b in zip(j['shoulder_l'],j['shoulder_r'])))
    forward=unit(cross(sideways,up))
    def offset(p,side=0,along=0,front=0):
        return tuple(p[i]+side*sideways[i]+along*up[i]+front*forward[i] for i in range(3))

    # The requested "dorito": broad orange shoulders narrowing to the waist.
    # A shallow depth gives the same clear taper in side-view floor exercises.
    shirt=[]
    for front in [-1,1]:
        shirt.extend([offset(j['chest'],side=.050,along=.080,front=.055*front),
                      offset(j['chest'],side=-.050,along=.080,front=.055*front),
                      offset(j['shoulder_l'],side=-.018,along=.010,front=.076*front),
                      offset(j['shoulder_r'],side=.018,along=.010,front=.076*front),
                      offset(j['pelvis'],side=.065,along=.020,front=.043*front),
                      offset(j['pelvis'],side=-.065,along=.020,front=.043*front)])
    if 'spine_mid' in j:
        # Articulated two-part spine (P18 stretches): one continuous tapered
        # torso through pelvis, mid-back and chest, so it can round or arch.
        # A convex shirt hull cannot show an arch. Absent from earlier clips.
        line([j['pelvis'],j['spine_mid'],j['chest']],ACCENT,[.135,.150,.175],True)
        line([j['shoulder_l'],j['shoulder_r']],ACCENT,.10,False)
    else:
        garment(shirt,ACCENT,floor=.012,soften=.12)
    # Stop inside the lower jaw; a full outlined neck through the head could
    # paint a false facial line when the figure lies on its back.
    if pose.get('view',{}).get('still_neck'):
        # P18 neck work: the neck stays put and only the skull turns on top of it.
        top=tuple(j['neck'][i]+(j['neck'][i]-j['chest'][i])*.25 for i in range(3))
        line([mix(j['chest'],j['neck'],.66),top],INK,.048,False)
    else:
        line([mix(j['chest'],j['neck'],.66),mix(j['neck'],j['head'],.36)],INK,.048,False)

    # Join the two pant legs at the waist only. A separate extruded pelvis
    # plate created a central protrusion during steps and has been removed.
    waistband=[offset(j['hip_l'],along=.012),offset(j['hip_r'],along=.012)]
    line(waistband,PANTS,.070,False)
    for side in ['l','r']:
        color = INK if side == camera.near else FAR
        pants_color = PANTS if side == camera.near else PANTS_FAR
        hip,knee,ankle=[j[f'{name}_{side}'] for name in ('hip','knee','ankle')]
        cuff_start,cuff_end=mix(ankle,knee,.20),mix(ankle,knee,.11)
        cuff=([cuff_start,cuff_end],CUFF if side==camera.near else CUFF_FAR,[.088,.079])
        leg=[hip,mix(hip,knee,.38),knee,cuff_end]
        widths=[min(w,max(.060,2*p[2]-.012)) for p,w in zip(leg,[.140,.146,.108,.079])]
        line(leg,pants_color,widths,True,details=[cuff])
        # Strong upper arms taper through the elbow into slender forearms.
        shoulder,elbow,wrist=[j[f'{name}_{side}'] for name in ('shoulder','elbow','wrist')]
        arm_line=local_line if pose.get('view',{}).get('local_arm_depth') else line
        arm_line([shoulder,mix(shoulder,elbow,.43),elbow,wrist],color,[.098,.120,.068,.038],True)
        for names,width in [(('wrist','palm'),[.038,.046])]:
            keys=[f'{name}_{side}' for name in names]
            if all(k in j for k in keys):
                arm_line([j[k] for k in keys],color,width,True)
                if pose.get('view',{}).get('local_arm_depth'):
                    # Short closed fist across each horn. The center is the
                    # constrained palm contact, continuous with a straight wrist.
                    palm=j['palm_'+side]
                    hand_axis=unit(tuple(a-b for a,b in zip(palm,wrist)))
                    local_line([mix(wrist,palm,.70),tuple(palm[i]+hand_axis[i]*.012 for i in range(3))],color,.064,True,.004)
        heel,toe=j[f'heel_{side}'],j[f'toe_{side}']
        along=unit(tuple(b-a for a,b in zip(heel,toe)))
        across=(0,1,0);normal=unit(cross(along,across))
        shoe=[]
        # Wider rounded toe box, a defined heel and an instep joining the ankle.
        # The bottom follows the same planted sole or toe pivot as the rig.
        for t,width,height in [(0,.025,.025),(.10,.045,.039),(.46,.050,.046),
                               (.76,.060,.032),(.90,.051,.024),(.98,.028,.015),(1,0,.010)]:
            sole=mix(heel,toe,t)
            for sign in [-1,1]:
                shoe.append(tuple(sole[i]+across[i]*width*sign for i in range(3)))
                shoe.append(tuple(sole[i]+across[i]*width*sign+normal[i]*height for i in range(3)))
        for sign in [-1,1]:
            shoe.append(tuple(ankle[i]+across[i]*.034*sign+normal[i]*.012 for i in range(3)))
        garment(shoe,color,floor=.001)

    # Featureless head silhouette: rounded skull, narrower jaw and small chin.
    # Follow the authored gaze/neck orientation without adding facial features.
    head_up=unit(tuple(a-b for a,b in zip(j['head'],j['neck'])))
    if 'head_axis' in j:
        # Optional explicit skull axis (P18 chin tuck: the head glides back upright).
        head_up=unit(tuple(j['head_axis']))
    head_front=unit(tuple(a-b for a,b in zip(j['face'],j['head'])))
    projection=dot(head_front,head_up)
    head_front=unit(tuple(a-projection*b for a,b in zip(head_front,head_up)))
    head_side=unit(cross(head_up,head_front))
    head=[]
    for ring in range(25):
        latitude=pi*ring/24
        height=.108*cos(latitude)
        radius=.091*sin(latitude)*(1+.15*cos(latitude))
        shift=-.005+.016*(1-cos(latitude))/2
        for step in range(24):
            theta=2*pi*step/24
            head.append(tuple(j['head'][i]+head_up[i]*height+head_side[i]*radius*.88*sin(theta)
                              +head_front[i]*(radius*cos(theta)+shift) for i in range(3)))
    garment(head,INK,floor=.002)
    for _,draw in sorted(queued,key=lambda item:item[0]): draw()
    return canvas.resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)


def save_png(frame, path):
    path.parent.mkdir(parents=True,exist_ok=True)
    # Zepp recommends RGB/RGBA PNGs. Preserve 24-bit RGB, no alpha or palette
    # interpretation dependency. SDK conversion/device decoding are separate costs.
    frame.convert('RGB').save(path,optimize=True)


def contact_sheet(frames, exercise, destination):
    indices = [round(i*(len(frames)-1)/7) for i in range(8)]
    sheet=Image.new('RGB',(WIDTH*4,(HEIGHT+28)*2),'#090b0b')
    d=ImageDraw.Draw(sheet)
    for cell,index in enumerate(indices):
        x=(cell%4)*WIDTH; y=(cell//4)*(HEIGHT+28)
        d.text((x+8,y+7),f'{exercise} · {index}',fill='#b8c2bb')
        sheet.paste(frames[index],(x,y+28))
    sheet.save(destination)


def gallery(destination, clips):
    """Local artifact: actual export frames, playable at delivery timing."""
    data=json.dumps(clips)
    destination.write_text('''<!doctype html><meta charset="utf-8"><title>Spamset motion review</title>
<style>body{background:#111;color:#edf2e9;font:15px system-ui;margin:24px}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(auto-fit, minmax(300px,1fr));gap:16px}article{background:#000;border-radius:16px;padding:16px}h2{font-size:16px;font-weight:500}canvas{width:280px;height:156px}button,input{margin:8px 8px 0 0}button{background:#d0fc79;border:0;border-radius:8px;padding:8px 12px}small{color:#a7b2aa}</style>
<h1>Stick-figure motion review</h1><p>Native 280 × 156 frames. Pause and scrub to inspect every transition. Form, anatomy, visual and movement-coach reviews are recorded separately.</p><main></main><script>
const clips='''+data+''';
for(const clip of clips){
const a=document.createElement('article');a.innerHTML=`<h2>${clip.id}</h2><canvas width="280" height="156"></canvas><br><button>Pause</button><input type="range" min="0" max="${clip.frames-1}" value="0"><br><small>${clip.frames} frames · ${clip.fps||0} fps · ${(clip.frames/(clip.fps||1)).toFixed(2)}s</small>`;document.querySelector('main').append(a);
const context=a.querySelector('canvas').getContext('2d'),slider=a.querySelector('input'),button=a.querySelector('button');let frame=0,playing=clip.frames>1,epoch=performance.now();
const images=Array.from({length:clip.frames},(_,i)=>{let im=new Image;im.src=`frames/${clip.id}/${String(i).padStart(3,'0')}.png`;return im;});
function draw(){const im=images[frame];if(im.complete&&im.naturalWidth){context.clearRect(0,0,280,156);context.drawImage(im,0,0);slider.value=frame;}}
button.onclick=()=>{playing=!playing;epoch=performance.now()-frame*1000/(clip.fps||1);button.textContent=playing?'Pause':'Play'};slider.oninput=()=>{playing=false;button.textContent='Play';frame=Number(slider.value);draw()};
function tick(t){if(playing){frame=Math.floor((t-epoch)*clip.fps/1000)%clip.frames;}draw();requestAnimationFrame(tick)}requestAnimationFrame(tick);
}</script>''')
