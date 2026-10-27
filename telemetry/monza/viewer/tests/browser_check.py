"""Exercise real zoom, alignment, downloads, video controls, and steering calibration."""
import asyncio,csv,io,json,math,pathlib,base64
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
async def check():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  page=await browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((ROOT/'confronto-interattivo.html').read_text(),wait_until='domcontentloaded')
  await page.wait_for_function('window.monzaViewer && document.querySelector("canvas").width>100')
  await page.wait_for_function('document.getElementById("steerVideo").videoWidth>0')
  assert await page.evaluate('monzaViewer.wheelActivity.length')==2
  assert await page.evaluate('monzaViewer.wheelActivity.every(rows=>rows.filter(r=>r[3]!==null).length>2000)')
  assert await page.locator('#steeringSection').evaluate('(el)=>!el.open')
  async with page.expect_download() as d:
   await page.click('#exportActivity')
  exported=list(csv.DictReader(pathlib.Path(await (await d.value).path()).read_text().splitlines()))
  assert len(exported)==5665 and 'wheel_region_motion_index' in exported[0]
  assert not any('angle_deg' in key for key in exported[0])
  original=await page.evaluate('monzaViewer.state.max-monzaViewer.state.min')
  await page.click('#zoomIn');assert abs(await page.evaluate('monzaViewer.state.max-monzaViewer.state.min')-original/2)<.001
  cv=page.locator('#charts canvas').first;box=await cv.bounding_box()
  await page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);await page.mouse.wheel(0,-150)
  await page.wait_for_timeout(100);assert await page.evaluate('monzaViewer.state.max-monzaViewer.state.min')<original/2
  await page.click('#resetView');box=await cv.bounding_box()
  y=box['y']+80;await page.mouse.move(box['x']+box['width']*.3,y);await page.mouse.down();await page.mouse.move(box['x']+box['width']*.6,y,steps=8);await page.mouse.up()
  width=await page.evaluate('monzaViewer.state.max-monzaViewer.state.min');assert 20<width<40
  before=await page.evaluate('({...monzaViewer.state})');await page.keyboard.down('Shift');await page.mouse.move(box['x']+box['width']*.6,y);await page.mouse.down();await page.mouse.move(box['x']+box['width']*.5,y,steps=5);await page.mouse.up();await page.keyboard.up('Shift')
  after=await page.evaluate('({...monzaViewer.state})');assert abs((after['max']-after['min'])-width)<.001 and after['min']>before['min']
  await page.locator('#videoDetails').evaluate('(el)=>el.open=true')
  await page.fill('#anchorA','12.5');await page.fill('#anchorB','12');await page.click('#alignAnchors');assert abs(await page.evaluate('monzaViewer.state.offset')-.5)<.00001
  assert await page.evaluate('monzaViewer.nearestValue(1,monzaViewer.channels[0],.25)') is None
  async with page.expect_download() as download:
   await page.click('#exportData')
  path=await (await download.value).path();rows=list(csv.DictReader(pathlib.Path(path).read_text().splitlines()));assert len(rows)==5716
  r=next(r for r in rows if r['video_id']=='giro2');assert abs(float(r['aligned_time_s'])-float(r['lap_elapsed_s_est'])-.5)<.00001
  async with page.expect_download() as download:
   await page.click('#exportView')
  png=pathlib.Path(await (await download.value).path()).read_bytes();assert png[:8]==b'\x89PNG\r\n\x1a\n' and len(png)>10000
  # Verify the real video-reference action, not just numeric alignment fields.
  sample=ROOT/'viewer/volante-demo.mp4'
  await page.set_input_files('#fileA',sample);await page.set_input_files('#fileB',sample)
  await page.wait_for_function('videoA.readyState>=1&&videoB.readyState>=1')
  await page.evaluate('videoA.currentTime=8;videoB.currentTime=4')
  await page.wait_for_function('!videoA.seeking&&!videoB.seeking')
  await page.click('#alignVideos');expected=(8-5.121667)-(4-1.418333);assert abs(await page.evaluate('monzaViewer.state.offset')-expected)<.001
  await page.click('#resetOffset');assert await page.evaluate('monzaViewer.state.offset')==0
  # Exact geometric checks of the two-point annotation UI. These are synthetic test clicks,
  # not physical measurements and are not saved as steering data.
  await page.locator('#steeringSection').evaluate('(el)=>el.open=true')
  await page.locator('#steeringSection').scroll_into_view_if_needed()
  await page.click('#setBody');ob=await page.locator('#steerOverlay').bounding_box()
  async def point(x,y):await page.mouse.click(ob['x']+x*ob['width'],ob['y']+y*ob['height'])
  # The chassis line is undirected: right-to-left must not add 180 degrees.
  await point(.65,.25);await point(.35,.25)
  assert abs(await page.evaluate('monzaViewer.bodyReferences[0].angle'))<.01
  assert await page.evaluate('monzaViewer.measured[0].length')==0
  await page.click('#setZero');ob=await page.locator('#steerOverlay').bounding_box()
  await point(.35,.35);await point(.65,.35)
  assert await page.evaluate('monzaViewer.measured[0].length')==1
  await page.evaluate('steerVideo.currentTime=1');await page.wait_for_function('!steerVideo.seeking')
  await page.click('#measureAngle');ob=await page.locator('#steerOverlay').bounding_box()
  ratio=await page.evaluate('steerVideo.videoWidth/steerVideo.videoHeight')
  await point(.35,.35);await point(.55,.35+.2*ratio*math.tan(math.pi/6))
  angle=await page.evaluate('monzaViewer.measured[0].at(-1).angle');assert abs(angle-30)<.15,angle
  async with page.expect_download() as download:
   await page.click('#exportSteering')
  rr=list(csv.DictReader(pathlib.Path(await (await download.value).path()).read_text().splitlines()));assert len(rr)==2 and abs(float(rr[1]['angle_apparent_deg'])-30)<.15
  # A hidden reference must stay missing rather than become zero or a fabricated angle.
  await page.evaluate('steerVideo.currentTime=.5');await page.wait_for_function('!steerVideo.seeking');await page.click('#markMissing')
  assert await page.evaluate('monzaViewer.measured[0].find(r=>r.status==="occluded").angle') is None
  await page.click('#undoSteering');assert await page.evaluate('monzaViewer.measured[0].length')==2
  assert await page.evaluate('monzaViewer.measured[0].some(r=>r.status==="occluded")') is False
  # Re-measure chassis after a simulated camera roll: common rotation cancels.
  await page.evaluate('steerVideo.currentTime=2');await page.wait_for_function('!steerVideo.seeking')
  await page.click('#setBody');ob=await page.locator('#steerOverlay').bounding_box()
  await point(.3,.25);await point(.6,.25+.3*ratio*math.tan(math.radians(10)))
  assert await page.evaluate('monzaViewer.measured[0].length')==2
  assert abs(await page.evaluate('monzaViewer.measured[0][0].bodyReference.angle'))<.01
  await page.click('#measureAngle');ob=await page.locator('#steerOverlay').bounding_box()
  await point(.35,.35);await point(.55,.35+.2*ratio*math.tan(math.radians(10)))
  assert abs(await page.evaluate('monzaViewer.measured[0].at(-1).angle'))<.15
  await page.evaluate('steerVideo.currentTime=3');await page.wait_for_function('!steerVideo.seeking')
  await page.click('#measureAngle');ob=await page.locator('#steerOverlay').bounding_box()
  await point(.35,.35);await point(.55,.35+.2*ratio*math.tan(math.radians(40)))
  assert abs(await page.evaluate('monzaViewer.measured[0].at(-1).angle')-30)<.15
  assert await page.evaluate('monzaViewer.measured[0].at(-1).bodyReferenceStatus')=='saved_reference_reused'
  # Switching to the second lap must not erase annotations of the first lap.
  await page.select_option('#steerLap','1')
  await page.click('#setZero')
  assert await page.evaluate('monzaViewer.measured[0].length')==4
  assert await page.evaluate('monzaViewer.measured[1].length')==0
  await page.set_input_files('#steerFile',sample)
  await page.wait_for_function('steerVideo.readyState>=1')
  assert await page.evaluate('monzaViewer.measured[0].length')==4
  assert not errors,errors
  # Fresh state for the published screenshot: no synthetic annotations from tests.
  await page.goto('about:blank');await page.set_content((ROOT/'confronto-interattivo.html').read_text(),wait_until='domcontentloaded');await page.wait_for_function('monzaViewer.channels[0].canvas.width>100')
  await page.evaluate('monzaViewer.setRange(3,16)');await page.wait_for_timeout(150)
  session=await page.context.new_cdp_session(page)
  image=await session.send('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
  (ROOT/'confronto-interattivo-preview.png').write_bytes(base64.b64decode(image['data']))
  await page.wait_for_function('steerVideo.readyState>=2')
  await page.locator('#steeringSection').evaluate('(el)=>el.open=true')
  await page.locator('#steeringSection').evaluate('(el)=>el.scrollIntoView({block:"start"})')
  await page.wait_for_timeout(100)
  shot=await session.send('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
  (ROOT/'sterzo-scocca-preview.png').write_bytes(base64.b64decode(shot['data']))
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(100)
  assert await page.evaluate('document.documentElement.scrollWidth')<=390
  await browser.close()
 print('PASS: automatic activity loaded without manual input, 5665-row automatic CSV, zoom buttons/wheel/selection, pan, numerical+video alignment, 5716-row CSV, PNG export, chassis-only reference, reversed endpoints, camera-roll cancellation, zero+30-degree annotation, missing/undo, mobile layout; no JS errors.')
asyncio.run(check())
