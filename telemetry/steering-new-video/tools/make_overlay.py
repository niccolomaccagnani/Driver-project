import json,pathlib,argparse,numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--out',type=pathlib.Path,required=True);args=parser.parse_args();root=args.out;rows=json.load(open(root/'steering-angle.json'));raw=json.load(open(root/'raw-orientation.json'));meta=json.load(open(root/'steering-metadata.json'));scale=1.6
header='''[Script Info]
ScriptType: v4.00+
PlayResX: 848
PlayResY: 298
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,21,&H00FFFFFF,&H000000FF,&H00101010,&H50000000,0,0,0,0,100,100,0,0,1,1.4,0,7,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
def clock(t):
 c=round(t*100);return f'{c//360000}:{c//6000%60:02d}:{c//100%60:02d}.{c%100:02d}'
lines=[header]
for i,(r,rr) in enumerate(zip(rows,raw)):
 start=r['video_time_s'];end=rows[i+1]['video_time_s'] if i+1<len(rows) else 94.35
 if end<=start:continue
 val=r['steering_apparent_deg'];text=f"{start:05.2f}s  {val:+.1f}° visivi" if val is not None else f"{start:05.2f}s  non leggibile"
 text+='  | stima breve' if r['status']=='short_gap_reconstructed' else '  | supporto debole' if r['visual_support']=='weak' else ''
 lines.append(f'Dialogue: 2,{clock(start)},{clock(end)},Default,,0,0,0,,{{\\pos(10,8)}}{text}\n')
 lines.append(f'Dialogue: 0,{clock(start)},{clock(end)},Default,,0,0,0,,{{\\an7\\pos(0,0)\\p1\\bord0\\c&H999999&\\alpha&H60&}}m 80 119 l 736 119 l 736 121 l 80 121{{\\p0}}\n')
 if val is None or r['status']=='short_gap_reconstructed':continue
 target=rr.get('led_angle');selected=r['selected_angle_raw_deg']+meta['zero_offset_deg']
 segment=None
 if target is not None and rr['led_count']>=3 and abs(meta['led_to_rim_slope']*target+meta['led_to_rim_intercept']-selected)<8:
  cx,cy,vx,vy=rr['led']['line'];segment=[cx-vx*100,cy-vy*100,cx+vx*100,cy+vy*100]
 elif rr['edges']:
  e=min(rr['edges'],key=lambda x:abs(x['angle']-selected))
  if abs(e['angle']-selected)<8:segment=e['line']
 if segment:
  x1,y1,x2,y2=segment;x1=(x1-1000)*scale;x2=(x2-1000)*scale;y1=(y1-1020)*scale;y2=(y2-1020)*scale
  color='70FF70' if r['visual_support']=='strong' else '50CFFF'
  lines.append(f'Dialogue: 1,{clock(start)},{clock(end)},Default,,0,0,0,,{{\\an7\\pos(0,0)\\p1\\bord2\\shad0\\c&H{color}&\\3c&H{color}&}}m {x1:.0f} {y1:.0f} l {x2:.0f} {y2:.0f}{{\\p0}}\n')
(root/'overlay.ass').write_text(''.join(lines))
print('Overlay events:',len(lines))
