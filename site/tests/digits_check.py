"""The per-video fallback must distinguish held-out numbers and reject ambiguous banks."""
import asyncio,pathlib,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
async def check():
 class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
   if self.path!='/':self.send_response(204);self.end_headers();return
   self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write((ROOT/'Driver notes.html').read_bytes())
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=await b.new_page();await page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded')
  result=await page.evaluate('''()=>{
    const glyphs=(text,size=48)=>{const c=document.createElement('canvas');c.width=420;c.height=80;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,420,80);x.fillStyle='black';x.font=size+'px Arial';x.fillText(text,15,60);const p=x.getImageData(0,0,420,80).data;return DriverDigits.describe(Uint8Array.from({length:420*80},(_,i)=>p[i*4]<145?1:0));};
    const bank=DriverDigits.createBank();for(let i=0;i<3;i++)bank.learn(glyphs('0123456789'),'0123456789');
    const readings=['221','222','224','226','227','267','97','90','0'].map(text=>({text,result:bank.read(glyphs(text))}));
    const ambiguous=DriverDigits.createBank(),two=glyphs('2');for(let i=0;i<2;i++){ambiguous.learn(two,'2');ambiguous.learn(two,'3');}
    return {readings,ambiguous:ambiguous.read(two),empty:DriverDigits.createBank().read(two),blank:bank.read([]),support:bank.support()};
  }''')
  assert all(x['result'] and x['result']['value']==int(x['text']) for x in result['readings']),result
  assert result['ambiguous'] is None and result['empty'] is None and result['blank'] is None,result
  await b.close()
 server.shutdown();print('PASS: per-video glyph examples read held-out numeric combinations; conflicting labels, untrained banks and blank crops remain unreadable.')
asyncio.run(check())
