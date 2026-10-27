"""Re-fit the apparent rotation geometry for the supplied recording, without manual points."""
import argparse,hashlib,json,pathlib,sys
import cv2,numpy as np
from scipy.optimize import least_squares
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'refined/tools'))
from rim_features import edge_lines,red_line,ridge,paired_led
parser=argparse.ArgumentParser();parser.add_argument('video',type=pathlib.Path);parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]/'model-calibration.json');args=parser.parse_args();cap=cv2.VideoCapture(str(args.video));lines=[];cv2.setNumThreads(2)
while True:
 ok,f=cap.read()
 if not ok:break
 if f.shape[:2]!=(1206,2622):raise ValueError('Geometry requires the original 2622×1206 source')
 im=f[1020:1206,1000:1530];led,_=red_line(im);edges,_=edge_lines(im);candidates=[]
 for edge in edges:
  edge=ridge(im,edge);agreed,agreement=paired_led(edge,led);edge['quality']=min(.99,edge['quality']*(1+agreement))
  if edge['quality']>.65 and np.hypot(edge['line'][2]-edge['line'][0],edge['line'][3]-edge['line'][1])>120 and abs(edge['angle'])<45:candidates.append(edge)
 if not candidates:continue
 edge=max(candidates,key=lambda e:e['quality']);a=np.array(edge['line'][:2]);b=np.array(edge['line'][2:]);v=(b-a)/np.linalg.norm(b-a);n=np.array([-v[1],v[0]]);lines.append([*n,n@((a+b)/2)])
cap.release();x=np.array(lines)
if len(lines)<100:raise ValueError('Insufficient long, clear rim observations to fit geometry')
A=np.column_stack([x[:,:2],-np.ones(len(x))]);fit=least_squares(lambda z:A@z-x[:,2],[1240,1230,115],loss='soft_l1',f_scale=3)
if not (1000<fit.x[0]<1500 and 1150<fit.x[1]<1500 and 60<fit.x[2]<300):raise ValueError('Rotation fit outside plausible image geometry')
result={'center':fit.x[:2].tolist(),'radius':float(fit.x[2]),'source_sha256':hashlib.file_digest(args.video.open('rb'),'sha256').hexdigest(),'source_size_px':[2622,1206],'fit_observations':len(lines),'fit_median_absolute_distance_residual_px':float(np.median(abs(fit.fun))),'fit_method':'robust signed line-distance fit on long high-contrast rim observations, |angle| < 45 degrees','note':'Apparent 2D model; not mechanical steering calibration.'}
args.output.write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
