"""Verify real offline OCR, automatic archive jobs, multiple datasets and video alignment."""
import asyncio,json,pathlib,threading,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from playwright.async_api import async_playwright
from fixtures import make_fixtures
ROOT=pathlib.Path(__file__).resolve().parents[1]
async def check():
 fixtures=make_fixtures()
 class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
   file=fixtures/self.path.removeprefix('/fixtures/') if self.path.startswith('/fixtures/') else ROOT/'Driver notes.html'
   self.send_response(200);self.send_header('Content-Type','video/mp4' if self.path.startswith('/fixtures/') else 'text/html; charset=utf-8');self.end_headers();self.wfile.write(file.read_bytes())
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],env={'PATH':'/usr/bin:/bin','XDG_CONFIG_HOME':'/tmp/monza-browser-config','XDG_CACHE_HOME':'/tmp/monza-browser-cache'})
  async def wait_db(predicate):
   deadline=time.monotonic()+120
   while time.monotonic()<deadline:
    if await page.evaluate(predicate):return
    await asyncio.sleep(.2)
   raise AssertionError('Timed out waiting for '+predicate)
  page=await browser.new_page(viewport={'width':1700,'height':1100});errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  await page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded');await page.click('[data-page=telemetry]')
  frame=page.frame_locator('#dnTelemetryFrame');await frame.locator('#plot').wait_for()
  assert await page.evaluate('driverTelemetry.chart().laps.length')==0
  assert await frame.locator('#alignmentActions button').count()==2
  assert not await frame.locator('#resetOffset,#alignVideos,#syncVideos').count()
  # Seed an existing video with the site's original IndexedDB API, then reload.
  await page.evaluate('''async()=>{const b=await(await fetch('/fixtures/hud.mp4')).blob(),file=new File([b],'Onboard esistente.mp4',{type:'video/mp4'});await storeVideo('existing',file);const t=state.tracks.find(t=>t.name==='Monza');t.videos=[{id:'existing',name:file.name,size:file.size}];save();}''')
  await page.reload(wait_until='domcontentloaded');await page.click('[data-page=telemetry]');await frame.locator('#plot').wait_for()
  await wait_db("async()=>{const j=await driverTelemetry.store('analyses','get','existing');return j?.status==='done';}")
  sets=await page.evaluate("driverTelemetry.store('sets','getAll')");assert len(sets)==1,sets
  data=sets[0]['data'];assert data['lap']['name']=='Onboard esistente.mp4' and data['video']['siteVideoId']=='existing'
  readings=data['lap']['rows'];assert len(readings)==36
  assert [r[3:] for r in readings]==[[120+(i//3),6000+(i//3)*20,4,80,0] for i in range(36)],readings
  assert sets[0]['missing']==[]
  assert abs(data['lap']['sourceFPS']-10)<.1,data['lap']['sourceFPS']
  print('PASS: real offline OCR reads all known HUD values; existing onboard auto-saved by video name.',flush=True)
  # New uploads are automatically analyzed; unreadable HUD never creates fabricated data.
  await page.evaluate("trackId=state.tracks.find(t=>t.name==='Monza').id;carId=state.defaultCarIds[0];navigate('track')")
  await page.set_input_files('#videoFile',fixtures/'blank.mp4')
  await wait_db("async()=>{const jobs=await driverTelemetry.store('analyses','getAll');return jobs.some(j=>j.name==='blank.mp4'&&j.status==='unreadable');}")
  assert len(await page.evaluate("driverTelemetry.store('sets','getAll')"))==1
  jobs=await page.evaluate("driverTelemetry.store('analyses','getAll')");assert 'Velocità' in next(j for j in jobs if j['name']=='blank.mp4')['message']
  await page.set_input_files('#videoFile',fixtures/'partial.mp4')
  await wait_db("async()=>{const jobs=await driverTelemetry.store('analyses','getAll');return jobs.some(j=>j.name==='partial.mp4'&&j.status==='done');}")
  sets=await page.evaluate("driverTelemetry.store('sets','getAll')");partial=next(s for s in sets if s['data']['lap']['name']=='partial.mp4')
  assert 'Velocità' in partial['missing'] and all(r[3] is None for r in partial['data']['lap']['rows']) and all(r[4] is not None for r in partial['data']['lap']['rows'])
  print('PASS: new uploads auto-analyzed; missing HUD and missing speed explicitly flagged.',flush=True)
  await page.click('[data-page=telemetry]');await page.evaluate('driverTelemetry.refreshLibrary()')
  # Four datasets get different colors; any color is editable and is used on actual traces.
  for _ in range(3):await page.click('#dnAddDataset')
  ids=[s['id'] for s in sets]
  for i in range(4):await page.select_option(f'select[aria-label="Apri set nel dataset {i+1}"]',ids[0])
  colors=await page.evaluate('driverTelemetry.chart().lapColors');assert len(set(colors))==4
  await page.locator('input[aria-label="Colore dataset 3"]').fill('#aa33cc')
  assert await page.evaluate('driverTelemetry.chart().lapColors[2]')=='#aa33cc'
  strokes=await page.evaluate('''()=>{const w=document.getElementById('dnTelemetryFrame').contentWindow,p=w.CanvasRenderingContext2D.prototype,old=p.stroke,colors=[];p.stroke=function(){colors.push(this.strokeStyle);return old.call(this);};w.telemetryChart.drawAll();p.stroke=old;return colors;}''')
  assert all(c in strokes for c in await page.evaluate('driverTelemetry.chart().lapColors'))
  # Alt+S shifts only the selected fourth dataset.
  await page.locator('input[aria-label="Seleziona dataset 4"]').check()
  await frame.locator('#modeDataset').click();await frame.locator('#plot').scroll_into_view_if_needed();box=await frame.locator('#plot').bounding_box();g=await page.evaluate('document.getElementById("dnTelemetryFrame").contentDocument.getElementById("plot")._g')
  x=box['x']+g['left']+100;y=box['y']+g['top']+160
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y,steps=5);await page.mouse.up()
  shifts=await page.evaluate('driverTelemetry.chart().laps.map(l=>l.shift)');assert shifts[:3]==[0,0,0] and shifts[3]>0,shifts
  await frame.locator('#plot').focus();await page.keyboard.press('Alt+s');assert await page.evaluate('driverTelemetry.chart().state.mode')=='zoom'
  await page.evaluate('driverTelemetry.chart().pinCursor(.4)');await frame.locator('#openAlignment').click()
  await page.wait_for_function('(()=>{const d=document.getElementById("dnTelemetryFrame").contentDocument;return d.getElementById("videoA").readyState>=2&&d.getElementById("videoB").readyState>=2&&!d.getElementById("videoA").seeking&&!d.getElementById("videoB").seeking})()')
  for side,idx in [('A',0),('B',3)]:
   actual=await page.evaluate(f'document.getElementById("dnTelemetryFrame").contentDocument.getElementById("video{side}").currentTime')
   shift=await page.evaluate(f'driverTelemetry.chart().lapShift({idx})')
   assert abs(actual-(.4-shift))<.002,(actual,shift)
  before=await page.evaluate('driverTelemetry.chart().laps.map(l=>l.shift)')
  await frame.locator('[data-step-video="1"][data-direction="1"]').click()
  await page.wait_for_function('!document.getElementById("dnTelemetryFrame").contentDocument.getElementById("videoB").seeking')
  after=await page.evaluate('driverTelemetry.chart().laps.map(l=>l.shift)');assert before[:3]==after[:3] and before[3]!=after[3]
  assert await page.evaluate('driverTelemetry.chart().state.cursor')==.4
  # Data survives navigation and jobs are not rerun after reload.
  await page.click('[data-page=home]');await page.click('[data-page=telemetry]');assert await page.evaluate('driverTelemetry.chart().laps.length')==4
  saved=await page.evaluate("driverTelemetry.store('analyses','getAll')")
  await page.reload(wait_until='domcontentloaded');await page.wait_for_timeout(500);assert not await page.evaluate('driverTelemetry.busy')
  assert await page.evaluate("driverTelemetry.store('analyses','getAll')")==saved
  await page.click('[data-page=telemetry]');await frame.locator('#plot').wait_for()
  assert await page.evaluate('driverTelemetry.chart().laps.length')==0
  # Manual analysis prompts with the video name as the default.
  track=await page.evaluate("state.tracks.find(t=>t.name==='Monza').id")
  await page.select_option('#dnTrack',track);await page.select_option('#dnVideo','existing')
  dialogs=[]
  async def name_dialog(dialog):dialogs.append(dialog.default_value);await dialog.accept('Set rinominato')
  page.on('dialog',name_dialog);await page.click('#dnGenerate')
  await wait_db("async()=>{const s=await driverTelemetry.store('sets','getAll');return s.some(x=>x.data.lap.name==='Set rinominato');}")
  assert dialogs==['Onboard esistente.mp4'];page.remove_listener('dialog',name_dialog)
  # Regenerate an existing named set in place, preserving the old reading and the onboard.
  saved=await page.evaluate("driverTelemetry.store('sets','getAll')");named=next(s for s in saved if s['data']['lap']['name']=='Set rinominato')
  named['data']['lap']['rows'][0][3]=10;named['data']['lap']['extraction']['engineVersion']=1
  await page.evaluate("item=>driverTelemetry.store('sets','put',item)",named);await page.evaluate('driverTelemetry.refreshLibrary()')
  await page.locator('#dnLibrary summary').click()
  row=page.locator('#dnLibraryItems .note').filter(has=page.locator('strong',has_text='Set rinominato'))
  assert 'Lettura precedente' in await row.inner_text()
  await row.get_by_role('button',name='Rigenera dal video',exact=True).click()
  await wait_db("async()=>{const s=await driverTelemetry.store('sets','getAll');return s.some(x=>x.data.lap.name==='Set rinominato'&&x.data.lap.rows[0][3]===120&&x.previousData);}")
  after=await page.evaluate("driverTelemetry.store('sets','getAll')");assert len(after)==len(saved)
  updated=next(s for s in after if s['id']==named['id']);assert updated['previousData']['lap']['rows'][0][3]==10
  assert updated['data']['video']['siteVideoId']=='existing' and updated['data']['lap']['extraction']['engineVersion']==2
  await page.locator('#dnLibrary summary').click()
  print('PASS: four colored datasets; editable colors; selected-only Alt+S shift; auto-open videos at cursor; frame following; persistence; manual naming.',flush=True)
  # UI shows an empty plot rather than test data on a fresh load; mobile has no horizontal overflow.
  await page.evaluate('scrollTo(0,0)');await page.screenshot(path=str(ROOT/'telemetria-preview.png'))
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(100)
  assert await page.evaluate('document.documentElement.scrollWidth')<=390
  # Export remains a portable single HTML after dynamic sections and OCR have run.
  async with page.expect_download() as download:await page.evaluate('downloadDriverSite()')
  exported=pathlib.Path(await (await download.value).path()).read_bytes()
  reopened=await browser.new_page()
  await reopened.route('**/exported',lambda route:route.fulfill(status=200,content_type='text/html',body=exported))
  await reopened.goto(f'http://127.0.0.1:{server.server_port}/exported',wait_until='domcontentloaded')
  assert await reopened.locator('[data-page=telemetry]').count()==1
  await reopened.click('[data-page=telemetry]');await reopened.frame_locator('#dnTelemetryFrame').locator('#plot').wait_for()
  assert await reopened.evaluate('driverTelemetry.chart().laps.length')==0
  assert not errors,errors
  assert not [r for r in requests if r.startswith('http') and not r.startswith(f'http://127.0.0.1:{server.server_port}')],requests
  await browser.close()
 server.shutdown()
 print('PASS: mobile; no JS errors; no external OCR/model requests. No Monza sample rows embedded.')
asyncio.run(check())
