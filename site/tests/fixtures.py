"""Deterministic labelled HUD clips with known values for actual OCR verification."""
import pathlib,subprocess,tempfile
from PIL import Image,ImageDraw,ImageFont

def make_fixtures():
 root=pathlib.Path(tempfile.mkdtemp(prefix='driver-notes-ocr-'))
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',40)
 for kind in ['hud','partial','blank']:
  folder=root/kind;folder.mkdir()
  for i in range(12):
   im=Image.new('RGB',(900,560),'#24384a');d=ImageDraw.Draw(im)
   texts=[f'SPEED {120+i} KM/H',f'RPM {6000+i*20}','GEAR 4','THROTTLE 80 %','BRAKE 0 %'] if kind=='hud' else [f'RPM {6000+i*20}'] if kind=='partial' else ['ONBOARD WITHOUT HUD']
   for j,text in enumerate(texts):d.text((40,30+j*96),text,font=font,fill='white')
   im.save(folder/f'{i:03d}.png')
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','10','-i',str(folder/'%03d.png'),'-c:v','libx264','-pix_fmt','yuv420p',str(root/f'{kind}.mp4')],check=True)
 return root
