# Monza · confronto telemetria

**[Scarica il pacchetto interattivo](confronto-interattivo.zip)** · **[Guarda l'anteprima](confronto-interattivo-preview.png)** · [Grafico PNG](confronto-monza.png)

Scarica lo ZIP con il pulsante di download di GitHub, estrailo sul Mac e apri `confronto-interattivo.html` con Safari o Chrome. Non servono installazioni né connessione. È disponibile anche il [singolo file HTML](confronto-interattivo.html), da scaricare: GitHub non esegue la pagina nella propria anteprima.

![Grafico unico con scale indipendenti](confronto-interattivo-preview.png)

## Un solo grafico, cinque canali

Velocità, giri motore, marcia, acceleratore e freno condividono lo stesso grafico e lo stesso asse del tempo. **Tutti i canali del giro 4 sono blu, tutti quelli del giro 6 arancioni, con linee continue.** Il cursore mostra i valori originali dei due giri nella lista dei canali. **Un clic fissa la linea verticale**: resta ferma anche muovendo il mouse. Un altro clic la porta al nuovo punto; «Libera cursore» ripristina il cursore mobile. Le scale laterali sono più strette per lasciare spazio al grafico.

La pagina consegnata non include canali o strumenti di sterzo.

### Disporre i canali

- **Sposta:** trascina verticalmente una delle scale colorate a sinistra del grafico. Puoi anche selezionare un canale e usare «Sposta canale» per trascinarlo direttamente nell'area del grafico.
- **Ingrandisci o rimpicciolisci:** usa la rotella sulla scala del canale, trascina le maniglie alle sue estremità oppure usa il cursore «Ampiezza». La rotella mantiene fermo il punto della scala sotto il puntatore.
- **Posizione verticale:** regolabile anche con il cursore nella barra laterale. I canali possono sovrapporsi e non sono vincolati a righe separate.
- **Visibilità:** le caselle permettono di nascondere un canale o uno dei giri, conservandone la disposizione.
- **Ripristina:** il pulsante del canale o il doppio clic sulla sua scala annullano i suoi spostamenti; «Ripristina tutti i canali» recupera la disposizione iniziale.
- La disposizione viene ricordata fra riaperture nel medesimo browser quando l'archiviazione locale è disponibile. Sul telefono viene mostrata una scala per volta, quella del canale selezionato.

Le scale verticali sono indipendenti: spostamento e ampiezza cambiano soltanto il disegno, non i valori o i tempi dei dati. Con il grafico a fuoco, Freccia su/giù sposta il canale selezionato e +/− ne cambia l'ampiezza.

### Tempo, allineamento ed esportazioni

- **Zoom sul tempo:** trascina sul grafico per selezionare e ingrandire un intervallo. Maiusc + trascinamento scorre nel tempo; doppio clic nell'area ripristina il giro intero.
- **Spostamento del dataset:** premi **Alt+S** (Opzione+S sul Mac), poi trascina orizzontalmente nell’area del grafico per spostare tutti i canali del giro 6 insieme. La vista temporale e i canali del giro 4 restano fermi durante il gesto. Alt+S o Esc torna alla selezione; è disponibile anche il pulsante «Sposta giro 6».
- **Allineamento visivo:** fissa il cursore con un clic e premi **Allineamento**. I video già aperti, o quelli selezionati dopo, vengono portati al punto corrispondente. Avanza o arretra il video blu o arancione con i controlli o «Fotogramma −/+»: i dati di quel giro si spostano per mantenere il fotogramma sotto la linea fissa. L’altro giro resta fermo. Il cursore e la vista non si spostano; gli aggiustamenti riguardano l’allineamento, non i valori o la durata dei giri.
- La casella **Aggancia i dati al cursore** abilita questa regolazione automatica sui cambi di fotogramma, non durante la normale riproduzione continua. Puoi disattivarla e premere «Allinea questi fotogrammi» per applicare manualmente il riferimento. «Vai al cursore» riposiziona i video senza cambiare gli allineamenti. «Azzera allineamento» ripristina entrambi i riferimenti iniziali.
- **PNG:** esporta il grafico unico con la disposizione, lo zoom, la visibilità e lo spostamento correnti.
- **CSV:** esporta sempre tutti i campioni dei cinque canali, anche se nascosti, con timestamp originali e tempo riallineato. Le letture mancanti restano vuote.

I video aperti dai selettori restano sul dispositivo; non sono inclusi nello ZIP.

## Salvare e aprire altri dati

Premi **Dati** per aprire la sezione dedicata.

- **Salva confronto JSON** conserva entrambi i giri, i nomi, lo spostamento di ciascuno, il cursore fisso, l’intervallo visibile, le scale e la visibilità dei canali. Riaprendo il JSON viene recuperata la stessa vista.
- **Apri JSON o CSV** apre un confronto salvato oppure nuovi dati. Un file con due giri sostituisce il confronto; un file con un solo giro sostituisce il blu o l’arancione scelto nel selettore.
- I CSV esportati dalla pagina sono riapribili. Sono supportati anche CSV con `time_s` o `lap_elapsed_s_est` e almeno un canale fra `speed_kmh`, `engine_rpm`, `gear`, `throttle_pct_est`, `brake_pct_est`. Le altre misure possono essere vuote. `video_time_s` permette il collegamento ai timestamp originali del video. Sono accettati separatori virgola o punto e virgola; con il punto e virgola sono accettati decimali con virgola.
- **Ricarica dati Monza** recupera i dati iniziali e la disposizione di base.

I video non sono incorporati nel JSON: vengono conservati i nomi per aiutarti a riselezionare gli originali dal Mac. Se un file non è valido, il confronto corrente viene conservato e viene mostrato il motivo.

## Dati e limiti

- Giro 4, primo video: tempo mostrato nell'HUD **1:33.07**.
- Giro 6, secondo video: tempo mostrato nell'HUD **1:32.49**.
- Differenza dei tempi mostrati: **0,58 s**.
- **5.716 campioni** originali, 2.952 + 2.764, a frequenza variabile.

I dati Monza iniziali della precedente estrazione sono conservati. Le partenze sono stimate dal cronometro HUD. L'asse X è il tempo, non la distanza: allo stesso secondo le auto possono essere in punti diversi del circuito. Lo spostamento è unico per il giro, senza dilatazione o allineamenti locali multipli.

Acceleratore e freno sono percentuali stimate dalle barre grafiche, non misure della centralina. Le letture numeriche incerte restano escluse. Non vengono interpolati valori mancanti e i tratti con intervalli fra campioni superiori a 0,15 s non vengono collegati nel disegno. I dati restano una prima estrazione da video con controlli a campione.

[Sorgenti, rigenerazione e verifiche nel browser](viewer/README.md).

Salvataggio singoli set: in **Dati**, scegli blu o arancione, dai un nome e premi **Salva singolo set JSON**. Il formato `driving-notes-dataset` v1 contiene `lap` (campioni e riferimento temporale) e `video` (nome e metadati, senza filmato). Apri un set nel blu e un altro nell’arancione per confrontarli. Il salvataggio del confronto completo resta disponibile.

**Collega onboard al giro** associa il video originale ai dati già presenti; non esegue estrazione automatica della telemetria da video nuovi. Un nuovo onboard richiede dati estratti JSON o CSV. Alla riapertura del set il nome dell’onboard è ricordato, ma il file va riselezionato dal Mac.
