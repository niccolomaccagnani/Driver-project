#!/usr/bin/env python3
"""Build the offline Trackbook, empty multi-dataset chart, and embedded OCR runtime."""
import base64,json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parent
viewer=(root/'chart.html').read_text().replace('/*STYLE*/',(root.parent/'telemetry/monza/viewer/style.css').read_text()).replace('/*SCRIPT*/',(root/'chart.js').read_text())
source=(root/'source.html').read_text()
injection='<script id="dnTelemetryDocument" type="application/json">'+json.dumps(viewer,ensure_ascii=False).replace('<','\\u003c')+'</script>\n'
for key,name in [('dnOCRCore','tesseract-core-lstm.wasm.js'),('dnOCRWorker','worker.min.js'),('dnOCRLanguage','eng.traineddata.gz')]:
 injection+='<script id="'+key+'" type="application/octet-stream">'+base64.b64encode((root/'vendor'/name).read_bytes()).decode()+'</script>\n'
for name in ['vendor/tesseract.min.js','extractor.js','telemetry.js']:
 injection+='<script>\n'+(root/name).read_text()+'\n</script>\n'
page=source.replace('</body>',injection+'</body>')
(root/'Driver notes.html').write_text(page)
with zipfile.ZipFile(root/'driver-notes-telemetria.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('Driver notes.html',page)
 z.writestr('LEGGIMI.txt','Apri Driver notes.html con Safari o Chrome. Nessun giro di prova precaricato. Telemetria analizza automaticamente gli onboard già salvati in questo browser e quelli caricati in seguito. Il motore OCR è incluso: nessun video viene inviato a server. Mantieni aperto il sito durante l’analisi. I valori non leggibili restano vuoti; i canali mancanti vengono segnalati. La lettura automatica cerca valori numerici con etichette HUD riconoscibili; Regola lettura permette di indicare le aree numeriche dei display diversi. Pedali mostrati solo come barre non vengono inventati. I set automatici usano il nome del video; Genera dati chiede il nome al termine. Per correggere set già salvati premi Rigenera dal video nella libreria: conserva il nome e mantiene una copia esportabile della lettura precedente. Apri i set nel Dataset 1 e usa + per gli altri. Ogni set ha un colore modificabile. Alt+S sposta il set selezionato; Allinea dal video apre due onboard al cursore e i dati seguono i fotogrammi. Per ritrovare l’archivio usa lo stesso browser e la stessa origine del sito; per HTML locali conserva nome e percorso dopo aver copiato il vecchio file. Esporta i JSON dei set come backup: i video non sono inclusi.\n')
 for name in ['TESSERACT-LICENSE.txt','CORE-LICENSE.txt','NOTICE.md','tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt']:
  z.write(root/'vendor'/name,'licenses/'+name)
with zipfile.ZipFile(root/'driver-notes-telemetria.zip') as z:
 assert z.read('Driver notes.html')==page.encode()
assert 'DATA.laps' not in viewer and 'telemetry-data.json' not in viewer
print(f'Built {len(page):,} character HTML, ZIP {(root/"driver-notes-telemetria.zip").stat().st_size:,} bytes')
