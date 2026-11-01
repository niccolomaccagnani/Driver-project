"""Compare every native decoded frame and timestamp with ffprobe, including B frames and VFR."""
import asyncio,json,pathlib,threading,subprocess,tempfile
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from PIL import Image,ImageDraw
from playwright.async_api import async_playwright
from fixtures import make_fixtures
ROOT=pathlib.Path(__file__).resolve().parents[1]
async def check():
 source=make_fixtures();root=pathlib.Path(tempfile.mkdtemp(prefix='driver-native-'));expected={}
 for i in range(12):
  im=Image.open(source/'hud'/f'{i:03d}.png');draw=ImageDraw.Draw(im)
  for bit in range(4):draw.rectangle((870+bit*7,530,876+bit*7,559),fill=(230,230,230) if i&(1<<bit) else (15,15,15))
  im.save(root/f'{i:03d}.png')
 durations=[.04,.12,.08,.2,.04,.16,.08,.04,.12,.16,.04,.12]
 (root/'vfr.txt').write_text(''.join(f"file '{root/f'{i:03d}.png'}'\nduration {d}\n" for i,d in enumerate(durations))+f"file '{root/'011.png'}'\n")
 for name,options in [('fast',['-framerate','60','-i',str(root/'%03d.png')]),('variable',['-f','concat','-safe','0','-i',str(root/'vfr.txt'),'-fps_mode','vfr'])]:
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*options,'-c:v','libx264','-crf','14','-pix_fmt','yuv420p',str(root/f'{name}.mp4')],check=True)
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,pkt_duration_time','-of','json',str(root/f'{name}.mp4')]))
  expected[name]=[float(f['best_effort_timestamp_time']) for f in probe['frames']]
 class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
   file=root/self.path.removeprefix('/fixtures/') if self.path.startswith('/fixtures/') else ROOT/'Driver notes.html';self.send_response(200);self.send_header('Content-Type','video/mp4' if self.path.startswith('/fixtures/') else 'text/html');self.end_headers();self.wfile.write(file.read_bytes())
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded');report={}
  for name in expected:
   result=await page.evaluate('''async name=>{const b=await(await fetch('/fixtures/'+name+'.mp4')).blob(),file=new File([b],name+'.mp4',{type:'video/mp4'}),source=await DriverFrames.open(file),out=[],c=document.createElement('canvas');for await(const item of source.frames()){try{source.draw(c,item.frame);out.push({index:item.index,time:item.time,marker:Array.from({length:4},(_,bit)=>c.getContext('2d').getImageData(873+bit*7,545,1,1).data[0]>128?1<<bit:0).reduce((a,b)=>a+b,0)});}finally{item.frame.close();}}const single=await source.frameAt(7);let red;try{source.draw(c,single.frame);red=Array.from({length:4},(_,bit)=>c.getContext('2d').getImageData(873+bit*7,545,1,1).data[0]>128?1<<bit:0).reduce((a,b)=>a+b,0);}finally{single.frame.close();}const extracted=await DriverOCR.analyze(file);return {count:source.count,variable:source.variable,frames:out,singleRed:red,extractedTimes:extracted.lap.rows.map(r=>r[1]),frameMode:extracted.lap.frameMode,decodedCount:extracted.quality.frames.decodedCount};}''',name)
   assert len(result['frames'])==result['count']==len(expected[name]),(name,result)
   assert all(abs(a['time']-b)<.000002 for a,b in zip(result['frames'],expected[name])),(name,result,expected[name])
   assert all(a['index']==i and a['marker']==min(i,11) for i,a in enumerate(result['frames'])),result
   assert result['singleRed']==7,result
   assert result['frameMode']=='native' and result['decodedCount']==len(expected[name])
   assert len(result['extractedTimes'])==len(expected[name]) and all(abs(a-b)<.000002 for a,b in zip(result['extractedTimes'],expected[name]))
   if name=='fast':assert result['count']==12
   else:assert result['variable'] and len(set(round(expected[name][i]-expected[name][i-1],3) for i in range(1,len(expected[name]))))>1
   report[name]={'timestamps_ffprobe':expected[name],'timestamps_decoded':[f['time'] for f in result['frames']],'count':result['count']}
  compatibility=await page.evaluate("""async()=>{const b=await(await fetch('/fixtures/fast.mp4')).blob(),original=window.VideoDecoder;window.VideoDecoder=undefined;try{const result=await DriverOCR.analyze(new File([b],'fast.mp4',{type:'video/mp4'}),{frameMode:'sampled',sampleRate:30});return {count:result.lap.rows.length,mode:result.quality.frames.mode};}finally{window.VideoDecoder=original;}}""")
  assert compatibility=={'count':6,'mode':'sampled'},compatibility
  dropped=await page.evaluate("""async()=>{const blob=await(await fetch('/fixtures/fast.mp4')).blob(),file=new File([blob],'dropped.mp4',{type:'video/mp4'}),source=await DriverFrames.open(file),sample=await source.frameAt(2),skip=sample.stamp,Original=window.VideoDecoder;sample.frame.close();window.VideoDecoder=class {constructor(options){return new Original({...options,output:frame=>{if(frame.timestamp===skip)frame.close();else options.output(frame)}})}static isConfigSupported(c){return Original.isConfigSupported(c)}};try{const r=await DriverOCR.analyze(file);return {rows:r.lap.rows,frames:r.quality.frames,reason:r.reason};}finally{window.VideoDecoder=Original}}""")
  assert len(dropped['rows'])==12 and dropped['rows'][2][3:]==[None]*5,dropped
  assert dropped['frames']['unavailableFrames']==[2] and dropped['frames']['decodedCount']==11 and dropped['frames']['timelineCount']==12,dropped
  assert all(abs(r[1]-t)<.000002 for r,t in zip(dropped['rows'],expected['fast']))
  assert 'fotogrammi non decodificabili' in dropped['reason']

  assert not errors,errors
  (ROOT/'tests/native-frames-report.json').write_text(json.dumps(report,indent=2)+'\n');await browser.close()
 server.shutdown();print('PASS: every frame and original timestamp matches ffprobe for 60 fps and variable-rate MP4 with B frames; pixels confirm order; random access returns the correct source frame.')
asyncio.run(check())
