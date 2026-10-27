import asyncio,pathlib,csv,json,base64
from playwright.async_api import async_playwright
root=pathlib.Path(__file__).resolve().parents[1]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page(viewport={'width':1440,'height':1150});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((root/'sterzo-interattivo.html').read_text(),wait_until='domcontentloaded')
  await page.wait_for_function('window.steeringViewer && video.readyState>=2')
  assert await page.evaluate('steeringViewer.rows.length')==2835
  await page.evaluate('video.currentTime=7');await page.wait_for_function('steeringViewer.state.cursor>6.9')
  assert '+' in await page.locator('#angle').inner_text()
  await page.evaluate('video.currentTime=20');await page.wait_for_function('steeringViewer.state.cursor>19.9')
  assert '-' in await page.locator('#angle').inner_text()
  await page.click('#in');width=await page.evaluate('steeringViewer.state.hi-steeringViewer.state.lo');assert 46<width<48
  await page.click('#reset');cv=page.locator('#chart');b=await cv.bounding_box();y=b['y']+100
  await page.mouse.move(b['x']+b['width']*.2,y);await page.mouse.down();await page.mouse.move(b['x']+b['width']*.45,y,steps=5);await page.mouse.up();assert await page.evaluate('steeringViewer.state.hi-steeringViewer.state.lo')<30
  async with page.expect_download() as d:await page.click('#csv')
  rows=list(csv.DictReader(pathlib.Path(await (await d.value).path()).read_text().splitlines()));assert len(rows)==2835
  assert any(float(r['steering_apparent_deg'])>20 for r in rows if r['steering_apparent_deg']) and any(float(r['steering_apparent_deg'])<-20 for r in rows if r['steering_apparent_deg'])
  assert sum(r['status']=='unreadable' and not r['steering_apparent_deg'] for r in rows)==439
  async with page.expect_download() as d:await page.click('#png')
  png=pathlib.Path(await (await d.value).path()).read_bytes();assert png[:8]==b'\x89PNG\r\n\x1a\n' and len(png)>10000
  await page.click('#reset');await page.evaluate('video.currentTime=20');await page.wait_for_function('steeringViewer.state.cursor>19.9');await page.wait_for_timeout(200)
  client=await page.context.new_cdp_session(page);shot=await client.send('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});(root/'anteprima-interattiva.png').write_bytes(base64.b64decode(shot['data']))
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(100);assert await page.evaluate('document.documentElement.scrollWidth')<=390
  assert not errors,errors
  await browser.close()
 print('PASS: actual 2835-row data, video playback/seek with signed values, zoom/drag, CSV gaps preserved, PNG export, mobile layout; no JS errors.')
asyncio.run(main())
