import os
os.environ['MPLCONFIGDIR']='/tmp/monza-matplotlib'
import json,csv,pathlib,argparse,numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
parser=argparse.ArgumentParser();parser.add_argument('--out',type=pathlib.Path,required=True);args=parser.parse_args();root=args.out;rows=json.loads((root/'raw-orientation.json').read_text());times=np.array([r['video_time_s'] for r in rows]);n=len(rows)
pairs=[]
for r in rows:
 if r['led_angle'] is not None and r['led_count']>=3 and r['led_span']>40 and r['edges']:
  edge=min(r['edges'],key=lambda e:abs(e['angle']-r['led_angle']))
  if abs(edge['angle']-r['led_angle'])<15:pairs.append([r['led_angle'],edge['angle']])
pairs=np.array(pairs);keep=np.ones(len(pairs),bool)
a,b=1.,0.
for _ in range(5):
 a,b=np.polyfit(pairs[keep,0],pairs[keep,1],1);res=pairs[:,1]-(a*pairs[:,0]+b);keep=abs(res)<max(4,2*np.median(abs(res[keep])))
print('LED->rim map',a,b,'pairs',len(pairs),'accepted',keep.sum())
grid=np.arange(-75,76,dtype=float);unary=np.empty((n,len(grid)));strength=np.zeros(n);bestangles=[]
for i,r in enumerate(rows):
 support=np.zeros(len(grid))
 if r['edges']:
  maxscore=max(e['score'] for e in r['edges'])
  for e in r['edges']:
   support=np.maximum(support,(e['score']/maxscore)**2*np.exp(-.5*((grid-e['angle'])/3.5)**2))
 if r['led_angle'] is not None:
  angle=a*r['led_angle']+b
  w=3 if r['led_count']>=3 else .25
  if r['led_count']==2 and r['edges'] and min(abs(e['angle']-angle) for e in r['edges'])<8:w=1.2
  support+=w*np.exp(-.5*((grid-angle)/3)**2)
 strength[i]=support.max();unary[i]=-np.log(.02+support)
 bestangles.append(grid[np.argmax(support)] if support.max() else np.nan)
# Global association of edge candidates, with a soft angular-speed penalty.
transition=.03*(grid[:,None]-grid[None,:])**2
cost=unary[0]+.01*grid**2;back=np.zeros((n,len(grid)),np.int16)
for i in range(1,n):
 dt=max(.01,times[i]-times[i-1]);m=cost[:,None]+transition*(1/30/dt);back[i]=np.argmin(m,axis=0);cost=np.min(m,axis=0)+unary[i]
path=np.empty(n);j=int(np.argmin(cost))
for i in range(n-1,-1,-1):path[i]=grid[j];j=int(back[i,j]) if i else j
observed=strength>.2;weights=np.where(observed,1.,0.)
D=sparse.diags([np.ones(n-2),-2*np.ones(n-2),np.ones(n-2)],[0,1,2],shape=(n-2,n));curve=path.copy()
for _ in range(6):
 residual=path-curve;robust=np.minimum(1,5/(abs(residual)+1e-6));w=weights*robust
 curve=spsolve((sparse.diags(w+1e-8)+600*(D.T@D)).tocsc(),w*path)
zero=float(np.median(curve[(times>=1)&(times<4)]));curve-=zero;path-=zero
valid=observed.copy();imputed=np.zeros(n,bool)
i=0
while i<n:
 if observed[i]:i+=1;continue
 start=i
 while i<n and not observed[i]:i+=1
 if start>0 and i<n and times[i]-times[start-1]<=.4:valid[start:i]=True;imputed[start:i]=True
curve[~valid]=np.nan
out=[]
for i,r in enumerate(rows):
 out.append({'frame_index':r['frame'],'video_time_s':r['video_time_s'],'steering_apparent_deg':round(float(curve[i]),3) if np.isfinite(curve[i]) else None,'selected_angle_raw_deg':float(path[i]) if observed[i] else None,'raw_edge_angle_deg':r['edge_angle'],'raw_led_angle_deg':r['led_angle'],'status':'short_gap_reconstructed' if imputed[i] else 'visual_orientation_estimate' if valid[i] else 'unreadable','support_strength':round(float(strength[i]),4),'visual_support':'strong' if (r['led_count']>=3 and r['led_angle'] is not None and abs(a*r['led_angle']+b-(path[i]+zero))<8) or any(abs(e['angle']-(path[i]+zero))<5 and np.hypot(e['line'][2]-e['line'][0],e['line'][3]-e['line'][1])>=120 for e in r['edges']) else 'weak'})
with open(root/'steering-angle.csv','w') as f:
 w=csv.DictWriter(f,fieldnames=list(out[0]),lineterminator='\n');w.writeheader();w.writerows(out)
(root/'steering-angle.json').write_text(json.dumps(out,separators=(',',':')))
meta={'quantity':'apparent 2D orientation of the upper wheel rim, NOT calibrated mechanical steering','sign':'clockwise positive, counterclockwise negative in the image; source checked for right/left convention','zero_video_interval_s':[1,4],'zero_offset_deg':zero,'led_to_rim_slope':a,'led_to_rim_intercept':b,'mapping_pairs':int(keep.sum()),'max_reconstructed_gap_s':.4,'smoothing_penalty':600,'frames':n,'returned':int(valid.sum()),'reconstructed':int(imputed.sum()),'unreadable':int((~valid).sum()),'filter':'global edge/LED candidate association then robust offline second-difference smoothing; no angle integration','range_deg':[float(np.nanmin(curve)),float(np.nanmax(curve))]}
(root/'steering-metadata.json').write_text(json.dumps(meta,indent=2));print(meta)
fig,ax=plt.subplots(figsize=(16,6));ax.plot(times,path,color='#b6c4d6',lw=.6,label='Selezione prima del filtro');ax.plot(times,curve,color='#1865dc',lw=1.7,label='Orientamento filtrato');ax.axhline(0,color='grey',lw=.8);ax.set_ylim(-80,80);ax.grid();ax.legend();ax.set_xlabel('Tempo video (s)');ax.set_ylabel('Angolo apparente (gradi)');fig.savefig(root/'first-angle-review.png')
for t in [2,5,7,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90]:
 j=np.argmin(abs(times-t));print(t,round(float(curve[j]),1),out[j]['status'])
