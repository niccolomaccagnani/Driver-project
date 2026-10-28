"""Verify pinned video alignment and portable data/session workflows in a real browser."""
import asyncio,base64,json,pathlib,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write((ROOT/'confronto-interattivo.html').read_bytes())
 def log_message(self,*args):pass
async def check():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page(viewport={'width':1600,'height':1240});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded');await page.wait_for_function('window.monzaViewer&&plot.width>100')
  assert await page.evaluate('plot._g.left')<=190
  assert (await page.locator('.channel-panel').bounding_box())['width']<=191
  original=await page.evaluate('monzaViewer.laps')
  g=await page.evaluate('({left:plot._g.left,right:plot._g.right,top:plot._g.top})');x=g['left']+2/93.07*(g['right']-g['left']);y=g['top']+120
  await page.locator('#plot').click(position={'x':x,'y':y});assert await page.evaluate('monzaViewer.state.cursorLocked')
  pin=await page.evaluate('monzaViewer.state.cursor');assert abs(pin-2)<.05
  box=await page.locator('#plot').bounding_box();await page.mouse.move(box['x']+g['right']-50,box['y']+y);await page.wait_for_timeout(40)
  assert await page.evaluate('monzaViewer.state.cursor')==pin
  await page.click('#openAlignment');fixture=ROOT/'viewer/volante-demo.mp4'
  await page.set_input_files('#fileA',fixture);await page.set_input_files('#fileB',fixture)
  await page.wait_for_function('videoA.readyState>=2&&videoB.readyState>=2&&!videoA.seeking&&!videoB.seeking')
  for i,key in enumerate(['A','B']):
   actual=await page.evaluate(f'video{key}.currentTime');assert abs(actual-(pin+original[i]['sourceStart']))<.002
  # Frame advance of the orange video moves only orange data under the fixed cursor.
  shifts=await page.evaluate('[monzaViewer.lapShift(0),monzaViewer.lapShift(1)]');view=await page.evaluate('[monzaViewer.state.min,monzaViewer.state.max]')
  await page.locator('[data-step-video="B"][data-direction="1"]').click();await page.wait_for_function('!videoB.seeking');await page.wait_for_timeout(50)
  orange_time=await page.evaluate('videoB.currentTime');after=await page.evaluate('[monzaViewer.lapShift(0),monzaViewer.lapShift(1)]')
  assert abs(after[0]-shifts[0])<1e-7 and abs(after[1]-(pin-orange_time+original[1]['sourceStart']))<1e-6 and after[1]<shifts[1]
  # The blue video can also be adjusted, retaining the orange video's alignment.
  await page.locator('[data-step-video="A"][data-direction="1"]').click();await page.wait_for_function('!videoA.seeking');await page.wait_for_timeout(50)
  blue_time=await page.evaluate('videoA.currentTime');next_shifts=await page.evaluate('[monzaViewer.lapShift(0),monzaViewer.lapShift(1)]')
  assert abs(next_shifts[0]-(pin-blue_time+original[0]['sourceStart']))<1e-6 and abs(next_shifts[1]-after[1])<1e-7
  assert await page.evaluate('monzaViewer.state.cursor')==pin and await page.evaluate('[monzaViewer.state.min,monzaViewer.state.max]')==view
  assert await page.evaluate('monzaViewer.laps')==original
  await page.locator('#followVideo').uncheck();await page.evaluate('videoB.currentTime+=.2');await page.wait_for_function('!videoB.seeking');await page.wait_for_timeout(30)
  assert await page.evaluate('[monzaViewer.lapShift(0),monzaViewer.lapShift(1)]')==next_shifts
  await page.locator('#followVideo').check();await page.click('#syncVideos');await page.wait_for_function('!videoA.seeking&&!videoB.seeking');await page.wait_for_timeout(30)
  assert await page.evaluate('[monzaViewer.lapShift(0),monzaViewer.lapShift(1)]')==next_shifts
  await page.click('#closeAlignment');await page.evaluate('monzaViewer.setChannel(monzaViewer.channels[0],{span:.8,center:.2})')
  snapshot=await page.evaluate('monzaViewer.comparisonSnapshot()')
  await page.click('#openData')
  async with page.expect_download() as d:await page.click('#saveSession')
  saved=pathlib.Path(await (await d.value).path()).read_bytes();decoded=json.loads(saved)
  assert decoded==snapshot and 'blob:' not in saved.decode() and decoded['videos'][0]['name']==fixture.name
  # Restore a full comparison through the actual file input, including its pinned reference and layout.
  await page.evaluate('monzaViewer.setOffset(1);monzaViewer.setChannel(monzaViewer.channels[0],{span:.2})')
  async def upload(name,content,mime='application/json'):
   await page.set_input_files('#openDataFile',{'name':name,'mimeType':mime,'buffer':content});await page.wait_for_function('document.getElementById("openDataFile").value===""');await page.wait_for_timeout(40)
  await upload('saved.json',saved)
  restored=await page.evaluate('monzaViewer.comparisonSnapshot()');assert restored==snapshot
  assert await page.evaluate('!videoA.getAttribute("src")&&!videoB.getAttribute("src")')
  # A malformed file must not partly replace current data.
  invalid={**decoded,'channels':[{'id':'speed','center':'bad','span':.5}]}
  await upload('invalid.json',json.dumps(invalid).encode())
  assert 'File non aperto' in await page.locator('#dataStatus').inner_text()
  assert await page.evaluate('monzaViewer.comparisonSnapshot()')==snapshot
  # Round-trip the native CSV, including each dataset's absolute shift.
  async with page.expect_download() as d:await page.click('#exportData')
  csv_data=pathlib.Path(await (await d.value).path()).read_bytes();await upload('both.csv',csv_data,'text/csv')
  assert await page.evaluate('monzaViewer.laps.map(l=>l.rows)')==[lap['rows'] for lap in original]
  round_shifts=await page.evaluate('[monzaViewer.lapShift(0),monzaViewer.lapShift(1)]')
  assert all(abs(a-b)<1e-6 for a,b in zip(round_shifts,next_shifts))
  # Import a different, single dataset into orange, including decimal commas and blank measurements.
  blue=await page.evaluate('monzaViewer.laps[0]')
  csv_single='time_s;video_time_s;speed_kmh;engine_rpm;dataset_name\n0;2;100,5;6000;Nuovo giro\n0,5;2,5;;6100;Nuovo giro\n1;3;110;6200;Nuovo giro\n'
  await page.select_option('#importTarget','1');await upload('single.csv',csv_single.encode(),'text/csv')
  assert await page.evaluate('monzaViewer.laps[0]')==blue
  assert await page.evaluate('monzaViewer.laps[1].rows')==[[0,2,0,100.5,6000,None,None,None],[1,2.5,.5,None,6100,None,None,None],[2,3,1,110,6200,None,None,None]]
  assert await page.locator('#lapNameB').inner_text()=='Nuovo giro'
  before_bad=await page.evaluate('monzaViewer.comparisonSnapshot()');await upload('bad.csv',b'time_s,speed_kmh\n0,fast\n1,100','text/csv')
  assert await page.evaluate('monzaViewer.comparisonSnapshot()')==before_bad
  await page.click('#resetData');assert await page.evaluate('monzaViewer.laps')==original
  await page.locator('#dataDetails').evaluate('(el)=>el.open=false');await page.locator('#videoDetails').evaluate('(el)=>el.open=false')
  await page.evaluate('monzaViewer.pinCursor(10);monzaViewer.drawAll();scrollTo(0,0)');await page.wait_for_timeout(80)
  async with page.expect_download() as d:await page.click('#exportView')
  (ROOT/'confronto-monza.png').write_bytes(pathlib.Path(await (await d.value).path()).read_bytes())
  client=await page.context.new_cdp_session(page);shot=await client.send('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});(ROOT/'confronto-interattivo-preview.png').write_bytes(base64.b64decode(shot['data']))
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(80);assert await page.evaluate('document.documentElement.scrollWidth')<=390
  assert not errors,errors
  await browser.close()
 server.shutdown()
 print('PASS: compact scales; click pins cursor; video load seeks to pin; frame adjustments of either video move only its dataset; no programmatic-seek feedback; session JSON round-trip with data/layout/view/bindings; native CSV round-trip; single-lap CSV import; invalid-file atomic rejection; reset; mobile; no JS errors.')
asyncio.run(check())
