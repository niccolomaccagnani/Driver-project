"""Image-level checks: camera motion versus local motion; no angle-readiness claim."""
import cv2
import numpy as np
from automatic_activity import visual_step, W, H, ASPECT
cv2.setNumThreads(2)
rng=np.random.default_rng(21)
gray=cv2.GaussianBlur(rng.integers(0,256,(H,W),dtype=np.uint8),(3,3),.5)
image=cv2.cvtColor(gray,cv2.COLOR_GRAY2BGR)
center=np.array([228.,132.],np.float32)
camera=cv2.warpAffine(image,np.float32([[1,0,2],[0,1,1]]),(W,H),borderMode=cv2.BORDER_REFLECT)
angle,support,_=visual_step(image,camera,center.copy())
assert angle is None or abs(angle)<.5,(angle,support)
y,x=np.indices((H,W));radius=np.hypot(x-center[0],(y-center[1])/ASPECT)
mask=(radius<118)&(y>84)&(y<175)&(x>110)&(x<325)
for sign in [-1,1]:
 theta=np.radians(2*sign);c,s=np.cos(theta),np.sin(theta);cx,cy=center
 matrix=np.float32([[c,-s/ASPECT,cx-c*cx+s/ASPECT*cy],[s*ASPECT,c,cy-s*ASPECT*cx-c*cy]])
 changed=image.copy();rotated=cv2.warpAffine(image,matrix,(W,H),borderMode=cv2.BORDER_REFLECT);changed[mask]=rotated[mask]
 increment,score,_=visual_step(image,changed,center.copy())
 assert increment is not None and abs(abs(increment)-2)<.8 and score>.25,(increment,score)
print('PASS: pure camera translation suppressed; local clockwise and counterclockwise visual motion detected. This does not validate steering angles in the actual recordings.')
