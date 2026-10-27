"""Exercise the single plot, real axis gestures, unchanged telemetry, alignment and exports."""
import asyncio,base64,csv,json,pathlib,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
HTML=(ROOT/'confronto-interattivo.html').read_bytes()
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(HTML)
 def log_message(self,*args):pass
async def check():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page(viewport={'width':1600,'height':1240},device_scale_factor=1);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
  await page.wait_for_function('window.monzaViewer && plot.width>100')
  assert await page.locator('canvas').count()==1
  assert await page.evaluate('monzaViewer.channels.length')==5
  assert await page.evaluate('Object.keys(JSON.parse(document.getElementById("telemetry").textContent)).join()')=='laps'
  assert await page.locator('#steeringSection, #activityChart, #steerVideo').count()==0
  source=json.loads((ROOT/'viewer/telemetry-data.json').read_text())
  assert await page.evaluate('monzaViewer.laps')==source['laps']
  cv=page.locator('#plot')
  async def drag(x1,y1,x2,y2):
   b=await cv.bounding_box();await page.mouse.move(b['x']+x1,b['y']+y1);await page.mouse.down();await page.mouse.move(b['x']+x2,b['y']+y2,steps=8);await page.mouse.up();await page.wait_for_timeout(60)
  assert await page.locator('#rangeStart,#rangeEnd,#zoomIn,#zoomOut,#applyRange,#offset,#offsetSlider,#anchorA,#anchorB').count()==0
  # Observe actual canvas strokes: every dataset trace uses its lap color and a solid line.
  recorded=await page.evaluate('''() => {const c=plot.getContext('2d'),old=c.stroke,seen=[];c.stroke=function(){seen.push({color:this.strokeStyle,dash:this.getLineDash()});return old.apply(this,arguments);};try{monzaViewer.drawAll();}finally{c.stroke=old;}return seen;}''')
  for color in ['#216bce','#e07825']:
   traces=[r for r in recorded if r['color']==color];assert len(traces)>=5 and all(not r['dash'] for r in traces)
  await page.click('#resetView');await page.wait_for_timeout(50)
  g=await page.evaluate('({left:plot._g.left,right:plot._g.right,top:plot._g.top,bottom:plot._g.bottom})');width=g['right']-g['left'];y=g['top']+100
  await drag(g['left']+width*.2,y,g['left']+width*.5,y)
  span=await page.evaluate('monzaViewer.state.max-monzaViewer.state.min');assert 25<span<30
  before=await page.evaluate('monzaViewer.state.min');await page.keyboard.down('Shift');await drag(g['left']+width*.6,y,g['left']+width*.5,y);await page.keyboard.up('Shift')
  assert await page.evaluate('monzaViewer.state.min')>before
  assert abs(await page.evaluate('monzaViewer.state.max-monzaViewer.state.min')-span)<.001
  b=await cv.bounding_box();await page.mouse.move(b['x']+g['left']+width*.5,b['y']+y);await page.mouse.wheel(0,-150);await page.wait_for_timeout(60)
  assert abs(await page.evaluate('monzaViewer.state.max-monzaViewer.state.min')-span)<.001
  # Alt+S toggles horizontal dataset movement, including the macOS Option+S character.
  await cv.focus();await page.keyboard.press('Alt+s');assert await page.evaluate('monzaViewer.state.mode')=='dataset'
  time_before_drag=await page.evaluate('[monzaViewer.state.min,monzaViewer.state.max]')
  channel_before_drag=await page.evaluate('monzaViewer.channels.map(c=>({center:c.center,span:c.span}))')
  await drag(g['left']+width*.4,y,g['left']+width*.5,y)
  expected_shift=(time_before_drag[1]-time_before_drag[0])*.1
  assert abs(await page.evaluate('monzaViewer.state.offset')-expected_shift)<.005
  assert await page.evaluate('[monzaViewer.state.min,monzaViewer.state.max]')==time_before_drag
  assert await page.evaluate('monzaViewer.channels.map(c=>({center:c.center,span:c.span}))')==channel_before_drag
  await page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ß',code:'KeyS',altKey:true,bubbles:true,cancelable:true}))")
  assert await page.evaluate('monzaViewer.state.mode')=='zoom'
  await page.click('#modeDataset');assert await page.evaluate('monzaViewer.state.mode')=='dataset'
  await page.keyboard.press('Escape');assert await page.evaluate('monzaViewer.state.mode')=='zoom'
  await page.click('#resetOffset')
  await page.locator('#channelScale').focus();await page.keyboard.press('Alt+s');assert await page.evaluate('monzaViewer.state.mode')=='dataset';await page.keyboard.press('Alt+s');assert await page.evaluate('monzaViewer.state.mode')=='zoom'
  # Move an axis; the other channels and the raw telemetry must remain unchanged.
  await page.click('#resetLayout');await page.wait_for_timeout(50)
  original_channels=await page.evaluate('monzaViewer.channels.map(c=>({center:c.center,span:c.span}))')
  before_image=await cv.evaluate('(el)=>el.toDataURL()')
  ruler=await page.evaluate('({x:plot._g.rulerRects[0].x,axis:plot._g.rulerRects[0].axis})')
  await drag(ruler['x']+15,g['top']+150,ruler['x']+15,g['top']+200)
  assert await page.evaluate('monzaViewer.channels[0].center')>original_channels[0]['center']+.05
  assert await page.evaluate('monzaViewer.channels.slice(1).map(c=>({center:c.center,span:c.span}))')==original_channels[1:]
  assert await cv.evaluate('(el)=>el.toDataURL()')!=before_image
  time_before=await page.evaluate('[monzaViewer.state.min,monzaViewer.state.max]')
  span_before=await page.evaluate('monzaViewer.channels[0].span');b=await cv.bounding_box();await page.mouse.move(b['x']+ruler['x']+15,b['y']+g['top']+200);await page.mouse.wheel(0,-150);await page.wait_for_timeout(60)
  assert await page.evaluate('monzaViewer.channels[0].span')>span_before
  assert await page.evaluate('[monzaViewer.state.min,monzaViewer.state.max]')==time_before
  # Resize the top handle while the lower value remains anchored.
  await page.click('#resetChannel');await page.wait_for_timeout(60)
  r=await page.evaluate('({axis:plot._g.rulerRects[0].axis,upper:plot._g.rulerRects[0].upper,lower:plot._g.rulerRects[0].lower})')
  await drag(r['axis'],r['upper'],r['axis'],r['upper']+35)
  assert await page.evaluate('monzaViewer.channels[0].span')<.58
  assert abs(await page.evaluate('plot._g.rulerRects[0].lower')-r['lower'])<.5
  # Select another channel and move it directly inside the common plot.
  await page.locator('[data-channel="rpm"] button').click();await page.click('#modeMove')
  before=await page.evaluate('monzaViewer.channels[1].center');await drag(g['left']+width*.5,y,g['left']+width*.5,y+60)
  assert await page.evaluate('monzaViewer.channels[1].center')>before+.08
  assert await page.evaluate('[monzaViewer.state.min,monzaViewer.state.max]')==time_before
  await page.click('#modeZoom')
  # Layout is saved across a real same-origin reload.
  await page.wait_for_timeout(200);saved=await page.evaluate('monzaViewer.channels.map(c=>({center:c.center,span:c.span}))')
  await page.reload(wait_until='domcontentloaded');await page.wait_for_function('window.monzaViewer && plot.width>100')
  assert await page.evaluate('monzaViewer.channels.map(c=>({center:c.center,span:c.span}))')==saved
  await page.locator('[data-channel="rpm"] input').uncheck();assert not await page.evaluate('monzaViewer.channels[1].visible')
  await page.locator('#lapB').uncheck();await page.wait_for_timeout(30);assert await page.locator('[data-channel="speed"] .g6 b').inner_text()=='nascosto';await page.locator('#lapB').check()
  # Dataset shift export and actual uploaded-video alignment.
  await page.evaluate('monzaViewer.setOffset(.5)')
  assert abs(await page.evaluate('monzaViewer.state.offset')-.5)<1e-6
  assert await page.evaluate('monzaViewer.nearestValue(1,monzaViewer.channels[0],.25)') is None
  async with page.expect_download() as d:await page.click('#exportData')
  exported=list(csv.DictReader(pathlib.Path(await (await d.value).path()).read_text().splitlines()));assert len(exported)==5716
  expected=[(i,r) for i,lap in enumerate(source['laps']) for r in lap['rows']]
  fields=['speed_kmh','engine_rpm','gear','throttle_pct_est','brake_pct_est']
  for row,(i,r) in zip(exported,expected):
   assert int(row['frame_index'])==r[0] and float(row['video_time_s'])==r[1]
   assert abs(float(row['aligned_time_s'])-r[2]-(.5 if i else 0))<1e-6
   for field,value in zip(fields,r[3:]):assert (row[field]=='' if value is None else float(row[field])==value)
  async with page.expect_download() as d:await page.click('#exportView')
  png=pathlib.Path(await (await d.value).path()).read_bytes();assert png[:8]==b'\x89PNG\r\n\x1a\n' and len(png)>15000
  await page.click('#openAlignment');assert await page.locator('#videoDetails').evaluate('(el)=>el.open');assert await page.locator('#openAlignment').get_attribute('aria-expanded')=='true'
  fixture=ROOT/'viewer/volante-demo.mp4'
  await page.set_input_files('#fileA',fixture);await page.set_input_files('#fileB',fixture);await page.wait_for_function('videoA.readyState>=1&&videoB.readyState>=1')
  await page.evaluate('videoA.currentTime=8;videoB.currentTime=4');await page.wait_for_function('!videoA.seeking&&!videoB.seeking');await page.click('#alignVideos')
  assert abs(await page.evaluate('monzaViewer.state.offset')-((8-source['laps'][0]['sourceStart'])-(4-source['laps'][1]['sourceStart'])))<.001
  assert 'Riferimenti allineati' in await page.locator('#videoAlignmentStatus').inner_text()
  await page.click('#closeAlignment');assert await page.locator('#videoDetails').evaluate('(el)=>!el.open')
  await page.click('#resetOffset');assert await page.evaluate('monzaViewer.state.offset')==0
  await page.click('#resetLayout');await page.click('#resetView');await page.locator('[data-channel="speed"] button').click();await page.locator('#videoDetails').evaluate('(el)=>el.open=false')
  await page.evaluate('monzaViewer.state.cursor=10;monzaViewer.drawAll();scrollTo(0,0)');await page.wait_for_timeout(80)
  async with page.expect_download() as d:await page.click('#exportView')
  (ROOT/'confronto-monza.png').write_bytes(pathlib.Path(await (await d.value).path()).read_bytes())
  client=await page.context.new_cdp_session(page);shot=await client.send('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});(ROOT/'confronto-interattivo-preview.png').write_bytes(base64.b64decode(shot['data']))
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(100)
  assert await page.evaluate('document.documentElement.scrollWidth')<=390
  assert await page.evaluate('plot._g.rulerRects.length')==1
  await page.locator('[data-channel="throttle"] button').click();await page.wait_for_timeout(40)
  assert await page.evaluate('plot._g.rulerRects[0].ch.id')=='throttle'
  assert not errors,errors
  await browser.close()
 server.shutdown()
 print('PASS: one canvas, no steering, unchanged 5716-row source and CSV, axis move/wheel/resize, in-plot channel move, independent transforms, persistence across reload, hide channels/laps, drag-only time zoom/pan, solid lap colors, Alt+S dataset shift + visual video alignment, PNG, mobile ruler/layout; no JS errors.')
asyncio.run(check())
