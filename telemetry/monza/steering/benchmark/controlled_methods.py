"""Controlled 2D apparent-angle benchmark, NOT ground truth from the onboard laps."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1';os.environ['MPLCONFIGDIR']='/tmp/monza-matplotlib'
import cv2,numpy as np,pathlib,json,csv,time
cv2.setNumThreads(2)
ROOT=pathlib.Path(__file__).resolve().parent;rng=np.random.default_rng(317)
SIZE=160;C=(SIZE/2,SIZE/2);Y,X=np.indices((SIZE,SIZE));wheel=((X-C[0])**2+(Y-C[1])**2)<58**2
source=cv2.imread(str(ROOT/'reference-texture.png'),0)
texture=cv2.resize(source,(120,88));foreground=np.zeros((SIZE,SIZE),np.uint8);foreground[36:124,20:140]=texture
body=rng.integers(20,95,(SIZE,SIZE),dtype=np.uint8);body=cv2.GaussianBlur(body,(3,3),.4)
base=body.copy();base[wheel]=foreground[wheel]
bodymask=np.uint8((X<15)|(X>SIZE-16)|(Y<15)|(Y>SIZE-16))*255
angles=np.arange(-100,101,2,dtype=float)
# Templates include only the turning patch; shared background is excluded by a circular mask.
mask=wheel.ravel();templates=[]
for angle in angles:
 im=cv2.warpAffine(foreground,cv2.getRotationMatrix2D(C,-angle,1),(SIZE,SIZE))
 v=im.ravel()[mask].astype('float32');v-=v.mean();v/=np.linalg.norm(v)+1e-6;templates.append(v)
bank=np.array(templates)
T=np.arange(0,12.001,1/12)
GT=np.interp(T,[0,1,2,3,4,5,6,7,8,9,10,11,12],[0,0,65,65,-75,-75,0,35,35,-45,-45,0,0])
scenarios=[('clear',.35,0.),('blur_light',1.1,0.),('occlusion_25',.6,.25),('occlusion_50',1.1,.50)]
rows=[];summary=[]
def stabilise(image):
 points=cv2.goodFeaturesToTrack(base,80,.01,4,mask=bodymask)
 nxt,status,error=cv2.calcOpticalFlowPyrLK(base,image,points,None,winSize=(15,15),maxLevel=2)
 good=(status.ravel()>0)&(error.ravel()<40)
 M,ins=cv2.estimateAffinePartial2D(points[good],nxt[good],method=cv2.RANSAC,ransacReprojThreshold=1.5)
 if M is None:return image
 return cv2.warpAffine(image,cv2.invertAffineTransform(M),(SIZE,SIZE),borderMode=cv2.BORDER_REFLECT)
for scenario,blur,occlusion in scenarios:
 samples=[]
 for i,(t,theta) in enumerate(zip(T,GT)):
  moving=cv2.warpAffine(foreground,cv2.getRotationMatrix2D(C,-theta,1),(SIZE,SIZE));image=body.copy();image[wheel]=moving[wheel]
  if occlusion and t>1:
   h=int(116*occlusion*(.8+.2*np.sin(t*1.3)));oc=(Y>int(80+58-h))&wheel
   image[oc]=(120+55*np.sin(X[oc]*.11)+30*np.cos(Y[oc]*.19)).clip(0,255).astype('uint8')
  image=cv2.GaussianBlur(image,(0,0),blur)
  gain=1.+(.15*np.sin(t*2) if scenario!='clear' else 0)
  image=np.clip(image.astype(float)*gain+rng.normal(0,1.7,image.shape),0,255).astype('uint8')
  camera=cv2.getRotationMatrix2D(C,float(2*np.sin(t*.7)),1);camera[:,2]+=[1.5*np.sin(t*2.1),1.2*np.cos(t*1.7)]
  image=cv2.warpAffine(image,camera,(SIZE,SIZE),borderMode=cv2.BORDER_REFLECT)
  samples.append(stabilise(image))
 ref=samples[0];points=cv2.goodFeaturesToTrack(ref,100,.02,4,mask=np.uint8(wheel)*255);original=points.copy();prev=ref;flow_angle=0.;fused=0.;variance=4.;last_abs=0
 estimates={k:[] for k in ['LK_RANSAC','Dense_flow','Rotated_NCC','Fusion_NCC_flow']};qualities=[]
 for i,im in enumerate(samples):
  # Direct independent angle matching: no integration and no use of ground-truth angles.
  v=im.ravel()[mask].astype('float32');v-=v.mean();v/=np.linalg.norm(v)+1e-6
  scores=bank@v;j=int(np.argmax(scores));score=float(scores[j]);ncc=float(angles[j]) if score>.42 else None
  if points is not None and len(points)>=6:
   nxt,st,err=cv2.calcOpticalFlowPyrLK(prev,im,points,None,winSize=(15,15),maxLevel=3)
   back,sb,_=cv2.calcOpticalFlowPyrLK(im,prev,nxt,None,winSize=(15,15),maxLevel=3)
   keep=(st.ravel()>0)&(sb.ravel()>0)&(np.linalg.norm(back-points,axis=2).ravel()<1)&(err.ravel()<35)
   points=nxt[keep].reshape(-1,1,2);original=original[keep].reshape(-1,1,2)
   M,ins=cv2.estimateAffinePartial2D(original,points,method=cv2.RANSAC,ransacReprojThreshold=2) if len(points)>=6 else (None,None)
   lk=float(np.degrees(np.arctan2(M[1,0],M[0,0]))) if M is not None and ins.sum()>=6 else None
  else:lk=None
  flow=cv2.calcOpticalFlowFarneback(prev,im,None,.5,3,15,3,5,1.2,0)
  dx=X-C[0];dy=Y-C[1];rad2=dx*dx+dy*dy
  grad=cv2.magnitude(cv2.Sobel(prev,cv2.CV_32F,1,0),cv2.Sobel(prev,cv2.CV_32F,0,1))
  omega=(dx*flow[:,:,1]-dy*flow[:,:,0])/(rad2+1e-6)
  use=wheel&(rad2>15**2)&(grad>30)&(np.abs(omega)<.4)
  increment=float(np.degrees(np.median(omega[use]))) if use.sum()>50 else 0.
  flow_angle+=increment
  fused+=increment;variance+=1.5
  if ncc is not None and (abs(ncc-fused)<25 or score>.7):
   R=1.5+15*(1-score);gain=variance/(variance+R);fused+=gain*(ncc-fused);variance*=1-gain;last_abs=i
  fusion=fused if i-last_abs<=5 else None
  for name,value in [('LK_RANSAC',lk),('Dense_flow',flow_angle),('Rotated_NCC',ncc),('Fusion_NCC_flow',fusion)]:
   estimates[name].append(value);rows.append({'scenario':scenario,'time_s':float(T[i]),'reference_apparent_deg':float(GT[i]),'method':name,'estimate_apparent_deg':value})
  prev=im
 for method,values in estimates.items():
  array=np.array([np.nan if v is None else v for v in values]);valid=np.isfinite(array);error=np.abs(array[valid]-GT[valid]);active=valid&(np.abs(GT)>10)
  sign_error=int(np.sum(np.sign(array[active])!=np.sign(GT[active])));residual=array-GT
  jumps=int(np.nansum(np.abs(np.diff(residual))>15))
  entry={'scenario':scenario,'method':method,'samples':len(T),'returned':int(valid.sum()),'coverage_pct':round(float(valid.mean()*100),1),'mae_deg':round(float(error.mean()),2) if len(error) else None,'p95_deg':round(float(np.percentile(error,95)),2) if len(error) else None,'sign_errors':sign_error,'active_returned':int(active.sum()),'residual_jumps_over_15deg':jumps}
  summary.append(entry);print(entry,flush=True)
with open(ROOT/'controlled_predictions.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
(ROOT/'controlled_metrics.json').write_text(json.dumps(summary,indent=2))
print('DONE controlled benchmark',len(rows),'estimates')
