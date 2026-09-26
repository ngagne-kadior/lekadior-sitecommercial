/* =====================================================================
   LE KADIOR — SYNCHRONISATION SUPABASE → SITE
   ---------------------------------------------------------------------
   Chargé APRÈS data/catalog.js et data/supabase-config.js, AVANT script.js.

   Fonctionnement (aucun changement d'affichage, aucune attente réseau) :
   1. Si une copie Supabase valide est en cache (localStorage), elle remplace
      les données de catalog.js AVANT le rendu de script.js.
   2. En arrière-plan, les données fraîches sont récupérées depuis Supabase
      puis mises en cache pour le prochain chargement de page.
   3. Supabase non configuré, indisponible, ou données invalides :
      le site garde data/catalog.js et les valeurs de script.js (fallback).
   ===================================================================== */

(function () {
  const CACHE_KEY = "kadior-supabase-cache-v1";
  const TIMEOUT_MS = 6000;
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

  // Événements : liste complète exigée, sinon la liste locale de script.js est gardée
  const isValidEvents = list => Array.isArray(list) && list.length > 0 &&
    list.every(e => e && e.key && e.name && e.label && e.title && e.desc && e.image);

  /* ---------- 1. Appliquer le cache avant le rendu ---------- */

  function replaceArray(target, items) {
    if (Array.isArray(target)) target.splice(0, target.length, ...items);
  }

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && cached.source === url && isValid(cached)) {
      replaceArray(KADIOR_CATEGORIES, cached.categories);
      replaceArray(KADIOR_PRODUCTS, cached.products);
      if (isValidEvents(cached.events)) window.KADIOR_EVENTS = cached.events;
      if (cached.settings && typeof cached.settings === "object" && !Array.isArray(cached.settings)) window.KADIOR_SETTINGS = cached.settings;
    }
  } catch (e) { /* cache illisible → fallback local */ }

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

  function refresh() {
    Promise.all([
      get("categories?select=id,name,label,description,image,image_focus,href,sort_order&order=sort_order"),
      get("products?select=id,name,description,price,price_label,currency,available,image,image_focus,rating,review_count,featured,sort_order,category:categories(name)&order=sort_order"),
      get("events?select=key,name,label,title,description,image,sort_order&order=sort_order").catch(() => []),
      get("site_settings?select=key,value").catch(() => [])
    ]).then(([cats, prods, events, settings]) => {
      if (!Array.isArray(cats) || !Array.isArray(prods)) throw new Error("réponse inattendue");
      if (!Array.isArray(events)) events = [];
      if (!Array.isArray(settings)) settings = [];
      const data = {
        source: url,
        savedAt: new Date().toISOString(),
        categories: cats.map(mapCategory),
        // produit dont la catégorie est masquée → category null → écarté
        products: prods.map(mapProduct).filter(p => p.category),
        events: events.map(mapEvent),
        settings: Object.fromEntries(settings.filter(s => s && typeof s.key === "string").map(s => [s.key, s.value]))
      };
      if (!isValidEvents(data.events)) data.events = [];   // événements locaux conservés
      if (!isValid(data)) {
        console.warn("Supabase : données incomplètes, catalogue local conservé.");
        return;
      }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* stockage indisponible */ }
    }).catch(err => {
      console.warn("Supabase indisponible, catalogue local utilisé :", err.message || err);
    });
  }

  if (document.readyState === "complete") refresh();
  else window.addEventListener("load", refresh, { once: true });
})();
