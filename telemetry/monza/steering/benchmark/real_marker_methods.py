"""Small, approximate visual landmark benchmark. Pixels are not steering degrees."""
import cv2,numpy as np,pathlib,json,csv,argparse
cv2.setNumThreads(2)
ROOT=pathlib.Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--jpeg-quality',type=int,default=None)
args=parser.parse_args()
suffix=f'_jpeg{args.jpeg_quality}' if args.jpeg_quality else ''
def load_frame(path):
 im=cv2.imread(str(path))
 if args.jpeg_quality:
  ok,encoded=cv2.imencode('.jpg',im,[cv2.IMWRITE_JPEG_QUALITY,args.jpeg_quality])
  if not ok:raise RuntimeError('JPEG encoding failed')
  im=cv2.imdecode(encoded,cv2.IMREAD_COLOR)
 return im
# Approximate independent visual readings from annotation-grid-v1/v2.jpg.
# Uncertainty is +/-3 pixels (up to +/-5 for the dim v2 9.5s sample).
labels={1:{8.25:[1362,1106],8.5:[1241,1071],8.75:None,9.:None,9.25:None,9.5:[1353,1096],9.75:None},2:{8.25:[1299,1078],8.5:[1329,1089],8.75:None,9.:None,9.25:None,9.5:[1374,1118],9.75:None}}
seed=load_frame(ROOT/'frames/frame-v1-8.5.png');seedpoint=np.array([141.,51.],np.float32)
patch=seed[39:64,129:154].copy();seedgray=cv2.cvtColor(seed,cv2.COLOR_BGR2GRAY)
sift=cv2.SIFT_create(0,contrastThreshold=.01,edgeThreshold=12,sigma=1.2)
kp,des=sift.detectAndCompute(seedgray[0:85,45:180],None)
for k in kp:k.pt=(k.pt[0]+45,k.pt[1])
bf=cv2.BFMatcher();rows=[];predictions={}
def detect_color(im):
 hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV);h,s,v=cv2.split(hsv)
 mask=np.uint8((h>85)&(h<110)&(s>100)&(v>65))*255
 contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);choices=[]
 for c in contours:
  area=cv2.contourArea(c);per=cv2.arcLength(c,True)
  if area<20 or area>280 or not per:continue
  x,y,w,he=cv2.boundingRect(c);circ=4*np.pi*area/(per*per)
  if circ<.45 or not .5<w/he<1.6:continue
  m=cv2.moments(c);cx,cy=m['m10']/m['m00'],m['m01']/m['m00'];r=np.sqrt(area/np.pi)
  yy,xx=np.indices(v.shape);dist=np.hypot(xx-cx,yy-cy);ring=(dist>r*1.25)&(dist<r*2.2)
  dark=float((v[ring]<105).mean()) if ring.sum() else 0
  score=circ*dark
  if dark>.45 and score>.35:choices.append((score,[cx,cy]))
 return max(choices,key=lambda a:a[0])[1] if choices else None
for n,ls in labels.items():
 for t,target in ls.items():
  if n==1 and t==8.5:continue  # shared calibration frame is never scored
  im=load_frame(ROOT/f'frames/frame-v{n}-{t}.png');gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
  color=detect_color(im)
  scores=cv2.matchTemplate(im,patch,cv2.TM_CCOEFF_NORMED);_,peak,_,loc=cv2.minMaxLoc(scores);ncc=[loc[0]+12,loc[1]+12] if peak>.65 else None
  p0=seedpoint.reshape(1,1,2);p1,status,error=cv2.calcOpticalFlowPyrLK(seedgray,gray,p0,None,winSize=(31,31),maxLevel=3)
  pback,stback,_=cv2.calcOpticalFlowPyrLK(gray,seedgray,p1,None,winSize=(31,31),maxLevel=3)
  lk=p1.ravel().tolist() if status[0,0] and stback[0,0] and error[0,0]<35 and np.linalg.norm(pback-p0)<1.5 else None
  kk,dd=sift.detectAndCompute(gray,None);matches=[a for a,b in bf.knnMatch(des,dd,k=2) if a.distance<.7*b.distance] if dd is not None else []
  affine=None
  if len(matches)>=6:
   src=np.array([kp[a.queryIdx].pt for a in matches]);dst=np.array([kk[a.trainIdx].pt for a in matches]);M,ins=cv2.estimateAffine2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=2)
   if M is not None and ins.sum()>=6 and ins.mean()>=.6 and .2<np.linalg.det(M[:,:2])<4:affine=(M[:,:2]@seedpoint+M[:,2]).tolist()
  consensus=(.5*(np.array(color)+np.array(ncc))).tolist() if color is not None and ncc is not None and np.linalg.norm(np.array(color)-ncc)<10 else None
  predictions[n,t]={}
  for method,p in [('Color_circle',color),('NCC_marker',ncc),('LK_direct_reference',lk),('SIFT_affine',affine),('Color_NCC_consensus',consensus)]:
   p=[p[0]+1100,p[1]+1020] if p is not None else None
   if p is not None and not (1100<=p[0]<=1460 and 1020<=p[1]<=1190):p=None
   error=float(np.linalg.norm(np.array(p)-target)) if target is not None and p is not None else None
   rows.append(dict(video=n,lap_time_s=t,method=method,visible=target is not None,reference_x=target[0] if target else None,reference_y=target[1] if target else None,predicted_x=p[0] if p else None,predicted_y=p[1] if p else None,error_px=error))
   predictions[n,t][method]=p
metrics=[]
for method in sorted(set(r['method'] for r in rows)):
 rr=[r for r in rows if r['method']==method];vis=[r for r in rr if r['visible']];obs=[r for r in vis if r['predicted_x'] is not None];errors=[r['error_px'] for r in obs]
 m={'method':method,'visible_samples':len(vis),'returned_visible':len(obs),'visible_coverage_pct':round(100*len(obs)/len(vis),1),'median_error_px':round(float(np.median(errors)),2) if errors else None,'p95_error_px':round(float(np.percentile(errors,95)),2) if errors else None,'errors_over_10px':sum(e>10 for e in errors),'occluded_samples':sum(not r['visible'] for r in rr),'false_detections_when_occluded':sum(not r['visible'] and r['predicted_x'] is not None for r in rr)};metrics.append(m);print(m)
(ROOT/f'real_marker_metrics{suffix}.json').write_text(json.dumps(metrics,indent=2))
(ROOT/f'real_marker_annotations{suffix}.json').write_text(json.dumps({'calibration':'v1 lap8.5 excluded from scores','uncertainty_px':'approximately 3; up to 5 for dim samples','labels':{str(k):v for k,v in labels.items()}},indent=2))
with open(ROOT/f'real_marker_predictions{suffix}.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
from PIL import Image,ImageDraw
sheet=Image.new('RGB',(720,13*210),'white');draw=ImageDraw.Draw(sheet)
for j,((n,t),preds) in enumerate(predictions.items()):
 im=load_frame(ROOT/f'frames/frame-v{n}-{t}.png');im=cv2.resize(im,(720,340));view=Image.fromarray(cv2.cvtColor(im,cv2.COLOR_BGR2RGB)).resize((360,170));sheet.paste(view,(0,j*210+25));draw.text((5,j*210+5),f'Video {n}, giro {t:.2f}s',fill='black')
 target=labels[n][t]
 if target:draw.ellipse((target[0]-1100-5,target[1]-1020+j*210+20,target[0]-1100+5,target[1]-1020+j*210+30),outline='lime',width=2)
 for k,(method,p) in enumerate(preds.items()):
  if p:
   err=np.linalg.norm(np.array(p)-target) if target else None;draw.text((375,j*210+30+k*25),f'{method}: {err:.1f}px' if err is not None else f'{method}: FP',fill='black')
sheet.save(ROOT/f'real_marker_review{suffix}.jpg')
