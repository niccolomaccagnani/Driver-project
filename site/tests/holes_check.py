"""Audit every previously blank speed sample against the source-frame transcription.
Use --result for the new full extraction and --previous for the engine-5 extraction.
"""
import argparse,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def result(path):
 d=json.loads(path.read_text());return d.get('result',d)
def check(args):
 new=result(args.result);old=result(args.previous);refs=json.loads((ROOT/'tests/holes-reference.json').read_text())['references'];rows=new['lap']['rows'];before=old['lap']['rows'];audit=[]
 assert len(rows)==len(before)==2966
 for i,(a,b) in enumerate(zip(rows,before)):
  assert a[:3]==b[:3] and a[0]==i
  if b[3] is not None:assert a[3]==b[3],('previous value changed',i,b[3],a[3])
 assert sum(r[3] is None for r in before)==len(refs)==125
 for ref in refs:
  n=ref['frame'];expected=ref['visibleSpeed'];actual=rows[n][3];assert before[n][3] is None
  if ref['reason'] not in ['decoder-unavailable','source-overlay-zero']:assert actual==expected,(n,actual,expected)
  else:assert actual is None,(n,'should remain unavailable or rejected',actual)
  audit.append({**ref,'previous':None,'updated':actual})
 info=new['quality']['speedRecovery'];recovered={r['frame'] for r in info['recovered']}
 assert recovered=={r['frame'] for r in refs if r['reason'] not in ['decoder-unavailable','source-overlay-zero']}
 assert len(info['recovered'])==123 and new['quality']['channels']['speed']['missing']==2
 assert any(r['frame']==2477 and r['candidate']==0 and r['reason']=='implausible-speed-change' for r in info['rejected'])
 report={'scope':'All 125 previously missing speed samples inspected from FFmpeg source frames and manually transcribed; two remain deliberately blank. Previously accepted speed readings must remain unchanged.','causes':{reason:sum(r['reason']==reason for r in refs) for reason in sorted({r['reason'] for r in refs})},'previousMissing':125,'recovered':123,'remaining':2,'rows':audit,'speedRecovery':info}
 args.output.write_text(json.dumps(report,indent=2)+'\n');print('PASS: all 123 valid gaps recovered exactly; original readings unchanged; decoder frame 1 and source HUD zero at frame 2477 remain blank.')
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--result',type=pathlib.Path,required=True);p.add_argument('--previous',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,default=ROOT/'validation/rejected-speed-audit.json');check(p.parse_args())
