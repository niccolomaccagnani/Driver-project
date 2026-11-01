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

La modalità predefinita **Ogni fotogramma originale** legge MP4/MOV non frammentati attraverso l’indice dei campioni e WebCodecs, in ordine di presentazione. Ogni fotogramma decodificato produce una riga con il suo timestamp originale, anche nei video a frequenza variabile; un fotogramma non restituito dal decoder mantiene una riga con valori vuoti al timestamp originale, senza spostare le righe successive. Il JSON e la libreria segnalano il conteggio dei frame non decodificabili; gli errori del decoder interrompono comunque il salvataggio. Le edit list semplici e la rotazione del contenitore vengono rispettate. Il decoder conserva una coda limitata e legge il file per blocchi, senza caricare l’onboard completo in memoria.

La modalità richiede un browser con WebCodecs e un codec supportato (H.264 verificato nei test; altri codec dipendono dal browser e dal sistema). Per contenitori frammentati, montaggi con edit list complesse o codec non disponibili, il messaggio invita a scegliere **Compatibilità · campionamento a 30 Hz** oppure una copia MP4 compatibile: non viene effettuato un fallback silenzioso. La modalità compatibile resta un campionamento temporale e non garantisce una riga per fotogramma originale.

Non vengono identificati automaticamente più giri nello stesso onboard: un video già tagliato su un giro usa il proprio inizio come zero. Le letture OCR e le stime delle barre possono essere errate o mancanti anche quando la decodifica è completa. I campioni non letti restano `null`; il conteggio completo dei frame non è una misura dell’accuratezza dei valori.

Mantieni aperto il sito durante l’analisi; la durata dipende da lunghezza, risoluzione e Mac. Puoi interrompere l’analisi o disattivare la coda automatica. I risultati completati non vengono rianalizzati a ogni ricaricamento; un lavoro interrotto viene ripreso dall’inizio al successivo avvio automatico. Una rilettura manuale resta sempre disponibile.

## Dati e implementazione

Note e video continuano a usare `pilot-notes-v1` e IndexedDB `pilot-onboards/videos`. La libreria usa IndexedDB `driver-notes-telemetry-v1` versione 2:

- `sets`: un giro con metadati, copertura e riferimento stabile `siteVideoId` all’onboard originale;
- `analyses`: stato e risultato di ciascun lavoro, compresi i video non leggibili.

Le analisi automatiche aggiornano il proprio set `auto:<video-id>`. I set salvati manualmente restano separati. Gli onboard non vengono duplicati. Il vecchio backup delle note non include questi set né i video: esporta anche i JSON dalla libreria. Le selezioni e gli spostamenti del confronto restano durante la navigazione; ricaricando la pagina il grafico torna vuoto e i set salvati restano disponibili.

File principali:

- `source.html`: sito originale dell’utente, conservato senza modifiche.
- `telemetry.js`: archivio, coda, caricamenti, libreria, slot e colori.
- `extractor.js`: ricerca HUD e lettura di ogni frame nativo tramite Tesseract.js/WASM o misura delle barre.
- `frames.js`: indice MP4/MOV, timestamp, edit list semplici, rotazione, WebCodecs e accesso al singolo frame.
- `inspection.js`: immagine originale, ritagli, valori salvati e tabella CSV di verifica.
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

## Formato delle scale e verifica visiva · motore 4

**Salva e blocca scale** conserva ampiezza, posizione e visibilità dei canali nel browser. Con il blocco attivo, trascinamento delle scale, rotella, maniglie, doppio clic sulle scale, cursori, reset, visibilità e tasti di modifica non cambiano il formato. **Sblocca scale** riattiva le modifiche; **Ripristina formato salvato** riprende il preset e lo blocca. Il blocco e il layout corrente sopravvivono al ricaricamento. Zoom temporale, cursore e allineamento dei dataset restano indipendenti dal blocco verticale. Se il browser rifiuta la scrittura locale, il messaggio distingue il blocco della sessione dal salvataggio permanente.

**Verifica letture**, nella libreria, apre il set nella vista **Verifica letture fotogramma per fotogramma**. Mostra l’immagine originale decodificata, le aree usate, velocità, RPM, marcia, gas e freno salvati per quella riga. I pulsanti frame e il cursore della verifica permettono di scorrere tutti i campioni; **Esporta tabella completa CSV** conserva le righe e lascia vuoti i valori non letti. Il video arriva dall’archivio del sito. Per vecchi set campionati l’interfaccia lo dichiara e mostra il frame al tempo del campione; rigenerando in modalità originale si ottiene una riga per ogni frame effettivo.

Nel JSON, `frameMode`, `frameDurations`, `fpsEstimated` e `extraction.frames` documentano provenienza, conteggio e tipo di lettura. L’allineamento per frame dei set nativi usa i timestamp delle righe, anziché un passo fisso ricavato dalla frequenza media.

Prove aggiuntive:

- `site/tests/native_frames_check.py`: confronto indipendente con ffprobe di tutti i timestamp e del conteggio su MP4 a 60 fps e VFR con B-frame; marcatori binari nei pixel verificano l’ordine effettivo delle immagini e l’accesso casuale. Report `site/tests/native-frames-report.json`.
- `site/tests/scales_check.py`: tentativi reali di trascinare, usare rotella/doppio clic/tastiera/reset con scale bloccate; persistenza, sblocco e ripristino; zoom temporale indipendente.
- `site/tests/browser_check.py`: verifica anche immagine e ritagli del frame selezionato, valori affiancati ed esportazione CSV con tutte le righe native.

Queste prove verificano il procedimento e i video di controllo. La validazione sul filmato e CSV reali condivisi in seguito è descritta nella sezione motore 5; non va estesa a qualunque video o display.


## Lettura su onboard reale · motore 5

Il CSV e il filmato condivisi hanno permesso di verificare errori reali: 209 km/h letto come 3, 213 come 13, 144 come 44 e 237 come 4. Le percentuali dei pedali erano vuote in tutte le 2.966 righe. Non era un problema di scala o di visualizzazione.

La ricerca dei campi numerici usa un margine verticale più stretto. `digits.js` separa le componenti delle cifre da linee, bordi del quadrante, indicatori e frammenti delle etichette; normalizza la riga prima dell’OCR. Dove il ritaglio contiene solo cifre, scarta anche letture molto più corte delle componenti visibili. Le letture della velocità incompatibili con un limite prudente di variazione (4 km/h di tolleranza più 200 km/h per secondo rispetto all’ultima lettura recente) vengono riprovate sull’immagine e lasciate vuote se non confermate. Il controllo non crea campioni intermedi e non applica una curva lisciata. Nessun limite analogo viene imposto ai salti RPM di un cambio marcia.

Per le barre con testo sovrapposto il lettore cerca bordi paralleli ripetuti, così la lunghezza completa non viene confusa con un frammento di colore interrotto dalle lettere. Restano i controlli sulla pista completa, gli orientamenti alternativi, le barre con bordo e la calibrazione manuale. Piccoli difetti di compressione ai bordi vengono esclusi dalla misura; un HUD coperto resta non letto. La calibrazione dei pedali osserva anche i primi dieci secondi e più punti del filmato: confronta il profilo a barra vuota per distinguere le decorazioni statiche dal riempimento.

Ogni frame viene esaminato. Per non ripetere i tentativi OCR di una marcia rimasta identica, un valore già riconosciuto può essere riusato per meno di mezzo secondo solo se il confronto delle immagini binarie della cifra cambia meno dello 0,5% dei pixel d’inchiostro; una cifra cambiata viene riletta. Non si riempiono intervalli mancanti.

Nel filmato reale Chromium non restituisce un frame iniziale. Non viene sostituito da un’immagine vicina: `unavailableFrames` conserva il suo indice, `timelineCount` include la riga vuota e `decodedCount` conta solo le immagini effettivamente decodificate. Le durate dei frame si riferiscono alla presentazione, rispettando il successivo timestamp e il termine dell’edit list. La verifica visiva segnala un frame non disponibile senza mantenere l’immagine del campione precedente.

I set automatici delle versioni precedenti vengono ricalcolati. Per il set nominato selezionare **Rigenera dal video**: il nome, le scale e una copia esportabile del risultato precedente vengono conservati.


Validazione: `site/tests/real_video_check.py --video /percorso/onboard.mov --output /tmp/verifica.json` esegue il lettore sui 33 frame trascritti a mano del filmato condiviso, senza incorporarlo nel repository. `--result /tmp/risultato.json` confronta anche tutti i timestamp di un’estrazione completa con ffprobe. Il test controlla l’impronta del video per non usare questa tabella su un altro onboard.

`site/validation/reading-report.json` documenta la lettura completa: 2.966 righe, un frame non restituito da Chromium (riga vuota), 99 valori numerici verificati esatti e 66 percentuali confrontate con la barra visibile (tolleranza di quattro punti). Le coperture misurano campioni accettati: circa 95,8% velocità, 99,3% RPM, 99,4% marcia/gas e 99,6% freno. Sono rimossi i 22 crolli isolati superiori a 80 km/h del CSV originale; questo controllo non certifica ogni lettura del giro. Le righe incerte restano vuote. Il confronto esportabile è `site/validation/confronto-letture.png`; `dati-ricalcolati.zip` contiene JSON e CSV separati dal sito, senza preinstallare giri dimostrativi e senza il video personale.


## Audit dei 125 vuoti · motore 6

L’audit successivo ha controllato tutti i 125 campioni della velocità rimasti vuoti nel motore 5, usando immagini estratte da FFmpeg ai frame originali. Le cifre sono trascritte in `site/tests/holes-reference.json`. I gruppi ricorrenti (221, 222, 224, 226, 227, 267, 97) erano visibili e integri: il riconoscimento OCR del carattere produceva risultati incompleti o poco affidabili, poi scartati dai controlli. Il filmato non era privo di velocità in quei punti.

Il motore 6 aggiunge una seconda lettura per le cifre non confermate. Per ogni video impara esempi delle singole cifre esclusivamente dalle letture OCR iniziali con confidenza almeno 85 e segmentazione compatibile con il numero riconosciuto. Non conserva esempi fra video diversi. Dopo la prima lettura confronta i singoli caratteri nei frame scartati con questi esempi, richiedendo sia somiglianza sia separazione dal secondo candidato. Le cifre vengono ricavate dai pixel dello stesso frame; il confronto con i campioni vicini può rifiutare un risultato, senza calcolare valori interpolati o copiare il numero del frame precedente.

`speedRecovery` nel JSON registra supporto degli esempi, frame recuperati, distanza delle forme e motivi degli scarti. La libreria mostra il conteggio dei recuperi; nella verifica del frame un salto impossibile del display ha una spiegazione specifica. Le letture precedentemente accettate non vengono riscritte da questa seconda lettura.

`site/tests/holes_check.py --result /tmp/risultato-motore6.json --previous /tmp/risultato-motore5.json` controlla ogni campione dell’audit e confronta tutti i timestamp e tutte le velocità già accettate. `site/tests/digits_check.py` verifica combinazioni numeriche non usate nell’apprendimento e il rifiuto di esempi ambigui o mancanti. La sorgente personale resta fuori dal repository.


L’audit distingue 122 errori di OCR, una lettura corretta bloccata dal limite di variazione e due casi rimasti separati: il frame a 0,010 s esiste nel file (206 km/h), ma Chromium non lo restituisce; a 81,475 s la grafica del video mostra per un frame 0 km/h fra 117 e 116 km/h. Il primo è un limite del decoder del browser; il secondo è un valore incoerente già presente nell’overlay. Non vengono riempiti con valori inventati.

Nel recupero per forma delle cifre, basta che almeno uno dei due campioni vicini confermi la plausibilità del risultato riconosciuto. Questo evita di rifiutare 271 km/h dopo il salto del display da 283 km/h, quando il frame successivo mostra ancora 271. La regola non ricostruisce la velocità dal tempo e continua a respingere lo zero isolato, incompatibile con entrambi i vicini.


Risultato sul filmato condiviso: **123 dei 125 vuoti recuperati**, tutti verificati contro la trascrizione dei frame; nessun campione della velocità già accettato modificato. La velocità è disponibile in 2.964 delle 2.966 righe (99,93%). Restano soltanto il frame non restituito dal decoder a 0,010 s e lo zero incoerente dell’overlay a 81,475 s. Il controllo riguarda tutti i vuoti precedenti e i 33 frame del confronto precedente; non certifica a mano ogni altro valore del giro.

Il report completo è `site/validation/rejected-speed-audit.json`, con una riga per ciascun campione esaminato. `audit-vuoti.png` mostra quattro confronti ingranditi tra motore 5 e 6; `fotogrammi-audit.png` affianca cifre reali e risultati, comprese le due eccezioni. Il pacchetto `dati-ricalcolati.zip` è aggiornato al motore 6.
