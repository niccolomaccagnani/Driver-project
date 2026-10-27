"""Extract and filter apparent rim angle. Geometry is specific to the supplied recording."""
import argparse,csv,hashlib,json,pathlib
import cv2,numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve
from rim_features import edge_lines,red_line,ridge,paired_led,x0,y0,W,H

def filter_frames(frames):
    n=len(frames)
    times=np.array([r['video_time_s'] for r in frames])
    for r in frames:
     for e in r['candidates']:
      a=np.array(e['line'][:2]);b=np.array(e['line'][2:]);length=np.linalg.norm(b-a)
      along=abs(np.dot((a+b)/2-[1250,1190],(b-a)/length))
      e['centrality']=float(np.exp(-(max(0,along-length/2-20)/30)**2))
      e['quality']*=e['centrality']
     r['candidates']=[e for e in r['candidates'] if e['quality']>.08]
    chosen=np.array([np.argmax([e['quality'] for e in r['candidates']]) if r['candidates'] else -1 for r in frames])
    values=np.array([r['candidates'][j]['angle'] if j>=0 else np.nan for r,j in zip(frames,chosen)])
    observed=np.isfinite(values)
    rejected=np.zeros(n,bool)
    for k in range(n):
     if not observed[k]:continue
     neighbours=values[max(0,k-3):min(n,k+4)];neighbours=neighbours[np.isfinite(neighbours)]
     if len(neighbours)<4:continue
     median=np.median(neighbours);mad=np.median(abs(neighbours-median))
     rejected[k]=abs(values[k]-median)>max(12.,4*mad)
    values[rejected]=np.nan;observed=np.isfinite(values)
    valid=observed.copy();imputed=np.zeros(n,bool);i=0
    while i<n:
     if observed[i]:i+=1;continue
     a=i
     while i<n and not observed[i]:i+=1
     if a>0 and i<n and times[i]-times[a-1]<=.25:valid[a:i]=True;imputed[a:i]=True
    curve=np.full(n,np.nan);i=0
    while i<n:
     if not valid[i]:i+=1;continue
     a=i
     while i<n and valid[i]:i+=1
     m=i-a;v=np.nan_to_num(values[a:i]);w=observed[a:i].astype(float);local=np.interp(times[a:i],times[a:i][w>0],values[a:i][w>0]);D=sparse.diags([np.ones(max(0,m-2)),-2*np.ones(max(0,m-2)),np.ones(max(0,m-2))],[0,1,2],shape=(max(0,m-2),m)) if m>=3 else sparse.csr_matrix((0,m))
     for _ in range(5):
      robust=np.minimum(1,5/(abs(v-local)+1e-6))*w
      local=spsolve((sparse.diags(robust+1e-8)+3*(D.T@D)).tocsc(),robust*v)
     curve[a:i]=local
    zero=float(np.nanmedian(curve[(times>=1)&(times<4)]));curve-=zero;values-=zero
    out=[]
    for i,r in enumerate(frames):
     e=r['candidates'][chosen[i]] if chosen[i]>=0 and observed[i] else None
     out.append({'frame_index':i,'video_time_s':r['video_time_s'],'steering_apparent_deg':round(float(curve[i]),3) if valid[i] else None,'selected_angle_raw_deg':round(float(values[i]),3) if observed[i] else None,'status':'short_gap_reconstructed' if imputed[i] else 'visual_orientation_estimate' if observed[i] else 'unreadable','support_strength':e['quality'] if e else 0,'visual_support':'strong' if e and e['quality']>.4 else 'weak','selected_segment':e['line'] if e else None,'temporal_outlier_rejected':bool(rejected[i])})
    return out, {'zero_offset_deg':zero,'frames':n,'observed':int(observed.sum()),'reconstructed':int(imputed.sum()),'unreadable':int((~valid).sum()),'returned':int(valid.sum()),'temporal_outliers_rejected':int(rejected.sum())}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video',type=pathlib.Path)
    parser.add_argument('--out',type=pathlib.Path,required=True)
    args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
    cv2.setNumThreads(2);cap=cv2.VideoCapture(str(args.video))
    frames=[]
    while True:
        ok,image=cap.read()
        if not ok:break
        if image.shape[:2]!=(1206,2622):raise ValueError('This model requires the original 2622×1206 camera geometry.')
        crop=image[y0:y0+H,x0:x0+W];led,_=red_line(crop);edges,_=edge_lines(crop);candidates=[]
        for edge in edges:
            edge=ridge(crop,edge)
            if edge['quality']<.06:continue
            agreed,agreement=paired_led(edge,led)
            edge['marker_agreement']=agreed;edge['quality']=min(.99,edge['quality']*(1+agreement));candidates.append(edge)
        frames.append({'frame_index':len(frames),'video_time_s':round(cap.get(cv2.CAP_PROP_POS_MSEC)/1000,6),'candidates':candidates})
        if len(frames)%500==0:print('Extracted',len(frames),flush=True)
    cap.release()
    if not frames:raise ValueError('No frames decoded')
    rows,metadata=filter_frames(frames)
    metadata.update(quantity='apparent 2D rim orientation; not calibrated mechanical steering',sign='clockwise positive (right), counterclockwise negative (left) in this recording',zero_video_interval_s=[1,4],max_reconstructed_gap_s=.25,smoothing_penalty=3,temporal_rejection_window_frames=7,method='grey-ridge contrast, central-bar geometry, geometric LED corroboration; local outlier rejection; robust smoothing within valid segments only',source_file=args.video.name,source_sha256=hashlib.file_digest(args.video.open('rb'),'sha256').hexdigest(),geometry_specific=True,algorithm_version='ridge-central-v1')
    (args.out/'steering.json').write_text(json.dumps(rows,separators=(',',':')))
    (args.out/'metadata.json').write_text(json.dumps(metadata,indent=2))
    with (args.out/'steering.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
    print(json.dumps(metadata,indent=2))

if __name__=='__main__':main()
