"""Different HUD geometries with known pedal percentages, independent of any user video."""
import pathlib,tempfile,subprocess
from PIL import Image,ImageDraw,ImageFont
VALUES=[0,5,20,40,65,80,95,100,85,35,10,0]
BRAKES=[0,0,10,30,50,75,100,90,50,15,0,0]

def make_bar_fixtures():
 root=pathlib.Path(tempfile.mkdtemp(prefix='driver-bars-'))
 layouts={}
 for style in ['horizontal','vertical','reverse','gradient','unbounded']:
  folder=root/style;folder.mkdir()
  for i in range(12):
   size=(900,560) if style in ['horizontal','unbounded'] else (720,720) if style=='vertical' else (1280,720)
   image=Image.new('RGB',size,'#172536');draw=ImageDraw.Draw(image)
   font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',30 if style!='reverse' else 22)
   values=[VALUES[i],BRAKES[i]] if style!='reverse' else [[10,15,20,30,45,60,55,40,35,25,15,10][i],BRAKES[i]]
   if style=='unbounded':
    boxes=[(300,282,720,316)]
    draw.text((50,280),'THROTTLE',font=font,fill='white')
    draw.rectangle((300,282,551,316),fill=(0,220,0))
   elif style=='horizontal':
    boxes=[(300,282,720,316),(300,382,720,416)];colors=[((0,38,0),(0,220,0)),((38,0,0),(220,0,0))]
    for j,(box,(empty,fill),pct) in enumerate(zip(boxes,colors,values)):
     draw.text((50,280+j*100),['THROTTLE','BRAKE'][j],font=font,fill='white');draw.rectangle(box,fill=empty)
     length=round((box[2]-box[0]+1)*pct/100)
     if length:draw.rectangle((box[0],box[1],box[0]+length-1,box[3]),fill=fill)
   elif style=='vertical':
    boxes=[(120,140,158,540),(500,140,538,540)];colors=[(0,190,230),(245,190,0)]
    for j,(box,fill,pct) in enumerate(zip(boxes,colors,values)):
     draw.text((50 if j==0 else 470,80),['THROTTLE','BRAKE'][j],font=font,fill='white');draw.rectangle(box,fill=(180,180,180))
     inner=(box[0]+2,box[1]+2,box[2]-2,box[3]-2);draw.rectangle(inner,fill=(15,15,15))
     length=round((inner[3]-inner[1]+1)*pct/100)
     if length:draw.rectangle((inner[0],inner[3]-length+1 if j==0 else inner[1],inner[2],inner[3] if j==0 else inner[1]+length-1),fill=fill)
   else:
    boxes=[(830,510,1180,540),(830,590,1180,620)];colors=[((0,0,38),(0,0,220)),((38,0,38),(220,0,220))]
    for j,(box,(empty,fill),pct) in enumerate(zip(boxes,colors,values)):
     if style=='gradient':empty=(0,32,0) if j==0 else (32,0,0)
     draw.rectangle(box,fill=empty);length=round((box[2]-box[0]+1)*pct/100)
     if style=='gradient':
      for x in range(length):
       bright=round(64+185*x/(box[2]-box[0]));color=(0,bright,0) if j==0 else (bright,0,0);draw.line((box[0]+x,box[1],box[0]+x,box[3]),fill=color)
     elif length:draw.rectangle((box[2]-length+1 if j==0 else box[0],box[1],box[2] if j==0 else box[0]+length-1,box[3]),fill=fill)
     draw.text((box[0]+8,box[1]+1),['Throttle','Brake'][j],font=font,fill='white')
   if i==0:layouts[style]={'size':size,'boxes':boxes}
   image.save(folder/f'{i:03d}.png')
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','10','-i',str(folder/'%03d.png'),'-c:v','libx264','-crf','16','-pix_fmt','yuv420p',str(root/f'{style}.mp4')],check=True)
 return root,layouts
