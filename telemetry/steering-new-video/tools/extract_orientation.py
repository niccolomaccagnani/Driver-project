import cv2,numpy as np,pathlib,csv,argparse,json
cv2.setNumThreads(2)
parser=argparse.ArgumentParser(description='Track visible wheel-rim/LED orientation in this specific onboard recording.');parser.add_argument('video',type=pathlib.Path);parser.add_argument('--out',type=pathlib.Path,required=True);parser.add_argument('--until',type=float,default=200);args=parser.parse_args();root=args.out;root.mkdir(parents=True,exist_ok=True)
cap=cv2.VideoCapture(str(args.video));rows=[];debug=[];x0,y0=1000,1020;W,H=530,186;YY,XX=np.indices((H,W));last=0

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
 return sorted(out,key=lambda x:-x['score'])[:8],helmet
idx=-1
while True:
 ok,f=cap.read();idx+=1
 if not ok:break
 t=cap.get(cv2.CAP_PROP_POS_MSEC)/1000
 if f.shape[:2]!=(1206,2622):raise ValueError("Geometry calibrated for a 2622x1206 source image")
 if t>args.until:break
 im=f[y0:y0+H,x0:x0+W]
 led,mask=red_line(im);edges,helmet=edge_lines(im)
 row={'frame':idx,'video_time_s':round(t,6),'led_angle':led['angle'] if led else None,'led_count':led['count'] if led else 0,'led_span':led['span'] if led else 0,'edge_angle':edges[0]['angle'] if edges else None,'edges':edges,'led':led}
 rows.append(row)
 if idx%500==0:print(idx,round(t,1),row['led_angle'],row['edge_angle'],flush=True)
 if len(debug)<100 and t>=len(debug):
  show=np.uint8(np.sqrt(im.astype('float32')/255)*255)
  if led:
   for x,y in led['points']:cv2.circle(show,(round(x),round(y)),4,(0,255,80),1)
   cx,cy,vx,vy=led['line'];cx-=x0;cy-=y0;cv2.line(show,(int(cx-vx*120),int(cy-vy*120)),(int(cx+vx*120),int(cy+vy*120)),(0,255,80),1)
  if edges:
   a,b,c,d=edges[0]['line'];cv2.line(show,(int(a-x0),int(b-y0)),(int(c-x0),int(d-y0)),(255,100,0),1)
  cv2.putText(show,f'{t:.1f}s LED {row["led_angle"] if led else "?"}',(5,18),cv2.FONT_HERSHEY_SIMPLEX,.4,(0,255,255),1);debug.append(show)
(root/'raw-orientation.json').write_text(json.dumps(rows))
from PIL import Image
sheet=Image.new('RGB',(W*4,(H+20)*((len(debug)+3)//4)),'white')
for i,f in enumerate(debug):sheet.paste(Image.fromarray(cv2.cvtColor(f,cv2.COLOR_BGR2RGB)),(i%4*W,i//4*(H+20)))
sheet.save(root/'line-diagnostic.jpg');print('DONE',len(rows),'led',sum(r['led_angle'] is not None for r in rows),'edge',sum(r['edge_angle'] is not None for r in rows))
