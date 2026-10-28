# Sorgenti del confronto con grafico unico

Il prodotto è `../confronto-interattivo.html`, disponibile anche in ZIP. Funziona offline con dati, stile e codice inclusi. Mostra esclusivamente velocità, RPM, marcia e stime dei due pedali. I video per il riallineamento vengono aperti dal dispositivo e restano locali.

## Rigenerazione

```bash
python telemetry/monza/viewer/build.py
```

Serve Python standard. La sorgente `telemetry-data.json` mantiene i 5.716 campioni precedenti senza modifiche: indice del fotogramma originale, timestamp del video, tempo stimato nel giro, velocità, RPM, marcia, acceleratore e freno. Il builder include soltanto `laps`; i dati dei vecchi esperimenti non entrano nella pagina o nello ZIP. `volante-demo.mp4` rimane una fixture del test dei selettori video e non è incluso nel prodotto.

## Scale e interazioni

Tutti i canali sono disegnati in un solo canvas. Ogni canale ha visibilità e trasformazione verticale indipendenti, applicati a entrambi i giri:

- `center`: posizione del centro della scala, in frazioni dell'altezza utile del grafico;
- `span`: altezza della scala completa rispetto all'area utile;
- `min`/`max`: limiti fisici fissi per le etichette e la conversione verticale.

Le trasformazioni sono solo di presentazione: non cambiano i campioni. La scala del canale selezionato fornisce la griglia orizzontale. Le maniglie ridimensionano la scala mantenendo fermo l'altro estremo; la rotella sulla scala ingrandisce intorno al valore sotto il puntatore. Le scale sono trascinabili e i canali possono sovrapporsi liberamente. Nei layout stretti è mostrata solo la scala del canale selezionato; tutti i controlli restano disponibili anche tramite input e pulsanti.

I cinque canali di ogni giro usano il medesimo colore, blu per il giro 4 e arancione per il giro 6, sempre con linee continue. Le scale e le etichette dei canali sono neutre.

Lo zoom temporale usa esclusivamente una selezione trascinata; non sono presenti campi di intervallo, pulsanti di ingrandimento o zoom temporale tramite rotella. Maiusc + trascinamento conserva il pan. Alt+S, riconosciuto tramite `KeyboardEvent.code` anche quando Opzione+S produce «ß» sul Mac, attiva lo spostamento orizzontale dell’intero giro 6. Durante il gesto il rapporto secondi/pixel viene fissato e la vista non cambia estensione.

Il pulsante Allineamento apre il pannello dei video, nel quale lo spostamento viene ricavato dai timestamp dei due riferimenti visivi, sottraendo gli inizi stimati dei rispettivi giri. Non vengono modificati o dilatati i timestamp originali. La marcia viene disegnata a gradini; `null` interrompe la traccia. Anche un intervallo fra campioni maggiore di 0,15 s interrompe la linea, senza interpolazioni nascoste. Il CSV usa sempre tutti i dati originali e aggiunge il tempo riallineato, indipendentemente dalla visibilità dei canali. Il PNG usa lo stesso renderer del canvas e la disposizione corrente.

La chiave locale `monza-single-chart-v1` salva soltanto selezione e disposizione dei canali. Un browser che blocca l'archiviazione locale continua a funzionare senza persistenza. Gli errori di accesso allo storage sono gestiti.

## Verifica nel browser

Con Python, Playwright e Chromium:

```bash
python telemetry/monza/viewer/tests/browser_check.py
```

Il test usa un server HTTP temporaneo locale, senza servizi esterni. Esercita il canvas unico, assenza degli strumenti di sterzo, spostamento e ridimensionamento effettivi delle scale, zoom verticale con rotella, indipendenza fra canali e tempo, spostamento nell'area del grafico, persistenza dopo ricaricamento, visibilità dei canali e dei giri, colori e tratti effettivamente disegnati dal canvas, zoom temporale solo da selezione, pan, Alt+S (compreso il carattere Mac), spostamento del dataset senza variare la vista, e allineamento da due file video realmente caricati, PNG e layout mobile.

Verifica inoltre tutti i valori e i timestamp delle 5.716 righe esportate contro il JSON sorgente, inclusi i valori mancanti: le trasformazioni non alterano il CSV. Le anteprime vengono prodotte dopo aver ripristinato tutti i canali e azzerato l'allineamento.

## Cursore e collegamento dei video

`cursorLocked` distingue il punto fisso dalla lettura al passaggio del mouse. Un clic, separato dal gesto di selezione, fissa il riferimento. `referenceOffset` è lo spostamento del blu e `offset` la differenza arancione meno blu; `lapShift(i)` viene usato dal renderer, dal CSV e dalla sincronizzazione.

All’apertura del pannello o al caricamento dei metadati di un video, il seek richiesto è `cursore - lapShift(i) + sourceStart`. Gli eventi `seeked` generati da questa sincronizzazione sono riconosciuti tramite un riferimento pendente e non modificano i dati. Un seek manuale o un avanzamento di fotogramma, con aggancio attivo, imposta invece `lapShift(i) = cursore - (videoTime - sourceStart)`, preservando l’altro dataset, il cursore e l’intervallo visibile. La normale riproduzione non riallinea continuamente le tracce.

## File portabili

`files.js` viene incluso dal builder dopo `app.js`. Il JSON `driving-notes-comparison`, versione 1, contiene `laps`, `view`, `channels`, titolo e nomi/metadati dei video. Non contiene URL blob o file video. Il ripristino conserva anche una vista leggermente esterna ai limiti dei dati dopo spostamenti, senza ricondurla automaticamente ai bordi.

Sono importabili anche JSON semplici con uno o due `laps`, oppure un oggetto giro `{name, duration, sourceStart, rows}`. Le righe mantengono l’ordine `[frame_index, video_time_s, lap_elapsed_s_est, speed_kmh, engine_rpm, gear, throttle_pct_est, brake_pct_est]`; le cinque misure possono essere `null`. Tempi ordinati e almeno due campioni sono richiesti. Il CSV supporta i nomi dei canali del formato esportato, `video_id`/`lap_id` per raggruppare e `dataset_name` per i nomi. Gli allineamenti sono recuperati da `aligned_time_s` quando presente. Con un CSV privo di durata esplicita, il limite è il tempo dell’ultimo campione.

Il file viene validato interamente prima di cambiare lo stato corrente. Le importazioni rilasciano i vecchi URL video e richiedono la selezione locale degli originali pertinenti. I dati iniziali rimangono separati dai dati attivi per consentire il ripristino Monza.

Il test aggiuntivo `tests/workflow_check.py` esercita le scale compatte, pin e blocco del cursore, posizionamento dei video al caricamento, avanzamento di entrambi i video, isolamento degli spostamenti, disattivazione dell’aggancio, assenza di retroazione nei seek programmati, salvataggio/riapertura JSON con equivalenza dello stato, CSV di entrambi i giri, un altro giro con decimali a virgola e valori vuoti, rifiuto atomico dei file non validi, ripristino e layout mobile.

```bash
python telemetry/monza/viewer/tests/workflow_check.py
```

Salvataggio singoli set: in **Dati**, scegli blu o arancione, dai un nome e premi **Salva singolo set JSON**. Il formato `driving-notes-dataset` v1 contiene `lap` (campioni e riferimento temporale) e `video` (nome e metadati, senza filmato). Apri un set nel blu e un altro nell’arancione per confrontarli. Il salvataggio del confronto completo resta disponibile.

**Collega onboard al giro** associa il video originale ai dati già presenti; non esegue estrazione automatica della telemetria da video nuovi. Un nuovo onboard richiede dati estratti JSON o CSV. Alla riapertura del set il nome dell’onboard è ricordato, ma il file va riselezionato dal Mac.
