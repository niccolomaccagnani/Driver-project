import cv2,numpy as np
from model import C,angles

def led_scores(im):
 h,s,v=cv2.split(cv2.cvtColor(im,cv2.COLOR_BGR2HSV));b,g,r=cv2.split(im)
 mask=np.uint8(((h<15)|(h>170))&(s>60)&(v>22)&(r.astype(float)>g*1.4)&(r.astype(float)>b*1.25))*255
 n,labels,stats,centers=cv2.connectedComponentsWithStats(mask);components=[]
 for st,center in zip(stats[1:],centers[1:]):
  x,y,w,hh,area=st
  if 8<=area<=600 and max(w,hh)<60 and .3<w/hh<3 and 70<center[0]<400:
   components.append((center+np.array([1000,1020]),area))
 evidence=np.zeros(len(angles));matches=[]
 for i,(p,area) in enumerate(components):
  for q,area2 in components[i+1:]:
   a,b=(p,q) if p[0]<=q[0] else (q,p);delta=b-a;length=np.linalg.norm(delta)
   if not 35<length<130:continue
   direction=delta/length;normal=np.array([-direction[1],direction[0]]);mid=(a+b)/2;rho=normal@(C-mid);along=direction@(mid-C);angle=np.degrees(np.arctan2(direction[1],direction[0]))
   if not 85<rho<135 or abs(along)>65 or abs(angle)>78:continue
   strength=min(1,(area+area2)/250)*np.exp(-.5*((rho-111)/13)**2)*np.exp(-.5*(along/60)**2)
   evidence=np.maximum(evidence,strength*np.exp(-.5*((angles-angle)/2.5)**2));matches.append({'angle':float(angle),'strength':float(strength),'distance':float(rho),'points':np.r_[a,b].tolist()})
 return evidence,matches
