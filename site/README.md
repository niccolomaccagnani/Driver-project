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

L’OCR cerca valori numerici con etichette HUD riconoscibili, anche negli angoli inferiori ingranditi. Velocità (`KM/H`, `SPEED`), RPM, marcia e percentuali di acceleratore/freno vengono letti quando riconoscibili. Per un display con RPM e velocità sovrapposti e allineati, viene cercata anche la singola cifra della marcia nel centro, con una soglia di confidenza più alta. I pedali mostrati soltanto come barre non vengono stimati in questa versione e sono segnalati come mancanti.

Per altri display, **Regola lettura** permette di disegnare aree intorno alle cifre e rigenerare il set. Le aree si riferiscono al video selezionato. Se il video non contiene la velocità, selezionare un’area non può ricostruirla.

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
- `extractor.js`: ricerca HUD e lettura locale tramite Tesseract.js/WASM.
- `chart.html` / `chart.js`: grafico con un numero variabile di dataset e allineamento video.
- `vendor/`: runtime, modello e licenze; vedere `vendor/NOTICE.md` per versioni e modifica locale.
- `build.py`: genera l’HTML autonomo e lo ZIP. Non incorpora `telemetry/monza/viewer/telemetry-data.json` né il vecchio viewer di prova.

Rigenera con `python site/build.py`. Esegui `site/tests/browser_check.py` con Python, Playwright, Pillow, Chromium e ffmpeg disponibili. Le prove creano video HUD sintetici con valori noti e verificano **tutti i valori estratti dal vero OCR**, segnalazioni dei canali mancanti, code su archivio esistente e nuovi upload, quattro set, colori, Alt+S, coppia di onboard al cursore, avanzamento fotogrammi, persistenza, nome manuale, esportazione del sito e layout mobile. Nessuna richiesta esterna per runtime o modelli.

Una prova aggiuntiva su un breve estratto dell’onboard originale ha letto velocità, RPM e marcia; acceleratore e freno a barre sono stati correttamente segnalati come non letti. I video personali non sono aggiunti al pacchetto di distribuzione.
