"""Regression: complete value fields across digit-width changes, plus numeric-group isolation."""
import asyncio,json,pathlib,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
from fixtures import make_fixtures
ROOT=pathlib.Path(__file__).resolve().parents[1]
async def check():
 fixtures=make_fixtures()
 class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
   file=fixtures/'growth.mp4' if self.path=='/growth.mp4' else ROOT/'Driver notes.html'
   self.send_response(200);self.send_header('Content-Type','video/mp4' if self.path=='/growth.mp4' else 'text/html; charset=utf-8');self.end_headers();self.wfile.write(file.read_bytes())
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
  parsed=await page.evaluate('''()=>{const field=id=>DriverOCR.fields.find(f=>f.id===id),word=(text,x0,x1)=>({text,confidence:95,bbox:{x0,x1,y0:0,y1:25}});return [DriverOCR.value('1:23',field('speed')),DriverOCR.value('12 3',field('speed')),DriverOCR.value('98oops',field('speed')),DriverOCR.value('-10',field('speed')),DriverOCR.value('8.5K',field('rpm')),DriverOCR.value('8,500',field('rpm')),DriverOCR.readWords([word('12',0,30),word('3',150,165)],field('speed')),DriverOCR.readWords([word('1',0,10),word('20',12,35)],field('speed')),DriverOCR.readWords([word('8.5',0,40)],field('rpm'),60,1000)];}''')
  assert parsed==[None,None,None,None,8500,8500,None,120,8500],parsed
  result=await page.evaluate('''async()=>{const blob=await(await fetch('/growth.mp4')).blob();return DriverOCR.analyze(new File([blob],'Changing digits.mp4',{type:'video/mp4'}),{sampleRate:10});}''')
  rows=result['lap']['rows'];expected=[[98+i,980+i*20,4,80,0] for i in range(12)]
  assert [r[3:] for r in rows]==expected,rows
  assert result['coverage']==dict.fromkeys(['speed','rpm','gear','throttle','brake'],1)
  assert result['quality']['engineVersion']==2 and len(result['quality']['calibrationTimes'])==3
  assert result['lap']['extraction']==result['quality']
  assert not errors,errors
  (ROOT/'tests/accuracy-report.json').write_text(json.dumps({'fixture':'changing digit widths, labelled HUD, 10 fps, 1.2 s','engineVersion':2,'expected':expected,'observed':[r[3:] for r in rows],'incorrect':0,'missing':0,'scope':'Controlled regression clip; the user’s Abu Dhabi dataset and onboard were not available.'},indent=2)+'\n')
  await browser.close()
 server.shutdown()
 print('PASS: 60/60 values exact across 2→3 and 3→4 digit changes; clocks, partial strings and separate numeric groups rejected; adjacent digits and explicit RPM units read; diagnostics retained. Abu Dhabi still requires the user files.')
asyncio.run(check())
