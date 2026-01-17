# Revonet HD Downloader - Estensione Chrome

Un'estensione Chrome potente per scaricare immagini in alta definizione dai siti di aste veicoli Dorotheum e Tipcars. Include traduzione automatica tedesco-italiano, descrizioni AI dei veicoli e integrazione opzionale con server YOLO per l'elaborazione delle immagini.

## Funzionalità

### Funzionalità Principali
- **Download Immagini HD**: Estrae e scarica automaticamente immagini ad alta risoluzione dei veicoli
- **Download in Batch**: Scarica tutte le immagini da una singola pagina veicolo come file ZIP
- **Supporto Multi-Veicolo**: Seleziona e scarica immagini da più veicoli contemporaneamente dalle pagine lista aste
- **Organizzazione Intelligente**: Crea cartelle organizzate per ogni veicolo quando si scaricano più lotti

### Traduzione AI (API DeepSeek)
- **Traduzione Nome Veicolo**: Traduce automaticamente i termini tedeschi in italiano
  - Kasten → Furgone
  - Maxi-Kasten → Furgone Maxi
  - LKW → Camion
  - PKW → Auto
  - Kombi → Station Wagon
  - E molti altri...
- **Generazione Descrizioni**: Crea descrizioni professionali e persuasive in più lingue
- **Supporto Multi-Lingua**: Genera descrizioni in italiano, inglese, tedesco, francese e spagnolo

### Elaborazione Immagini (Opzionale)
- **Integrazione Server YOLO**: Connessione a un server YOLO per l'elaborazione automatica delle immagini
- **Rimozione Banner/Cornici**: Ritaglia automaticamente le immagini per focalizzarsi sul veicolo, rimuovendo watermark e bordi

### Interfaccia Utente
- **Barra di Progresso in Tempo Reale**: Feedback visivo durante il download con messaggi di stato dettagliati
- **Ricerca e Filtro**: Trova rapidamente i veicoli nelle liste aste lunghe
- **Anteprima Miniature**: Anteprima visiva di tutte le immagini disponibili prima del download
- **Pannello Impostazioni**: Configurazione facile di chiavi API e preferenze

## Siti Web Supportati

- `dorotheum.com` - Casa d'aste austriaca
- `dorotheum.at` - Casa d'aste austriaca (dominio alternativo)
- `tipcars.com` - Marketplace veicoli

## Installazione

### Metodo 1: Carica Estensione Non Pacchettizzata (Sviluppo)
1. Scarica o clona questo repository
2. Apri Chrome e vai a `chrome://extensions`
3. Abilita la **"Modalità sviluppatore"** (toggle in alto a destra)
4. Clicca **"Carica estensione non pacchettizzata"**
5. Seleziona la cartella `dorotheum-hd-downloader-chrome`

### Metodo 2: File CRX
1. Scarica il file `.crx` dalle release
2. Apri Chrome e vai a `chrome://extensions`
3. Abilita la **"Modalità sviluppatore"**
4. Trascina e rilascia il file `.crx` sulla pagina

## Configurazione

### Chiave API DeepSeek (Necessaria per le traduzioni)
1. Ottieni una chiave API da [DeepSeek](https://platform.deepseek.com/)
2. Clicca sull'icona dell'estensione per aprire il popup
3. Clicca l'icona **Impostazioni** (ingranaggio)
4. Inserisci la tua chiave API DeepSeek
5. Seleziona le lingue di output desiderate
6. Clicca **Salva**

### Server YOLO (Opzionale)
Se hai un server YOLO per l'elaborazione delle immagini:
1. Apri le Impostazioni
2. Inserisci l'URL del server (es. `http://localhost:5000`)
3. Abilita la checkbox **"Elabora immagini"**
4. Clicca **Salva**

## Utilizzo

### Pagina Singolo Veicolo
1. Naviga a una pagina dettaglio veicolo su Dorotheum o Tipcars
2. Clicca sull'icona dell'estensione
3. Visualizza tutte le immagini HD disponibili
4. Seleziona immagini specifiche o clicca **"Scarica tutto come ZIP"**
5. Opzionalmente abilita **"Includi descrizione"** per le descrizioni generate dall'AI

### Pagina Lista Aste
1. Naviga a una pagina lista aste
2. Clicca sull'icona dell'estensione
3. Usa la casella di ricerca per filtrare i veicoli
4. Seleziona i veicoli cliccandoci sopra
5. Clicca **"Scarica X veicoli"**
6. Le immagini saranno organizzate in cartelle per nome veicolo

## Dettagli Tecnici

### Versione Manifest
- Conforme a Chrome Manifest V3
- Usa Service Worker per l'elaborazione in background

### Permessi
- `activeTab`: Accesso al contenuto della scheda corrente
- `downloads`: Salvataggio file su disco
- `storage`: Memorizzazione preferenze utente

### Permessi Host
- `*://*.dorotheum.com/*`
- `*://*.dorotheum.at/*`
- `*://*.tipcars.com/*`

### Dipendenze
- [JSZip](https://stuk.github.io/jszip/) - Generazione file ZIP

## Struttura File

```
dorotheum-hd-downloader-chrome/
├── manifest.json          # Manifest estensione (MV3)
├── popup/
│   ├── popup.html         # UI popup estensione
│   ├── popup.js           # Logica popup e chiamate API
│   └── popup.css          # Stili popup
├── scripts/
│   ├── background.js      # Service worker per download
│   └── content.js         # Estrazione contenuto pagina
├── lib/
│   └── jszip.min.js       # Libreria ZIP
└── icons/
    ├── icon-48.png        # Icona estensione (48x48)
    └── icon-96.png        # Icona estensione (96x96)
```

## Riferimento Traduzioni Tedesco-Italiano

| Tedesco | Italiano |
|---------|----------|
| Kasten | Furgone |
| Maxi-Kasten | Furgone Maxi |
| Hochdach-Kasten | Furgone Tetto Alto |
| Kastenwagen | Furgone |
| LKW / Lkw | Camion |
| PKW / Pkw | Auto |
| Kombi | Station Wagon |
| Pritsche | Cassone |
| Kipper | Ribaltabile |
| Transporter | Furgone |
| Kleinbus | Minibus |
| Geländewagen | Fuoristrada |
| Sattelzugmaschine | Trattore stradale |
| Anhänger | Rimorchio |
| Limousine | Berlina |

## Risoluzione Problemi

### L'estensione non funziona sulla pagina
- Ricarica la pagina dopo aver installato l'estensione
- Verifica di essere su un sito web supportato
- Assicurati che la pagina sia completamente caricata

### Il download fallisce
- Controlla la connessione internet
- Prova a scaricare meno immagini alla volta
- Controlla la console del browser per messaggi di errore

### Le traduzioni non funzionano
- Verifica che la chiave API DeepSeek sia corretta
- Controlla di avere crediti API rimanenti
- Assicurati che la chiave API abbia i permessi corretti

### Il file ZIP è vuoto
- Alcune immagini potrebbero essere protette o non disponibili
- Prova a ricaricare la pagina e scaricare di nuovo

## Privacy

Questa estensione:
- Accede ai dati solo sui siti di aste supportati
- Memorizza le impostazioni localmente nel browser
- Invia le descrizioni dei veicoli all'API DeepSeek solo quando la traduzione è abilitata
- Non raccoglie né trasmette dati personali

## Licenza

Licenza MIT - Vedi file LICENSE per i dettagli

## Contribuire

I contributi sono benvenuti! Sentiti libero di inviare una Pull Request.

## Changelog

### v2.0.0
- Prima release per Chrome (convertita da Firefox)
- Supporto Chrome Manifest V3
- Barra di progresso in tempo reale durante i download
- Traduzione tedesco-italiano migliorata
- Integrazione server YOLO per elaborazione immagini
- Generazione descrizioni multi-lingua
