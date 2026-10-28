# Driver Notes con Telemetria

Scarica `driver-notes-telemetria.zip`, estrailo e apri `Driver notes.html` con Safari o Chrome. Per ritrovare i dati locali usa lo stesso browser e la stessa origine del sito; se usi il file sul Mac conserva nome e percorso del vecchio HTML, dopo averne fatto una copia. Il pacchetto non contiene video personali. I browser possono applicare regole diverse all’archiviazione dei file locali.

La voce **Telemetria** contiene il confronto su un solo grafico, le scale indipendenti, il cursore fisso, lo zoom trascinando, Alt+S, l’allineamento per fotogrammi e l’importazione/esportazione JSON/CSV.

1. Scegli circuito e onboard blu/arancione dall’archivio del sito. Collega gli originali corrispondenti ai dati visualizzati.
2. Apri **Allineamento** nel grafico: i video dell’archivio sono già disponibili.
3. Nella **Libreria dei set**, scegli il giro e un nome, poi **Salva set nel sito**.
4. Apri due set salvati nel blu e nell’arancione. Gli onboard associati si ricollegano automaticamente quando ancora presenti nello stesso browser.

I due giri Monza iniziali sono esempi. La selezione di un onboard non estrae nuovi valori: per nuovi filmati importa la telemetria già estratta tramite **Dati**. I file video non vengono duplicati nella libreria dei set. Eliminare un set conserva l’onboard originale. Esporta anche i singoli JSON per conservarne una copia esterna; il backup delle note esistente non include la libreria telemetria né i video.

## Struttura e verifica

- `source.html`: sito originale caricato dall’utente, conservato senza modifiche.
- `telemetry.js`: sezione, libreria e collegamento agli onboard.
- `build.py`: incorpora il viewer generato in un iframe `srcdoc` nello stesso HTML. L’isolamento mantiene separati stili e variabili del sito e del grafico.
- `Driver notes.html` e `driver-notes-telemetria.zip`: distribuzione senza dipendenze di rete.
- `tests/browser_check.py`: prova browser con onboard reali archiviati tramite l’API originale, riallineamento, libreria persistente, ricollegamento per ID, navigazione, eliminazione e mobile. L’apertura `file://` non è verificabile nel Chromium di questo ambiente, che la blocca tramite una policy amministrativa.

Le note e i video continuano a usare le chiavi originali `pilot-notes-v1` e IndexedDB `pilot-onboards/videos`. La libreria usa IndexedDB `driver-notes-telemetry-v1/sets`. I riferimenti video salvano `siteVideoId`; un nome e una dimensione univoci consentono di collegare anche set esportati prima dell’integrazione. Un riferimento mancante non viene sostituito con un video diverso.

Rigenera prima `python telemetry/monza/viewer/build.py`, poi `python site/build.py` dalla radice del repository.
