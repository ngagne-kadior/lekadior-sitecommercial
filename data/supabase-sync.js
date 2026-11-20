/* =====================================================================
   LE KADIOR — SYNCHRONISATION SUPABASE → SITE
   ---------------------------------------------------------------------
   Chargé APRÈS data/catalog.js et data/supabase-config.js, AVANT script.js.

   Fonctionnement (aucun changement d'affichage, aucune attente réseau) :
   1. Si une copie Supabase valide est en cache (localStorage), elle remplace
      les données de catalog.js AVANT le rendu de script.js.
   2. En arrière-plan, les données fraîches sont récupérées depuis Supabase
      puis mises en cache pour le prochain chargement de page. Elles sont en
      plus appliquées immédiatement à la page ouverte :
      - paramètres du site (site_settings) : événement « kadior:settings »
        (voir applySettings dans script.js) ;
      - catégories et produits, seulement s'ils ont changé : événement
        « kadior:products » (voir refreshCatalogViews dans script.js) ;
      - événements (table events), seulement s'ils ont changé : événement
        « kadior:events » (voir renderEventViews dans script.js) ;
      - promotions et galerie, demandées seulement par les pages qui les
        affichent (#promoGrid, #galleryGrid), seulement si elles ont changé :
        « kadior:promotions » et « kadior:gallery ». Pas de secours local.
      Une nouvelle synchronisation a lieu quand on revient sur l'onglet.
   3. Supabase non configuré, indisponible, ou données invalides :
      le site garde data/catalog.js et les valeurs de script.js (fallback).
   ===================================================================== */

(function () {
  const CACHE_KEY = "kadior-supabase-cache-v1";
  const TIMEOUT_MS = 6000;
  const REVISIT_MS = 5000;
  const cfg = window.KADIOR_SUPABASE || {};
  const url = String(cfg.url || "").replace(/\/+$/, "");
  const key = String(cfg.anonKey || "");

  if (!url || !key) return; // non configuré → fallback local

  // Sécurité : refuser toute clé secrète dans le frontend
  function isSecretKey(k) {
    if (k.startsWith("sb_secret_")) return true;
    try {
      const payload = JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.role === "service_role";
    } catch (e) { return false; }
  }
  if (isSecretKey(key)) {
    console.error("Supabase : clé service_role/secrète détectée dans le site — synchronisation désactivée. Utilisez la clé anon/publishable.");
    return;
  }

  /* ---------- Conversion lignes Supabase → format du site (catalog.js) ---------- */

  const mapCategory = r => ({
    id: r.id, name: r.name, label: r.label || r.name, description: r.description || "",
    image: r.image, imageFocus: r.image_focus || null, href: r.href || null, order: r.sort_order
  });

  const mapProduct = r => {
    const reviewCount = Number(r.review_count) > 0 ? Number(r.review_count) : 0;
    const rating = r.rating === null || r.rating === undefined ? null : Number(r.rating);
    return {
      id: r.id, name: r.name, category: r.category && r.category.name,
      description: r.description || "", price: r.price === undefined ? null : r.price,
      priceLabel: r.price_label || null, currency: r.currency || "FCFA",
      available: r.available !== false, image: r.image, imageFocus: r.image_focus || null,
      // pas de note sans vrais avis
      rating: reviewCount > 0 && rating >= 0 && rating <= 5 ? rating : null,
      reviewCount, featured: r.featured === true
    };
  };

  const mapEvent = r => ({
    key: r.key, name: r.name, label: r.label || r.name, image: r.image,
    title: r.title || r.name, desc: r.description || ""
  });

  const num = v => v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

  // Promotions : la RLS ne renvoie déjà que les promotions actives et dans leur période
  const mapPromotion = r => ({
    id: r.id, title: r.title, description: r.description || "",
    productId: r.product_id || null, categoryId: r.category_id || null,
    oldPrice: num(r.old_price), newPrice: num(r.new_price),
    discountPercent: num(r.discount_percent), discountAmount: num(r.discount_amount),
    startDate: r.start_date || null, endDate: r.end_date || null,
    image: r.image || null, order: num(r.sort_order) ?? 0
  });

  // Galerie : la RLS ne renvoie que les photos actives, et les réalisations clients
  // uniquement avec le consentement du client
  const mapGalleryItem = r => ({
    id: r.id, title: r.title || "", alt: r.alt || "", description: r.description || "",
    image: r.image, theme: r.theme || null, featured: r.featured === true, order: num(r.sort_order) ?? 0
  });

  // Chaque élément est validé séparément ; un élément invalide est ignoré seul
  const cleanList = (list, ok) => list.filter(ok);
  const isValidPromotion = p => !!p && !!p.id && typeof p.title === "string" && !!p.title.trim();
  const isValidGalleryItem = g => !!g && !!g.id && typeof g.image === "string" && !!g.image.trim();

  /* ---------- Validation : ne jamais remplacer le catalogue par des données incomplètes ---------- */

  const isPrice = v => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

  function isValid(data) {
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.products)) return false;
    if (!data.categories.length || !data.products.length) return false;
    const names = new Set(data.categories.map(c => c.name));
    if (names.size !== data.categories.length) return false;          // noms de catégorie en double
    if (new Set(data.products.map(p => p.id)).size !== data.products.length) return false;
    const catsOk = data.categories.every(c => c.id && c.name && typeof c.order === "number");
    const prodsOk = data.products.every(p => p.id && p.name && names.has(p.category) &&
      isPrice(p.price) && (typeof p.price === "number" || p.priceLabel));
    return catsOk && prodsOk;
  }

  // Événements : chaque événement est validé séparément. Un événement incomplet est
  // ignoré seul ; une liste vide (tous masqués dans l'admin) est une réponse valide.
  // L'image est facultative : sans image, la page affiche « Photo à venir ».
  const isCompleteEvent = e => !!e && typeof e.key === "string" && /^[a-z0-9-]+$/i.test(e.key) &&
    !!e.name && !!e.label && !!e.title && !!e.desc;

  function cleanEvents(list, warn) {
    const seen = new Set();
    return list.filter(e => {
      const ok = isCompleteEvent(e) && !seen.has(e.key);
      if (!ok && warn) console.warn("Supabase : événement incomplet ou en double ignoré :", (e && e.key) || e);
      if (ok) seen.add(e.key);
      return ok;
    });
  }

  /* ---------- 1. Appliquer le cache avant le rendu ---------- */

  function replaceArray(target, items) {
    if (Array.isArray(target)) target.splice(0, target.length, ...items);
  }

  let cachedEvents = null;   // derniers événements Supabase connus (cache)
  let cachedPromotions = null;
  let cachedGallery = null;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && cached.source === url && isValid(cached)) {
      replaceArray(KADIOR_CATEGORIES, cached.categories);
      replaceArray(KADIOR_PRODUCTS, cached.products);
      // eventsSource marque les caches où la liste d'événements vient bien de Supabase
      if (cached.eventsSource === "supabase" && Array.isArray(cached.events)) {
        cachedEvents = cleanEvents(cached.events, false);
        window.KADIOR_EVENTS = cachedEvents;
      }
      if (cached.settings && typeof cached.settings === "object" && !Array.isArray(cached.settings)) window.KADIOR_SETTINGS = cached.settings;
      // Promotions / galerie : dernier état Supabase connu (script.js refiltre les dates)
      if (cached.promotionsSource === "supabase" && Array.isArray(cached.promotions)) {
        cachedPromotions = cleanList(cached.promotions, isValidPromotion);
        window.KADIOR_PROMOTIONS = cachedPromotions;
      }
      if (cached.gallerySource === "supabase" && Array.isArray(cached.gallery)) {
        cachedGallery = cleanList(cached.gallery, isValidGalleryItem);
        window.KADIOR_GALLERY = cachedGallery;
      }
    }
  } catch (e) { /* cache illisible → fallback local */ }

  // Pas d'événements en cache : script.js attend la réponse de Supabase (« kadior:events »)
  // avant d'afficher la liste, et n'utilise son secours local qu'en cas d'échec
  // (« kadior:events-unavailable »)
  if (!Array.isArray(window.KADIOR_EVENTS)) window.KADIOR_EVENTS_PENDING = true;

  /* ---------- 2. Récupération en arrière-plan ---------- */

  function get(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: ctrl.signal
    }).then(res => {
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${path.split("?")[0]} : HTTP ${res.status}`);
      return res.json();
    });
  }

  // Empreinte du catalogue : on ne redessine la page que si les données ont changé
  const signature = (cats, prods) => JSON.stringify([cats, prods]);

  let busy = false;   // une seule synchronisation à la fois
  let lastRun = 0;

  // Promotions et galerie : demandées seulement par les pages qui les affichent
  // (undefined = non demandé, null = requête en échec, [] = réponse valide vide)
  const optional = (elementId, path) => document.getElementById(elementId)
    ? get(path).catch(() => null)
    : Promise.resolve(undefined);

  // Met à jour la donnée partagée et prévient script.js, seulement si elle a changé
  function publish(eventName, globalKey, fresh) {
    if (!fresh) return;                        // non demandé ou échec : état affiché conservé
    if (JSON.stringify(fresh) !== JSON.stringify(window[globalKey] ?? null)) {
      window[globalKey] = fresh;
      document.dispatchEvent(new CustomEvent(eventName, { detail: fresh }));
    }
  }

  function refresh() {
    if (busy) return;
    busy = true;
    lastRun = Date.now();
    Promise.all([
      get("categories?select=id,name,label,description,image,image_focus,href,sort_order&order=sort_order"),
      get("products?select=id,name,description,price,price_label,currency,available,image,image_focus,rating,review_count,featured,sort_order,category:categories(name)&order=sort_order"),
      // null = requête des événements en échec (≠ liste vide, qui est une réponse valide)
      get("events?select=key,name,label,title,description,image,sort_order&order=sort_order").catch(() => null),
      get("site_settings?select=key,value").catch(() => []),
      optional(document.getElementById("promoGrid") ? "promoGrid" : "topTicker", "promotions?select=id,title,description,product_id,category_id,old_price,new_price,discount_percent,discount_amount,start_date,end_date,image,sort_order&order=sort_order"),
      optional("galleryGrid", "gallery?select=id,title,alt,description,image,theme,featured,sort_order&order=featured.desc,sort_order.asc,created_at.desc&limit=24")
    ]).then(([cats, prods, events, settings, promos, gallery]) => {
      if (!Array.isArray(cats) || !Array.isArray(prods)) throw new Error("réponse inattendue");
      if (!Array.isArray(settings)) settings = [];
      const freshEvents = Array.isArray(events) ? cleanEvents(events.map(mapEvent), true) : null;
      if (freshEvents) cachedEvents = freshEvents;
      const freshPromotions = Array.isArray(promos) ? cleanList(promos.map(mapPromotion), isValidPromotion) : null;
      if (freshPromotions) cachedPromotions = freshPromotions;
      const freshGallery = Array.isArray(gallery) ? cleanList(gallery.map(mapGalleryItem), isValidGalleryItem) : null;
      if (freshGallery) cachedGallery = freshGallery;
      const data = {
        source: url,
        savedAt: new Date().toISOString(),
        categories: cats.map(mapCategory),
        // produit dont la catégorie est masquée → category null → écarté
        products: prods.map(mapProduct).filter(p => p.category),
        // événements : données fraîches, sinon derniers événements Supabase connus
        events: cachedEvents,
        eventsSource: cachedEvents ? "supabase" : null,
        // promotions / galerie : données fraîches, sinon dernier état connu (autres pages)
        promotions: cachedPromotions,
        promotionsSource: cachedPromotions ? "supabase" : null,
        gallery: cachedGallery,
        gallerySource: cachedGallery ? "supabase" : null,
        settings: Object.fromEntries(settings.filter(s => s && typeof s.key === "string").map(s => [s.key, s.value]))
      };
      // Paramètres du site (adresse, horaires, contacts…) : appliqués tout de suite
      // sur la page ouverte, sans attendre le prochain chargement
      if (Object.keys(data.settings).length) {
        window.KADIOR_SETTINGS = data.settings;
        document.dispatchEvent(new CustomEvent("kadior:settings", { detail: data.settings }));
      }
      // Événements : mis à jour et signalés à script.js seulement s'ils ont changé
      if (freshEvents) {
        if (JSON.stringify(freshEvents) !== JSON.stringify(window.KADIOR_EVENTS ?? null)) {
          window.KADIOR_EVENTS = freshEvents;
          document.dispatchEvent(new CustomEvent("kadior:events", { detail: freshEvents }));
        }
      } else {
        document.dispatchEvent(new CustomEvent("kadior:events-unavailable"));
      }
      // Promotions et galerie : indépendantes du reste (un échec n'empêche rien d'autre)
      publish("kadior:promotions", "KADIOR_PROMOTIONS", freshPromotions);
      publish("kadior:gallery", "KADIOR_GALLERY", freshGallery);
      if (!isValid(data)) {
        console.warn("Supabase : données incomplètes, catalogue local conservé.");
        return;
      }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* stockage indisponible */ }

      // Catalogue (catégories + produits) : si différent de celui affiché, on met à jour
      // les tableaux partagés et on prévient script.js, qui redessine la page ouverte
      if (signature(KADIOR_CATEGORIES, KADIOR_PRODUCTS) !== signature(data.categories, data.products)) {
        replaceArray(KADIOR_CATEGORIES, data.categories);
        replaceArray(KADIOR_PRODUCTS, data.products);
        document.dispatchEvent(new CustomEvent("kadior:products", {
          detail: { categories: data.categories, products: data.products }
        }));
      }
    }).catch(err => {
      console.warn("Supabase indisponible, catalogue local utilisé :", err.message || err);
      document.dispatchEvent(new CustomEvent("kadior:events-unavailable"));
    }).finally(() => { busy = false; });
  }

  if (document.readyState === "complete") refresh();
  else window.addEventListener("load", refresh, { once: true });

  // Retour sur l'onglet (ex. après une modification dans l'admin) : nouvelle
  // synchronisation, au plus une fois toutes les 5 secondes
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastRun > REVISIT_MS) refresh();
  });
})();
