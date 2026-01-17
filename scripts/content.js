// Content script per Revonet HD Downloader (Chrome) - Dorotheum + Tipcars

(function() {
  'use strict';

  // Rileva il sito corrente
  function detectSite() {
    const url = window.location.hostname;
    if (url.includes('dorotheum.com')) return 'dorotheum';
    if (url.includes('tipcars.com')) return 'tipcars';
    return 'unknown';
  }

  const currentSite = detectSite();

  // ==================== TIPCARS.COM ====================

  // Rileva tipo pagina Tipcars
  function detectTipcarsPageType() {
    const url = window.location.href;
    // Pagina veicolo: contiene un ID numerico alla fine prima di .html
    if (url.match(/-\d+\.html$/)) {
      return 'single';
    }
    // Pagina lista: /marca o /marca/modello senza .html
    return 'list';
  }

  // Estrai lotti dalla pagina lista Tipcars
  function extractTipcarsLots() {
    const lots = [];
    const seenIds = new Set();

    console.log('[Revonet DEBUG] ========== INIZIO ESTRAZIONE TIPCARS ==========');
    console.log('[Revonet DEBUG] URL corrente:', window.location.href);

    // Estrai il termine di ricerca dall'URL per filtrare
    const urlParams = new URLSearchParams(window.location.search);
    const searchText = urlParams.get('text')?.toLowerCase() || '';
    const pathMatch = window.location.pathname.match(/^\/([^\/]+)/);
    const brandFromPath = pathMatch ? pathMatch[1].toLowerCase() : '';
    console.log(`[Revonet DEBUG] Ricerca: "${searchText}", Marca da path: "${brandFromPath}"`);

    // Metodo principale: cerca link con h3 DENTRO (struttura Tipcars: <a><h3>...</h3></a>)
    console.log('[Revonet DEBUG] --- Cercando link veicoli con h3 interno ---');

    // Cerca tutti i link che contengono un h3
    document.querySelectorAll('a[href*=".html"]').forEach((link, index) => {
      const href = link.getAttribute('href');
      if (!href) return;

      // Verifica pattern veicolo
      const idMatch = href.match(/-(\d+)\.html$/);
      if (!idMatch) return;

      const id = idMatch[1];
      if (id.length < 5) return; // ID troppo corto
      if (seenIds.has(id)) return;

      // Verifica se è in una sezione sponsorizzata (da escludere se c'è ricerca)
      const isSponsored = link.closest('[class*="sponsor"], [class*="promo"], [class*="advert"], [class*="banner"], [class*="highlight"], [data-ad], [data-sponsor]');

      // Estrai info dall'href per verificare rilevanza
      const hrefLower = href.toLowerCase();

      // Se c'è un termine di ricerca, filtra i risultati
      if (searchText) {
        const isRelevant = hrefLower.includes(searchText) || hrefLower.includes(brandFromPath);
        if (!isRelevant && isSponsored) {
          console.log(`[Revonet DEBUG] SKIP sponsorizzato: ${href.substring(0, 50)}`);
          return;
        }
        // Se non è rilevante e non corrisponde alla ricerca, skip
        if (!isRelevant && !hrefLower.includes(brandFromPath)) {
          console.log(`[Revonet DEBUG] SKIP non rilevante: ${href.substring(0, 50)}`);
          return;
        }
      }

      seenIds.add(id);

      // Cerca h3 dentro il link per il titolo completo
      let title = '';
      const h3Inside = link.querySelector('h3');
      if (h3Inside) {
        title = h3Inside.textContent.trim();
      }

      // Se non c'è h3 dentro, prova testo del link pulito
      if (!title || title.length < 5) {
        // Prendi solo il testo diretto, non tutto il contenuto
        const textNodes = [];
        link.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node.textContent.trim());
          }
        });
        title = textNodes.join(' ').trim();
      }

      // Fallback: estrai dal href
      if (!title || title.length < 5) {
        const pathParts = href.match(/\/([^\/]+)-\d+\.html$/);
        if (pathParts) {
          title = pathParts[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }

      if (!title || title.length < 3) {
        console.log(`[Revonet DEBUG] SKIP titolo vuoto: ${href.substring(0, 50)}`);
        return;
      }

      // Pulisci titolo da spazi extra
      title = title.replace(/\s+/g, ' ').trim();

      // Cerca thumbnail - prima dentro il link stesso
      let thumbnail = '';
      const imgInside = link.querySelector('img[src*="tipcars"], img[src*="fotky"]');
      if (imgInside) {
        thumbnail = imgInside.src || imgInside.dataset?.src || '';
      }

      // Se non trovata, cerca nel container padre
      if (!thumbnail) {
        // Risali fino a trovare un container con immagine
        let parent = link.parentElement;
        for (let i = 0; i < 5 && parent && !thumbnail; i++) {
          const img = parent.querySelector(`img[src*="${id}"], img[src*="fotky"]`);
          if (img) {
            thumbnail = img.src || img.dataset?.src || '';
          }
          parent = parent.parentElement;
        }
      }

      // Ultimo tentativo: cerca immagine con ID nel src
      if (!thumbnail) {
        const imgWithId = document.querySelector(`img[src*="${id}"]`);
        if (imgWithId) {
          thumbnail = imgWithId.src || '';
        }
      }

      const fullUrl = href.startsWith('http') ? href : `https://www.tipcars.com${href}`;

      console.log(`[Revonet DEBUG] AGGIUNTO: ID=${id}, title="${title.substring(0, 40)}", thumb=${thumbnail ? 'SI' : 'NO'}`);
      lots.push({
        id: id,
        lotNumber: parseInt(id),
        title: title,
        url: fullUrl,
        thumbnail: thumbnail
      });
    });

    console.log(`[Revonet DEBUG] ========== FINE ESTRAZIONE: ${lots.length} veicoli ==========`);

    return lots;
  }

  // Estrai immagini HD dalla pagina veicolo Tipcars
  function extractTipcarsImages() {
    const images = [];
    const seenUrls = new Set();

    // Metodo 1: Cerca nel JSON-LD
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        if (data.image) {
          const imgArray = Array.isArray(data.image) ? data.image : [data.image];
          imgArray.forEach(img => {
            const url = typeof img === 'string' ? img : img.url;
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              // Converti a risoluzione massima
              const hdUrl = url.replace(/fotky_\w+/, 'fotky_zdrojove');
              images.push({
                url: hdUrl,
                thumbnail: url
              });
            }
          });
        }
      } catch (e) {}
    });

    // Metodo 2: Cerca nelle immagini della galleria
    if (images.length === 0) {
      document.querySelectorAll('img[src*="tipcars.com"]').forEach(img => {
        const src = img.src || img.dataset.src;
        if (!src || seenUrls.has(src)) return;
        if (src.includes('fotky_')) {
          seenUrls.add(src);
          const hdUrl = src.replace(/fotky_\w+/, 'fotky_zdrojove');
          images.push({
            url: hdUrl,
            thumbnail: src
          });
        }
      });
    }

    // Metodo 3: Cerca nei link
    document.querySelectorAll('a[href*="fotky_"]').forEach(a => {
      const href = a.href;
      if (!href || seenUrls.has(href)) return;
      seenUrls.add(href);
      const hdUrl = href.replace(/fotky_\w+/, 'fotky_zdrojove');
      images.push({
        url: hdUrl,
        thumbnail: href
      });
    });

    console.log(`[Revonet] Tipcars: estratte ${images.length} immagini HD`);
    return images;
  }

  // Estrai titolo veicolo Tipcars
  function extractTipcarsTitle() {
    const h1 = document.querySelector('h1');
    if (h1) return h1.textContent.trim();

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) return ogTitle.content;

    return '';
  }

  // Estrai descrizione Tipcars - versione completa
  function extractTipcarsDescription() {
    const parts = [];
    const seenTexts = new Set();

    console.log('[Revonet DEBUG] Estrazione descrizione Tipcars...');

    // Etichette da escludere (rivelano provenienza geografica)
    const excludedLabels = [
      'stk',           // Revisione ceca
      'záruka',        // Garanzia in ceco
      'garancia',      // Garanzia in slovacco/ungherese
      'technická kontrola',
      'emisní kontrola',
      'evidenční kontrola',
      'spz',           // Targa ceca
      'rz',            // Targa slovacca
      'tp',            // Libretto ceco
      'osvedčení',
      'prověřit',      // Verifica
      'historie vozidla', // Storia veicolo (link ceco)
      'zobrazit histori'  // Mostra storia
    ];

    // Funzione per verificare se un'etichetta è da escludere
    const isExcludedLabel = (label) => {
      const lowerLabel = label.toLowerCase();
      return excludedLabels.some(excl => lowerLabel.includes(excl));
    };

    // Helper per evitare duplicati
    const addUnique = (text) => {
      const cleaned = text.trim().replace(/\s+/g, ' ');
      if (cleaned.length < 3) return false;
      const key = cleaned.toLowerCase().substring(0, 100);
      if (seenTexts.has(key)) return false;
      seenTexts.add(key);
      return true;
    };

    // 1. Titolo
    const title = extractTipcarsTitle();
    if (title) {
      parts.push('=== TITOLO ===');
      parts.push(title);
      parts.push('');
    }

    // 2. Prezzo
    const priceEl = document.querySelector('[class*="price"], [class*="cena"], .price');
    if (priceEl) {
      const priceText = priceEl.textContent.trim().replace(/\s+/g, ' ');
      if (priceText && addUnique(priceText)) {
        parts.push('=== PREZZO ===');
        parts.push(priceText);
        parts.push('');
      }
    }

    // 3. Informazioni base (VIN, km, data, etc.)
    parts.push('=== INFORMAZIONI BASE ===');

    console.log('[Revonet DEBUG] === INIZIO RICERCA VIN ===');

    // Ricerca VIN - Metodo 1: JSON-LD (productID)
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    console.log(`[Revonet DEBUG] Trovati ${jsonLdScripts.length} script JSON-LD`);
    jsonLdScripts.forEach((script, idx) => {
      try {
        const data = JSON.parse(script.textContent);
        console.log(`[Revonet DEBUG] JSON-LD ${idx}: productID=${data.productID}, type=${data['@type']}`);
        const productId = data.productID || data.sku || data.vehicleIdentificationNumber;
        if (productId && productId.length === 17 && /^[A-Z0-9]+$/i.test(productId)) {
          if (addUnique(`VIN: ${productId}`)) {
            parts.push(`VIN: ${productId}`);
            console.log(`[Revonet DEBUG] VIN da JSON-LD: ${productId}`);
          }
        }
      } catch (e) {
        console.log(`[Revonet DEBUG] Errore parsing JSON-LD ${idx}:`, e.message);
      }
    });

    // Ricerca VIN - Metodo 2: Cerca nell'intero HTML della pagina
    const pageHTML = document.documentElement.innerHTML;
    const htmlVinMatch = pageHTML.match(/VIN[:\s]*([A-Z0-9]{17})/i);
    if (htmlVinMatch) {
      console.log(`[Revonet DEBUG] VIN trovato in HTML raw: ${htmlVinMatch[1]}`);
      if (addUnique(`VIN: ${htmlVinMatch[1]}`)) {
        parts.push(`VIN: ${htmlVinMatch[1]}`);
      }
    }

    // Ricerca VIN - Metodo 3: Cerca productID nell'HTML (anche non parsato)
    const productIdMatch = pageHTML.match(/"productID"\s*:\s*"([A-Z0-9]{17})"/i);
    if (productIdMatch) {
      console.log(`[Revonet DEBUG] productID trovato in HTML: ${productIdMatch[1]}`);
      if (addUnique(`VIN: ${productIdMatch[1]}`)) {
        parts.push(`VIN: ${productIdMatch[1]}`);
      }
    }

    // Ricerca VIN - Metodo 4: Elementi dt che contengono "VIN:"
    document.querySelectorAll('dt').forEach(dt => {
      const text = dt.textContent.trim();
      const vinMatch = text.match(/VIN[:\s]*([A-Z0-9]{17})/i);
      if (vinMatch && addUnique(`VIN: ${vinMatch[1]}`)) {
        parts.push(`VIN: ${vinMatch[1]}`);
        console.log(`[Revonet DEBUG] VIN da dt: ${vinMatch[1]}`);
      }
    });

    // Ricerca VIN - Metodo 5: Qualsiasi elemento con testo VIN (incluso strong)
    document.querySelectorAll('span, div, p, td, th, strong, b, em, a').forEach(el => {
      const text = el.textContent.trim();
      if (text.length < 100 && text.toUpperCase().includes('VIN')) {
        const vinMatch = text.match(/VIN[:\s]*([A-Z0-9]{17})/i);
        if (vinMatch && addUnique(`VIN: ${vinMatch[1]}`)) {
          parts.push(`VIN: ${vinMatch[1]}`);
          console.log(`[Revonet DEBUG] VIN da ${el.tagName}: ${vinMatch[1]}`);
        }
      }
    });

    console.log('[Revonet DEBUG] === FINE RICERCA VIN ===');

    // Cerca tutte le coppie chiave-valore nella pagina
    // Metodo 1: Definition lists (dl > dt/dd)
    document.querySelectorAll('dl').forEach(dl => {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
        const label = dts[i].textContent.trim().replace(/:$/, '');
        const value = dds[i].textContent.trim();
        if (label && value && !isExcludedLabel(label) && addUnique(`${label}: ${value}`)) {
          parts.push(`${label}: ${value}`);
          console.log(`[Revonet DEBUG] DL: ${label}: ${value.substring(0, 30)}`);
        }
      }
    });

    // Metodo 2: Tabelle
    document.querySelectorAll('table').forEach(table => {
      table.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim().replace(/:$/, '');
          const value = cells[1].textContent.trim();
          if (label && value && label.length < 50 && !isExcludedLabel(label) && addUnique(`${label}: ${value}`)) {
            parts.push(`${label}: ${value}`);
          }
        }
      });
    });

    // Metodo 3: Elementi con classe che contiene "param", "spec", "info", "detail"
    document.querySelectorAll('[class*="param"], [class*="spec"], [class*="info"], [class*="detail"]').forEach(el => {
      // Cerca coppie label/value dentro l'elemento
      const labels = el.querySelectorAll('[class*="label"], [class*="name"], [class*="key"], dt, th');
      const values = el.querySelectorAll('[class*="value"], [class*="data"], dd, td');

      if (labels.length > 0 && values.length > 0) {
        for (let i = 0; i < Math.min(labels.length, values.length); i++) {
          const label = labels[i].textContent.trim().replace(/:$/, '');
          const value = values[i].textContent.trim();
          if (label && value && !isExcludedLabel(label) && addUnique(`${label}: ${value}`)) {
            parts.push(`${label}: ${value}`);
          }
        }
      } else {
        // Prova a estrarre il testo diretto se è una coppia chiave:valore
        const text = el.textContent.trim();
        const colonMatch = text.match(/^([^:]+):\s*(.+)$/);
        if (colonMatch && !isExcludedLabel(colonMatch[1]) && addUnique(text)) {
          parts.push(text);
        }
      }
    });

    parts.push('');

    // 4. Equipaggiamento/Features - cerca sezioni con liste
    parts.push('=== EQUIPAGGIAMENTO ===');

    // Cerca tutte le sezioni con intestazione + lista
    document.querySelectorAll('h2, h3, h4, [class*="heading"], [class*="title"]').forEach(heading => {
      const headingText = heading.textContent.trim();
      // Salta intestazioni non rilevanti
      if (headingText.length < 3 || headingText.length > 50) return;
      if (/cookie|privacy|similar|doporuč/i.test(headingText)) return;

      // Cerca lista successiva (ul, ol) o div con elementi
      let list = heading.nextElementSibling;
      for (let i = 0; i < 3 && list; i++) {
        if (list.tagName === 'UL' || list.tagName === 'OL') {
          const items = [];
          list.querySelectorAll('li').forEach(li => {
            const itemText = li.textContent.trim();
            if (itemText && itemText.length < 100 && addUnique(itemText)) {
              items.push(`  - ${itemText}`);
            }
          });
          if (items.length > 0) {
            parts.push(`\n${headingText}:`);
            parts.push(...items);
          }
          break;
        }
        list = list.nextElementSibling;
      }
    });

    // Cerca anche liste senza intestazione esplicita
    document.querySelectorAll('ul[class*="equip"], ul[class*="feature"], ul[class*="option"], [class*="equipment"] ul, [class*="feature"] ul').forEach(ul => {
      const items = [];
      ul.querySelectorAll('li').forEach(li => {
        const itemText = li.textContent.trim();
        if (itemText && itemText.length < 100 && addUnique(itemText)) {
          items.push(`  - ${itemText}`);
        }
      });
      if (items.length > 0) {
        parts.push(...items);
      }
    });

    const result = parts.join('\n');
    console.log(`[Revonet DEBUG] Descrizione estratta: ${result.length} caratteri`);

    return result;
  }

  // Carica pagina Tipcars in iframe ed estrai immagini e descrizione completa
  async function fetchTipcarsLotImages(lotUrl) {
    console.log(`[Revonet] Caricamento pagina Tipcars: ${lotUrl}`);

    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

      const timeout = setTimeout(() => {
        console.warn('[Revonet] Timeout caricamento iframe Tipcars');
        iframe.remove();
        resolve({ images: [], description: '' });
      }, 15000);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            const doc = iframe.contentDocument;
            const images = [];
            const seenUrls = new Set();

            // Estrai dal JSON-LD
            doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
              try {
                const data = JSON.parse(script.textContent);
                if (data.image) {
                  const imgArray = Array.isArray(data.image) ? data.image : [data.image];
                  imgArray.forEach(img => {
                    const url = typeof img === 'string' ? img : img.url;
                    if (url && !seenUrls.has(url)) {
                      seenUrls.add(url);
                      const hdUrl = url.replace(/fotky_\w+/, 'fotky_zdrojove');
                      images.push({ url: hdUrl, thumbnail: url });
                    }
                  });
                }
              } catch (e) {}
            });

            // Fallback: cerca img
            if (images.length === 0) {
              doc.querySelectorAll('img[src*="tipcars.com"]').forEach(img => {
                const src = img.src || img.dataset.src;
                if (!src || seenUrls.has(src)) return;
                if (src.includes('fotky_')) {
                  seenUrls.add(src);
                  const hdUrl = src.replace(/fotky_\w+/, 'fotky_zdrojove');
                  images.push({ url: hdUrl, thumbnail: src });
                }
              });
            }

            // Estrai descrizione completa dal documento iframe
            const description = extractTipcarsDescriptionFromDoc(doc, lotUrl);

            console.log(`[Revonet] Estratte ${images.length} immagini e ${description.length} caratteri descrizione da ${lotUrl}`);

            clearTimeout(timeout);
            iframe.remove();
            resolve({ images, description });
          } catch (e) {
            console.error('[Revonet] Errore estrazione Tipcars:', e);
            clearTimeout(timeout);
            iframe.remove();
            resolve({ images: [], description: '' });
          }
        }, 2000);
      };

      iframe.src = lotUrl;
      document.body.appendChild(iframe);
    });
  }

  // Estrai descrizione completa da un documento Tipcars (iframe o corrente)
  function extractTipcarsDescriptionFromDoc(doc, sourceUrl) {
    const parts = [];
    const seenTexts = new Set();

    // Etichette da escludere (rivelano provenienza geografica)
    const excludedLabels = [
      'stk', 'záruka', 'garancia', 'technická kontrola',
      'emisní kontrola', 'evidenční kontrola', 'spz', 'rz', 'tp',
      'osvedčení', 'prověřit', 'historie vozidla', 'zobrazit histori'
    ];

    const isExcludedLabel = (label) => {
      const lowerLabel = label.toLowerCase();
      return excludedLabels.some(excl => lowerLabel.includes(excl));
    };

    // Helper per evitare duplicati
    const addUnique = (text) => {
      const cleaned = text.trim().replace(/\s+/g, ' ');
      if (cleaned.length < 3) return false;
      const key = cleaned.toLowerCase().substring(0, 100);
      if (seenTexts.has(key)) return false;
      seenTexts.add(key);
      return true;
    };

    // 1. Titolo
    const h1 = doc.querySelector('h1');
    if (h1) {
      parts.push('=== TITOLO ===');
      parts.push(h1.textContent.trim());
      parts.push('');
    }

    // 2. Prezzo
    const priceEl = doc.querySelector('[class*="price"], [class*="cena"], .price');
    if (priceEl) {
      const priceText = priceEl.textContent.trim().replace(/\s+/g, ' ');
      if (priceText && addUnique(priceText)) {
        parts.push('=== PREZZO ===');
        parts.push(priceText);
        parts.push('');
      }
    }

    // 3. Informazioni base
    parts.push('=== INFORMAZIONI BASE ===');

    console.log('[Revonet DEBUG] Ricerca VIN in iframe...');

    // Ricerca VIN - Metodo 1: JSON-LD (productID)
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        console.log(`[Revonet DEBUG] JSON-LD iframe: productID=${data.productID}`);
        const productId = data.productID || data.sku || data.vehicleIdentificationNumber;
        if (productId && productId.length === 17 && /^[A-Z0-9]+$/i.test(productId)) {
          if (addUnique(`VIN: ${productId}`)) {
            parts.push(`VIN: ${productId}`);
            console.log(`[Revonet DEBUG] VIN da JSON-LD iframe: ${productId}`);
          }
        }
      } catch (e) {}
    });

    // Ricerca VIN - Metodo 2: Cerca nell'intero HTML della pagina iframe
    try {
      const pageHTML = doc.documentElement.innerHTML;
      const htmlVinMatch = pageHTML.match(/VIN[:\s]*([A-Z0-9]{17})/i);
      if (htmlVinMatch) {
        console.log(`[Revonet DEBUG] VIN trovato in HTML iframe: ${htmlVinMatch[1]}`);
        if (addUnique(`VIN: ${htmlVinMatch[1]}`)) {
          parts.push(`VIN: ${htmlVinMatch[1]}`);
        }
      }

      // Ricerca VIN - Metodo 3: Cerca productID nell'HTML
      const productIdMatch = pageHTML.match(/"productID"\s*:\s*"([A-Z0-9]{17})"/i);
      if (productIdMatch) {
        console.log(`[Revonet DEBUG] productID trovato in HTML iframe: ${productIdMatch[1]}`);
        if (addUnique(`VIN: ${productIdMatch[1]}`)) {
          parts.push(`VIN: ${productIdMatch[1]}`);
        }
      }
    } catch (e) {
      console.log('[Revonet DEBUG] Errore ricerca HTML iframe:', e.message);
    }

    // Ricerca VIN - Metodo 4: Elementi dt che contengono "VIN:"
    doc.querySelectorAll('dt').forEach(dt => {
      const text = dt.textContent.trim();
      const vinMatch = text.match(/VIN[:\s]+([A-Z0-9]{17})/i);
      if (vinMatch && addUnique(`VIN: ${vinMatch[1]}`)) {
        parts.push(`VIN: ${vinMatch[1]}`);
        console.log(`[Revonet DEBUG] VIN da dt iframe: ${vinMatch[1]}`);
      }
    });

    // Ricerca VIN - Metodo 5: Qualsiasi elemento con testo VIN (incluso strong)
    doc.querySelectorAll('span, div, p, td, th, strong, b, em, a').forEach(el => {
      const text = el.textContent.trim();
      if (text.length < 100 && text.toUpperCase().includes('VIN')) {
        const vinMatch = text.match(/VIN[:\s]*([A-Z0-9]{17})/i);
        if (vinMatch && addUnique(`VIN: ${vinMatch[1]}`)) {
          parts.push(`VIN: ${vinMatch[1]}`);
          console.log(`[Revonet DEBUG] VIN da ${el.tagName} iframe: ${vinMatch[1]}`);
        }
      }
    });

    console.log('[Revonet DEBUG] Fine ricerca VIN in iframe');

    // Definition lists
    doc.querySelectorAll('dl').forEach(dl => {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
        const label = dts[i].textContent.trim().replace(/:$/, '');
        const value = dds[i].textContent.trim();
        if (label && value && !isExcludedLabel(label) && addUnique(`${label}: ${value}`)) {
          parts.push(`${label}: ${value}`);
        }
      }
    });

    // Tabelle
    doc.querySelectorAll('table').forEach(table => {
      table.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim().replace(/:$/, '');
          const value = cells[1].textContent.trim();
          if (label && value && label.length < 50 && !isExcludedLabel(label) && addUnique(`${label}: ${value}`)) {
            parts.push(`${label}: ${value}`);
          }
        }
      });
    });

    // Elementi con classi specifiche
    doc.querySelectorAll('[class*="param"], [class*="spec"], [class*="info"], [class*="detail"]').forEach(el => {
      const labels = el.querySelectorAll('[class*="label"], [class*="name"], [class*="key"], dt, th');
      const values = el.querySelectorAll('[class*="value"], [class*="data"], dd, td');

      if (labels.length > 0 && values.length > 0) {
        for (let i = 0; i < Math.min(labels.length, values.length); i++) {
          const label = labels[i].textContent.trim().replace(/:$/, '');
          const value = values[i].textContent.trim();
          if (label && value && !isExcludedLabel(label) && addUnique(`${label}: ${value}`)) {
            parts.push(`${label}: ${value}`);
          }
        }
      }
    });

    parts.push('');

    // 4. Equipaggiamento
    parts.push('=== EQUIPAGGIAMENTO ===');

    doc.querySelectorAll('h2, h3, h4, [class*="heading"], [class*="title"]').forEach(heading => {
      const headingText = heading.textContent.trim();
      if (headingText.length < 3 || headingText.length > 50) return;
      if (/cookie|privacy|similar|doporuč/i.test(headingText)) return;

      let list = heading.nextElementSibling;
      for (let i = 0; i < 3 && list; i++) {
        if (list.tagName === 'UL' || list.tagName === 'OL') {
          const items = [];
          list.querySelectorAll('li').forEach(li => {
            const itemText = li.textContent.trim();
            if (itemText && itemText.length < 100 && addUnique(itemText)) {
              items.push(`  - ${itemText}`);
            }
          });
          if (items.length > 0) {
            parts.push(`\n${headingText}:`);
            parts.push(...items);
          }
          break;
        }
        list = list.nextElementSibling;
      }
    });

    // Liste equipaggiamento
    doc.querySelectorAll('ul[class*="equip"], ul[class*="feature"], ul[class*="option"], [class*="equipment"] ul').forEach(ul => {
      const items = [];
      ul.querySelectorAll('li').forEach(li => {
        const itemText = li.textContent.trim();
        if (itemText && itemText.length < 100 && addUnique(itemText)) {
          items.push(`  - ${itemText}`);
        }
      });
      if (items.length > 0) {
        parts.push(...items);
      }
    });

    return parts.join('\n');
  }

  // ==================== DOROTHEUM.COM ====================

  // Funzione per convertire URL thumbnail in HD (Dorotheum)
  function convertToHD(url) {
    if (!url) return null;

    let hdUrl = url;
    hdUrl = hdUrl.replace(/\/\d+x\d+\//g, '/hires/');

    if (hdUrl.includes('/hires/') && hdUrl.endsWith('.webp')) {
      hdUrl = hdUrl.replace(/\.webp$/, '.jpg');
    }

    hdUrl = hdUrl.replace(/\/thumb(s|nail)?\//gi, '/hires/');
    hdUrl = hdUrl.replace(/\/preview\//gi, '/hires/');
    hdUrl = hdUrl.replace(/\/(small|medium|large)\//gi, '/hires/');

    return hdUrl;
  }

  // Rileva il tipo di pagina
  function detectPageType() {
    const url = window.location.href;

    if (url.match(/\/l\/\d+\/?/)) {
      return 'single';
    }

    if (url.match(/\/a\/\d+/) || document.querySelectorAll('a[href*="/l/"]').length > 1) {
      return 'list';
    }

    return 'single';
  }

  // Trova tutte le pagine della paginazione
  async function findAllPaginationPages() {
    const currentUrl = window.location.href.split('?')[0].split('#')[0];
    const auctionMatch = currentUrl.match(/\/a\/(\d+)/);

    if (!auctionMatch) {
      console.log('[Dorotheum HD] Non siamo su una pagina di asta');
      return [];
    }

    // Conta i lotti sulla pagina corrente per stimare items per pagina
    const currentLots = document.querySelectorAll('a[href*="/l/"]').length;
    const lotsPerPage = Math.max(currentLots, 50); // Almeno 50 per pagina
    console.log(`[Dorotheum HD] Lotti visibili sulla pagina: ${currentLots}`);

    // Cerca il numero totale di lotti nel testo della pagina
    let totalLots = 0;
    const bodyText = document.body.innerText;

    // Pattern per trovare il totale: "444 lotti", "444 Lots", "1-50 di 444", etc.
    const patterns = [
      /(\d+)\s*(?:lotti|lots|veicoli|oggetti|items)/i,
      /\d+\s*[-–]\s*\d+\s*(?:di|of|su)\s*(\d+)/i,
      /(?:totale|total|risultati|results)[\s:]*(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (num > totalLots && num < 10000) { // Limite ragionevole
          totalLots = num;
          console.log(`[Dorotheum HD] Trovato totale lotti: ${totalLots} (pattern: ${pattern})`);
        }
      }
    }

    // Se non troviamo il totale, prova a cercare nell'HTML
    if (totalLots === 0) {
      // Cerca in elementi specifici
      const countSelectors = [
        '[class*="count"]',
        '[class*="total"]',
        '[class*="result"]',
        '[class*="found"]',
        '.auction-lots-count',
        '.lots-count'
      ];

      for (const sel of countSelectors) {
        document.querySelectorAll(sel).forEach(el => {
          const nums = el.textContent.match(/\d+/g);
          if (nums) {
            nums.forEach(n => {
              const num = parseInt(n);
              if (num > totalLots && num > 100 && num < 10000) {
                totalLots = num;
                console.log(`[Dorotheum HD] Trovato totale in ${sel}: ${totalLots}`);
              }
            });
          }
        });
      }
    }

    // Se ancora non troviamo il totale, usa un valore alto e testa le pagine
    if (totalLots === 0) {
      console.log('[Dorotheum HD] Totale non trovato, provo fino a 20 pagine...');
      totalLots = lotsPerPage * 20; // Prova fino a 20 pagine
    }

    const estimatedPages = Math.ceil(totalLots / lotsPerPage);
    console.log(`[Dorotheum HD] Pagine stimate: ${estimatedPages} (${totalLots} lotti / ${lotsPerPage} per pagina)`);

    // Genera tutte le possibili URL di paginazione
    const pages = [];

    // Pagina 1 è la corrente
    pages.push({ url: currentUrl, pageNum: 1 });

    // Genera URL per le altre pagine - prova diversi pattern
    for (let p = 2; p <= estimatedPages; p++) {
      // Dorotheum usa TYPO3, prova il pattern TYPO3
      pages.push({
        url: `${currentUrl}?tx_dthauction_catalog%5Bpage%5D=${p}`,
        pageNum: p,
        patterns: [
          `${currentUrl}?tx_dthauction_catalog%5Bpage%5D=${p}`,
          `${currentUrl}?page=${p}`,
          `${currentUrl}?cHash=&tx_dthauction_catalog%5Bpage%5D=${p}`
        ]
      });
    }

    console.log(`[Dorotheum HD] Pagine da provare: ${pages.length}`);
    return pages;
  }

  // Estrae i lotti da un documento HTML - usa i link come base
  function extractLotsFromDocument(doc, baseUrl) {
    const lots = [];
    const seen = new Set();

    // Trova tutti i link ai lotti
    const allLinks = doc.querySelectorAll('a[href*="/l/"]');
    console.log(`[Dorotheum HD] Trovati ${allLinks.length} link a lotti`);

    allLinks.forEach(link => {
      const match = link.href.match(/\/l\/(\d+)/);
      if (!match) return;

      const id = match[1];
      if (seen.has(id)) return;
      seen.add(id);

      // Trova il container del lotto risalendo il DOM
      let container = link.closest('.link-card') || link.closest('[class*="lot-"]') ||
                      link.closest('[class*="card"]') || link.closest('li');

      if (!container) {
        container = link.parentElement;
        for (let i = 0; i < 4 && container && container.tagName !== 'BODY'; i++) {
          if (container.querySelector('img')) break;
          container = container.parentElement;
        }
      }

      const lotData = extractLotDataFromElement(container || link.parentElement, link, id, baseUrl);
      if (lotData) {
        lots.push(lotData);
      }
    });

    console.log(`[Dorotheum HD] Estratti ${lots.length} lotti unici`);
    return lots;
  }

  // Estrae dati lotto da un elemento contenitore
  function extractLotDataFromElement(element, link, id, baseUrl) {
    // Cerca il numero del lotto
    let lotNumber = null;
    const text = element.textContent || '';

    const patterns = [
      /lotto?\s*(?:no\.?)?\s*(\d+)/i,
      /lot\s*(?:no\.?)?\s*(\d+)/i,
      /nr\.?\s*(\d+)/i,
      /^(\d+)\s*[-–]/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        lotNumber = parseInt(match[1]);
        break;
      }
    }

    // Cerca titolo
    let title = '';
    const titleEls = element.querySelectorAll('h1, h2, h3, h4, h5, [class*="title"], [class*="name"]');
    for (const el of titleEls) {
      let t = el.textContent?.trim() || '';
      t = t.replace(/Osservato.*$/i, '').replace(/watched.*$/i, '').trim();
      t = t.replace(/^Lotto\s*(?:No\.?)?\s*\d+\s*V?\s*/i, '').trim();
      if (t.length > 3 && t.length < 200 && !t.includes('Osservato')) {
        title = t;
        break;
      }
    }

    if (!title) {
      // Prova il testo del link
      let linkText = link.textContent?.trim() || '';
      linkText = linkText.replace(/Osservato.*$/i, '').replace(/^Lotto\s*(?:No\.?)?\s*\d+\s*V?\s*/i, '').trim();
      if (linkText.length > 3) title = linkText;
    }

    if (!title) {
      const img = element.querySelector('img');
      if (img?.alt) title = img.alt.replace(/Osservato.*$/i, '').trim();
    }

    if (!title || title.length < 3) title = `Lotto ${lotNumber || id}`;

    // Cerca thumbnail
    let thumbnail = '';
    const imgs = element.querySelectorAll('img');
    for (const img of imgs) {
      const srcs = [
        img.src,
        img.getAttribute('data-src'),
        img.getAttribute('data-lazy-src'),
        img.getAttribute('data-original'),
        img.getAttribute('srcset')?.split(' ')[0]
      ];

      for (const src of srcs) {
        if (src && src.length > 20 && !src.includes('placeholder') && !src.includes('data:image') && !src.includes('spacer')) {
          thumbnail = src;
          break;
        }
      }
      if (thumbnail) break;
    }

    // Cerca immagine di sfondo
    if (!thumbnail) {
      element.querySelectorAll('[style*="background"]').forEach(el => {
        const style = el.getAttribute('style') || '';
        const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
        if (match && match[1].length > 20) {
          thumbnail = match[1];
        }
      });
    }

    if (thumbnail && thumbnail.startsWith('/')) thumbnail = baseUrl + thumbnail;

    return {
      id,
      lotNumber,
      title: cleanTitle(title),
      url: link.href,
      thumbnail
    };
  }


  // Carica tutti i lotti dalla pagina usando scroll completo
  async function loadAllLots(onProgress) {
    const allLots = new Map();
    const baseUrl = window.location.origin;

    console.log(`[Dorotheum HD] Avvio scansione completa della pagina...`);

    if (onProgress) {
      onProgress({ phase: 'scroll', lots: 0, progress: 0 });
    }

    // Scroll completo della pagina, estraendo lotti durante lo scroll
    await autoScrollWithExtraction(allLots, baseUrl, onProgress);

    // Converti Map in array e ordina per numero lotto
    const lotsArray = [...allLots.values()];
    lotsArray.sort((a, b) => {
      const aNum = a.lotNumber || 99999;
      const bNum = b.lotNumber || 99999;
      return aNum - bNum;
    });

    console.log('[Dorotheum HD] Totale lotti trovati:', lotsArray.length);

    // Debug: mostra i primi 5 lotti
    console.log('[Dorotheum HD] Primi 5 lotti:');
    lotsArray.slice(0, 5).forEach((lot, i) => {
      console.log(`  ${i+1}. lotNumber=${lot.lotNumber}, id=${lot.id}, thumb=${lot.thumbnail ? 'SI' : 'NO'}, title=${lot.title.substring(0,30)}`);
    });

    return lotsArray;
  }

  // Scroll con estrazione continua dei lotti
  async function autoScrollWithExtraction(allLots, baseUrl, onProgress) {
    const scrollStep = 300;
    const scrollDelay = 100;
    const maxScrolls = 3000;
    let scrollCount = 0;

    const originalScrollPos = window.scrollY;

    // Funzione per estrarre e salvare i lotti visibili
    const extractAndSave = () => {
      const lots = extractLotsFromDocument(document, baseUrl);
      lots.forEach(lot => {
        const existing = allLots.get(lot.id);
        if (!existing) {
          allLots.set(lot.id, lot);
        } else {
          // Aggiorna dati mancanti
          if (!existing.thumbnail && lot.thumbnail) {
            allLots.set(lot.id, { ...existing, thumbnail: lot.thumbnail });
          }
          if (!existing.lotNumber && lot.lotNumber) {
            allLots.set(lot.id, { ...existing, lotNumber: lot.lotNumber });
          }
        }
      });
      return allLots.size;
    };

    // Vai all'inizio
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 500));

    extractAndSave();
    console.log(`[Dorotheum HD] Inizio scroll, lotti iniziali: ${allLots.size}`);

    let sameHeightCount = 0;
    let lastReportedCount = 0;

    while (scrollCount < maxScrolls) {
      window.scrollBy(0, scrollStep);
      scrollCount++;

      // Estrai ogni 5 scroll
      if (scrollCount % 5 === 0) {
        extractAndSave();
        await new Promise(r => setTimeout(r, scrollDelay));
        window.dispatchEvent(new Event('scroll'));
      }

      // Report progress ogni 50 scroll
      if (scrollCount % 50 === 0) {
        const currentCount = allLots.size;
        const progress = Math.min((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100, 100);

        if (currentCount !== lastReportedCount) {
          console.log(`[Dorotheum HD] Scroll ${scrollCount}: ${currentCount} lotti, ${progress.toFixed(0)}%`);
          lastReportedCount = currentCount;
        }

        if (onProgress) {
          onProgress({ phase: 'scroll', lots: currentCount, progress });
        }
      }

      // Controlla fine pagina
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
      if (atBottom) {
        await new Promise(r => setTimeout(r, 400));
        const newHeight = document.body.scrollHeight;

        if (window.innerHeight + window.scrollY >= newHeight - 50) {
          sameHeightCount++;
          if (sameHeightCount >= 3) {
            // Estrazione finale
            extractAndSave();
            console.log(`[Dorotheum HD] Fine pagina raggiunta: ${allLots.size} lotti`);
            break;
          }
        } else {
          sameHeightCount = 0;
        }
      }
    }

    console.log(`[Dorotheum HD] Scroll completato dopo ${scrollCount} passi: ${allLots.size} lotti totali`);
    window.scrollTo(0, originalScrollPos);
  }

  // Trova i link di paginazione per una specifica asta
  function findAuctionPaginationLinks(auctionId) {
    const links = [];
    const seen = new Set();

    // Debug: cerca tutti i possibili elementi di paginazione
    const pagContainers = document.querySelectorAll('[class*="pag"], [class*="page"], nav, .pagination, [class*="nav"]');
    console.log(`[Dorotheum HD] Contenitori paginazione trovati: ${pagContainers.length}`);
    pagContainers.forEach(c => {
      const pageLinks = c.querySelectorAll('a');
      if (pageLinks.length > 0) {
        console.log(`[Dorotheum HD] Container pag: ${c.className}, links: ${pageLinks.length}`);
      }
    });

    document.querySelectorAll('a').forEach(link => {
      const href = link.href;
      if (!href) return;

      // Cerca parametri di paginazione (senza richiedere ID asta)
      const typo3Match = href.match(/tx_dthauction_catalog%5Bpage%5D=(\d+)/i);
      const pageMatch = href.match(/[?&]page=(\d+)/);

      if (typo3Match || pageMatch) {
        const pageNum = parseInt(typo3Match?.[1] || pageMatch?.[1]);
        // Verifica che sia della stessa asta se possibile
        const isValidAuction = !auctionId || href.includes(`/a/${auctionId}`) || href.includes(`auction`);

        if (pageNum > 1 && !seen.has(pageNum) && isValidAuction) {
          seen.add(pageNum);
          links.push({ url: href, page: pageNum });
          console.log(`[Dorotheum HD] Pagina ${pageNum} trovata: ${href.substring(0, 80)}...`);
        }
      }
    });

    // Se non ci sono link, cerca numeri cliccabili
    if (links.length === 0) {
      document.querySelectorAll('a, button, [role="button"]').forEach(el => {
        const text = el.textContent?.trim();
        if (/^\d+$/.test(text)) {
          const num = parseInt(text);
          const parent = el.closest('[class*="pag"], [class*="page"], nav');
          if (parent && num > 1 && num < 20) {
            console.log(`[Dorotheum HD] Possibile pulsante pagina: ${num} in ${parent.className}`);
          }
        }
      });
    }

    // Ordina per numero pagina e restituisci solo gli URL
    links.sort((a, b) => a.page - b.page);
    return links.map(l => l.url);
  }

  // Trova il numero dell'ultima pagina dalla paginazione
  function findLastPageNumber() {
    let maxPage = 1;
    let paginationUrls = [];

    // Cerca tutti i link nella pagina
    document.querySelectorAll('a').forEach(link => {
      const href = link.href || '';

      // Cerca parametri page= nell'URL
      const pageMatch = href.match(/[?&]page=(\d+)/);
      if (pageMatch) {
        const pageNum = parseInt(pageMatch[1]);
        maxPage = Math.max(maxPage, pageNum);
        paginationUrls.push({ url: href, page: pageNum, type: 'page=' });
      }

      // Cerca tx_dthauction_catalog[page] (TYPO3)
      const typo3Match = href.match(/tx_dthauction_catalog%5Bpage%5D=(\d+)/i);
      if (typo3Match) {
        const pageNum = parseInt(typo3Match[1]);
        maxPage = Math.max(maxPage, pageNum);
        paginationUrls.push({ url: href, page: pageNum, type: 'typo3' });
      }

      // Cerca /page/N/ nell'URL
      const pagePathMatch = href.match(/\/page\/(\d+)/);
      if (pagePathMatch) {
        const pageNum = parseInt(pagePathMatch[1]);
        maxPage = Math.max(maxPage, pageNum);
        paginationUrls.push({ url: href, page: pageNum, type: '/page/' });
      }

      // Cerca numeri nel testo dei link di paginazione
      const text = link.textContent.trim();
      if (/^\d+$/.test(text)) {
        const parent = link.closest('[class*="pag"], [class*="page"], nav, .pagination, ul, .list-view');
        if (parent || href.includes('/a/')) {
          const num = parseInt(text);
          if (num > 0 && num < 500) {
            maxPage = Math.max(maxPage, num);
          }
        }
      }
    });

    // Cerca anche testo tipo "Pagina X di Y", "1 - 50 di 444", etc.
    const pagePatterns = [
      /(?:pagina|page|pag\.?)\s*\d+\s*(?:di|of|\/)\s*(\d+)/i,
      /\d+\s*[-–]\s*\d+\s*(?:di|of|su)\s*(\d+)/i,
      /(\d+)\s*(?:lotti|lots|items|oggetti|veicoli)/i
    ];

    pagePatterns.forEach(pattern => {
      const match = document.body.innerText.match(pattern);
      if (match) {
        const total = parseInt(match[1]);
        // Calcola pagine necessarie (assumendo ~50 items per pagina)
        if (total > 50) {
          const estimatedPages = Math.ceil(total / 50);
          maxPage = Math.max(maxPage, estimatedPages);
          console.log(`[Dorotheum HD] Trovato totale ${total}, stimo ${estimatedPages} pagine`);
        }
      }
    });

    // Cerca elementi con info sulla paginazione
    document.querySelectorAll('[class*="pag"], [class*="page"], [class*="result"]').forEach(el => {
      const text = el.textContent;
      // Pattern "X - Y di Z"
      const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:di|of|su)\s*(\d+)/);
      if (rangeMatch) {
        const total = parseInt(rangeMatch[3]);
        const perPage = parseInt(rangeMatch[2]) - parseInt(rangeMatch[1]) + 1;
        if (perPage > 0) {
          const pages = Math.ceil(total / perPage);
          maxPage = Math.max(maxPage, pages);
          console.log(`[Dorotheum HD] Paginazione: ${rangeMatch[1]}-${rangeMatch[2]} di ${total}, pagine stimate: ${pages}`);
        }
      }
    });

    console.log('[Dorotheum HD] URL paginazione trovati:', paginationUrls);
    console.log('[Dorotheum HD] Pagina massima rilevata:', maxPage);

    return maxPage;
  }

  // Auto-scroll per lazy loading - scorre TUTTA la pagina per caricare tutti i lotti
  async function autoScrollPage(onProgress) {
    return new Promise(async (resolve) => {
      const scrollStep = 300; // Scroll più piccoli per non saltare elementi
      const scrollDelay = 150; // Veloce ma permette il caricamento
      const maxScrolls = 2000; // Abbastanza per 444+ lotti
      let scrollCount = 0;

      // Raccoglie TUTTI i lotti trovati durante lo scroll
      const allFoundLots = new Map();

      const originalScrollPos = window.scrollY;

      // Estrae e accumula i lotti visibili
      const extractVisibleLots = () => {
        document.querySelectorAll('a[href*="/l/"]').forEach(a => {
          const match = a.href.match(/\/l\/(\d+)/);
          if (match && !allFoundLots.has(match[1])) {
            allFoundLots.set(match[1], true);
          }
        });
        return allFoundLots.size;
      };

      // Vai all'inizio della pagina
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 500));

      extractVisibleLots();
      console.log(`[Dorotheum HD] Inizio scroll dalla cima, lotti iniziali: ${allFoundLots.size}`);

      let lastHeight = 0;
      let sameHeightCount = 0;

      while (scrollCount < maxScrolls) {
        // Scroll piccolo
        window.scrollBy(0, scrollStep);
        scrollCount++;

        // Estrai lotti visibili
        const currentCount = extractVisibleLots();

        // Aspetta un po' per il lazy loading
        if (scrollCount % 3 === 0) {
          await new Promise(r => setTimeout(r, scrollDelay));
        }

        // Triggera eventi scroll
        if (scrollCount % 5 === 0) {
          window.dispatchEvent(new Event('scroll'));
          document.dispatchEvent(new Event('scroll'));
        }

        // Report progress ogni 20 scroll
        if (scrollCount % 20 === 0) {
          const progress = Math.min((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100, 100);
          console.log(`[Dorotheum HD] Scroll ${scrollCount}: ${currentCount} lotti trovati, ${progress.toFixed(0)}%`);

          if (onProgress) {
            onProgress({
              scrolls: scrollCount,
              lots: currentCount,
              progress: progress
            });
          }
        }

        // Controlla se siamo veramente alla fine
        const currentHeight = document.body.scrollHeight;
        const atBottom = window.innerHeight + window.scrollY >= currentHeight - 50;

        if (atBottom) {
          // Aspetta per eventuali caricamenti
          await new Promise(r => setTimeout(r, 300));

          // Controlla se l'altezza è cambiata (nuovi contenuti caricati)
          if (document.body.scrollHeight === currentHeight) {
            sameHeightCount++;
            if (sameHeightCount >= 5) {
              // Veramente alla fine
              console.log(`[Dorotheum HD] Fine pagina confermata dopo ${scrollCount} scroll`);
              break;
            }
          } else {
            sameHeightCount = 0;
          }
        }
      }

      // Estrazione finale
      const finalCount = extractVisibleLots();
      console.log(`[Dorotheum HD] Scroll completato: ${finalCount} lotti unici trovati`);

      // Torna alla posizione originale
      window.scrollTo(0, originalScrollPos);
      resolve(finalCount);
    });
  }

  // Pulisce il titolo
  function cleanTitle(title) {
    return title
      .replace(/\s+/g, ' ')
      .replace(/^\d+\s*[-–]\s*/, '')
      .trim()
      .substring(0, 150);
  }

  // Estrae immagini HD dalla pagina corrente
  function extractHDImages() {
    const images = [];
    const seen = new Set();
    const baseUrl = window.location.origin;

    const imgSelectors = [
      'img[src*="lot-images"]',
      'img[src*="fileadmin"]',
      'img[data-src*="lot-images"]',
      '[class*="gallery"] img',
      '[class*="slider"] img',
      '[class*="carousel"] img'
    ];

    imgSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(img => {
        let src = img.src || img.getAttribute('data-src');
        if (!src) return;
        if (src.startsWith('/')) src = baseUrl + src;
        if (src.includes('placeholder') || src.includes('icon') || src.includes('logo')) return;

        const hdUrl = convertToHD(src);
        if (hdUrl && !seen.has(hdUrl)) {
          seen.add(hdUrl);
          images.push({
            url: hdUrl,
            thumbnail: src,
            filename: extractFilename(hdUrl)
          });
        }
      });
    });

    return images;
  }

  // Recupera immagini HD e descrizione da un URL specifico di lotto usando iframe
  async function fetchLotImages(lotUrl, includeDescription = false) {
    try {
      console.log(`[Dorotheum HD] Caricamento pagina veicolo: ${lotUrl}`);

      // Usa iframe per caricare la pagina con JavaScript
      const result = await loadPageInIframe(lotUrl);

      if (!result.success) {
        console.error(`[Dorotheum HD] Errore caricamento iframe: ${result.error}`);
        return { images: [], description: null };
      }

      console.log(`[Dorotheum HD] Estratte ${result.images.length} immagini HD da ${lotUrl}`);

      return {
        images: result.images,
        description: includeDescription ? result.description : null
      };
    } catch (error) {
      console.error('Errore fetch lotto:', error);
      return { images: [], description: null };
    }
  }

  // Carica una pagina in un iframe nascosto ed estrae le immagini
  function loadPageInIframe(url) {
    return new Promise((resolve) => {
      // Crea iframe nascosto
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      iframe.sandbox = 'allow-same-origin allow-scripts';

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log(`[Dorotheum HD] Timeout iframe per ${url}`);
          cleanup();
          resolve({ success: false, error: 'timeout', images: [], description: null });
        }
      }, 15000); // 15 secondi timeout

      const cleanup = () => {
        try {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        } catch (e) {}
      };

      iframe.onload = () => {
        // Aspetta che le immagini vengano caricate via JS
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);

          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

            // Estrai immagini HD dal documento dell'iframe
            const images = extractHDImagesFromDocument(iframeDoc);

            // Estrai descrizione
            const description = extractLotDescription(iframeDoc);

            cleanup();
            resolve({ success: true, images, description });
          } catch (e) {
            console.error(`[Dorotheum HD] Errore accesso iframe:`, e);
            cleanup();
            resolve({ success: false, error: e.message, images: [], description: null });
          }
        }, 3000); // Aspetta 3 secondi per caricamento immagini JS
      };

      iframe.onerror = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        resolve({ success: false, error: 'load error', images: [], description: null });
      };

      iframe.src = url;
      document.body.appendChild(iframe);
    });
  }

  // Estrae immagini HD da un documento (iframe o corrente)
  function extractHDImagesFromDocument(doc) {
    const images = [];
    const seen = new Set();

    // Cerca tutte le immagini con pattern lot-images o fileadmin
    doc.querySelectorAll('img[src*="lot-images"], img[src*="fileadmin"], img[data-src*="lot-images"], img[data-src*="fileadmin"]').forEach(img => {
      let src = img.src || img.getAttribute('data-src') || img.dataset.src;

      if (!src || src.includes('placeholder') || src.includes('icon') ||
          src.includes('logo') || src.includes('flag')) return;

      const hdUrl = convertToHD(src);
      if (hdUrl && !seen.has(hdUrl)) {
        seen.add(hdUrl);
        images.push({
          url: hdUrl,
          thumbnail: src,
          filename: extractFilename(hdUrl)
        });
      }
    });

    // Cerca anche link a immagini HD
    doc.querySelectorAll('a[href*="hires"], a[href*="lot-images"]').forEach(link => {
      const href = link.href;
      if (href && !seen.has(href) &&
          (href.includes('.jpg') || href.includes('.jpeg') || href.includes('.png'))) {
        const hdUrl = convertToHD(href);
        if (hdUrl && !seen.has(hdUrl)) {
          seen.add(hdUrl);
          images.push({
            url: hdUrl,
            thumbnail: href,
            filename: extractFilename(hdUrl)
          });
        }
      }
    });

    // Cerca in elementi gallery/slider
    doc.querySelectorAll('[class*="gallery"] img, [class*="slider"] img, [class*="carousel"] img').forEach(img => {
      let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy');
      if (!src || seen.has(src)) return;

      if (src.includes('lot-images') || src.includes('fileadmin') || src.includes('dorotheum')) {
        const hdUrl = convertToHD(src);
        if (hdUrl && !seen.has(hdUrl)) {
          seen.add(hdUrl);
          images.push({
            url: hdUrl,
            thumbnail: src,
            filename: extractFilename(hdUrl)
          });
        }
      }
    });

    return images;
  }

  // Estrae la descrizione completa del lotto dalla pagina
  function extractLotDescription(doc) {
    const parts = [];
    const seenTexts = new Set();

    // Funzione per aggiungere testo senza duplicati
    const addUnique = (text) => {
      const cleaned = text.trim();
      if (cleaned.length < 3) return false;
      const normalized = cleaned.toLowerCase().substring(0, 80);
      if (!seenTexts.has(normalized)) {
        seenTexts.add(normalized);
        return true;
      }
      return false;
    };

    // Titolo del lotto
    const title = doc.querySelector('h1');
    if (title) {
      const titleText = cleanDescriptionText(title.textContent);
      if (titleText.length > 3) {
        parts.push('=== TITOLO ===');
        parts.push(titleText);
        seenTexts.add(titleText.toLowerCase().substring(0, 80));
        parts.push('');
      }
    }

    parts.push('=== DESCRIZIONE ===');

    // Cerca la descrizione del veicolo - testo descrittivo lungo
    // Dorotheum mette la descrizione in vari contenitori
    const descContainers = doc.querySelectorAll(
      '[class*="lot-description"], [class*="description"], ' +
      '[class*="lot-text"], [class*="detail"], article, ' +
      '.lot-info, [class*="product-info"]'
    );

    let descriptionFound = false;
    descContainers.forEach(container => {
      if (descriptionFound) return;

      // Salta se contiene cookie/privacy
      if (isCookieOrPrivacyElement(container)) return;

      // Cerca paragrafi con testo descrittivo
      const paragraphs = container.querySelectorAll('p');
      paragraphs.forEach(p => {
        const text = cleanDescriptionText(p.textContent);
        // Solo testo descrittivo (non troppo corto, non cookie/UI)
        if (text.length > 30 && !isUnwantedText(text) && addUnique(text)) {
          parts.push(text);
          descriptionFound = true;
        }
      });

      // Se non ci sono paragrafi, prova il testo diretto
      if (!descriptionFound) {
        const directText = cleanDescriptionText(container.textContent);
        if (directText.length > 50 && directText.length < 2000 &&
            !isUnwantedText(directText) && addUnique(directText)) {
          parts.push(directText);
          descriptionFound = true;
        }
      }
    });

    // Cerca specifiche tecniche del veicolo (tabella con dati tecnici)
    parts.push('');
    parts.push('=== SPECIFICHE ===');

    // Etichette valide per specifiche veicolo
    const validSpecLabels = [
      'marca', 'modello', 'anno', 'km', 'chilometri', 'colore', 'carburante',
      'cilindrata', 'potenza', 'cv', 'kw', 'cambio', 'trazione', 'porte',
      'posti', 'carrozzeria', 'telaio', 'motore', 'prezzo', 'stima', 'base',
      'realizz', 'partenza', 'lotto', 'data', 'luogo', 'asta', 'tipo',
      'esposizione', 'immatricolazione', 'targa', 'stato', 'condizione'
    ];

    // Cerca nelle tabelle solo quelle con dati del veicolo/asta
    const tables = doc.querySelectorAll('table');
    tables.forEach(table => {
      // Salta tabelle cookie
      if (isCookieOrPrivacyElement(table)) return;

      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim().replace(/:+$/, '');
          const value = cells[1].textContent.trim();

          // Verifica che sia una specifica valida
          if (isValidSpecLabel(label, validSpecLabels) && value && !isUnwantedText(value)) {
            const line = `${label}: ${value.replace(/\s+/g, ' ')}`;
            if (addUnique(line)) {
              parts.push(line);
            }
          }
        }
      });
    });

    // Cerca anche nelle liste di definizioni
    const defLists = doc.querySelectorAll('dl');
    defLists.forEach(dl => {
      if (isCookieOrPrivacyElement(dl)) return;

      const items = dl.querySelectorAll('dt, dd');
      for (let i = 0; i < items.length - 1; i++) {
        if (items[i].tagName === 'DT' && items[i + 1].tagName === 'DD') {
          const label = items[i].textContent.trim().replace(/:+$/, '');
          const value = items[i + 1].textContent.trim();

          if (isValidSpecLabel(label, validSpecLabels) && value && !isUnwantedText(value)) {
            const line = `${label}: ${value.replace(/\s+/g, ' ')}`;
            if (addUnique(line)) {
              parts.push(line);
            }
          }
        }
      }
    });

    // URL della pagina
    parts.push('');
    parts.push('=== FONTE ===');
    parts.push(doc.URL || window.location.href);

    return parts.join('\n');
  }

  // Controlla se un'etichetta è valida per le specifiche del veicolo
  function isValidSpecLabel(label, validLabels) {
    const lowerLabel = label.toLowerCase();
    // Escludi etichette cookie/tracking
    if (/cookie|consent|session|token|website|vimeo|facebook|google|hotjar|doubleclick/i.test(label)) {
      return false;
    }
    // Verifica se contiene almeno una delle etichette valide
    return validLabels.some(valid => lowerLabel.includes(valid));
  }

  // Controlla se l'elemento è relativo a cookie/privacy
  function isCookieOrPrivacyElement(element) {
    const text = element.textContent.toLowerCase();
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    // Controlla classe e id
    if (/cookie|consent|privacy|gdpr|tracking/i.test(className + id)) {
      return true;
    }

    // Controlla se contiene molti riferimenti a cookie/tracking
    const cookieKeywords = ['cookie', 'consent', 'vimeo', 'facebook', 'google tag',
                           'hotjar', 'doubleclick', 'analytics', '_ga', '_fb'];
    let cookieCount = 0;
    cookieKeywords.forEach(kw => {
      if (text.includes(kw)) cookieCount++;
    });

    return cookieCount >= 3;
  }

  // Controlla se il testo è contenuto UI da escludere
  function isUnwantedText(text) {
    const unwantedPatterns = [
      /^(login|accedi|registrati|password)/i,
      /siamo spiacenti/i,
      /effettuare il login/i,
      /inserisci.*email/i,
      /^\s*V\s*$/,
      /cookie/i,
      /consent/i,
      /privacy policy/i,
      /vimeo|facebook|google|hotjar|doubleclick/i,
      /^nome:\s*(fornitore|website)/i,
      /session.*token/i
    ];

    return unwantedPatterns.some(pattern => pattern.test(text));
  }

  // Pulisce il testo della descrizione
  function cleanDescriptionText(text) {
    return text
      .replace(/\s+/g, ' ')      // Normalizza spazi
      .replace(/\s*V\s*$/i, '')  // Rimuovi V finale
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  // Estrae la descrizione dalla pagina corrente (per pagina singolo lotto)
  function extractCurrentPageDescription() {
    return extractLotDescription(document);
  }

  function extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/');
      return parts[parts.length - 1] || 'image.jpg';
    } catch (e) {
      return 'image.jpg';
    }
  }

  function extractLotTitle() {
    const selectors = ['h1', '.lot-title', '.product-title', 'meta[property="og:title"]'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        let title = el.tagName === 'META' ? el.getAttribute('content') : el.textContent;
        title = cleanTitle(title || '');
        if (title.length > 3) return title.replace(/\s*-\s*Dorotheum.*$/i, '');
      }
    }
    const match = window.location.pathname.match(/\/l\/(\d+)/);
    return match ? `Lotto_${match[1]}` : 'dorotheum_images';
  }

  // Ascolta messaggi dal popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === 'autoScrollAndExtract') {
      // Gestione basata sul sito
      if (currentSite === 'tipcars') {
        const pageType = detectTipcarsPageType();

        if (pageType === 'list') {
          const lots = extractTipcarsLots();
          sendResponse({
            pageType: 'list',
            lots: lots,
            images: [],
            lotTitle: ''
          });
        } else {
          const images = extractTipcarsImages();
          const lotTitle = extractTipcarsTitle();
          sendResponse({
            pageType: 'single',
            lots: [],
            images: images,
            lotTitle: lotTitle
          });
        }
        return true;
      }

      // Dorotheum (comportamento originale)
      const pageType = detectPageType();

      if (pageType === 'list') {
        loadAllLots((progress) => {
          chrome.runtime.sendMessage({
            action: 'scrollProgress',
            ...progress
          }).catch(() => {});
        }).then(lots => {
          sendResponse({
            pageType: 'list',
            lots: lots,
            images: [],
            lotTitle: ''
          });
        });
      } else {
        const images = extractHDImages();
        const lotTitle = extractLotTitle();
        sendResponse({
          pageType: 'single',
          lots: [],
          images: images,
          lotTitle: lotTitle
        });
      }

      return true;
    }

    if (message.action === 'getPageInfo') {
      if (currentSite === 'tipcars') {
        const pageType = detectTipcarsPageType();
        const lots = pageType === 'list' ? extractTipcarsLots() : [];
        const images = pageType === 'single' ? extractTipcarsImages() : [];
        sendResponse({ pageType, lots, images, lotTitle: pageType === 'single' ? extractTipcarsTitle() : '' });
      } else {
        const pageType = detectPageType();
        const lots = pageType === 'list' ? extractLotsFromDocument(document, window.location.origin) : [];
        const images = pageType === 'single' ? extractHDImages() : [];
        sendResponse({ pageType, lots, images, lotTitle: pageType === 'single' ? extractLotTitle() : '' });
      }
    }

    if (message.action === 'getImages') {
      if (currentSite === 'tipcars') {
        sendResponse({ images: extractTipcarsImages(), lotTitle: extractTipcarsTitle() });
      } else {
        sendResponse({ images: extractHDImages(), lotTitle: extractLotTitle() });
      }
    }

    if (message.action === 'fetchLotImages') {
      if (currentSite === 'tipcars' || message.lotUrl.includes('tipcars.com')) {
        fetchTipcarsLotImages(message.lotUrl).then(result => {
          sendResponse({
            images: result.images,
            description: result.description
          });
        });
      } else {
        fetchLotImages(message.lotUrl, message.includeDescription).then(result => {
          sendResponse({
            images: result.images,
            description: result.description
          });
        });
      }
      return true;
    }

    if (message.action === 'getDescription') {
      console.log('[Revonet DEBUG] getDescription chiamato, sito:', currentSite);
      if (currentSite === 'tipcars') {
        console.log('[Revonet DEBUG] Chiamando extractTipcarsDescription()...');
        const desc = extractTipcarsDescription();
        console.log('[Revonet DEBUG] Descrizione estratta, lunghezza:', desc.length);
        sendResponse({ description: desc });
      } else {
        const description = extractCurrentPageDescription();
        sendResponse({ description });
      }
    }

    return true;
  });

  // Debug
  window.revonetExtractLots = () => {
    if (currentSite === 'tipcars') return extractTipcarsLots();
    return extractLotsFromDocument(document, window.location.origin);
  };
  window.revonetExtractImages = () => {
    if (currentSite === 'tipcars') return extractTipcarsImages();
    return extractHDImages();
  };

  // Log iniziale
  console.log(`[Revonet] Content script caricato su: ${window.location.href}`);
  console.log(`[Revonet] Sito rilevato: ${currentSite}`);
  if (currentSite === 'tipcars') {
    console.log(`[Revonet] Tipo pagina Tipcars: ${detectTipcarsPageType()}`);
  } else if (currentSite === 'dorotheum') {
    console.log(`[Revonet] Tipo pagina Dorotheum: ${detectPageType()}`);
  }

})();
