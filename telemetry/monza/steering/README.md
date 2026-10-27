# Esperimento sterzo dai video

La proposta della linea è utilizzabile quando si riescono a riconoscere gli stessi due riferimenti solidali al volante. La linea tra due lati fissi della scocca fornisce il riferimento della macchina, come nella foto dell’utente. Una seconda linea mobile segue il volante. Sul rettilineo si salva l’angolo iniziale fra le due linee; nei fotogrammi successivi si sottrae questo zero all’angolo volante/scocca. La prospettiva richiede una calibrazione aggiuntiva per trasformarla in gradi meccanici del volante; non fornisce direttamente l'angolo delle ruote.

## Risultato del primo tentativo automatico

Provato il primo video originale, fra i secondi 6 e 18, sui comandi visibili a destra del volante. Il casco, i guanti, il bordo dell'immagine e i cambiamenti di visibilità rendono difficile mantenere gli stessi riferimenti.

- Prima configurazione: 17 punti iniziali; il tracciamento viene rifiutato dopo due fotogrammi.
- Seconda configurazione: 24 punti iniziali; 56 fotogrammi su 365 conservano una trasformazione accettata, fino a 7,868 s del video (circa 1,87 s dall'inizio della prova), ancora sul rettilineo.
- Il riferimento non rimane affidabile durante la curva. Le stime non sono validate come angolo del volante e **non sono caricate nel grafico di confronto**.

`automatic-trial-unvalidated.csv` e `tracking-diagnostic.jpg` documentano questo esperimento; non sono un canale di telemetria utilizzabile. Una casella vuota significa tracciamento perso, non zero gradi.

## Esperimento utilizzabile nella pagina interattiva

Il file `../confronto-interattivo.html` include un estratto muto di 12 secondi del primo video, ritagliato sul volante e convertito in H.264. L'estratto comincia al secondo 6 del video originale. Si può anche caricare un originale dal proprio dispositivo.

1. Premi **Linea scocca** e collega due lati rigidi della macchina, come nella foto. La linea color ambra non genera campioni di sterzo. Nell’estratto di esempio è proposta una linea ricavata approssimativamente dalla foto: verificala o ridisegnala.
2. Sul rettilineo premi **Zero volante dritto** e indica due riferimenti mobili solidali al volante. Questo salva l’offset tra volante e scocca quando lo sterzo è dritto.
3. Avanza nel video. Se la camera ruota, aggiorna prima la **Linea scocca** sul fotogramma corrente. Poi premi **Misura volante** e indica gli stessi riferimenti mobili nello stesso ordine.
4. Il calcolo è `angolo = (volante − scocca) attuale − (volante − scocca) sul rettilineo`, normalizzato fra −180° e +180°. I due punti scocca possono essere indicati in entrambi gli ordini, senza introdurre un errore di 180°; mantieni invece l’ordine dei punti del volante.
5. Se i riferimenti mobili sono coperti, premi **Segna non leggibile**. La linea scocca da sola non permette di conoscere la rotazione del volante.
6. **Esporta sterzo CSV** conserva timestamp, angolo apparente, stato, punti disegnati, calibrazione e riferimento scocca usato in ciascuna misura. `same_frame` indica la scocca annotata sullo stesso fotogramma; `saved_reference_reused` segnala che è stato riutilizzato un riferimento precedente. In quel caso non si sta misurando né correggendo automaticamente un eventuale movimento della camera.
7. Il grafico aggiunge soltanto i punti confermati; nessuna interpolazione. Le misure restano in memoria fino alla chiusura: esporta il CSV per conservarle.

È una prova manuale per verificare la fattibilità e costruire riferimenti verificati, non un inseguimento automatico già risolto. Un futuro tracker dovrebbe mantenere l'identità dei punti, controllare le occlusioni e la prospettiva, arrestarsi quando perde il riferimento e superare verifiche su fotogrammi annotati.

## Riprodurre il tentativo automatico

In un ambiente Python con `opencv-python-headless`, `numpy` e `pillow`:

```bash
python track_experiment.py '/percorso/al/primo-video.mp4' --out /tmp/monza-trial
```

Le coordinate sono specifiche del primo video ruotato correttamente (2622 × 1206); non generalizzano automaticamente ad altre telecamere. Il comando produce un CSV sperimentale e un'immagine diagnostica.

## Nuova elaborazione automatica: attività visiva, non angolo

Sono stati provati un flusso ottico denso, una compensazione del movimento della scocca, l'esclusione del casco tramite colore e il riaggancio di dettagli visivi. La ricostruzione del **segno e dell'angolo integrato** ha dato risultati incoerenti fra pose simili dei due video, oltre a deriva e occlusioni. Questa verifica è fallita: non è stata pubblicata una curva in gradi come se fosse una misura valida.

La pagina carica invece automaticamente una **traccia di attività visiva della zona del volante**, in indice relativo 0–100. Non richiede clic, punti, calibrazioni o annotazioni dell'utente. Le opzioni di misura manuale sono facoltative e inizialmente chiuse.

- Il flusso nella scocca stima un movimento comune della camera da sottrarre.
- Una maschera cromatica tenta di escludere il casco. La zona di analisi include volante e mani che lo impugnano: possono restare movimenti di guanti, riflessi o porzioni di casco.
- Viene conservata l'ampiezza del movimento locale supportato dall'immagine, prima di integrarla in un angolo. Il supporto è un punteggio euristico, non una probabilità di correttezza.
- Una media quadratica su 0,3 secondi attenua il rumore. La scala 0–100 è comune ai due video, con riferimento al percentile 95 dei valori supportati e al rumore iniziale.
- I campioni con supporto insufficiente restano vuoti; non sono riempiti per ottenere una curva continua. La traccia inizia circa 0,8 secondi dopo l’inizio del giro, al primo fotogramma usato per inizializzare il confronto visivo.
- **Un valore basso non significa volante dritto:** il volante potrebbe essere fermo mentre mantiene una sterzata. L'indice non fornisce né gradi né direzione della sterzata e non è una percentuale del fine corsa.

`automatic-activity-giro1.csv` e `automatic-activity-giro2.csv` contengono timestamp, indice, supporto e stato. Il campo `visual_angular_rate_proxy` è una quantità intermedia del modello di movimento nell'immagine, non una misura della velocità angolare meccanica. I metadati documentano la normalizzazione. La pagina esporta anche un CSV dedicato alla traccia automatica e una PNG dello zoom attuale.

Per ricalcolare dai due originali:

```bash
python automatic_activity.py '/percorso/video1.mp4' '/percorso/video2.mp4' --out /tmp/monza-activity
```

Servono `opencv-python-headless` e `numpy`. La geometria è specifica di questi video. Il test `test_automatic_activity.py` verifica con immagini sintetiche la sottrazione di una traslazione comune e la sensibilità a movimento locale in entrambi i versi. Questi test non validano una ricostruzione dello sterzo nei video reali: quella resta irrisolta.
