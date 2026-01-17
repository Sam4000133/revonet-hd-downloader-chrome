// Background service worker per Revonet HD Downloader (Chrome)

// Carica JSZip come libreria esterna (percorso dalla root dell'estensione)
importScripts('/lib/jszip.min.js');

// Verifica che JSZip sia caricato
console.log('[Background] Service worker caricato. JSZip disponibile:', typeof JSZip !== 'undefined');

// Gestisce i messaggi dal popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Messaggio ricevuto:', message.action);

  try {
    // Risposta al ping per verificare che il background sia attivo
    if (message.action === 'ping') {
      console.log('[Background] Ping ricevuto, rispondo pong');
      sendResponse({ pong: true });
      return true;
    }

    if (message.action === 'download') {
      downloadSingleImage(message.url, message.filename);
      sendResponse({ success: true });
    } else if (message.action === 'downloadZip') {
      console.log('[Background] downloadZip - immagini:', message.images?.length, 'descrizioni:', message.descriptions?.length, 'singleVehicle:', message.singleVehicle);

      // Verifica che i dati siano validi
      if (!message.images || !Array.isArray(message.images)) {
        console.error('[Background] Errore: images non è un array valido');
        sendResponse({ success: false, error: 'Dati immagini non validi' });
        return true;
      }

      downloadAsZip(message.images, message.zipName, message.descriptions || [], message.singleVehicle || false, message.serverUrl || null)
        .then((result) => {
          console.log('[Background] downloadAsZip completato con successo');
          sendResponse({ success: true, ...result });
        })
        .catch(err => {
          console.error('[Background] downloadAsZip errore:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Indica risposta asincrona
    } else {
      console.log('[Background] Azione non riconosciuta:', message.action);
    }
  } catch (syncError) {
    console.error('[Background] Errore sincrono:', syncError);
    sendResponse({ success: false, error: syncError.message });
  }

  return true;
});

// Download singola immagine
async function downloadSingleImage(url, filename) {
  try {
    await chrome.downloads.download({
      url: url,
      filename: `dorotheum_downloads/${filename}`,
      saveAs: false,
      conflictAction: 'uniquify'
    });
  } catch (error) {
    console.error(`Errore download ${filename}:`, error);
    // Fallback senza cartella
    try {
      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      });
    } catch (e) {
      console.error('Errore fallback:', e);
    }
  }
}

// Elabora immagine sul server YOLO (rimuove banner/cornici)
async function processImageOnServer(blob, serverUrl) {
  try {
    console.log(`[Background] Elaborazione immagine su server: ${serverUrl}`);

    const formData = new FormData();
    formData.append('image', blob, 'image.jpg');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 secondi timeout

    const response = await fetch(`${serverUrl}/process`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const processedBlob = await response.blob();

    // Verifica header informativi
    const vehicleFound = response.headers.get('X-Vehicle-Found');
    const newSize = response.headers.get('X-New-Size');
    const processingTime = response.headers.get('X-Processing-Time');

    console.log(`[Background] Elaborazione completata: veicolo=${vehicleFound}, size=${newSize}, tempo=${processingTime}ms`);

    return processedBlob;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[Background] Timeout elaborazione server');
    } else {
      console.error('[Background] Errore elaborazione server:', error.message);
    }
    return null; // Ritorna null per usare immagine originale come fallback
  }
}

// Invia messaggio di progresso al popup
function sendProgress(phase, current, total, detail = '') {
  try {
    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      phase: phase,
      current: current,
      total: total,
      percent: total > 0 ? Math.round((current / total) * 100) : 0,
      detail: detail
    }).catch(() => {
      // Ignora errori se il popup è chiuso
    });
  } catch (e) {
    // Ignora errori di comunicazione
  }
}

// Download multiplo come ZIP (immagini + descrizioni)
async function downloadAsZip(images, zipName, descriptions = [], singleVehicle = false, serverUrl = null) {
  console.log(`[Background] Inizio creazione ZIP...`);
  console.log(`[Background] Immagini ricevute: ${images ? images.length : 0}`);
  console.log(`[Background] Descrizioni ricevute: ${descriptions ? descriptions.length : 0}`);
  console.log(`[Background] Modalità singolo veicolo: ${singleVehicle}`);
  console.log(`[Background] Server elaborazione: ${serverUrl || 'disabilitato'}`);

  // Notifica inizio
  sendProgress('init', 0, images.length, 'Preparazione download...');

  // Verifica che JSZip sia disponibile
  if (typeof JSZip === 'undefined') {
    console.error('[Background] ERRORE: JSZip non è definito!');
    throw new Error('Libreria JSZip non caricata');
  }

  if (!images || images.length === 0) {
    console.error('[Background] Nessuna immagine ricevuta!');
    throw new Error('Nessuna immagine da scaricare');
  }

  console.log('[Background] Creazione istanza JSZip...');
  const zip = new JSZip();
  console.log('[Background] JSZip istanziato correttamente');

  // Funzione helper per scaricare con retry (definita una volta sola)
  const downloadWithRetry = async (url, imageIndex, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Piccola pausa tra i download per evitare throttling
        if (imageIndex > 0 || attempt > 1) {
          await new Promise(r => setTimeout(r, 200));
        }

        console.log(`[Background] Download (tentativo ${attempt}): ${url.substring(0, 80)}...`);
        const response = await fetch(url, {
          mode: 'cors',
          credentials: 'include',
          cache: 'no-cache'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();

        // Verifica che l'immagine sia completa (almeno 10KB per immagine HD)
        const minSize = 10 * 1024;
        if (blob.size < minSize) {
          console.warn(`[Background] Immagine troppo piccola (${(blob.size/1024).toFixed(1)} KB), ritento...`);
          if (attempt < maxRetries) continue;
        }

        return blob;
      } catch (error) {
        console.error(`[Background] Tentativo ${attempt} fallito:`, error.message);
        if (attempt === maxRetries) throw error;
      }
    }
    return null;
  };

  console.log(`[Background] Creazione ZIP con ${images.length} immagini e ${descriptions.length} descrizioni...`);

  let successful = 0;
  let descAdded = 0;

  // Modalità singolo veicolo: file direttamente nella root
  if (singleVehicle) {
    console.log('[Background] Modalità singolo veicolo - file nella root');

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      if (!image || !image.url) {
        console.warn(`[Background] Immagine ${i} senza URL, skip`);
        continue;
      }

      // Invia progresso download
      sendProgress('download', i + 1, images.length, `Scaricamento immagine ${i + 1} di ${images.length}...`);

      try {
        let blob = await downloadWithRetry(image.url, i);

        if (blob && blob.size > 1000) {
          // Elabora immagine sul server se abilitato
          if (serverUrl) {
            sendProgress('processing', i + 1, images.length, `Elaborazione immagine ${i + 1} sul server...`);
            const processed = await processImageOnServer(blob, serverUrl);
            if (processed && processed.size > 1000) {
              console.log(`[Background] Immagine elaborata: ${(blob.size/1024).toFixed(1)}KB -> ${(processed.size/1024).toFixed(1)}KB`);
              blob = processed;
            } else {
              console.log(`[Background] Uso immagine originale (elaborazione fallita o non necessaria)`);
            }
          }

          const filename = `${i + 1}.jpg`;
          zip.file(filename, blob);
          console.log(`[Background] OK: ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
          successful++;
        }
      } catch (error) {
        console.error(`[Background] Errore download ${image.url}:`, error.message);
      }
    }

    // Aggiungi descrizioni nella root
    if (descriptions.length > 0) {
      sendProgress('descriptions', 0, descriptions.length, 'Aggiunta descrizioni...');
    }
    descriptions.forEach((desc, idx) => {
      if (desc.content) {
        const langMatch = desc.filename.match(/_([a-z]{2})\.txt$/i);
        const langSuffix = langMatch ? `_${langMatch[1]}` : '';
        const descFilename = `descrizione${langSuffix}.txt`;
        zip.file(descFilename, desc.content);
        console.log(`[Background] Aggiunta descrizione: ${descFilename}`);
        descAdded++;
      }
    });

  } else {
    // Modalità multipli veicoli: crea cartelle

    const imagesByLot = new Map();
    images.forEach((image, index) => {
      const lotKey = image.lotTitle || 'veicolo';
      if (!imagesByLot.has(lotKey)) {
        imagesByLot.set(lotKey, []);
      }
      imagesByLot.get(lotKey).push({ ...image, originalIndex: index });
    });

    const descsByLot = new Map();
    descriptions.forEach(desc => {
      const lotKey = desc.lotTitle || 'veicolo';
      if (!descsByLot.has(lotKey)) {
        descsByLot.set(lotKey, []);
      }
      descsByLot.get(lotKey).push(desc);
    });

    console.log(`[Background] Veicoli da processare: ${imagesByLot.size}`);

    let totalProcessed = 0;
    let lotIndex = 0;
    const totalLots = imagesByLot.size;

    for (const [lotTitle, lotImages] of imagesByLot) {
      lotIndex++;
      const folderName = sanitizeFolderName(lotTitle) || `veicolo_${Date.now()}`;
      console.log(`[Background] Processando: ${folderName} (${lotImages.length} immagini)`);

      const folder = zip.folder(folderName);

      for (let i = 0; i < lotImages.length; i++) {
        const image = lotImages[i];
        totalProcessed++;

        if (!image || !image.url) {
          console.warn(`[Background] Immagine ${i} senza URL, skip`);
          continue;
        }

        // Invia progresso download
        sendProgress('download', totalProcessed, images.length, `Veicolo ${lotIndex}/${totalLots} - Immagine ${i + 1}/${lotImages.length}`);

        try {
          let blob = await downloadWithRetry(image.url, i);

          if (blob && blob.size > 1000) {
            // Elabora immagine sul server se abilitato
            if (serverUrl) {
              sendProgress('processing', totalProcessed, images.length, `Elaborazione immagine ${i + 1} sul server...`);
              const processed = await processImageOnServer(blob, serverUrl);
              if (processed && processed.size > 1000) {
                console.log(`[Background] Immagine elaborata: ${(blob.size/1024).toFixed(1)}KB -> ${(processed.size/1024).toFixed(1)}KB`);
                blob = processed;
              } else {
                console.log(`[Background] Uso immagine originale (elaborazione fallita o non necessaria)`);
              }
            }

            const filename = `${i + 1}.jpg`;
            folder.file(filename, blob);
            console.log(`[Background] OK: ${folderName}/${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
            successful++;
          } else {
            throw new Error('Blob troppo piccolo o nullo');
          }
        } catch (error) {
          console.error(`[Background] Errore download ${image.url}:`, error.message);

          if (image.thumbnail && image.thumbnail !== image.url) {
            try {
              console.log(`[Background] Provo fallback: ${image.thumbnail.substring(0, 80)}...`);
              let blob = await downloadWithRetry(image.thumbnail, i, 2);

              if (blob && blob.size > 1000) {
                // Elabora anche il fallback se server abilitato
                if (serverUrl) {
                  const processed = await processImageOnServer(blob, serverUrl);
                  if (processed && processed.size > 1000) {
                    blob = processed;
                  }
                }

                const filename = `${i + 1}_fallback.jpg`;
                folder.file(filename, blob);
                console.log(`[Background] Fallback OK: ${folderName}/${filename}`);
                successful++;
              }
            } catch (e) {
              console.error('[Background] Anche il fallback ha fallito:', e.message);
            }
          }
        }
      }

      // Aggiungi descrizioni per questo veicolo
      const lotDescs = descsByLot.get(lotTitle) || [];
      lotDescs.forEach(desc => {
        if (desc.content) {
          const langMatch = desc.filename.match(/_([a-z]{2})\.txt$/i);
          const langSuffix = langMatch ? `_${langMatch[1]}` : '';
          const descFilename = `descrizione${langSuffix}.txt`;
          folder.file(descFilename, desc.content);
          console.log(`[Background] Aggiunta descrizione: ${folderName}/${descFilename}`);
          descAdded++;
        }
      });
    }
  }

  console.log(`[Background] Download completati: ${successful} immagini, ${descAdded} descrizioni`);

  if (successful === 0 && descAdded === 0) {
    console.error('[Background] Nessun contenuto scaricato con successo!');
    sendProgress('error', 0, 0, 'Nessun contenuto scaricato');
    throw new Error('Nessun contenuto scaricato con successo');
  }

  // Genera lo ZIP
  console.log('[Background] Generazione file ZIP...');
  sendProgress('compressing', 0, 100, 'Compressione file ZIP in corso...');

  try {
    // In Chrome MV3 Service Worker, URL.createObjectURL non è disponibile
    // Generiamo il ZIP come base64 e usiamo un data URL
    const zipBase64 = await zip.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, (metadata) => {
      // Callback per il progresso della compressione
      sendProgress('compressing', Math.round(metadata.percent), 100, `Compressione: ${Math.round(metadata.percent)}%`);
    });

    const zipSizeMB = (zipBase64.length * 0.75 / 1024 / 1024).toFixed(2);
    console.log(`[Background] ZIP generato: ~${zipSizeMB} MB`);

    sendProgress('saving', 100, 100, 'Salvataggio file ZIP...');

    // Crea data URL per il download
    const zipUrl = `data:application/zip;base64,${zipBase64}`;

    // Scarica lo ZIP
    const timestamp = new Date().toISOString().slice(0, 10);
    const finalZipName = zipName || `dorotheum_${timestamp}.zip`;

    console.log(`[Background] Avvio download: ${finalZipName}`);
    await chrome.downloads.download({
      url: zipUrl,
      filename: finalZipName,
      saveAs: true
    });

    sendProgress('complete', 100, 100, `Completato! ${successful} immagini, ${descAdded} descrizioni`);

    console.log(`[Background] ZIP completato: ${successful} immagini, ${descAdded} descrizioni`);
    return { success: true, count: successful, total: images.length, descriptions: descAdded };
  } catch (zipError) {
    console.error('[Background] Errore generazione/download ZIP:', zipError);
    sendProgress('error', 0, 0, 'Errore durante la creazione dello ZIP');
    throw zipError;
  }
}

// Sanitizza nome cartella
function sanitizeFolderName(name) {
  return name
    // Rimuovi prefissi tedeschi veicoli mantenendo eventuale numero lotto
    .replace(/^(\d+_)?(pkw|lkw|skw|kkw|kfz|nfz)\s+/i, '$1')
    .replace(/[<>:"/\\|?*]/g, '')      // Rimuovi caratteri non validi
    .replace(/\s+/g, '_')              // Spazi -> underscore
    .replace(/_+/g, '_')               // Riduci underscore multipli
    .replace(/^_|_$/g, '')             // Rimuovi underscore iniziali/finali
    .substring(0, 80);                 // Limita lunghezza
}
