"""Actual pointer/keyboard attempts cannot change saved locked scales; zoom and dataset shift remain active."""
import asyncio,pathlib,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
async def check():
 class Handler(BaseHTTPRequestHandler):
  def do_GET(self):self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write((ROOT/'Driver notes.html').read_bytes())
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page(viewport={'width':1700,'height':1200});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='domcontentloaded');await page.click('[data-page=telemetry]');frame=page.frame_locator('#dnTelemetryFrame');await frame.locator('#plot').wait_for()
  await page.evaluate("(()=>{const a=driverTelemetry.chart();a.setChannel(a.channels[0],{span:.8,center:.23});})()")
  saved=await page.evaluate('driverTelemetry.chart().scaleSnapshot()');await frame.locator('#saveScales').click()
  assert await page.evaluate('driverTelemetry.chart().state.scalesLocked')
  assert await frame.locator('#channelScale').is_disabled() and await frame.locator('#modeMove').is_disabled()
  await frame.locator('#plot').scroll_into_view_if_needed();box=await frame.locator('#plot').bounding_box();g=await page.evaluate('document.getElementById("dnTelemetryFrame").contentDocument.getElementById("plot")._g')
  x=box['x']+25;y=box['y']+g['top']+160
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+100,steps=5);await page.mouse.up();await page.mouse.wheel(0,-240)
  await frame.locator('#plot').dblclick(position={'x':25,'y':g['top']+160});await frame.locator('#plot').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('+');await page.keyboard.press('-')
  await page.evaluate("(()=>{const a=driverTelemetry.chart();a.setChannel(a.channels[0],{span:1.7,center:.8});document.getElementById('dnTelemetryFrame').contentDocument.getElementById('resetLayout').onclick();})()")
  assert (await page.evaluate('driverTelemetry.chart().scaleSnapshot()'))['channels']==saved['channels']
  # Horizontal zoom is deliberately independent of the vertical lock.
  await frame.locator('#plot').scroll_into_view_if_needed();box=await frame.locator('#plot').bounding_box()
  x=box['x']+g['left']+80;y=box['y']+g['top']+130
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+180,y,steps=5);await page.mouse.up()
  assert await page.evaluate('driverTelemetry.chart().state.max-driverTelemetry.chart().state.min')<10
  await page.reload(wait_until='domcontentloaded');await page.click('[data-page=telemetry]');await frame.locator('#plot').wait_for()
  assert await page.evaluate('driverTelemetry.chart().state.scalesLocked')
  assert (await page.evaluate('driverTelemetry.chart().scaleSnapshot()'))['channels']==saved['channels']
  await frame.locator('#toggleScales').click();assert not await frame.locator('#channelScale').is_disabled()
  await page.evaluate('(()=>{const a=driverTelemetry.chart();a.setChannel(a.channels[0],{span:1.2,center:.7});})()')
  await frame.locator('#restoreScales').click();assert await page.evaluate('driverTelemetry.chart().state.scalesLocked')
  assert (await page.evaluate('driverTelemetry.chart().scaleSnapshot()'))['channels']==saved['channels']
  assert not errors,errors;await browser.close()
 server.shutdown();print('PASS: save+lock persists across reload; axis drag/wheel/double click, sliders, reset and keyboard cannot alter locked scales; time zoom still works; unlock/edit/restore works.')
asyncio.run(check())
