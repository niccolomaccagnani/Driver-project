import cv2,numpy as np,csv,pathlib,argparse
cv2.setNumThreads(2)
parser=argparse.ArgumentParser(description='Exploratory wheel-feature tracking, NOT validated steering telemetry.')
parser.add_argument('video',type=pathlib.Path)
parser.add_argument('--out',type=pathlib.Path,required=True)
args=parser.parse_args()
root=args.out;root.mkdir(parents=True,exist_ok=True);p=args.video
cap=cv2.VideoCapture(str(p));base=None;prev=None;points=None;original=None;alive=False;rows=[];shots=[]
# Only points on the visible right-hand wheel controls: excludes the static halo.
# Coordinates are in the correctly rotated source video.
roi=(1280,1090,1480,1200)
while True:
 ok,f=cap.read()
 if not ok:break
 t=cap.get(cv2.CAP_PROP_POS_MSEC)/1000
 if t<6:continue
 if t>18:break
 gray=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY)
 if base is None:
  mask=np.zeros_like(gray);cv2.rectangle(mask,roi[:2],roi[2:],255,-1)
  points=cv2.goodFeaturesToTrack(gray,maxCorners=80,qualityLevel=.02,minDistance=5,mask=mask,blockSize=7)
  original=points.copy();prev=gray;alive=True;base=t;reference=f.copy();zero=0;first=len(points)
 if alive:
  nxt,status,err=cv2.calcOpticalFlowPyrLK(prev,gray,points,None,winSize=(25,25),maxLevel=3,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,.01))
  back,back_status,_=cv2.calcOpticalFlowPyrLK(gray,prev,nxt,None,winSize=(25,25),maxLevel=3)
  good=(status.ravel()>0)&(back_status.ravel()>0)&(np.linalg.norm(back-points,axis=2).ravel()<1)&(err.ravel()<25)
  points=nxt[good].reshape(-1,1,2);original=original[good].reshape(-1,1,2)
  if len(points)>=8:
   M,inliers=cv2.estimateAffinePartial2D(original,points,method=cv2.RANSAC,ransacReprojThreshold=2,maxIters=2000,confidence=.99)
  else:M=None
  angle=None;reason='tracking_lost';ratio=0
  if M is not None:
   ratio=float(inliers.mean());scale=float(np.hypot(M[0,0],M[1,0]));angle=float(np.degrees(np.arctan2(M[1,0],M[0,0])))
   if ratio<.55 or int(inliers.sum())<8 or scale<.8 or scale>1.2 or abs(angle)>140:reason=f'transform_rejected inliers={ratio:.2f} scale={scale:.2f} angle={angle:.2f}';angle=None
   else:reason='experimental_unvalidated'
  if angle is None:alive=False
  prev=gray
 else:angle=None;reason='tracking_lost';ratio=0
 rows.append({'video_time_s':round(t,6),'angle_apparent_deg':round(angle,3) if angle is not None else '', 'tracked_points':len(points),'inlier_ratio':round(ratio,3),'status':reason})
 if len(shots)<13 and t>=6+len(shots):
  a=f.copy()
  cv2.rectangle(a,roi[:2],roi[2:],(0,190,255),2)
  if alive:
   for q in points:cv2.circle(a,tuple(np.int32(q[0])),4,(0,255,90),-1)
  cv2.putText(a,f't={t:.2f} angle={angle if angle is not None else "LOST"} points={len(points)}',(750,900),cv2.FONT_HERSHEY_SIMPLEX,.8,(0,190,255),2)
  shots.append(a[850:1206,850:1600])
with open(root/'tracking-experiment-unvalidated.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
from PIL import Image,ImageDraw
sheet=Image.new('RGB',(3*750,5*380),'white')
for i,a in enumerate(shots):sheet.paste(Image.fromarray(cv2.cvtColor(a,cv2.COLOR_BGR2RGB)),(i%3*750,i//3*380))
sheet.save(root/'tracking-diagnostic.jpg')
valid=[r for r in rows if r['angle_apparent_deg']!=''];print('initial features',first,'valid',len(valid),'total',len(rows),'last track',valid[-1] if valid else None)
