"""Exercise the integrated site with real videos in the original onboard database."""
import asyncio,json,pathlib,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write((ROOT/'Driver notes.html').read_bytes())
 def log_message(self,*args):pass
async def check():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page(viewport={'width':1700,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
  assert await page.locator('.nav[data-page="telemetry"]').count()==1
  # Seed two stored onboard files through the original site API, not a fake bridge.
  fixture=ROOT.parent/'telemetry/monza/viewer/volante-demo.mp4'
  await page.evaluate("trackId=state.tracks.find(t=>t.name==='Monza').id;carId=state.defaultCarIds[0];navigate('track')")
  await page.set_input_files('#videoFile',fixture)
  await page.wait_for_function('getTrack().videos.length===1')
  await page.set_input_files('#videoFile',[])
  await page.set_input_files('#videoFile',fixture)
  await page.wait_for_function('getTrack().videos.length===2')
  ids=await page.evaluate('getTrack().videos.map(v=>v.id)')
  # Change names to ensure bindings follow stable video IDs, not filenames.
  await page.evaluate("getTrack().videos[0].name='Monza onboard A';getTrack().videos[1].name='Monza onboard B';save()")
  await page.click('.nav[data-page="telemetry"]')
  frame=page.frame_locator('#dnTelemetryFrame')
  await frame.locator('#plot').wait_for()
  await page.wait_for_function('Boolean(document.getElementById("dnTelemetryFrame").contentWindow.monzaViewer?.datasetSnapshot)')
  await page.select_option('#dnTelemetryVideoA',ids[0]);await page.select_option('#dnTelemetryVideoB',ids[1])
  await page.wait_for_function('(()=>{let d=document.getElementById("dnTelemetryFrame").contentDocument;return d.getElementById("videoA").readyState>=2&&d.getElementById("videoB").readyState>=2})()')
  await page.evaluate('document.getElementById("dnTelemetryFrame").contentWindow.monzaViewer.pinCursor(2)')
  await frame.locator('#openAlignment').click()
  await page.wait_for_function('!document.getElementById("dnTelemetryFrame").contentDocument.getElementById("videoB").seeking')
  before=await page.evaluate('document.getElementById("dnTelemetryFrame").contentWindow.monzaViewer.lapShift(1)')
  await frame.locator('[data-step-video="B"][data-direction="1"]').click()
  await page.wait_for_function('(f=>f.monzaViewer.lapShift(1)!==0)(document.getElementById("dnTelemetryFrame").contentWindow)')
  after=await page.evaluate('document.getElementById("dnTelemetryFrame").contentWindow.monzaViewer.lapShift(1)');assert after!=before
  await page.locator('#dnTelemetrySets summary').click()
  await page.fill('#dnTelemetryName','Monza set salvato');await page.click('#dnTelemetrySave')
  await page.locator('#dnTelemetryLibrary strong').filter(has_text='Monza set salvato').wait_for()
  # Navigation preserves the same viewer state and video connections.
  await page.click('.nav[data-page="home"]');assert not await page.locator('#dnTelemetry').is_visible()
  await page.click('.nav[data-page="telemetry"]')
  assert await page.evaluate('document.getElementById("dnTelemetryFrame").contentWindow.monzaViewer.lapShift(1)')==after
  # Reload, load a saved set into orange, and automatically reconnect its original site video.
  await page.reload(wait_until='domcontentloaded');await page.click('.nav[data-page="telemetry"]')
  await frame.locator('#plot').wait_for()
  await page.locator('#dnTelemetrySets summary').click()
  await page.locator('#dnTelemetryLibrary button').filter(has_text='Apri nell’arancione').click()
  await page.wait_for_function('document.getElementById("dnTelemetryFrame").contentWindow.monzaViewer.videoBindings[1]?.siteVideoId')
  assert await page.evaluate('document.getElementById("dnTelemetryFrame").contentWindow.monzaViewer.videoBindings[1].siteVideoId')==ids[0]
  await page.wait_for_function('document.getElementById("dnTelemetryFrame").contentDocument.getElementById("videoB").readyState>=2')
  assert await frame.locator('#lapNameB').inner_text()=='Monza set salvato'
  # Original circuit library remains intact; deleting a set must never delete its video.
  page.once('dialog',lambda d:d.accept())
  await page.locator('#dnTelemetryLibrary button').filter(has_text='Elimina set').click()
  await page.wait_for_function('document.getElementById("dnTelemetryLibrary").textContent.startsWith("Nessun set")')
  assert await page.evaluate('state.tracks.find(t=>t.name==="Monza").videos.length')==2
  assert await page.evaluate('(async()=>!!(await loadVideo(state.tracks.find(t=>t.name==="Monza").videos[0].id)))()')
  await page.locator('#dnTelemetrySets summary').click()
  await page.evaluate('scrollTo(0,0)')
  await page.screenshot(path=str(ROOT/'telemetria-preview.png'))
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(100)
  assert await page.evaluate('document.documentElement.scrollWidth')<=390
  assert not errors,errors
  # The site's existing Download website action must also reopen without duplicate sections.
  async with page.expect_download() as d:await page.evaluate('downloadDriverSite()')
  exported=pathlib.Path(await (await d.value).path()).read_bytes()
  reopened=await browser.new_page()
  await reopened.route('**/exported',lambda route:route.fulfill(status=200,content_type='text/html',body=exported))
  await reopened.goto(f'http://127.0.0.1:{server.server_port}/exported',wait_until='domcontentloaded')
  assert await reopened.locator('.nav[data-page="telemetry"]').count()==1
  assert await reopened.locator('#dnTelemetry').count()==1
  assert await reopened.locator('#view').is_visible()
  await reopened.click('.nav[data-page="telemetry"]');await reopened.frame_locator('#dnTelemetryFrame').locator('#plot').wait_for()
  await browser.close()
 server.shutdown()
 print('PASS: uploaded site navigation; original IndexedDB onboards; automatic iframe video attachment; frame-based alignment; set library save/reload/open with stable video ID; navigation state; deletion preserves videos; mobile; no JS errors.')
asyncio.run(check())
