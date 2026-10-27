import json,pathlib,numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve
import argparse,csv
from model import C,R
parser=argparse.ArgumentParser();parser.add_argument('--out',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);args=parser.parse_args();root=args.out

def solve(use_flow=True):
 d=np.load(root/'evidence.npz');rim=d['scores'];led=d['led_scores'];scores=rim+.45*led;times=d['times'];angles=d['angles'];n,g=scores.shape;flow=d['flow'];mad=d['flow_mad'];backs=np.zeros((n,g),np.int16)
 # Scores remain absolute; no observations are manufactured by normalizing weak frames.
 unary=-np.log(.025+scores)
 anchors=np.full(n,-1,int)
 for i in range(n):
  j=int(np.argmax(rim[i]));outside=abs(angles-angles[j])>8
  second=float(rim[i,outside].max())
  if rim[i,j]>.42 and d['support'][i,j]>=28 and rim[i,j]>1.4*second:anchors[i]=j
  lj=int(np.argmax(led[i]))
  if led[i,lj]>.5 and rim[i].max()<.35:anchors[i]=lj
  if anchors[i]>=0:unary[i,abs(angles-angles[anchors[i]])>2.]=50.
 cost=unary[0]+.005*angles**2
 velocity=np.zeros(g)
 for i in range(1,n):
  delta=flow[i] if use_flow else np.zeros(g)
  reliable=(mad[i]<.7)&(scores[i-1]>.42)
  predicted=np.where(reliable,.5*velocity+.5*delta,velocity)
  diff=angles[None,:]-angles[:,None]
  # Preserve clear fast manoeuvres; ambiguity alone must not cause a sudden pose switch.
  strong_destination=((rim[i]>.42)&(d['support'][i]>=28))|(led[i]>.5)
  acceleration=diff-predicted[:,None]*np.where(strong_destination,1.,.85)[None,:]
  penalty=(.018*acceleration**2+.0015*diff**2)
  penalty[:,strong_destination]=np.minimum(penalty[:,strong_destination],3.)
  mat=cost[:,None]+penalty;back=np.argmin(mat,axis=0);backs[i]=back;cost=mat.min(axis=0)+unary[i]
  velocity=angles-angles[back]

 chosen=np.empty(n,int);j=int(np.argmin(cost))
 for i in range(n-1,-1,-1):chosen[i]=j;j=int(backs[i,j]) if i else j
 raw=angles[chosen];selected=scores[np.arange(n),chosen];best=scores.max(axis=1)
 # Support must come from the actual selected pose, not an unrelated high scoring pose.
 selected_rim=rim[np.arange(n),chosen];selected_led=led[np.arange(n),chosen]
 observed=((selected_rim>.25)&(d['support'][np.arange(n),chosen]>=28))|((selected_rim>.13)&(d['support'][np.arange(n),chosen]>=28))|(selected_led>.35)
 base_observed=observed.copy()
 good_indices=np.flatnonzero(base_observed)
 for i in np.flatnonzero(~base_observed):
  k=np.searchsorted(good_indices,i)
  if k==0 or k==len(good_indices):continue
  left,right=good_indices[k-1:k+1]
  if times[right]-times[left]>.5:continue
  predicted=np.interp(times[i],[times[left],times[right]],[raw[left],raw[right]])
  if selected_rim[i]>.13 and d['support'][i,chosen[i]]>=16 and abs(raw[i]-predicted)<8:observed[i]=True
 valid=observed.copy();imputed=np.zeros(n,bool);i=0
 while i<n:
  if observed[i]:i+=1;continue
  a=i
  while i<n and not observed[i]:i+=1
  if a>0 and i<n and times[i]-times[a-1]<=.3:valid[a:i]=True;imputed[a:i]=True
 curve=np.full(n,np.nan);i=0
 while i<n:
  if not valid[i]:i+=1;continue
  a=i
  while i<n and valid[i]:i+=1
  m=i-a;values=raw[a:i];weights=observed[a:i].astype(float);local=values.copy()
  D=sparse.diags([np.ones(m-2),-2*np.ones(m-2),np.ones(m-2)],[0,1,2],shape=(m-2,m)) if m>=3 else sparse.csr_matrix((0,m))
  for _ in range(5):
   w=weights*np.minimum(1,4/(abs(values-local)+1e-6));local=spsolve((sparse.diags(w+1e-8)+.3*(D.T@D)).tocsc(),w*values)
  curve[a:i]=local
 zero=float(np.nanmedian(curve[(times>=1)&(times<4)]));curve-=zero;raw=raw-zero;out=[]
 for i in range(n):
  angle=angles[chosen[i]];theta=np.radians(angle);normal=np.array([-np.sin(theta),np.cos(theta)]);v=np.array([np.cos(theta),np.sin(theta)]);radius=R+d['offsets'][i,chosen[i]];foot=C-radius*normal;segment=np.r_[foot-100*v,foot+100*v]
  out.append({'frame_index':i,'video_time_s':round(float(times[i]),6),'steering_apparent_deg':round(float(curve[i]),3) if valid[i] else None,'selected_angle_raw_deg':round(float(raw[i]),3) if observed[i] else None,'status':'short_gap_reconstructed' if imputed[i] else 'visual_orientation_estimate' if observed[i] else 'unreadable','support_strength':round(float(selected[i]),4),'visual_support':'strong' if selected_rim[i]>.4 else 'weak','selected_segment':segment.tolist() if observed[i] else None,'model_angle_deg':float(angle),'reference_source':'led_row' if selected_led[i]>.35 and selected_rim[i]<.25 else 'rim_model','rim_support':round(float(selected_rim[i]),4),'led_support':round(float(selected_led[i]),4),'flow_delta_deg':float(flow[i,chosen[i-1]]) if i else 0.,'flow_mad_deg':float(mad[i,chosen[i-1]]) if i else 99.})
 (root/'steering.json').write_text(json.dumps(out,separators=(',',':')))
 with (root/'steering.csv').open('w') as f:
  writer=csv.DictWriter(f,fieldnames=list(out[0]),lineterminator='\n');writer.writeheader();writer.writerows(out)
 metadata={'frames':n,'returned':int(valid.sum()),'observed':int(observed.sum()),'reconstructed':int(imputed.sum()),'unreadable':int((~valid).sum()),'zero_offset_deg':zero,'zero_video_interval_s':[1,4],'max_reconstructed_gap_s':.3,'smoothing_penalty':.3,'quantity':'apparent 2D rim orientation; not calibrated mechanical steering','method':'signed rotation geometry, dense rim-profile evidence, LED pairs in the expected wheel region, confidence anchors, angular-motion association with forward/backward flow checks, local robust filtering','sign':'clockwise positive (right), counterclockwise negative (left) for this recording','source_sha256':'ca36168ed18eaa93cbdf5ec996b47f54d838ae31151f85d373f54e10c5fff790','overlay_note':'The overlay is the fitted rim pose, not a measured segment endpoint pair; amber includes indirect LED support.'}
 (root/'metadata.json').write_text(json.dumps(metadata,indent=2))
 print(json.dumps(metadata,indent=2))
 return out
if __name__=='__main__':solve(True)
