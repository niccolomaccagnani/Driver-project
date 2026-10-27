# Esperimento sterzo dai video

La proposta della linea è utilizzabile quando si riescono a riconoscere gli stessi due riferimenti solidali al volante. Uno zero sul rettilineo permette di misurare la variazione dell'angolo della linea nell'immagine. La prospettiva richiede una calibrazione aggiuntiva per trasformarla in gradi meccanici del volante; non fornisce direttamente l'angolo delle ruote.

## Risultato del primo tentativo automatico

Provato il primo video originale, fra i secondi 6 e 18, sui comandi visibili a destra del volante. Il casco, i guanti, il bordo dell'immagine e i cambiamenti di visibilità rendono difficile mantenere gli stessi riferimenti.

- Prima configurazione: 17 punti iniziali; il tracciamento viene rifiutato dopo due fotogrammi.
- Seconda configurazione: 24 punti iniziali; 56 fotogrammi su 365 conservano una trasformazione accettata, fino a 7,868 s del video (circa 1,87 s dall'inizio della prova), ancora sul rettilineo.
- Il riferimento non rimane affidabile durante la curva. Le stime non sono validate come angolo del volante e **non sono caricate nel grafico di confronto**.

`automatic-trial-unvalidated.csv` e `tracking-diagnostic.jpg` documentano questo esperimento; non sono un canale di telemetria utilizzabile. Una casella vuota significa tracciamento perso, non zero gradi.

## Esperimento utilizzabile nella pagina interattiva

Il file `../confronto-interattivo.html` include un estratto muto di 12 secondi del primo video, ritagliato sul volante e convertito in H.264. L'estratto comincia al secondo 6 del video originale. Si può anche caricare un originale dal proprio dispositivo.

1. Ferma il video sul rettilineo e premi **Imposta zero**.
2. Clicca due riferimenti del volante sufficientemente distanti e realmente solidali ad esso. Non scegliere halo, casco o guanto.
3. Avanza fotogramma per fotogramma. Premi **Misura angolo** e indica gli stessi riferimenti nello stesso ordine.
4. Se i riferimenti sono coperti, premi **Segna non leggibile**.
5. Il grafico aggiunge soltanto i punti confermati; nessuna interpolazione. L'angolo apparente è positivo in senso orario nell'immagine.
6. **Esporta sterzo CSV** conserva timestamp, angolo apparente, stato, punti disegnati e calibrazione. Le misure restano in memoria fino alla chiusura: esportale per conservarle.

È una prova manuale per verificare la fattibilità e costruire riferimenti verificati, non un inseguimento automatico già risolto. Un futuro tracker dovrebbe mantenere l'identità dei punti, controllare le occlusioni e la prospettiva, arrestarsi quando perde il riferimento e superare verifiche su fotogrammi annotati.

## Riprodurre il tentativo automatico

In un ambiente Python con `opencv-python-headless`, `numpy` e `pillow`:

```bash
python track_experiment.py '/percorso/al/primo-video.mp4' --out /tmp/monza-trial
```

Le coordinate sono specifiche del primo video ruotato correttamente (2622 × 1206); non generalizzano automaticamente ad altre telecamere. Il comando produce un CSV sperimentale e un'immagine diagnostica.
