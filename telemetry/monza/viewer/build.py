#!/usr/bin/env python3
"""Build an offline, single-plot comparison containing the original lap data."""
import json,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parent
source=json.loads((root/'telemetry-data.json').read_text())
data=json.dumps({'laps':source['laps']},separators=(',',':'),ensure_ascii=False)
page=(root/'template.html').read_text()
for marker,content in [('STYLE',(root/'style.css').read_text()),('DATA',data),('SCRIPT',(root/'app.js').read_text())]:
 page=page.replace('/*'+marker+'*/',content)
output=root.parent/'confronto-interattivo.html';output.write_text(page)
instructions='''MONZA — CONFRONTO TELEMETRIA

Apri confronto-interattivo.html con Safari o Chrome sul Mac. Non servono installazioni o connessione.
Tutti e cinque i canali sono in un unico grafico. Il colore identifica il canale; la linea continua è il giro 4, quella tratteggiata è il giro 6.
Trascina una scala a sinistra per spostare verticalmente il suo canale. La rotella sulla scala cambia l’ampiezza. Le maniglie alle estremità della scala selezionata permettono di ridimensionarla.
Puoi usare anche i cursori Ampiezza e Posizione verticale o il comando Sposta canale. Ripristina riporta alla disposizione iniziale.
Le disposizioni vengono ricordate nel browser quando l’archiviazione locale è disponibile.
Sul grafico, la rotella ingrandisce il tempo; trascina per selezionare un intervallo, Maiusc + trascina per scorrere. Doppio clic sul grafico: giro intero; su una scala: ripristina quel canale.
Riallinea il giro 6 con lo spostamento in secondi oppure aprendo i due video originali e scegliendo lo stesso riferimento fisico. I video restano sul Mac e non sono inclusi nel pacchetto.
Il CSV conserva tutti i 5.716 campioni originali e aggiunge il tempo riallineato. Posizione e ampiezza dei canali cambiano soltanto il disegno. Il PNG include la disposizione e il confronto correnti.
L’asse X è il tempo, non la distanza. Acceleratore e freno sono stime dalle barre dei video; le letture incerte restano vuote.
'''
archive=root.parent/'confronto-interattivo.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name,content in [('confronto-interattivo.html',page),('LEGGIMI.txt',instructions)]:
  info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content.encode())
with zipfile.ZipFile(archive) as z:assert z.read('confronto-interattivo.html')==page.encode()
print(f'{output.name}: {output.stat().st_size:,} bytes; ZIP: {archive.stat().st_size:,} bytes')
