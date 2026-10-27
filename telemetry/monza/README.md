# Confronto dei due giri a Monza

**Nuovo: [prove dei metodi per lo sterzo con segno](steering/benchmark/README.md)** — confronto quantitativo di errore, copertura e falsi agganci. I test con gradi noti sono simulazioni 2D; sui video sono misurati scarti di tracciamento in pixel, non la precisione dei gradi meccanici.

## Aprire la versione interattiva sul Mac

Scarica **[confronto-interattivo.zip](confronto-interattivo.zip)** usando il pulsante di download di GitHub, apri lo ZIP e poi apri `confronto-interattivo.html` con Safari o Chrome. Non servono installazioni. Lo ZIP contiene la pagina completa: dati e video di esempio sono già inclusi.

È disponibile anche il [singolo file HTML](confronto-interattivo.html), da scaricare e aprire nel browser. La pagina di GitHub mostra il file, non esegue l'applicazione interattiva.

![Anteprima della vista interattiva, zoom sulla prima staccata](confronto-interattivo-preview.png)

### Traccia automatica disponibile senza annotazioni

La pagina mostra già un [indicatore automatico di movimento nella zona del volante](volante-automatico.png) per entrambi i giri. È un indice relativo 0–100: **non è un angolo di sterzo né la posizione del volante**. Un valore basso può indicare assenza di movimento visibile anche durante una sterzata mantenuta. La ricostruzione automatica dei gradi ha fallito il controllo di coerenza; [metodo e limiti](steering/README.md) sono documentati. Le misure manuali restano disponibili come opzione chiusa, non sono un passaggio richiesto.

### Controlli

- **Zoom:** trascina sul grafico, usa la rotella/trackpad oppure i pulsanti. Tutti i canali condividono l'intervallo. **Maiusc + trascinamento** sposta la vista; doppio clic ripristina il giro intero.
- **Riallineamento:** cambia lo spostamento del giro arancione in secondi, oppure apri i due video originali dal dispositivo, seleziona lo stesso riferimento fisico e premi **Allinea questi fotogrammi**. Puoi anche indicare due tempi di riferimento. Un valore positivo sposta l'arancione verso destra. Il riallineamento non cambia le durate dei giri.
- **Cursore:** mostra i valori dei due video nel punto temporale scelto; le letture dubbie restano vuote.
- **Esporta vista PNG:** salva sul tuo Mac l'immagine del confronto con lo zoom e lo spostamento attuali.
- **Esporta dati CSV:** salva tutti i campioni, i timestamp originali e il tempo allineato; conserva i valori mancanti.
- **Misure manuali facoltative dell’angolo:** linea fissa sulla scocca, linea mobile sul volante, zero sul rettilineo e misure manuali della rotazione relativa, con esportazione CSV. È incluso un video ritagliato di esempio. [Metodo e risultato della prova automatica](steering/README.md).

I video aperti tramite i selettori rimangono sul dispositivo. Le misure dello sterzo restano in memoria: esporta il CSV per conservarle prima di chiudere la pagina.

[Anteprima del riferimento scocca](sterzo-scocca-preview.png).

## Dati e limiti

- Blu: giro 4 del primo video, tempo mostrato nell'HUD **1:33.07**.
- Arancione: giro 6 del secondo video, tempo mostrato nell'HUD **1:32.49**.
- Differenza dei tempi mostrati: **0,58 secondi**.
- Il confronto contiene **5.716 fotogrammi** (2.952 + 2.764), con timestamp a frequenza variabile.

Le partenze sono stimate dal cronometro HUD. L'asse orizzontale mantiene il tempo reale di ciascun giro: allo stesso secondo le auto possono trovarsi in punti diversi della pista. Non è ancora un allineamento per distanza o un riallineamento locale fra più riferimenti.

Acceleratore e freno sono percentuali stimate dalle barre grafiche. Le letture numeriche incerte sono escluse; i valori mancanti non sono interpolati. Si tratta di una prima estrazione automatica con verifiche a campione, da rivedere prima di un confronto definitivo.

Lo sterzo manuale misura l'angolo apparente della linea nell'immagine, non l'angolo meccanico corretto per prospettiva. La prova automatica perde il riferimento prima della curva: non è presentata come una curva sterzo valida.

## Immagine originale

![Confronto telemetria statico](confronto-monza.png)

Questa immagine è statica. Lo zoom temporale e il riallineamento richiedono la versione HTML.

[Sorgenti, rigenerazione e verifiche nel browser](viewer/README.md).
