// Popup script per Revonet HD Downloader (Chrome)

(function() {
  'use strict';

  // Stato
  let pageType = 'single';
  let allLots = [];
  let selectedLots = new Set();
  let allImages = [];
  let selectedImages = new Set();
  let lotTitle = '';
  let currentTabId = null;

  // Impostazioni
  let settings = {
    deepseekApiKey: '',
    languages: ['it'], // Italiano sempre incluso
    serverUrl: '',     // URL server elaborazione immagini
    enableProcessing: false // Abilita elaborazione immagini
  };

  // Elementi DOM
  const elements = {
    loading: document.getElementById('loading'),
    notSupported: document.getElementById('not-supported'),
    noContent: document.getElementById('no-content'),
    lotsContainer: document.getElementById('lots-container'),
    imagesContainer: document.getElementById('images-container'),
    lotsGrid: document.getElementById('lots-grid'),
    imagesGrid: document.getElementById('images-grid'),
    lotsCount: document.getElementById('lots-count'),
    imageCount: document.getElementById('image-count'),
    selectAllLots: document.getElementById('select-all-lots'),
    downloadSelectedLots: document.getElementById('download-selected-lots'),
    refreshLots: document.getElementById('refresh-lots'),
    selectAll: document.getElementById('select-all'),
    downloadSelected: document.getElementById('download-selected'),
    downloadAll: document.getElementById('download-all'),
    backBtn: document.getElementById('back-btn'),
    backToLots: document.getElementById('back-to-lots'),
    progressOverlay: document.getElementById('progress-overlay'),
    progressText: document.getElementById('progress-text'),
    progressFill: document.getElementById('progress-fill'),
    progressDetail: document.getElementById('progress-detail'),
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    searchHint: document.getElementById('search-hint'),
    includeDescription: document.getElementById('include-description'),
    includeDescriptionSingle: document.getElementById('include-description-single'),
    // Impostazioni
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    closeSettings: document.getElementById('close-settings'),
    deepseekApiKey: document.getElementById('deepseek-api-key'),
    saveSettings: document.getElementById('save-settings'),
    langEn: document.getElementById('lang-en'),
    langDe: document.getElementById('lang-de'),
    langFr: document.getElementById('lang-fr'),
    langEs: document.getElementById('lang-es'),
    // Server elaborazione immagini
    serverUrl: document.getElementById('server-url'),
    enableProcessing: document.getElementById('enable-processing')
  };

  // Stato filtro
  let filteredIndices = null; // null = mostra tutti

  // Carica impostazioni salvate
  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(['deepseekApiKey', 'languages', 'serverUrl', 'enableProcessing']);
      if (stored.deepseekApiKey) {
        settings.deepseekApiKey = stored.deepseekApiKey;
        elements.deepseekApiKey.value = stored.deepseekApiKey;
      }
      if (stored.languages && Array.isArray(stored.languages)) {
        settings.languages = stored.languages;
        // Aggiorna checkbox
        if (elements.langEn) elements.langEn.checked = stored.languages.includes('en');
        if (elements.langDe) elements.langDe.checked = stored.languages.includes('de');
        if (elements.langFr) elements.langFr.checked = stored.languages.includes('fr');
        if (elements.langEs) elements.langEs.checked = stored.languages.includes('es');
      }
      // Server elaborazione immagini
      if (stored.serverUrl) {
        settings.serverUrl = stored.serverUrl;
        if (elements.serverUrl) elements.serverUrl.value = stored.serverUrl;
      }
      if (stored.enableProcessing !== undefined) {
        settings.enableProcessing = stored.enableProcessing;
        if (elements.enableProcessing) elements.enableProcessing.checked = stored.enableProcessing;
      }
    } catch (e) {
      console.error('Errore caricamento impostazioni:', e);
    }
  }

  // Salva impostazioni
  async function saveSettingsToStorage() {
    const apiKey = elements.deepseekApiKey.value.trim();
    const languages = ['it']; // Italiano sempre incluso

    if (elements.langEn?.checked) languages.push('en');
    if (elements.langDe?.checked) languages.push('de');
    if (elements.langFr?.checked) languages.push('fr');
    if (elements.langEs?.checked) languages.push('es');

    // Server elaborazione immagini
    const serverUrl = elements.serverUrl?.value.trim() || '';
    const enableProcessing = elements.enableProcessing?.checked || false;

    settings.deepseekApiKey = apiKey;
    settings.languages = languages;
    settings.serverUrl = serverUrl;
    settings.enableProcessing = enableProcessing;

    try {
      await chrome.storage.local.set({
        deepseekApiKey: apiKey,
        languages: languages,
        serverUrl: serverUrl,
        enableProcessing: enableProcessing
      });
      showNotification('Impostazioni salvate!');
      elements.settingsPanel.classList.add('hidden');
    } catch (e) {
      console.error('Errore salvataggio impostazioni:', e);
      showNotification('Errore nel salvataggio');
    }
  }

  // Genera descrizione pulita con DeepSeek API
  async function generateDescriptionWithDeepSeek(rawText, targetLang) {
    if (!settings.deepseekApiKey) {
      console.warn('API key DeepSeek non configurata');
      return null;
    }

    const langNames = {
      'it': 'Italian',
      'en': 'English',
      'de': 'German',
      'fr': 'French',
      'es': 'Spanish'
    };

    const targetLanguage = langNames[targetLang] || targetLang;

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `Sei un copywriter esperto di veicoli. Scrivi una descrizione commerciale persuasiva e accattivante in ${targetLanguage}, integrando TUTTE le specifiche tecniche in modo fluido e naturale nel testo.

TRADUZIONI OBBLIGATORIE DAL TEDESCO:
- Kasten = Furgone
- Maxi-Kasten = Furgone Maxi
- Hochdach-Kasten = Furgone Tetto Alto
- Kastenwagen = Furgone
- LKW = Camion
- PKW = Auto
- Kombi = Station Wagon
- Pritsche = Cassone
- Transporter = Furgone
- Kleinbus = Minibus
- Geländewagen = Fuoristrada
- Limousine = Berlina

FORMATO OUTPUT:
TITOLO: [Marca Modello con termini tedeschi TRADOTTI in ${targetLanguage}]

[Descrizione persuasiva di 3-5 paragrafi con copywriting accattivante. Integra TUTTE le specifiche nel testo in modo naturale e scorrevole.]

VIN: [se presente nei dati]

REGOLE FONDAMENTALI:
- Scrivi SOLO in ${targetLanguage}
- TRADUCI SEMPRE i termini tedeschi usando la tabella sopra (es. "Maxi-Kasten" diventa "Furgone Maxi")
- INTEGRA nel testo TUTTE le specifiche: colore, data immatricolazione, tipo motore, classe Euro, cilindrata (ccm), potenza (kW/CV), numero porte, posti, dotazioni (radio, clima, USB, tempomat, ESP, ecc.), chilometraggio
- NON fare liste puntate - scrivi in modo discorsivo e persuasivo
- NON inventare informazioni non presenti nei dati originali
- NON menzionare danni, difetti, riparazioni, condizioni negative - il veicolo è venduto completamente revisionato
- Presenta il veicolo come pronto all'uso e in ottime condizioni
- Usa un tono professionale ma coinvolgente, che invogli all'acquisto
- Il VIN va sempre indicato alla fine se presente`
            },
            {
              role: 'user',
              content: rawText
            }
          ],
          temperature: 0.4
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (error) {
      console.error(`Errore generazione ${targetLang}:`, error);
      return null;
    }
  }

  // Genera descrizioni in tutte le lingue selezionate
  async function generateMultiLanguageDescriptions(originalDescription, baseFilename) {
    const descriptions = [];

    // Se non c'è API key, salva solo l'originale grezzo
    if (!settings.deepseekApiKey) {
      descriptions.push({
        filename: `${baseFilename}.txt`,
        content: originalDescription
      });
      return descriptions;
    }

    // Genera descrizione per ogni lingua selezionata
    for (const lang of settings.languages) {
      try {
        const generated = await generateDescriptionWithDeepSeek(originalDescription, lang);
        if (generated) {
          descriptions.push({
            filename: `${baseFilename}_${lang}.txt`,
            content: generated
          });
        }
      } catch (e) {
        console.error(`Errore generazione ${lang}:`, e);
      }
    }

    // Se nessuna generazione riuscita, salva l'originale
    if (descriptions.length === 0) {
      descriptions.push({
        filename: `${baseFilename}.txt`,
        content: originalDescription
      });
    }

    return descriptions;
  }

  // Traduce il nome del veicolo in italiano per le cartelle usando DeepSeek API
  async function translateFolderName(originalName) {
    // Se non c'è API key, ritorna l'originale
    if (!settings.deepseekApiKey) {
      console.log(`[Popup] Nessuna API key, uso nome originale: "${originalName}"`);
      return originalName;
    }

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `Sei un traduttore di nomi veicoli dal tedesco all'italiano. DEVI tradurre TUTTI i termini tedeschi in italiano.

TRADUZIONI OBBLIGATORIE:
- Kasten = Furgone
- Maxi-Kasten = Furgone Maxi
- Hochdach-Kasten = Furgone Tetto Alto
- Kastenwagen = Furgone
- LKW, Lkw = Camion
- PKW, Pkw = Auto
- Kombi = Station Wagon
- Pritsche = Cassone
- Kipper = Ribaltabile
- Transporter = Furgone
- Kleinbus = Minibus
- Geländewagen = Fuoristrada
- Sattelzugmaschine = Trattore stradale
- Anhänger = Rimorchio
- Limousine = Berlina
- Hochdach = Tetto Alto
- Maxi = Maxi
- Lang = Lungo

REGOLE:
1. Traduci SEMPRE i termini tedeschi sopra elencati
2. Mantieni marca, modello e motorizzazione (es. VW Caddy 2.0 TDI)
3. Rispondi SOLO con il nome tradotto, niente altro
4. Non aggiungere virgolette o punteggiatura extra

ESEMPI:
- "VW Caddy Maxi-Kasten 2.0 TDI" → "VW Caddy Furgone Maxi 2.0 TDI"
- "VW Caddy Kasten 2.0 TDI" → "VW Caddy Furgone 2.0 TDI"
- "LKW MAN TGX" → "Camion MAN TGX"
- "Renault Master Kastenwagen L2H2" → "Renault Master Furgone L2H2"`
            },
            {
              role: 'user',
              content: originalName
            }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const translated = data.choices?.[0]?.message?.content?.trim();

      if (translated && translated.length > 0) {
        console.log(`[Popup] Tradotto: "${originalName}" -> "${translated}"`);
        return translated;
      }
      return originalName;
    } catch (error) {
      console.error('Errore traduzione nome cartella:', error);
      return originalName;
    }
  }

  // Inizializzazione
  async function init() {
    // Carica impostazioni
    await loadSettings();
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      currentTabId = currentTab.id;

      const isSupportedSite = currentTab.url &&
        (currentTab.url.includes('dorotheum.com') || currentTab.url.includes('tipcars.com'));

      if (!isSupportedSite) {
        showView('notSupported');
        return;
      }

      // Aggiorna il messaggio di loading
      updateLoadingMessage('Scansione pagina in corso...', '');

      // Usa autoScrollAndExtract per caricare tutti i lotti
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'autoScrollAndExtract' });

      pageType = response.pageType;

      if (pageType === 'list' && response.lots && response.lots.length > 0) {
        allLots = response.lots;
        displayLots(allLots);
        showView('lotsContainer');
      } else if (response.images && response.images.length > 0) {
        allImages = response.images;
        lotTitle = response.lotTitle || '';
        displayImages(allImages);
        showView('imagesContainer');
      } else {
        showView('noContent');
      }
    } catch (error) {
      console.error('Errore:', error);
      showView('noContent');
    }
  }

  // Aggiorna messaggio di loading
  function updateLoadingMessage(text, detail) {
    const loadingP = elements.loading.querySelector('p');
    if (loadingP) {
      loadingP.textContent = text;
    }
    // Se c'è un dettaglio, aggiungilo
    let detailEl = elements.loading.querySelector('.loading-detail');
    if (detail) {
      if (!detailEl) {
        detailEl = document.createElement('p');
        detailEl.className = 'loading-detail';
        elements.loading.appendChild(detailEl);
      }
      detailEl.textContent = detail;
    } else if (detailEl) {
      detailEl.remove();
    }
  }

  // Listener per messaggi di progresso dallo scroll e download
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'scrollProgress') {
      if (message.phase === 'loading') {
        updateLoadingMessage(
          `Caricamento pagine...`,
          `Pagina ${message.page}/${message.totalPages} - Trovati ${message.lots} veicoli`
        );
      } else if (message.phase === 'scroll') {
        updateLoadingMessage(
          `Scansione pagina...`,
          `Trovati ${message.lots} veicoli (${Math.round(message.progress || 0)}%)`
        );
      } else {
        updateLoadingMessage(
          `Caricamento veicoli...`,
          `Trovati ${message.lots} veicoli`
        );
      }
    }

    // Gestione progresso download ZIP
    if (message.action === 'downloadProgress') {
      const phaseLabels = {
        'init': 'Preparazione...',
        'download': 'Download immagini',
        'processing': 'Elaborazione immagini',
        'descriptions': 'Aggiunta descrizioni',
        'compressing': 'Compressione ZIP',
        'saving': 'Salvataggio file',
        'complete': 'Completato!',
        'error': 'Errore'
      };

      const label = phaseLabels[message.phase] || message.phase;
      updateProgress(label, message.percent, message.detail);

      // Se completato o errore, nascondi dopo un po'
      if (message.phase === 'complete') {
        setTimeout(() => hideProgress(), 1500);
      } else if (message.phase === 'error') {
        setTimeout(() => hideProgress(), 3000);
      }
    }
  });

  // Mostra una vista
  function showView(viewId) {
    elements.loading.classList.add('hidden');
    elements.notSupported.classList.add('hidden');
    elements.noContent.classList.add('hidden');
    elements.lotsContainer.classList.add('hidden');
    elements.imagesContainer.classList.add('hidden');

    if (elements[viewId]) {
      elements[viewId].classList.remove('hidden');
    }
  }

  // Visualizza i lotti
  function displayLots(lots) {
    elements.lotsGrid.innerHTML = '';
    elements.lotsCount.textContent = `${lots.length} veicoli trovati`;
    filteredIndices = null; // Reset filtro

    lots.forEach((lot, index) => {
      const item = document.createElement('div');
      item.className = 'lot-item';
      item.dataset.index = index;

      const displayNumber = lot.lotNumber || lot.id;
      item.innerHTML = `
        <div class="lot-checkbox"></div>
        <div class="lot-number">${displayNumber}</div>
        ${lot.thumbnail ? `<img src="${lot.thumbnail}" alt="${lot.title}" loading="lazy">` : '<div class="no-image">No img</div>'}
        <div class="lot-info">
          <div class="lot-title">${lot.title}</div>
        </div>
      `;

      item.addEventListener('click', () => toggleLotSelection(index));
      elements.lotsGrid.appendChild(item);
    });

    updateLotsUI();
  }

  // Toggle selezione lotto
  function toggleLotSelection(index) {
    if (selectedLots.has(index)) {
      selectedLots.delete(index);
    } else {
      selectedLots.add(index);
    }
    updateLotsUI();
  }

  // Aggiorna UI lotti
  function updateLotsUI() {
    const items = elements.lotsGrid.querySelectorAll('.lot-item');

    items.forEach((item, index) => {
      const checkbox = item.querySelector('.lot-checkbox');
      if (selectedLots.has(index)) {
        item.classList.add('selected');
        checkbox.textContent = '✓';
      } else {
        item.classList.remove('selected');
        checkbox.textContent = '';
      }
    });

    const count = selectedLots.size;
    elements.downloadSelectedLots.disabled = count === 0;
    elements.downloadSelectedLots.textContent = count > 0
      ? `Scarica ${count} veicol${count === 1 ? 'o' : 'i'}`
      : 'Scarica selezionati';

    // Aggiorna testo "Seleziona tutti" in base al filtro
    const visibleCount = filteredIndices ? filteredIndices.length : allLots.length;
    const allVisibleSelected = filteredIndices
      ? filteredIndices.every(i => selectedLots.has(i))
      : count === allLots.length;

    elements.selectAllLots.textContent = allVisibleSelected && visibleCount > 0
      ? 'Deseleziona tutti'
      : 'Seleziona tutti';
  }

  // Filtra i lotti in base alla query di ricerca
  function filterLots(query) {
    if (!query || query.trim() === '') {
      filteredIndices = null;
      displayLots(allLots);
      elements.searchHint.textContent = 'Usa la ricerca per filtrare. Es: "BMW", "lotto 12", "125-130"';
      return;
    }

    query = query.trim().toLowerCase();
    const results = [];

    // Controlla se è un range di lotti (es. "125-130")
    const rangeMatch = query.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]);
      const end = parseInt(rangeMatch[2]);
      allLots.forEach((lot, index) => {
        if (lot.lotNumber >= start && lot.lotNumber <= end) {
          results.push(index);
        }
      });
    }
    // Controlla se cerca un numero di lotto specifico
    else if (/^(lotto?\s*)?(\d+)$/i.test(query)) {
      const numMatch = query.match(/(\d+)/);
      const lotNum = parseInt(numMatch[1]);
      allLots.forEach((lot, index) => {
        if (lot.lotNumber === lotNum) {
          results.push(index);
        }
      });
    }
    // Ricerca testuale nel titolo
    else {
      allLots.forEach((lot, index) => {
        const searchText = `${lot.title} ${lot.lotNumber || ''}`.toLowerCase();
        if (searchText.includes(query)) {
          results.push(index);
        }
      });
    }

    filteredIndices = results;
    displayFilteredLots(results);

    if (results.length === 0) {
      elements.searchHint.textContent = `Nessun risultato per "${query}"`;
    } else {
      elements.searchHint.textContent = `${results.length} risultat${results.length === 1 ? 'o' : 'i'} per "${query}"`;
    }
  }

  // Mostra solo i lotti filtrati
  function displayFilteredLots(indices) {
    const items = elements.lotsGrid.querySelectorAll('.lot-item');
    items.forEach((item, index) => {
      if (indices.includes(index)) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });

    elements.lotsCount.textContent = `${indices.length} di ${allLots.length} veicoli`;
  }

  // Visualizza le immagini
  function displayImages(images) {
    elements.imagesGrid.innerHTML = '';
    elements.imageCount.textContent = `${images.length} immagini HD trovate`;

    images.forEach((image, index) => {
      const item = document.createElement('div');
      item.className = 'image-item';
      item.dataset.index = index;

      item.innerHTML = `
        <img src="${image.thumbnail}" alt="Immagine ${index + 1}" loading="lazy">
        <div class="checkbox"></div>
        <button class="download-single" title="Scarica questa immagine">
          <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (!e.target.closest('.download-single')) {
          toggleImageSelection(index);
        }
      });

      item.querySelector('.download-single').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadSingleImage(image, index);
      });

      elements.imagesGrid.appendChild(item);
    });

    updateImagesUI();
  }

  // Toggle selezione immagine
  function toggleImageSelection(index) {
    if (selectedImages.has(index)) {
      selectedImages.delete(index);
    } else {
      selectedImages.add(index);
    }
    updateImagesUI();
  }

  // Aggiorna UI immagini
  function updateImagesUI() {
    const items = elements.imagesGrid.querySelectorAll('.image-item');

    items.forEach((item, index) => {
      const checkbox = item.querySelector('.checkbox');
      if (selectedImages.has(index)) {
        item.classList.add('selected');
        checkbox.textContent = '✓';
      } else {
        item.classList.remove('selected');
        checkbox.textContent = '';
      }
    });

    const count = selectedImages.size;
    elements.downloadSelected.disabled = count === 0;

    if (count > 1) {
      elements.downloadSelected.textContent = `Scarica ZIP (${count})`;
    } else if (count === 1) {
      elements.downloadSelected.textContent = 'Scarica selezionata';
    } else {
      elements.downloadSelected.textContent = 'Scarica selezionate';
    }

    elements.selectAll.textContent = count === allImages.length
      ? 'Deseleziona tutte'
      : 'Seleziona tutte';

    if (allImages.length > 1) {
      elements.downloadAll.textContent = `Scarica tutte come ZIP (${allImages.length})`;
    } else {
      elements.downloadAll.textContent = 'Scarica immagine HD';
    }
  }

  // Scarica immagini dei lotti selezionati
  async function downloadSelectedLotsImages() {
    if (selectedLots.size === 0) return;

    const lotsToDownload = Array.from(selectedLots).map(i => allLots[i]);
    const includeDesc = elements.includeDescription.checked;

    showProgress('Recupero immagini dai veicoli selezionati...', 0);

    const allLotImages = [];
    const allDescriptions = [];
    let processed = 0;

    for (const lot of lotsToDownload) {
      updateProgress(
        `Recupero: ${lot.title.substring(0, 40)}...`,
        (processed / lotsToDownload.length) * 100,
        `${processed + 1}/${lotsToDownload.length}`
      );

      try {
        const response = await chrome.tabs.sendMessage(currentTabId, {
          action: 'fetchLotImages',
          lotUrl: lot.url,
          includeDescription: includeDesc
        });

        // Traduci il nome della cartella in italiano
        const translatedTitle = await translateFolderName(lot.title);
        const prefix = sanitizeFilename(translatedTitle);
        // Usa numero lotto + titolo tradotto per garantire cartelle uniche
        const uniqueLotTitle = lot.lotNumber ? `${lot.lotNumber}_${translatedTitle}` : translatedTitle;

        if (response.images && response.images.length > 0) {
          response.images.forEach((img, idx) => {
            allLotImages.push({
              ...img,
              filename: `${prefix}_${idx + 1}.jpg`,
              lotTitle: uniqueLotTitle
            });
          });
        }

        // Salva descrizione se richiesta (con traduzioni se configurate)
        if (includeDesc && response.description) {
          const langDescs = await generateMultiLanguageDescriptions(
            response.description,
            `${prefix}_descrizione`
          );
          langDescs.forEach(desc => {
            allDescriptions.push({
              ...desc,
              lotTitle: uniqueLotTitle
            });
          });
        }
      } catch (error) {
        console.error(`Errore recupero ${lot.title}:`, error);
      }

      processed++;
    }

    hideProgress();

    console.log(`[Popup] Immagini raccolte: ${allLotImages.length}`);
    console.log(`[Popup] Descrizioni raccolte: ${allDescriptions.length}`);

    if (allLotImages.length === 0 && allDescriptions.length === 0) {
      showNotification('Nessun contenuto trovato nei veicoli selezionati');
      return;
    }

    // Genera nome ZIP
    let zipName = 'dorotheum_veicoli';
    if (lotsToDownload.length === 1) {
      zipName = sanitizeFilename(lotsToDownload[0].title);
    } else {
      zipName = `dorotheum_${lotsToDownload.length}_veicoli`;
    }

    // Scarica come ZIP
    showProgress('Creazione ZIP...', 50);

    console.log(`[Popup] Invio ${allLotImages.length} immagini al background...`);
    console.log(`[Popup] Prima immagine:`, JSON.stringify(allLotImages[0]));

    try {
      // Verifica che il background script sia attivo
      console.log('[Popup] Verifica connessione background...');
      try {
        await chrome.runtime.sendMessage({ action: 'ping' });
        console.log('[Popup] Background script attivo');
      } catch (pingError) {
        console.error('[Popup] Background non risponde, ricarica l\'estensione');
        throw new Error('Background script non attivo. Ricarica l\'estensione da chrome://extensions');
      }

      console.log('[Popup] Invio messaggio downloadZip...');
      const result = await chrome.runtime.sendMessage({
        action: 'downloadZip',
        images: allLotImages,
        descriptions: allDescriptions,
        zipName: `${zipName}.zip`,
        serverUrl: settings.enableProcessing ? settings.serverUrl : null,
        enableProcessing: settings.enableProcessing
      });
      console.log(`[Popup] Risposta background:`, JSON.stringify(result));

      if (result && result.success) {
        const descMsg = allDescriptions.length > 0 ? ` e ${allDescriptions.length} descrizioni` : '';
        showNotification(`ZIP creato con ${allLotImages.length} immagini${descMsg}!`);
      } else {
        console.error('[Popup] Background ha risposto con errore:', result?.error);
        showNotification('Errore: ' + (result?.error || 'Risposta non valida dal background'));
      }
    } catch (error) {
      console.error(`[Popup] Errore sendMessage:`, error);
      console.error(`[Popup] Tipo errore:`, typeof error);
      console.error(`[Popup] Errore JSON:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
      showNotification('Errore durante la creazione dello ZIP: ' + (error.message || String(error)));
    }

    hideProgress();
  }

  // Scarica singola immagine
  function downloadSingleImage(image, index) {
    chrome.runtime.sendMessage({
      action: 'download',
      url: image.url,
      filename: image.filename || `dorotheum_image_${index + 1}.jpg`
    });
    showNotification('Download avviato!');
  }

  // Scarica immagini come ZIP (per pagina singolo lotto)
  async function downloadAsZip(images) {
    if (images.length === 0) return;

    const includeDesc = elements.includeDescriptionSingle?.checked ?? false;

    // Se solo 1 immagine e no descrizione, scarica direttamente
    if (images.length === 1 && !includeDesc) {
      downloadSingleImage(images[0], 0);
      return;
    }

    const originalText = elements.downloadAll.textContent;
    elements.downloadAll.disabled = true;
    if (elements.downloadSelected) {
      elements.downloadSelected.disabled = true;
    }

    // Mostra overlay di progresso
    showProgress('Preparazione download...', 0, `0/${images.length} immagini`);

    try {
      // Traduci il titolo del veicolo per il nome ZIP
      updateProgress('Traduzione nome veicolo...', 0, '');
      const translatedTitle = await translateFolderName(lotTitle || 'veicolo');
      const zipName = `${sanitizeFilename(translatedTitle)}.zip`;

      // Se richiesta descrizione, recuperala dalla pagina (con traduzioni se configurate)
      let descriptions = [];
      if (includeDesc) {
        updateProgress('Generazione descrizioni...', 0, 'Traduzione in corso...');
        try {
          const response = await chrome.tabs.sendMessage(currentTabId, {
            action: 'getDescription'
          });
          if (response && response.description) {
            const baseFilename = sanitizeFilename(translatedTitle) + '_descrizione';
            // Genera descrizioni in tutte le lingue selezionate
            descriptions = await generateMultiLanguageDescriptions(
              response.description,
              baseFilename
            );
          }
        } catch (descError) {
          console.error('Errore recupero descrizione:', descError);
        }
      }

      // Avvia il download - il progresso viene aggiornato dai messaggi del background
      await chrome.runtime.sendMessage({
        action: 'downloadZip',
        images: images,
        descriptions: descriptions,
        zipName: zipName,
        singleVehicle: true,  // Indica che è un singolo veicolo, no sottocartelle
        serverUrl: settings.enableProcessing ? settings.serverUrl : null,
        enableProcessing: settings.enableProcessing
      });

      const descMsg = descriptions.length > 0 ? ' e descrizione' : '';
      showNotification(`ZIP creato con ${images.length} immagini${descMsg}!`);
    } catch (error) {
      console.error('Errore download:', error);
      showNotification('Errore durante la creazione dello ZIP');
      hideProgress();
    } finally {
      elements.downloadAll.textContent = originalText;
      elements.downloadAll.disabled = false;
      updateImagesUI();
    }
  }

  // Genera nome per lo ZIP
  function generateZipName() {
    if (lotTitle) {
      return `${sanitizeFilename(lotTitle)}.zip`;
    }
    const date = new Date().toISOString().slice(0, 10);
    return `dorotheum_images_${date}.zip`;
  }

  // Sanitizza nome file
  function sanitizeFilename(name) {
    return name
      .toLowerCase()
      .replace(/^(pkw|lkw|skw|kkw|kfz|nfz)\s+/i, '')  // Rimuovi prefissi tedeschi veicoli
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[ñ]/g, 'n')
      .replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 60);
  }

  // Mostra/nascondi progress
  function showProgress(text, percent, detail = '') {
    elements.progressOverlay.classList.remove('hidden');
    elements.progressText.textContent = text;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressDetail.textContent = detail;
  }

  function updateProgress(text, percent, detail = '') {
    elements.progressText.textContent = text;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressDetail.textContent = detail;
  }

  function hideProgress() {
    elements.progressOverlay.classList.add('hidden');
  }

  // Mostra notifica
  function showNotification(message) {
    let notification = document.querySelector('.notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.className = 'notification';
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.classList.add('show');

    setTimeout(() => notification.classList.remove('show'), 3000);
  }

  // Refresh lista lotti (con auto-scroll)
  async function refreshLotsList() {
    elements.refreshLots.disabled = true;
    elements.refreshLots.textContent = '...';
    showNotification('Scansione pagina...');

    try {
      // Usa autoScrollAndExtract per ricaricare tutti i lotti
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'autoScrollAndExtract' });

      if (response.lots && response.lots.length > 0) {
        // Mantieni le selezioni esistenti per ID
        const previouslySelected = new Set(
          Array.from(selectedLots).map(i => allLots[i]?.id).filter(Boolean)
        );

        allLots = response.lots;
        selectedLots.clear();

        // Ripristina le selezioni
        allLots.forEach((lot, index) => {
          if (previouslySelected.has(lot.id)) {
            selectedLots.add(index);
          }
        });

        displayLots(allLots);
        showNotification(`Trovati ${allLots.length} veicoli`);
      }
    } catch (error) {
      console.error('Errore refresh:', error);
      showNotification('Errore durante l\'aggiornamento');
    } finally {
      elements.refreshLots.disabled = false;
      elements.refreshLots.innerHTML = '&#x21bb;';
    }
  }

  // Event Listeners - Ricerca
  elements.searchInput.addEventListener('input', (e) => {
    filterLots(e.target.value);
  });

  elements.clearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    filterLots('');
    elements.searchInput.focus();
  });

  // Event Listeners - Lotti
  elements.refreshLots.addEventListener('click', () => {
    elements.searchInput.value = '';
    filteredIndices = null;
    refreshLotsList();
  });

  elements.selectAllLots.addEventListener('click', () => {
    // Usa gli indici filtrati se c'è una ricerca attiva
    const indicesToToggle = filteredIndices || allLots.map((_, i) => i);

    // Controlla se tutti i visibili sono selezionati
    const allSelected = indicesToToggle.every(i => selectedLots.has(i));

    if (allSelected) {
      // Deseleziona solo i visibili
      indicesToToggle.forEach(i => selectedLots.delete(i));
    } else {
      // Seleziona tutti i visibili
      indicesToToggle.forEach(i => selectedLots.add(i));
    }
    updateLotsUI();
  });

  elements.downloadSelectedLots.addEventListener('click', () => {
    downloadSelectedLotsImages();
  });

  // Event Listeners - Immagini
  elements.selectAll.addEventListener('click', () => {
    if (selectedImages.size === allImages.length) {
      selectedImages.clear();
    } else {
      allImages.forEach((_, index) => selectedImages.add(index));
    }
    updateImagesUI();
  });

  elements.downloadSelected.addEventListener('click', () => {
    const imagesToDownload = Array.from(selectedImages).map(i => allImages[i]);
    downloadAsZip(imagesToDownload);
  });

  elements.downloadAll.addEventListener('click', () => {
    downloadAsZip(allImages);
  });

  // Event Listeners - Impostazioni
  elements.settingsBtn.addEventListener('click', () => {
    elements.settingsPanel.classList.toggle('hidden');
  });

  elements.closeSettings.addEventListener('click', () => {
    elements.settingsPanel.classList.add('hidden');
  });

  elements.saveSettings.addEventListener('click', () => {
    saveSettingsToStorage();
  });

  // Avvia
  init();

})();
