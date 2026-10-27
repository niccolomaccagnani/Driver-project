"""Visual features for the 2622×1206 onboard recording; no angle integration."""
import cv2
import numpy as np
x0,y0=1000,1020
W,H=530,186
YY,XX=np.indices((H,W))

def red_line(im):
 hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV);h,s,v=cv2.split(hsv);b,g,r=cv2.split(im)
 mask=np.uint8(((h<12)|(h>170))&(s>75)&(v>30)&(r.astype(float)>g*1.5)&(r.astype(float)>b*1.3))*255
 n,l,stats,cents=cv2.connectedComponentsWithStats(mask)
 points=[]
 for i,(x,y,w,he,area) in enumerate(stats[1:],1):
  if area<2 or area>900 or y+he>=H-2 and area>60:continue
  comp=np.column_stack(np.where(l==i)[::-1]).astype('float32')
  if area>100 and max(w,he)>40:
   _,sig,_=cv2.PCACompute2(comp,mean=None)
  if area<=150 and .25<w/he<4:points.append((float(cents[i,0]),float(cents[i,1]),int(area)))
 best=None
 for a in range(len(points)):
  for b in range(a+1,len(points)):
   p=np.array(points[a][:2]);q=np.array(points[b][:2]);delta=q-p;span=np.linalg.norm(delta)
   if span<24 or span>260:continue
   if delta[0]<0:p,q=q,p;delta=-delta
   angle=np.degrees(np.arctan2(delta[1],delta[0]));mid=(p+q)/2
   if abs(angle)>75 or not 90<mid[0]<440 or not 45<mid[1]<170:continue
   dist=np.array([abs(delta[0]*(z[1]-p[1])-delta[1]*(z[0]-p[0]))/span for z in points]);inds=np.where(dist<3)[0]
   pts=np.array([points[i][:2] for i in inds]);vline=cv2.fitLine(pts.astype('float32'),cv2.DIST_L2,0,.01,.01).ravel();vx,vy,cx,cy=vline
   if vx<0:vx=-vx;vy=-vy
   angle=float(np.degrees(np.arctan2(vy,vx)));length=float(np.ptp(pts@np.array([vx,vy])))
   resid=float(np.median(dist[inds]));score=len(inds)*3+min(length/40,4)-resid
   if len(inds)==2:score-=1
   if best is None or score>best['score']:best={'angle':angle,'score':score,'points':pts.tolist(),'line':[float(cx+x0),float(cy+y0),float(vx),float(vy)],'count':len(inds),'span':length}
 return best,mask

def edge_lines(im):
 hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV);h,s,v=cv2.split(hsv)
 color=np.uint8((h>35)&(h<140)&(s>75)&(v>80)&(YY>75)&(XX<430))*255
 co,_=cv2.findContours(color,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);co=[c for c in co if cv2.contourArea(c)>20]
 helmet=np.zeros((H,W),np.uint8)
 if co:cv2.fillConvexPoly(helmet,cv2.convexHull(np.concatenate(co)),255);helmet=cv2.dilate(helmet,np.ones((7,7),np.uint8))
 gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);gray=cv2.createCLAHE(3,(8,8)).apply(gray);edge=cv2.Canny(gray,45,110);edge[helmet>0]=0
 lines=cv2.HoughLinesP(edge,1,np.pi/360,threshold=35,minLineLength=65,maxLineGap=15);out=[]
 if lines is not None:
  for line in lines.reshape(-1,4):
   x1,y1,x2,y2=map(float,line);dx=x2-x1;dy=y2-y1
   if dx<0:x1,x2=x2,x1;y1,y2=y2,y1;dx=-dx;dy=-dy
   angle=float(np.degrees(np.arctan2(dy,dx)));length=float(np.hypot(dx,dy));mx=(x1+x2)/2;my=(y1+y2)/2
   if abs(angle)>70 or not 90<mx<450 or my<80:continue
   distance=abs(dx*(170-y1)-dy*(250-x1))/length
   if not 25<distance<105:continue
   xs=np.linspace(x1,x2,30).astype(int).clip(0,W-1);ys=np.linspace(y1,y2,30).astype(int).clip(0,H-1)
   if np.mean(v[ys,xs]>140)>.35 or np.median(s[ys,xs])>105:continue
   contrast=float(np.mean(gray[ys,xs]));score=length*(1-abs(distance-65)/140)*(1-abs(mx-260)/600)
   out.append({'angle':angle,'score':score,'line':[x1+x0,y1+y0,x2+x0,y2+y0]})
 return sorted(out,key=lambda x:-x['score'])[:12],helmet

def ridge(im,e):
 gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY).astype('float32');hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
 a,b,c,d=e['line'];a-=x0;c-=x0;b-=y0;d-=y0;length=np.hypot(c-a,d-b);vx=(c-a)/length;vy=(d-b)/length;normal=np.array([-vy,vx]);f=np.linspace(.08,.92,50);xs=a+(c-a)*f;ys=b+(d-b)*f
 best=None
 for offset in range(-4,5):
  xx=xs+normal[0]*offset;yy=ys+normal[1]*offset
  def sample(image,shift=0):return cv2.remap(image,(xx+normal[0]*shift).astype('float32').reshape(1,-1),(yy+normal[1]*shift).astype('float32').reshape(1,-1),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).ravel()
  peak=sample(gray);up=sample(gray,-7);down=sample(gray,7);contrast=np.minimum(peak-up,peak-down);sat=sample(hsv[:,:,1]);valid=(contrast>4)&(sat<100)&(peak<190)
  coverage=float(valid.mean());medcontrast=float(np.median(np.maximum(0,contrast)));intensity=float(np.median(peak));penalty=float(np.exp(-max(0,intensity-85)/35))
  q=min(1,medcontrast/12)*coverage*penalty*min(1,length/160)
  if best is None or q>best['quality']:
   line=[float(a+x0+normal[0]*offset),float(b+y0+normal[1]*offset),float(c+x0+normal[0]*offset),float(d+y0+normal[1]*offset)]
   best={**e,'line':line,'quality':q,'ridge_coverage':coverage,'ridge_contrast':medcontrast,'ridge_intensity':intensity}
 return best

def paired_led(candidate,led):
 if led is None or led['count']<3 or led['span']<35:return False,0.
 a,b,c,d=candidate['line'];length=np.hypot(c-a,d-b);normal=np.array([-(d-b)/length,(c-a)/length]);cx,cy,vx,vy=led['line'];distance=float(np.dot(np.array([cx-(a+c)/2,cy-(b+d)/2]),normal));difference=abs(candidate['angle']-led['angle'])
 good=4<distance<55 and difference<15
 return good, max(0.,1-difference/20) if good else 0.
