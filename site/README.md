# Driver Notes · generazione e confronto telemetria

Scarica `driver-notes-telemetria.zip`, estrailo e apri **Driver notes.html** con Safari o Chrome. Il motore OCR e il modello sono inclusi: non occorrono server o download aggiuntivi e gli onboard non vengono caricati su servizi esterni.

Per ritrovare l’archivio personale usa lo stesso browser e la stessa origine del sito. Per HTML locali, conserva nome e percorso del vecchio file dopo averne fatta una copia. Le regole di archiviazione `file://` dipendono dal browser; il Chromium gestito dell’ambiente di sviluppo ne blocca l’apertura locale, per cui le prove sono state eseguite via HTTP locale.

## Flusso

- Nessun giro Monza di prova è incorporato nella pagina. Il grafico parte vuoto; il circuito Monza resta nell’elenco delle piste.
- All’apertura vengono analizzati automaticamente gli onboard già nell’archivio. Nuovi video caricati dalla pagina del circuito entrano nella stessa coda, uno alla volta. I risultati automatici usano il nome del video.
- Per una generazione manuale scegli **Pista → Video → Genera dati**: al termine viene chiesto il nome del set, proponendo quello dell’onboard.
- **Set salvati e stato delle analisi** elenca risultati, canali mancanti e percentuale di campioni leggibili. Un video senza dati riconoscibili viene segnalato senza creare un set fittizio. Puoi rinominare, esportare e cancellare set; il video originale resta nell’archivio.
- In **Confronto** apri il primo set in **Dataset 1** e aggiungi altri slot con **+ Aggiungi dataset** (fino a 64). I colori iniziali sono distinti e modificabili. Un pulsante radio seleziona il dataset da spostare.
- L’allineamento ha due comandi: **Sposta dati · Alt+S** e **Allinea dal video**. Quest’ultimo apre automaticamente due onboard associati, al punto del cursore fisso. Avanzare o arretrare uno dei video sposta solo i suoi dati. Con più set puoi scegliere la coppia da riallineare.
- Zoom temporale trascinando, scale indipendenti, posizione verticale e ampiezza dei canali restano disponibili. Le tracce di ogni dataset hanno lo stesso colore e sono continue; i campioni mancanti restano vuoti.

## Lettura dei video: limiti concreti

L’OCR cerca valori numerici con etichette HUD riconoscibili, anche negli angoli inferiori ingranditi. Velocità (`KM/H`, `SPEED`), RPM, marcia e percentuali di acceleratore/freno vengono letti quando riconoscibili. Per un display con RPM e velocità sovrapposti e allineati, viene cercata anche la singola cifra della marcia nel centro, con una soglia di confidenza più alta. Il motore 3 misura anche le barre di acceleratore e freno: lunghezza riempita / lunghezza della pista completa × 100. La stessa procedura viene applicata a ogni onboard, con geometria e colore ricavati dal suo display; nessun nome di file, circuito o valore massimo raggiunto viene usato per calibrare il 100%.

Per altri display, **Regola lettura** permette di disegnare aree intorno alle cifre oppure scegliere **Barra percentuale · pedali** e selezionare l’intera pista, compresa la parte vuota. Puoi indicare verso e riempimento chiaro/scuro. Questa calibrazione viene ricordata per quell’onboard e riutilizzata nelle rigenerazioni; **Azzera aree** la cancella. Le aree si riferiscono al video selezionato. Se il video non contiene la velocità, selezionare un’area non può ricostruirla.

Il campionamento è a **30 Hz** lungo l’onboard completo, senza identificazione automatica di giri multipli. Se il video contiene già un solo giro tagliato, il suo inizio è lo zero. La frequenza del video viene stimata dai callback dei fotogrammi quando disponibili; in assenza di informazioni il passo di allineamento usa 1/30 s. Non è una decodifica dei timestamp di ogni fotogramma del contenitore, quindi con video a frequenza variabile il passo resta approssimativo. Le letture OCR non sono dati ECU e non sono garantite per qualsiasi sovraimpressione. I valori incerti o fuori intervallo restano `null`, senza interpolazione né zeri aggiunti. Nessun riempimento o smoothing artificiale viene applicato.

Mantieni aperto il sito durante l’analisi; la durata dipende da lunghezza, risoluzione e Mac. Puoi interrompere l’analisi o disattivare la coda automatica. I risultati completati non vengono rianalizzati a ogni ricaricamento; un lavoro interrotto viene ripreso dall’inizio al successivo avvio automatico. Una rilettura manuale resta sempre disponibile.

## Dati e implementazione

Note e video continuano a usare `pilot-notes-v1` e IndexedDB `pilot-onboards/videos`. La libreria usa IndexedDB `driver-notes-telemetry-v1` versione 2:

- `sets`: un giro con metadati, copertura e riferimento stabile `siteVideoId` all’onboard originale;
- `analyses`: stato e risultato di ciascun lavoro, compresi i video non leggibili.

Le analisi automatiche aggiornano il proprio set `auto:<video-id>`. I set salvati manualmente restano separati. Gli onboard non vengono duplicati. Il vecchio backup delle note non include questi set né i video: esporta anche i JSON dalla libreria. Le selezioni e gli spostamenti del confronto restano durante la navigazione; ricaricando la pagina il grafico torna vuoto e i set salvati restano disponibili.

File principali:

- `source.html`: sito originale dell’utente, conservato senza modifiche.
- `telemetry.js`: archivio, coda, caricamenti, libreria, slot e colori.
- `extractor.js`: ricerca HUD, sincronizzazione con il fotogramma decodificato e lettura locale tramite Tesseract.js/WASM.
- `bars.js`: riconoscimento della pista, calibrazione del contrasto e misura dei pedali come percentuale grafica.
- `chart.html` / `chart.js`: grafico con un numero variabile di dataset e allineamento video.
- `vendor/`: runtime, modello e licenze; vedere `vendor/NOTICE.md` per versioni e modifica locale.
- `build.py`: genera l’HTML autonomo e lo ZIP. Non incorpora `telemetry/monza/viewer/telemetry-data.json` né il vecchio viewer di prova.

Rigenera con `python site/build.py`. Esegui `site/tests/browser_check.py` con Python, Playwright, Pillow, Chromium e ffmpeg disponibili. Le prove creano video HUD sintetici con valori noti e verificano **tutti i valori estratti dal vero OCR**, segnalazioni dei canali mancanti, code su archivio esistente e nuovi upload, quattro set, colori, Alt+S, coppia di onboard al cursore, avanzamento fotogrammi, persistenza, nome manuale, esportazione del sito e layout mobile. Nessuna richiesta esterna per runtime o modelli.

Una prova aggiuntiva sul breve estratto disponibile dell’onboard originale ha letto velocità, RPM e marcia; con il motore 3 ha misurato anche acceleratore 100% e freno 0%, coerenti con le barre visibili. I video personali non sono aggiunti al pacchetto di distribuzione.

## Correzione lettura, motore 2

Il precedente ritaglio dipendeva dalla larghezza delle cifre nel primo fotogramma. Una prova riproducibile ha mostrato `98 → 100` letto come `98 → 10`, e `980 → 1020` letto come `980 → 102`. Inoltre il ridimensionamento a dimensioni frazionarie poteva produrre un bordo nero artificiale, riconosciuto come un carattere e responsabile di letture scartate.

Il motore 2 usa tre istanti di calibrazione, controlla la coerenza della posizione del display e riserva spazio al numero completo. Mantiene intere le unità adiacenti, usa dimensioni intere per il ritaglio e riprova i valori non letti con riconoscimento per singola riga. Il parser rifiuta timer, suffissi sconosciuti e gruppi di cifre lontani; considera anche la confidenza di ogni simbolo per non scartare numeri chiari penalizzati dal punteggio del dizionario OCR. Nessuna interpolazione o riempimento dei vuoti.

**Rigenera dal video**, accanto a ciascun set salvato, applica il nuovo motore al suo onboard già archiviato e aggiorna il set conservandone nome, identificativo e una copia della lettura precedente esportabile. Le analisi automatiche del vecchio motore vengono ricalcolate. I JSON nuovi contengono `lap.extraction` con versione, aree, istanti di calibrazione e contatori dei campioni letti/scartati/riprovati. La percentuale in libreria misura i campioni accettati, non l’accuratezza rispetto al video.

Esegui anche `site/tests/accuracy_check.py`: verifica 60 valori noti attraverso cambi di larghezza e i casi di parsing ambiguo. Il risultato è in `site/tests/accuracy-report.json`. Il set e l’onboard dell’utente relativi ad Abu Dhabi non erano disponibili nell’ambiente: queste correzioni generali non costituiscono una validazione di quel giro specifico. Per diagnosticare quel caso occorrono il JSON esportato e il filmato sorgente.

## Barre percentuali · motore 3

Il lettore cerca le etichette di acceleratore/freno, individua piste rettangolari colorate oppure con bordo e verifica la geometria in più fotogrammi. Funziona con barre orizzontali e verticali, versi opposti, colori diversi e con la comune sfumatura crescente delle barre con etichetta a sinistra. Le unità sono **percentuali grafiche stimate**, non pressione freno o segnali ricevuti dall’ECU.

La lunghezza totale è quella della pista visibile: un video in cui l’acceleratore arriva solo al 60% rimane al 60%. I testi sovrapposti vengono esclusi dalla misura del colore e piccole interruzioni spaziali vengono risolte usando il colore ai lati; non si interpolano i valori nel tempo. Le letture a barre sono identificate come `method: "bar-percentage"` nel JSON.

Se manca una pista completa riconoscibile, il sistema segnala il canale invece di chiamare 100% il massimo segmento colorato osservato. Barre senza etichette, con riempimenti centrati/non lineari, colori ambigui o sfumature non riconoscibili possono richiedere la calibrazione manuale della pista e del verso; nessuna lettura universale di qualsiasi grafica è garantita. Se il display è coperto o il colore/bordo atteso scompare, il campione resta vuoto, senza uno zero fittizio.

Le analisi automatiche precedenti vengono rigenerate dal nuovo motore; per aggiornare un set nominato usa **Rigenera dal video**. Nome e copia precedente vengono conservati. La misura è inclusa nella stessa coda che analizza gli onboard già presenti e i nuovi caricamenti.

`site/tests/bars_check.py` genera clip H.264 con quattro layout, tre risoluzioni, sei colori, gradienti, etichette sovrapposte, barre vuote/piene/parziali e versi opposti, poi confronta le percentuali estratte con quelle note. Verifica anche un massimo del 60%, la rejection di un segmento senza scala totale visibile, l’overlay coperto e la calibrazione manuale. I risultati sono in `site/tests/bars-report.json`. I test numerici e del sito completo restano separati.
