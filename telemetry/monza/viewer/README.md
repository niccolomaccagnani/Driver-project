# Sorgenti del confronto interattivo

Il prodotto da aprire è `../confronto-interattivo.html`: include dati, stile, codice e video di esempio. Funziona senza connessione e senza installazioni. I video originali aperti tramite i selettori restano locali e non vengono inviati a servizi esterni.

## Rigenerazione

Dalla radice del repository:

```bash
python telemetry/monza/viewer/build.py
```

Serve solo Python standard. `telemetry-data.json` conserva 5.716 righe accettate dalla prima estrazione, con `null` per le letture numeriche dubbie. Le colonne sono: indice del fotogramma originale, timestamp video, tempo stimato nel giro, km/h, RPM, marcia, acceleratore %, freno %. I due tempi nel giro non vengono dilatati quando si modifica lo spostamento.

`volante-demo.mp4` è un estratto H.264 del primo video, secondi 6–18, ritagliato sulla zona del volante. È incorporato nella pagina costruita, quindi non occorre scaricarlo separatamente.

## Verifica nel browser

Con Python, Playwright e Chromium installati:

```bash
python telemetry/monza/viewer/tests/browser_check.py
```

La verifica esercita realmente zoom con pulsanti e rotella, selezione, spostamento della vista, allineamento numerico e da fotogrammi video, esportazione di tutti i campioni e del PNG, riferimento scocca indipendente, inversione dei punti scocca, annullamento di una rotazione comune della camera, angolo noto di prova, misure non leggibili, annullamento e larghezza mobile. I clic sintetici del test non vengono salvati come dati di sterzo. L'anteprima pubblicata è catturata da una sessione pulita.

L'ambiente di test limita la navigazione `file://`; il test carica lo stesso documento completo nel browser con `set_content`. Il viewer non richiede chiamate a un server o risorse remote.
