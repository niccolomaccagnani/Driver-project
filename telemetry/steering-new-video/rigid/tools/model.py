import cv2,numpy as np,json,pathlib
cv2.setNumThreads(2)
calibration=json.loads((pathlib.Path(__file__).resolve().parents[1]/'model-calibration.json').read_text())
C=np.array(calibration['center']);R=calibration['radius']
angles=np.arange(-78,78.01,.5);offsets=np.array([-4.,0,4.]);u=np.arange(-125,125.1,3.)
th=np.radians(angles);v=np.stack([np.cos(th),np.sin(th)],axis=1);normal=np.stack([-np.sin(th),np.cos(th)],axis=1)
points=C[None,None,None,:]-(R+offsets[None,:,None,None])*normal[:,None,None,:]+u[None,None,:,None]*v[:,None,None,:]-[1000,1020]

def score(im):
 gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY).astype(np.float32);hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
 xx=points[...,0];yy=points[...,1];shape=xx.shape
 def sample(mat,delta=0):
  x=xx+delta*normal[:,None,None,0];y=yy+delta*normal[:,None,None,1]
  return cv2.remap(mat,x.reshape(len(angles)*len(offsets),-1).astype('float32'),y.reshape(len(angles)*len(offsets),-1).astype('float32'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT).reshape(shape)
 peak=sample(gray);up=sample(gray,-7);down=sample(gray,7);sat=sample(hsv[:,:,1]);valid=(xx>5)&(xx<524)&(yy>9)&(yy<177)
 contrast=np.minimum(peak-up,peak-down);neutral=(sat<95)&(peak<145)
 good=valid&neutral&(contrast>2)
 # Give each visible part equal influence, with a penalty for too little support.
 weights=np.clip(contrast,0,18)/18 * good
 count=valid.sum(axis=-1);supported=good.sum(axis=-1);coverage=supported/np.maximum(1,count)
 q=weights.sum(axis=-1)/np.maximum(35,count)
 q*=np.minimum(1,supported/20)
 best=np.argmax(q,axis=1);quality=q[np.arange(len(angles)),best]
 return quality,{'coverage':coverage[np.arange(len(angles)),best],'offset':offsets[best],'supported':supported[np.arange(len(angles)),best]}
