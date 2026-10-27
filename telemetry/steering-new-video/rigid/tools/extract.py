import pathlib,sys,json,time
import cv2,numpy as np
from model import score,angles,C,R,normal,v,offsets,u
cv2.setNumThreads(2)
import argparse,hashlib
from led_model import led_scores
parser=argparse.ArgumentParser();parser.add_argument('video',type=pathlib.Path);parser.add_argument('--out',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);args=parser.parse_args();root=args.out;root.mkdir(parents=True,exist_ok=True);cap=cv2.VideoCapture(str(args.video));leds=[];matches=[];qs=[];times=[];support=[];radii=[];flows=[];flowmads=[];previous=None
# Sparse samples on each pose's central rim; dense flow also supplies a backward consistency check.
us=np.linspace(-100,100,21)
p=C[None,None,:]-R*normal[:,None,:]+us[None,:,None]*v[:,None,:]-[1000,1020]
px=p[:,:,0].astype('float32');py=p[:,:,1].astype('float32');valid=(px>10)&(px<519)&(py>10)&(py<175)
prevclahe=None
while True:
 ok,f=cap.read()
 if not ok:break
 if f.shape[:2]!=(1206,2622):raise ValueError('Model requires the original camera geometry, 2622×1206')
 im=f[1020:1206,1000:1530];lq,lm=led_scores(im);leds.append(lq);matches.append(lm);gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);clahe=cv2.createCLAHE(2,(8,8)).apply(gray)
 q,details=score(im);qs.append(q);times.append(cap.get(cv2.CAP_PROP_POS_MSEC)/1000);support.append(details['supported']);radii.append(details['offset'])
 delta=np.zeros(len(angles));mad=np.full(len(angles),99.)
 if previous is not None:
  ff=cv2.calcOpticalFlowFarneback(prevclahe,clahe,None,.5,3,21,3,5,1.2,0);bb=cv2.calcOpticalFlowFarneback(clahe,prevclahe,None,.5,3,21,3,5,1.2,0)
  dx=cv2.remap(ff[:,:,0],px,py,cv2.INTER_LINEAR);dy=cv2.remap(ff[:,:,1],px,py,cv2.INTER_LINEAR)
  bx=cv2.remap(bb[:,:,0],px+dx,py+dy,cv2.INTER_LINEAR);by=cv2.remap(bb[:,:,1],px+dx,py+dy,cv2.INTER_LINEAR)
  p0=p+[1000,1020]-C;p1=p0+np.stack([dx,dy],axis=-1)
  angular=np.degrees(np.arctan2(p0[:,:,0]*p1[:,:,1]-p0[:,:,1]*p1[:,:,0],np.sum(p0*p1,axis=-1)))
  good=valid&(((dx+bx)**2+(dy+by)**2)<1.5**2)&(abs(np.linalg.norm(p1,axis=-1)-np.linalg.norm(p0,axis=-1))<3)
  for j in range(len(angles)):
   aa=angular[j][good[j]]
   if len(aa)>=8:delta[j]=np.median(aa);mad[j]=np.median(abs(aa-delta[j]))
 flows.append(delta);flowmads.append(mad);previous=gray;prevclahe=clahe
 if len(qs)%500==0:print('frame',len(qs),'time',times[-1],flush=True)
np.savez_compressed(root/'evidence.npz',scores=np.array(qs),times=times,angles=angles,support=np.array(support),offsets=np.array(radii),flow=np.array(flows),flow_mad=np.array(flowmads),led_scores=np.array(leds))
print('DONE',len(qs))

cap.release()
(root/'source.json').write_text(json.dumps({'source_file':args.video.name,'sha256':hashlib.file_digest(args.video.open('rb'),'sha256').hexdigest(),'frames':len(times)},indent=2))
