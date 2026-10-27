#!/usr/bin/env python3
"""Build the standalone viewer using Python's standard library."""
import base64,json,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parent
page=(root/'template.html').read_text()
json.loads((root/'telemetry-data.json').read_text())
for marker,content in [('STYLE',(root/'style.css').read_text()),('DATA',(root/'telemetry-data.json').read_text()),('SCRIPT',(root/'app.js').read_text()),('DEMO','data:video/mp4;base64,'+base64.b64encode((root/'volante-demo.mp4').read_bytes()).decode())]:
 page=page.replace('/*'+marker+'*/',content)
output=root.parent/'confronto-interattivo.html';output.write_text(page)
print(f'{output.name}: {output.stat().st_size:,} bytes')

archive=root.parent/'confronto-interattivo.zip'
instructions=("MONZA - CONFRONTO INTERATTIVO\n\n"
 "Apri confronto-interattivo.html con Safari o Chrome sul Mac. Non servono installazioni.\n"
 "Il file include dati e un estratto video di esempio. Per i riferimenti visivi di entrambi i giri apri i video originali dai selettori della pagina.\n"
 "Zoom: trascina sui grafici o usa la rotella. Riallineamento: modifica lo spostamento oppure seleziona lo stesso riferimento nei due video.\n"
 "Esperimento sterzo: traccia la linea scocca fissa, imposta il volante dritto e misura la sua rotazione rispetto alla scocca. Aggiorna la linea scocca se la camera ruota.\n"
 "Esporta le misure dello sterzo in CSV prima di chiudere: restano solo in memoria.\n"
 "L'angolo della linea nel video non e' ancora una misura meccanica calibrata. Il tracciamento automatico non e' validato.\n")
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name,content in [('confronto-interattivo.html',page),('LEGGIMI.txt',instructions)]:
  info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,content.encode())
with zipfile.ZipFile(archive) as z:
 assert z.read('confronto-interattivo.html')==page.encode()
print(f'{archive.name}: {archive.stat().st_size:,} bytes')
