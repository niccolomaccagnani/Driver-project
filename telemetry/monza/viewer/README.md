# Sorgenti del confronto con grafico unico

Il prodotto è `../confronto-interattivo.html`, disponibile anche in ZIP. Funziona offline con dati, stile e codice inclusi. Mostra esclusivamente velocità, RPM, marcia e stime dei due pedali. I video per il riallineamento vengono aperti dal dispositivo e restano locali.

## Rigenerazione

```bash
python telemetry/monza/viewer/build.py
```

Serve Python standard. La sorgente `telemetry-data.json` mantiene i 5.716 campioni precedenti senza modifiche: indice del fotogramma originale, timestamp del video, tempo stimato nel giro, velocità, RPM, marcia, acceleratore e freno. Il builder include soltanto `laps`; i dati dei vecchi esperimenti non entrano nella pagina o nello ZIP. `volante-demo.mp4` rimane una fixture del test dei selettori video e non è incluso nel prodotto.

## Scale e interazioni

Tutti i canali sono disegnati in un solo canvas. Ogni canale ha colore, visibilità e trasformazione verticale indipendenti, applicati a entrambi i giri:

- `center`: posizione del centro della scala, in frazioni dell'altezza utile del grafico;
- `span`: altezza della scala completa rispetto all'area utile;
- `min`/`max`: limiti fisici fissi per le etichette e la conversione verticale.

Le trasformazioni sono solo di presentazione: non cambiano i campioni. La scala del canale selezionato fornisce la griglia orizzontale. Le maniglie ridimensionano la scala mantenendo fermo l'altro estremo; la rotella sulla scala ingrandisce intorno al valore sotto il puntatore. Le scale sono trascinabili e i canali possono sovrapporsi liberamente. Nei layout stretti è mostrata solo la scala del canale selezionato; tutti i controlli restano disponibili anche tramite input e pulsanti.

Lo zoom temporale, il pan e l'allineamento operano su un unico stato condiviso. La marcia viene disegnata a gradini; `null` interrompe la traccia. Anche un intervallo fra campioni maggiore di 0,15 s interrompe la linea, senza interpolazioni nascoste. Il CSV usa sempre tutti i dati originali e aggiunge il tempo riallineato, indipendentemente dalla visibilità dei canali. Il PNG usa lo stesso renderer del canvas e la disposizione corrente.

La chiave locale `monza-single-chart-v1` salva soltanto selezione e disposizione dei canali. Un browser che blocca l'archiviazione locale continua a funzionare senza persistenza. Gli errori di accesso allo storage sono gestiti.

## Verifica nel browser

Con Python, Playwright e Chromium:

```bash
python telemetry/monza/viewer/tests/browser_check.py
```

Il test usa un server HTTP temporaneo locale, senza servizi esterni. Esercita il canvas unico, assenza degli strumenti di sterzo, spostamento e ridimensionamento effettivi delle scale, zoom verticale con rotella, indipendenza fra canali e tempo, spostamento nell'area del grafico, persistenza dopo ricaricamento, visibilità dei canali e dei giri, zoom temporale/selezione/pan, allineamento numerico e da due file video realmente caricati, PNG e layout mobile.

Verifica inoltre tutti i valori e i timestamp delle 5.716 righe esportate contro il JSON sorgente, inclusi i valori mancanti: le trasformazioni non alterano il CSV. Le anteprime vengono prodotte dopo aver ripristinato tutti i canali e azzerato l'allineamento.
