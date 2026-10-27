"""Render measured segments and filtered values into an ASS overlay."""
import argparse,json,pathlib
parser=argparse.ArgumentParser();parser.add_argument('--out',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);args=parser.parse_args();root=args.out
rows=json.loads((root/'steering.json').read_text())
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
for i,row in enumerate(rows):
 start=row['video_time_s'];end=rows[i+1]['video_time_s'] if i+1<len(rows) else 94.35
 if end<=start:continue
 value=row['steering_apparent_deg'];text=f'{start:05.2f}s  {value:+.1f}° visivi' if value is not None else f'{start:05.2f}s  non leggibile'
 text+=' | LED + modello' if row.get('reference_source')=='led_row' and value is not None else ''
 text+=' | ricostruzione breve' if row['status']=='short_gap_reconstructed' else ' | supporto debole' if row['visual_support']=='weak' and value is not None else ''
 lines.append(f'Dialogue: 2,{clock(start)},{clock(end)},Default,,0,0,0,,{{\\pos(10,8)}}{text}\n')
 lines.append(f'Dialogue: 0,{clock(start)},{clock(end)},Default,,0,0,0,,{{\\an7\\pos(0,0)\\p1\\bord0\\c&H999999&\\alpha&H60&}}m 80 119 l 736 119 l 736 121 l 80 121{{\\p0}}\n')
 segment=row['selected_segment']
 if segment is None or value is None:continue
 x1,y1,x2,y2=segment;x1=(x1-1000)*1.6;x2=(x2-1000)*1.6;y1=(y1-1020)*1.6;y2=(y2-1020)*1.6
 color='70FF70' if row['visual_support']=='strong' else '50CFFF'
 lines.append(f'Dialogue: 1,{clock(start)},{clock(end)},Default,,0,0,0,,{{\\an7\\pos(0,0)\\p1\\bord2\\shad0\\c&H{color}&\\3c&H{color}&}}m {x1:.0f} {y1:.0f} l {x2:.0f} {y2:.0f}{{\\p0}}\n')
(root/'overlay.ass').write_text(''.join(lines));print('Overlay events',len(lines))
