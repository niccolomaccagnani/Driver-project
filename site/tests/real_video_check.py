"""Optional real-footage regression; private source stays outside the repository.
Usage: python site/tests/real_video_check.py --video /path/onboard.mov --output /tmp/reading-check.json
Use --result /path/full-result.json to validate an existing complete extraction too.
"""
import argparse,asyncio,csv,hashlib,json,pathlib,subprocess,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
REFERENCES={
 0:[205,7480,4,100,0],4:[207,7560,4,100,0],5:[209,7570,4,100,0],6:[209,7620,4,100,0],8:[209,7620,4,100,0],17:[213,7730,4,100,0],
 183:[182,6020,4,100,71],213:[148,6650,3,0,0],249:[143,6620,3,100,0],250:[144,6600,3,100,0],251:[144,6630,3,100,0],252:[144,6700,3,100,0],281:[164,7620,3,100,0],
 460:[234,7230,5,100,0],461:[234,7260,5,100,0],462:[234,7270,5,100,0],463:[234,7230,5,100,0],464:[234,7240,5,100,0],465:[234,7190,5,100,0],493:[237,7270,5,100,0],
 663:[274,7200,5,100,100],693:[165,6650,3,100,100],723:[113,6040,2,100,18],1233:[297,8060,6,100,0],1263:[286,6960,6,100,100],1293:[169,6400,3,100,100],1323:[99,5940,1,100,49],
 1350:[72,5430,1,100,0],1351:[72,5380,1,100,0],1352:[71,5390,1,100,0],1353:[71,5340,1,0,0],1383:[70,5920,1,34,0],1413:[92,5120,2,15,4]
}
def validate(result,timestamps):
 rows=result['lap']['rows'];by_index={r[0]:r for r in rows};errors=[];missing=[];read=0
 for index,expected in REFERENCES.items():
  row=by_index[index]
  assert abs(row[1]-timestamps[index])<.000002,(index,row[1],timestamps[index])
  for c,(actual,target) in enumerate(zip(row[3:],expected)):
   if actual is None:missing.append({'frame':index,'channel':c});continue
   read+=1
   if abs(actual-target)>(4 if c>=3 else 0):errors.append({'frame':index,'channel':c,'expected':target,'observed':actual})
 report={'scope':'33 visually transcribed source frames; numeric references exact, pedal references estimated from full visible track (tolerance 4 percentage points). Remaining frames have not all been annotated by hand.','references':len(REFERENCES)*5,'read':read,'missing':missing,'errors':errors,'channels':result['quality']['channels'],'frames':result['quality']['frames']}
 return report
async def main(args):
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',str(args.video)]));times=[float(x['best_effort_timestamp_time']) for x in probe['frames']]
 assert len(times)==2966,'This reference table belongs to the supplied 2966-frame video.'
 if args.result:
  payload=json.loads(args.result.read_text());result=payload.get('result',payload)
  rows=result['lap']['rows'];assert len(rows)==len(times)
  assert all(r[0]==i and abs(r[1]-times[i])<.000002 for i,r in enumerate(rows))
 else:
  class Handler(BaseHTTPRequestHandler):
   def do_GET(self):
    file=args.video if self.path=='/video' else ROOT/'Driver notes.html';self.send_response(200);self.send_header('Content-Type','video/quicktime' if self.path=='/video' else 'text/html');self.end_headers()
    with file.open('rb') as f:
     while block:=f.read(1024*1024):self.wfile.write(block)
   def log_message(self,*a):pass
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=await browser.new_page();await page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
   result=await page.evaluate('''async indices=>{const wanted=new Set(indices),open=DriverFrames.open.bind(DriverFrames);DriverFrames.open=async(...args)=>{const source=await open(...args),frames=source.frames.bind(source);source.frames=async function*(...a){for await(const item of frames(...a)){if(item.index>Math.max(...indices)){item.frame?.close();return;}if(wanted.has(item.index))yield item;else item.frame?.close();}};return source};const blob=await(await fetch('/video')).blob();return DriverOCR.analyze(new File([blob],'onboard.mov',{type:'video/quicktime'}));}''',list(REFERENCES))
   await browser.close()
  server.shutdown()
 report=validate(result,times);report['sourceSha256']=hashlib.file_digest(args.video.open('rb'),'sha256').hexdigest();assert report['sourceSha256']=='1fcececb97c73ea242cd021231fa9f9e90e97c3c655b79d96bcbb83a5be72443';args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
 assert not report['errors'],report['errors']
 assert len(report['missing'])<=5,report['missing']
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--video',type=pathlib.Path,required=True);p.add_argument('--result',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path,default=pathlib.Path('/tmp/real-reading-check.json'));asyncio.run(main(p.parse_args()))
