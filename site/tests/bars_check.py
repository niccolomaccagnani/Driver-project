"""Real OCR label discovery + geometric bar measurement across layouts and directions."""
import asyncio,json,pathlib,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
from bar_fixtures import make_bar_fixtures,VALUES,BRAKES
ROOT=pathlib.Path(__file__).resolve().parents[1]
async def check():
 fixtures,layouts=make_bar_fixtures()
 class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
   file=fixtures/self.path.removeprefix('/fixtures/') if self.path.startswith('/fixtures/') else ROOT/'Driver notes.html'
   self.send_response(200);self.send_header('Content-Type','image/png' if self.path.endswith('.png') else 'video/mp4' if self.path.startswith('/fixtures/') else 'text/html; charset=utf-8');self.end_headers();self.wfile.write(file.read_bytes())
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
  report={}
  for style in layouts:
   result=await page.evaluate('''async style=>{const blob=await(await fetch('/fixtures/'+style+'.mp4')).blob();return DriverOCR.analyze(new File([blob],style+'.mp4',{type:'video/mp4'}),{sampleRate:10});}''',style)
   observed=[r[6:8] for r in (result.get('lap') or {}).get('rows',[])]
   if style=='unbounded':
    assert not observed,'An unbounded fill must not be called 100%.'
    assert 'Acceleratore' in result['missing']
    manual=await page.evaluate("""async()=>{const b=await(await fetch('/fixtures/unbounded.mp4')).blob();return DriverOCR.analyze(new File([b],'unbounded.mp4',{type:'video/mp4'}),{sampleRate:10,regions:{throttle:{kind:'bar',x:300/900,y:282/560,w:421/900,h:35/560,axis:'horizontal',direction:'left',tone:'bright',manual:true}}});}""")
    assert len(manual['lap']['rows'])==12
    assert all(abs(r[6]-60)<=2 for r in manual['lap']['rows']),manual['lap']['rows']
    report[style]={'automatic':'unreadable without full track','manual':[r[6] for r in manual['lap']['rows']]}
    # A stored manual calibration survives a new run through the site queue.
    await page.evaluate("""async()=>{const blob=await(await fetch('/fixtures/unbounded.mp4')).blob(),file=new File([blob],'Custom bar.mp4',{type:'video/mp4'});await storeVideo('custom-bar',file);const t=state.tracks[0];t.videos=[{id:'custom-bar',name:file.name,size:file.size}];save();await driverTelemetry.store('analyses','put',{id:'custom-bar',size:file.size,version:2,status:'done',manualRegions:{throttle:{kind:'bar',x:300/900,y:282/560,w:421/900,h:35/560,axis:'horizontal',direction:'left',tone:'bright',manual:true}}});await driverTelemetry.scan();}""")
    import time
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
     stored=await page.evaluate("driverTelemetry.store('sets','get','auto:custom-bar')")
     if stored:break
     await asyncio.sleep(.2)
    assert stored and all(abs(r[6]-60)<=2 for r in stored['data']['lap']['rows'])
    persisted=await page.evaluate("driverTelemetry.store('analyses','get','custom-bar')")
    assert persisted['manualRegions']['throttle']['kind']=='bar' and persisted['version']==3
    continue
   expected=list(zip(VALUES if style!='reverse' else [10,15,20,30,45,60,55,40,35,25,15,10],BRAKES))
   print(style,json.dumps({'observed':observed,'missing':result['missing']}),flush=True)
   assert len(observed)==12,(style,result)
   assert all(a is not None and abs(a-b)<=2 for obs,exp in zip(observed,expected) for a,b in zip(obs,exp)),(style,observed,expected)
   assert result['quality']['channels']['throttle']['method']=='bar-percentage'
   assert result['quality']['channels']['brake']['method']=='bar-percentage'
   if style=='reverse':assert max(r[0] for r in observed)<=62
   report[style]={'expected':expected,'observed':observed}
   for field in ['throttle','brake']:
    model=result['regions'][field]
    rejected=await page.evaluate("model=>DriverBars.read({width:100,height:30,data:new Uint8ClampedArray(100*30*4)},model)",model)
    assert rejected is None,'A hidden overlay must be missing, never a fake zero.' 
  assert not errors,errors
  (ROOT/'tests/bars-report.json').write_text(json.dumps(report,indent=2)+'\n')
  await browser.close()
 server.shutdown()
 print('PASS: pedal bars become percentages across 4 layouts/resolutions, including gradients, 6 colors, horizontal/vertical and opposite fill directions; empty/full/partial values; a 60% maximum is never rescaled to 100%; missing track/occluded HUD are rejected; manual full-track calibration works.')
asyncio.run(check())
