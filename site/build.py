#!/usr/bin/env python3
"""Build the uploaded Trackbook with an offline telemetry section."""
import json
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parent
viewer=(root.parent/'telemetry/monza/confronto-interattivo.html').read_text()
source=(root/'source.html').read_text()
injection='<script id="dnTelemetryDocument" type="application/json">'+json.dumps(viewer,ensure_ascii=False).replace('<','\\u003c')+'</script>\n<script>\n'+(root/'telemetry.js').read_text()+'\n</script>\n'
page=source.replace('</body>',injection+'</body>')
(root/'Driver notes.html').write_text(page)
with zipfile.ZipFile(root/'driver-notes-telemetria.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('Driver notes.html',page)
 z.writestr('LEGGIMI.txt','Apri Driver notes.html con Safari o Chrome. La voce Telemetria usa gli onboard già archiviati nello stesso browser e nella stessa origine del sito. Per ritrovare dati locali, sostituisci il vecchio HTML mantenendo percorso e nome e usa lo stesso browser. Fai prima una copia del file e un backup delle note dalle impostazioni. I video non sono inclusi nel backup JSON delle note. I set di telemetria sono in una libreria separata: esportali anche come JSON dal pannello Dati. Il nuovo HTML non contiene i tuoi file video personali.\n')
print('Built integrated HTML and ZIP')
