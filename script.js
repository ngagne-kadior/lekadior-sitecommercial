// Numéro WhatsApp : paramètre Supabase « whatsapp » si disponible, sinon valeur locale
// (mis à jour par applySettings dès que les paramètres Supabase sont reçus)
let WHATSAPP = "221784666259";
const WA_ICON = `<svg class="whatsapp-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>`;

/* ============ DONNÉES ============
   Catégories et produits : tableaux KADIOR_CATEGORIES / KADIOR_PRODUCTS.
   Valeurs de secours dans data/catalog.js ; data/supabase-sync.js les remplace
   par les données Supabase (cache au chargement, puis données fraîches via
   l'événement « kadior:products », qui redessine la page ouverte).
   Image absente : la carte affiche « Photo à venir ». */

let categories = [];
const products = KADIOR_PRODUCTS;   // tableau partagé, mis à jour en place par supabase-sync.js

// Filtres de la page produits : « Tous » + les catégories officielles
let FILTERS = [];

// (Re)calcule les catégories triées et les filtres à partir des données courantes
function syncCatalogData() {
  categories = [...KADIOR_CATEGORIES].sort((a, b) => a.order - b.order);
  FILTERS = [{key:"all", label:"Tous"}, ...categories.map(c => ({key:c.name, label:c.name}))];
}
syncCatalogData();

/* Types d'événements : table Supabase « events » (cache, puis données fraîches via
   l'événement « kadior:events », qui redessine la page ouverte).
   Une liste vide venant de Supabase est respectée (tous les événements masqués).
   LOCAL_EVENTS n'est utilisé que si Supabase est absent ou injoignable.
   Copie des événements de Supabase au 2026-09-28 (même forme que supabase-sync.js). */
const LOCAL_EVENTS = [
  {key:"anniversaire", name:"Anniversaire", label:"un anniversaire", image:"https://yvfwhjixhqxejvhefvyx.supabase.co/storage/v1/object/public/lekadior-images/events/1790506566665-7z9hfh.jpg",
   title:"Un gâteau à l'image de la personne fêtée",
   desc:"Parfums, taille, couleurs, décoration, prénom : nous créons avec vous le gâteau d'anniversaire qui fera briller les yeux de vos invités, petits et grands."},
  {key:"mariage", name:"Mariage", label:"un mariage", image:"assets/images/event-mariage.jpg",
   title:"Des créations élégantes pour le plus beau jour",
   desc:"Pièce montée, gâteau à étages ou douceurs pour vos invités : une création sur mesure, pensée selon le nombre de convives et le style de votre célébration."},
  {key:"bapteme", name:"Baptême", label:"un baptême", image:"assets/images/event-bapteme.jpg",
   title:"Des douceurs pour accueillir bébé",
   desc:"Gâteaux délicats et gourmandises à partager pour célébrer l'arrivée d'un nouveau membre de la famille, dans une ambiance douce et chaleureuse."},
  {key:"ceremonie", name:"Cérémonie", label:"une cérémonie", image:"assets/images/event-ceremonie.jpg",
   title:"Le sucré qui accompagne vos cérémonies",
   desc:"Gâteaux, viennoiseries et petites douceurs en quantité pour recevoir vos proches dans les meilleures conditions, le jour venu."},
  {key:"professionnel", name:"Événement professionnel", label:"un événement professionnel", image:"assets/images/event-professionnel.jpg",
   title:"Pauses, séminaires et réceptions",
   desc:"Viennoiseries du matin, snacks et gâteaux pour vos réunions, séminaires, lancements et réceptions d'entreprise. Livraison possible."}
];

// Pas d'événements en cache mais Supabase configuré : on attend sa réponse avant d'afficher
// la liste (évite d'afficher le secours puis de le remplacer). Secours si pas de réponse.
let eventsPending = window.KADIOR_EVENTS_PENDING === true;
let eventTypes = Array.isArray(window.KADIOR_EVENTS) ? window.KADIOR_EVENTS : (eventsPending ? [] : LOCAL_EVENTS);
const EVENTS_WAIT_MS = 12000;

/* ============ OUTILS ============ */

const $ = (selector, root = document) => root.querySelector(selector);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function whatsappLink(message = "Bonjour Le Kadior, je souhaite avoir des informations.") {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
}

const isEquipment = p => p.category === "Matériel";
const productUrl = p => `produit.html?id=${encodeURIComponent(p.id)}`;
const orderLabel = p => isEquipment(p) ? "Demander le prix" : "Commander";

function orderMessage(p, qty = 1) {
  if (isEquipment(p)) return `Bonjour Le Kadior, je souhaite connaître le prix : ${p.name}.`;
  return `Bonjour Le Kadior, je souhaite commander : ${qty > 1 ? `${qty} × ` : ""}${p.name}.`;
}

// Prix affiché : texte prévu (« Prix sur demande », « Sur devis »…) sinon prix formaté
function priceText(p) {
  if (p.priceLabel) return p.priceLabel;
  if (typeof p.price === "number") return `${String(p.price).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${p.currency || "FCFA"}`;
  return "Prix sur demande";
}

// Avis : affichés uniquement s'il existe de vrais avis (note + nombre)
function ratingHtml(p) {
  if (typeof p.rating === "number" && p.reviewCount > 0) {
    const full = Math.round(p.rating);
    return `<div class="rating"><span aria-hidden="true">${"★".repeat(full)}${"☆".repeat(5 - full)}</span> ${String(p.rating).replace(".", ",")} (${p.reviewCount} avis)</div>`;
  }
  return `<div class="rating rating-empty"><span aria-hidden="true">☆☆☆☆☆</span> Pas encore d'avis</div>`;
}

// Contrôle des données (utile avant l'import Supabase) : avertit dans la console
function validateCatalog() {
  const allowed = categories.map(c => c.name);
  const required = ["id", "name", "category", "description", "available", "image"];
  const ids = new Set();
  products.forEach(p => {
    required.forEach(key => { if (p[key] === undefined || p[key] === "") console.warn(`Catalogue : champ « ${key} » manquant pour ${p.id || p.name}`); });
    if (!allowed.includes(p.category)) console.warn(`Catalogue : catégorie inconnue « ${p.category} » pour ${p.id}`);
    if (typeof p.price !== "number" && !p.priceLabel) console.warn(`Catalogue : ni prix ni libellé de prix pour ${p.id}`);
    if (!("rating" in p) || !("reviewCount" in p)) console.warn(`Catalogue : champs d'avis manquants pour ${p.id}`);
    if (ids.has(p.id)) console.warn(`Catalogue : identifiant en double ${p.id}`);
    ids.add(p.id);
  });
}

function productCard(p, i, full = false) {
  const url = productUrl(p);
  return `
    <article class="product-card reveal-card" style="--delay:${i * 70}ms">
      <a class="media product-img" href="${url}" aria-label="Voir ${p.name}">
        <img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async" width="400" height="400" style="object-position:${p.imageFocus || "center"}">
      </a>
      <div class="product-body">
        <span class="product-cat">${p.category}</span>
        <h3><a href="${url}">${p.name}</a></h3>
        <div class="price">${priceText(p)}</div>
        ${ratingHtml(p)}
        <div class="product-actions">
          ${full ? `<a class="btn btn-soft" href="${url}">Voir le produit</a>` : ""}
          <a class="btn btn-gold" href="${whatsappLink(orderMessage(p))}" target="_blank" rel="noopener">${WA_ICON}<span>${orderLabel(p)}</span></a>
        </div>
      </div>
    </article>`;
}

/* ============ ACCUEIL ============ */

function renderCategories() {
  const grid = $("#categoryGrid");
  if (!grid) return;
  grid.innerHTML = categories.map((c, i) => `
    <a class="category-card reveal-card" href="${c.href || `produits.html?cat=${encodeURIComponent(c.name)}`}" style="--delay:${i * 70}ms">
      <div class="media category-img">
        <img src="${c.image}" alt="${c.name}" loading="lazy" decoding="async" width="400" height="300" style="object-position:${c.imageFocus || "center"}">
      </div>
      <div class="category-body">
        <h3>${c.label || c.name}</h3>
        <p>${c.description}</p>
        <span class="circle-arrow" aria-hidden="true">→</span>
      </div>
    </a>`).join("");
}

function renderProducts() {
  const grid = $("#productGrid");
  if (!grid) return;
  grid.innerHTML = products.filter(p => p.featured).map((p, i) => productCard(p, i)).join("");
}

/* ============ PAGE PRODUITS ============ */

// Rendus réutilisables après une mise à jour Supabase (définis par les pages concernées)
let rerenderCatalog = null;
let rerenderProductPage = null;

function initCatalog() {
  const grid = $("#catalogGrid");
  if (!grid) return;
  const bar = $("#filterBar");
  const info = $("#searchInfo");
  const empty = $("#catalogEmpty");
  const params = new URLSearchParams(location.search);
  const query = (params.get("q") || "").trim();
  const requested = params.get("cat") || "all";
  let current = requested;
  let userChose = false;   // filtre choisi à la main : jamais remplacé par une mise à jour
  if (!FILTERS.some(f => f.key === current)) current = "all";

  const normalize = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const buildBar = () => {
    bar.innerHTML = FILTERS.map(f =>
      `<button type="button" class="filter-chip" data-filter="${f.key}" aria-pressed="false">${f.label}</button>`).join("");
  };
  buildBar();

  if (query) {
    info.hidden = false;
    info.innerHTML = `Résultats pour « <strong>${escapeHtml(query)}</strong> » · <a href="produits.html">Effacer la recherche</a>`;
    const input = $("#searchBar input");
    if (input) input.value = query;
  }

  const render = animate => {
    bar.querySelectorAll(".filter-chip").forEach(b => {
      const on = b.dataset.filter === current;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on);
    });
    let list = current === "all" ? products : products.filter(p => p.category === current);
    if (query) list = list.filter(p => normalize(`${p.name} ${p.category} ${p.description}`).includes(normalize(query)));

    const draw = () => {
      grid.innerHTML = list.map((p, i) => productCard(p, i, true)).join("");
      grid.querySelectorAll(".reveal-card").forEach(card => card.classList.add("visible"));
      setupImageFallbacks(grid);
      empty.hidden = list.length > 0;
      grid.classList.remove("is-switching");
    };
    if (animate) {
      grid.classList.add("is-switching");
      setTimeout(draw, 180);
    } else draw();
  };

  bar.addEventListener("click", e => {
    const button = e.target.closest(".filter-chip");
    if (!button || button.dataset.filter === current) return;
    current = button.dataset.filter;
    userChose = true;
    try {
      const url = new URL(location.href);
      if (current === "all") url.searchParams.delete("cat");
      else url.searchParams.set("cat", current);
      history.replaceState(null, "", url);
    } catch (err) { /* file:// : l'URL n'est pas mise à jour, le filtre fonctionne quand même */ }
    render(true);
  });

  render(false);

  // Données Supabase fraîches : filtres et grille redessinés, filtre choisi conservé
  // (la catégorie demandée dans l'URL est reprise si elle devient disponible)
  rerenderCatalog = () => {
    buildBar();
    if (!FILTERS.some(f => f.key === current)) current = "all";
    if (!userChose && requested !== "all" && FILTERS.some(f => f.key === requested)) current = requested;
    render(false);
  };
}

/* ============ PAGE PRODUIT ============ */

function initProductPage() {
  const box = $("#productDetail");
  if (!box) return;
  const id = new URLSearchParams(location.search).get("id");
  const related = $("#relatedSection");
  let p = null;
  let qty = 1;

  // Quantité : un seul écouteur, qui s'applique toujours au produit affiché
  box.addEventListener("click", e => {
    const button = e.target.closest("[data-qty]");
    if (!button || !p) return;
    qty = Math.min(99, Math.max(1, qty + Number(button.dataset.qty)));
    $("#qtyValue").textContent = qty;
    $("#orderBtn").href = whatsappLink(orderMessage(p, qty));
  });

  const draw = () => {
    p = products.find(item => item.id === id) || null;

    if (!p) {
      box.innerHTML = `
        <div class="empty-block">
          <h1>Produit introuvable</h1>
          <p>Ce produit n'existe pas ou n'est plus disponible.</p>
          <a class="btn btn-gold" href="produits.html">Voir le catalogue</a>
        </div>`;
      if (related) related.hidden = true;
      return;
    }
    if (related) related.hidden = false;

    document.title = `${p.name} — Le Kadior`;
    const equipment = isEquipment(p);
    box.innerHTML = `
      <a class="back-link" href="produits.html">← Retour au catalogue</a>
      <div class="detail-grid">
        <div class="media detail-img reveal">
          <img src="${p.image}" alt="${p.name}" width="800" height="800" style="object-position:${p.imageFocus || "center"}">
        </div>
        <div class="detail-info reveal">
          <nav class="breadcrumb" aria-label="Fil d'Ariane">
            <a href="index.html">Accueil</a><span>›</span>
            <a href="produits.html?cat=${encodeURIComponent(p.category)}">${p.category}</a><span>›</span>
            <span>${p.name}</span>
          </nav>
          <span class="product-cat">${p.category}</span>
          <h1>${p.name}</h1>
          <div class="detail-price">${priceText(p)}</div>
          ${ratingHtml(p)}
          <p class="detail-desc">${p.description}</p>
          <div class="detail-meta">
            <span class="stock ${p.available ? "in" : "out"}">● ${p.available ? "Disponible" : "Momentanément indisponible"}</span>
            <span data-setting="location" data-setting-prefix="📍 ">📍 ${escapeHtml(settingText(window.KADIOR_SETTINGS, "location") || "Mbour, Sénégal")}</span>
            <span>🚚 Livraison possible</span>
          </div>
          ${equipment ? "" : `
          <div class="qty-row">
            <span>Quantité</span>
            <div class="qty" role="group" aria-label="Quantité">
              <button type="button" data-qty="-1" aria-label="Diminuer la quantité">−</button>
              <output id="qtyValue" aria-live="polite">${qty}</output>
              <button type="button" data-qty="1" aria-label="Augmenter la quantité">+</button>
            </div>
          </div>`}
          <a class="btn btn-gold btn-large detail-order" id="orderBtn" target="_blank" rel="noopener" href="${whatsappLink(orderMessage(p, qty))}">
            ${WA_ICON}<span>${equipment ? "Demander le prix sur WhatsApp" : "Commander sur WhatsApp"}</span>
          </a>
          <p class="detail-note">Votre commande est envoyée directement à Le Kadior sur WhatsApp : <span data-setting="whatsapp">${escapeHtml(formatPhone(WHATSAPP))}</span>.</p>
        </div>
      </div>`;

    const sameCategory = products.filter(x => x.id !== p.id && x.category === p.category);
    const others = products.filter(x => x.id !== p.id && x.category !== p.category && !isEquipment(x));
    $("#relatedGrid").innerHTML = [...sameCategory, ...others].slice(0, 4).map((x, i) => productCard(x, i, true)).join("");
  };

  draw();
  rerenderProductPage = draw;
}

/* ============ ÉVÉNEMENTS (page Événements, formulaire de devis, accueil) ============ */

// Liste des événements (evenements.html). Sans image : « Photo à venir ».
function renderEventList() {
  const list = $("#eventList");
  if (!list) return;
  list.innerHTML = eventTypes.map((ev, i) => `
    <article class="event-row reveal" id="${escapeHtml(ev.key)}">
      <div class="media event-media${ev.image ? "" : " is-missing"}">
        ${ev.image ? `<img src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.name)}" loading="lazy" decoding="async" width="900" height="600">` : ""}
      </div>
      <div class="event-row-body">
        <span class="event-num">0${i + 1}</span>
        <div class="eyebrow gold-text">— ${escapeHtml(ev.name.toUpperCase())}</div>
        <h2>${escapeHtml(ev.title)}</h2>
        <p>${escapeHtml(ev.desc)}</p>
        <div class="event-row-actions">
          <a class="btn btn-gold" target="_blank" rel="noopener" href="${whatsappLink(`Bonjour Le Kadior, je souhaite demander un devis pour ${ev.label}.`)}">${WA_ICON}<span>Demander un devis</span></a>
          <a class="btn btn-soft" href="#devis" data-event-type="${escapeHtml(ev.name)}">Remplir le formulaire</a>
        </div>
      </div>
    </article>`).join("");
}

// Options du formulaire de devis : la sélection en cours est conservée si elle existe encore
function renderEventOptions() {
  const select = $("#eventType");
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Choisir…</option>` +
    eventTypes.map(ev => `<option>${escapeHtml(ev.name)}</option>`).join("") + "<option>Autre</option>";
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

// Accueil : étiquettes de la section « Gâteaux & Événements » (événements visibles)
function renderEventChips() {
  const box = $(".event-chips");
  if (!box || eventsPending) return;          // en attente : étiquettes du HTML conservées
  box.innerHTML = eventTypes.map(ev => `<span>${escapeHtml(ev.name)}</span>`).join("");
  box.hidden = eventTypes.length === 0;
}

// « Voir nos prestations » : vers le premier événement affiché, sinon vers la liste
function updateFirstEventLink() {
  document.querySelectorAll("[data-first-event-link]").forEach(a => {
    a.href = eventTypes.length ? `#${eventTypes[0].key}` : "#eventList";
  });
}

function renderEventViews(update = false) {
  renderEventList();
  renderEventOptions();
  renderEventChips();
  updateFirstEventLink();
  const list = $("#eventList");
  if (update && list) {
    list.querySelectorAll(".reveal").forEach(el => el.classList.add("visible"));
    setupImageFallbacks(list);
  }
}

// Nouvelle liste d'événements (Supabase, ou secours local) : rendu sans rechargement
function applyEvents(list) {
  const wasPending = eventsPending;
  eventsPending = false;
  eventTypes = list;
  renderEventViews(true);
  // Arrivée avec une ancre (#mariage…) pendant l'attente : on s'y positionne une fois la liste affichée
  if (wasPending && location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target && $("#eventList")?.contains(target)) requestAnimationFrame(() => target.scrollIntoView({behavior: "instant", block: "start"}));
  }
}

document.addEventListener("kadior:events", e => applyEvents(Array.isArray(e.detail) ? e.detail : []));
// Supabase injoignable : secours local, seulement si aucune liste n'est encore affichée
document.addEventListener("kadior:events-unavailable", () => { if (eventsPending) applyEvents(LOCAL_EVENTS); });

function initEvents() {
  renderEventViews();
  const list = $("#eventList");
  const select = $("#eventType");
  if (list && select) {
    list.addEventListener("click", e => {
      const link = e.target.closest("[data-event-type]");
      if (link) select.value = link.dataset.eventType;
    });
  }
  const date = $("#eventDate");
  if (date) date.min = new Date().toISOString().slice(0, 10);
  // Filet de sécurité : sans réponse de Supabase, le secours local est affiché
  if (eventsPending) setTimeout(() => { if (eventsPending) applyEvents(LOCAL_EVENTS); }, EVENTS_WAIT_MS);
}

/* ============ PROMOTIONS & GALERIE (accueil) ============
   Données Supabase uniquement (cache, puis « kadior:promotions » / « kadior:gallery »).
   Pas de secours local : une section sans donnée est masquée.
   La base ne renvoie que les promotions actives et dans leur période, et les photos
   autorisées (réalisation client = consentement obligatoire). */

let promotions = Array.isArray(window.KADIOR_PROMOTIONS) ? window.KADIOR_PROMOTIONS : [];
let galleryItems = Array.isArray(window.KADIOR_GALLERY) ? window.KADIOR_GALLERY : [];
const GALLERY_MAX = 24;   // diaporama : jusqu'à 24 photos

const formatFcfa = n => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;

// Date du jour à Mbour (UTC+0, comme la base) au format AAAA-MM-JJ
const todayMbour = () => new Date().toISOString().slice(0, 10);

// Refiltrage par date côté navigateur (cache, page ouverte au passage de minuit)
const isPromotionCurrent = (p, today) => (!p.startDate || p.startDate <= today) && (!p.endDate || p.endDate >= today);

// Ancien prix : old_price, sinon prix actuel du produit. Nouveau prix : new_price, sinon
// calculé depuis la remise (% ou FCFA) quand l'ancien prix est connu.
function promotionPricing(p, product) {
  const productPrice = product && typeof product.price === "number" ? product.price : null;
  const base = p.oldPrice ?? productPrice;
  let newPrice = p.newPrice;
  if (newPrice == null && base != null) {
    if (p.discountPercent != null) newPrice = Math.round(base * (1 - p.discountPercent / 100));
    else if (p.discountAmount != null) newPrice = Math.max(0, base - p.discountAmount);
  }
  const reduced = base != null && newPrice != null && newPrice < base;
  let badge = null;
  if (p.discountPercent != null) badge = `−${String(p.discountPercent).replace(".", ",")} %`;
  else if (reduced && Math.round((1 - newPrice / base) * 100) >= 1) badge = `−${Math.round((1 - newPrice / base) * 100)} %`;
  else if (p.discountAmount != null) badge = `−${formatFcfa(p.discountAmount)}`;
  return { oldPrice: reduced ? base : null, newPrice, badge };
}

// Fin de promotion : « Dernier jour », « Plus que N jours » (≤ 3 jours), sinon la date
// « 30 novembre » (année ajoutée seulement si différente de l'année en cours)
function longDay(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const opts = { day: "numeric", month: "long", timeZone: "UTC" };
  if (d.getUTCFullYear() !== new Date().getUTCFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("fr-FR", opts);
}
function daysLeft(endDate) {
  if (!endDate) return null;
  return Math.round((Date.parse(endDate + "T00:00:00Z") - Date.parse(todayMbour() + "T00:00:00Z")) / 86400000);
}
function promoPeriodHtml(p) {
  const d = daysLeft(p.endDate);
  if (d === null) return "";
  if (d <= 0) return `<small class="promo-period promo-soon">Dernier jour</small>`;
  if (d <= 3) return `<small class="promo-period promo-soon">Plus que ${d} jour${d > 1 ? "s" : ""}</small>`;
  return `<small class="promo-period">Jusqu'au ${escapeHtml(longDay(p.endDate))}</small>`;
}

// Promotions en cours, visibles (produit ou catégorie encore affichés), triées
function currentPromotions() {
  const today = todayMbour();
  return promotions
    .filter(p => isPromotionCurrent(p, today))
    .filter(p => (!p.productId || products.some(x => x.id === p.productId)) &&
                 (!p.categoryId || KADIOR_CATEGORIES.some(c => c.id === p.categoryId)))
    .sort((a, b) => a.order - b.order);
}

function promotionCard(p, i) {
  const product = p.productId ? products.find(x => x.id === p.productId) : null;
  const category = p.categoryId ? KADIOR_CATEGORIES.find(c => c.id === p.categoryId) : null;
  const url = product ? productUrl(product)
    : category ? (category.href || `produits.html?cat=${encodeURIComponent(category.name)}`) : "produits.html";
  const image = p.image || (product && product.image) || (category && category.image) || "";
  const target = product ? product.name : category ? `Catégorie ${category.label || category.name}` : "Le Kadior";
  const { oldPrice, newPrice, badge } = promotionPricing(p, product);
  const price = newPrice != null
    ? `${oldPrice != null ? `<del class="promo-old">${formatFcfa(oldPrice)}</del>` : ""}<span>${formatFcfa(newPrice)}</span>`
    : (badge ? `<span>${escapeHtml(badge)}</span>` : "");
  return `
    <article class="product-card promo-card reveal-card" style="--delay:${i * 70}ms">
      <a class="media product-img${image ? "" : " is-missing"}" href="${escapeHtml(url)}" aria-label="${escapeHtml(p.title)}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" width="400" height="400">` : ""}
        ${badge ? `<span class="promo-badge">${escapeHtml(badge)}</span>` : ""}
      </a>
      <div class="product-body">
        <span class="product-cat">${escapeHtml(target)}</span>
        <h3><a href="${escapeHtml(url)}">${escapeHtml(p.title)}</a></h3>
        ${price ? `<div class="price">${price}</div>` : ""}
        ${p.description ? `<p class="promo-desc">${escapeHtml(p.description)}</p>` : ""}
        ${promoPeriodHtml(p)}
        <div class="product-actions">
          ${product
            ? `<a class="btn btn-gold" href="${whatsappLink(`Bonjour Le Kadior, je souhaite commander : ${product.name} (promotion « ${p.title} »${newPrice != null ? `, ${formatFcfa(newPrice)}` : ""}).`)}" target="_blank" rel="noopener">${WA_ICON}<span>Commander</span></a>`
            : `<a class="btn btn-soft" href="${escapeHtml(url)}">${category ? "Voir les produits" : "Voir le catalogue"}</a>`}
        </div>
      </div>
    </article>`;
}

// Section entièrement masquée s'il n'y a aucune promotion en cours. Une promotion dont le
// produit ou la catégorie n'est plus visible sur le site n'est pas affichée.
function renderPromotions(update = false) {
  const section = $("#promotions");
  const grid = $("#promoGrid");
  if (!section || !grid) return;
  const list = currentPromotions();
  grid.innerHTML = list.map(promotionCard).join("");
  const empty = $("#promoEmpty");
  if (empty) {                                   // page Promotions : toujours affichée
    empty.hidden = list.length > 0;
    const count = $("#promoCount");
    if (count && list.length) count.textContent = `${list.length} offre${list.length > 1 ? "s" : ""} en cours · à commander directement par WhatsApp.`;
  } else {
    section.hidden = list.length === 0;
  }
  refreshCarousel(grid);
  if (update) {
    grid.querySelectorAll(".reveal-card").forEach(el => el.classList.add("visible"));
    setupImageFallbacks(grid);
  }
}

// Galerie : 8 photos au plus, mises en avant d'abord puis ordre d'affichage
function renderGallery(update = false) {
  const section = $("#galerie");
  const grid = $("#galleryGrid");
  if (!section || !grid) return;
  const list = [...galleryItems].sort((a, b) => (b.featured - a.featured) || (a.order - b.order)).slice(0, GALLERY_MAX);
  grid.innerHTML = list.map((g, i) => `
    <figure class="gallery-item reveal-card" style="--delay:${i * 60}ms">
      <div class="media gallery-img">
        <img src="${escapeHtml(g.image)}" alt="${escapeHtml(g.alt || g.title || "Réalisation Le Kadior")}" loading="lazy" decoding="async" width="600" height="600">
      </div>
      ${g.title ? `<figcaption>${escapeHtml(g.title)}</figcaption>` : ""}
    </figure>`).join("");
  section.hidden = list.length === 0;
  refreshCarousel(grid);
  if (update) {
    grid.querySelectorAll(".reveal-card").forEach(el => el.classList.add("visible"));
    setupImageFallbacks(grid);
  }
}

/* ============ BANDE ANIMÉE (haut de toutes les pages) ============
   Fait défiler : les promotions en cours (automatique, lien vers la page
   Promotions) puis les informations écrites par l'admin (paramètre
   « bandeau_infos » : une ligne = une information). Sans rien à annoncer :
   « Qualité · Fraîcheur · Savoir-faire ». Pause au survol ; pas d'animation
   si l'utilisateur a demandé moins de mouvements. */

const TICKER_DEFAULT = "Qualité · Fraîcheur · Savoir-faire";
const TAG_ICON = `<svg class="tb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>`;

function tickerPromoText(p) {
  const product = p.productId ? products.find(x => x.id === p.productId) : null;
  const { oldPrice, newPrice, badge } = promotionPricing(p, product);
  let offer = "";
  if (newPrice != null && oldPrice != null) offer = ` : ${formatFcfa(newPrice)} au lieu de ${formatFcfa(oldPrice)}`;
  else if (newPrice != null) offer = ` : ${formatFcfa(newPrice)}`;
  else if (badge) offer = ` : ${badge}`;
  const d = daysLeft(p.endDate);
  const end = d === null ? "" : d <= 0 ? " — dernier jour" : d <= 3 ? ` — plus que ${d} jour${d > 1 ? "s" : ""}` : ` — jusqu'au ${longDay(p.endDate)}`;
  return `<b>${escapeHtml(p.title)}</b>${escapeHtml(offer + end)}`;
}

function renderTicker() {
  const box = $("#topTicker");
  if (!box) return;
  const track = box.querySelector(".ticker-track");
  const promos = currentPromotions().map(p =>
    `<a class="ticker-item ticker-promo" href="promotions.html">${TAG_ICON}<span>${tickerPromoText(p)}</span></a>`);
  const raw = (window.KADIOR_SETTINGS && window.KADIOR_SETTINGS.bandeau_infos) || "";
  const infos = String(typeof raw === "string" ? raw : "").split(/\r?\n/).map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="ticker-item ticker-info">${escapeHtml(t)}</span>`);
  const items = promos.concat(infos);
  if (!items.length) items.push(`<span class="ticker-item ticker-info">${TICKER_DEFAULT}</span>`);
  const sep = `<span class="ticker-sep" aria-hidden="true">◆</span>`;
  const one = items.map(it => it + sep).join("");
  // Deux copies à la suite : la boucle est continue
  track.innerHTML = `<span class="ticker-group">${one}</span><span class="ticker-group" aria-hidden="true">${one}</span>`;
  track.querySelectorAll('.ticker-group[aria-hidden] a').forEach(a => a.tabIndex = -1);
  requestAnimationFrame(() => {
    const w = track.firstElementChild.getBoundingClientRect().width;
    track.style.setProperty("--ticker-duration", `${Math.max(12, Math.round(w / 60))}s`);   // ~60 px/s
    box.classList.add("is-ready");
  });
}

document.addEventListener("kadior:promotions", e => { promotions = Array.isArray(e.detail) ? e.detail : []; renderPromotions(true); renderTicker(); });
document.addEventListener("kadior:settings", () => renderTicker());
document.addEventListener("kadior:gallery", e => { galleryItems = Array.isArray(e.detail) ? e.detail : []; renderGallery(true); });
// Produits ou catégories modifiés : noms, prix et images des promotions recalculés
document.addEventListener("kadior:products", () => { renderPromotions(true); renderTicker(); });

function initPromotionsAndGallery() {
  renderPromotions();
  renderGallery();
  renderTicker();
  // Page ouverte au passage de minuit (heure de Mbour) : les promotions sont refiltrées
  if ($("#promoGrid") || $("#topTicker")) {
    const schedule = () => {
      const now = new Date();
      const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      setTimeout(() => { renderPromotions(true); renderTicker(); schedule(); }, nextDay - now.getTime() + 1000);
    };
    schedule();
  }
}

/* ============ BOX (accueil) ============
   Produits de la catégorie « Box » (box salées, sucrées, mixtes…), créés par
   l'admin comme n'importe quel produit. Section masquée s'il n'y en a aucune. */

function renderBoxes(update = false) {
  const section = $("#box");
  const grid = $("#boxGrid");
  if (!section || !grid) return;
  const list = products.filter(p => (p.category || "").toLowerCase() === "box");
  grid.innerHTML = list.map((p, i) => productCard(p, i, true)).join("");
  section.hidden = list.length === 0;
  refreshCarousel(grid);
  if (update) {
    grid.querySelectorAll(".reveal-card").forEach(el => el.classList.add("visible"));
    setupImageFallbacks(grid);
  }
}

/* ============ DIAPORAMAS ============
   Une rangée de cartes qui défile toute seule (toutes les 4,5 s), avec flèches
   et points. Pause quand on survole, touche ou parcourt la rangée au clavier.
   Pas de défilement automatique si l'utilisateur a demandé moins d'animations.
   Si toutes les cartes tiennent à l'écran, flèches et points sont masqués. */

const carousels = new WeakMap();

function refreshCarousel(track) {
  if (!track || !track.classList.contains("carousel-track")) return;
  let c = carousels.get(track);
  if (!c) c = setupCarousel(track);
  c.rebuild();
}

function setupCarousel(track) {
  const box = track.parentElement;
  const nav = document.createElement("div");
  nav.className = "carousel-nav";
  nav.innerHTML = `<button type="button" class="carousel-btn" data-dir="-1" aria-label="Précédent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
    <div class="carousel-dots"></div>
    <button type="button" class="carousel-btn" data-dir="1" aria-label="Suivant"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>`;
  box.appendChild(nav);
  const dotsBox = nav.querySelector(".carousel-dots");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = false, resumeTimer, timer;

  const step = () => {
    const first = track.children[0];
    if (!first) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return first.getBoundingClientRect().width + gap;
  };
  const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  const go = dir => {
    if (dir > 0 && atEnd()) track.scrollTo({ left: 0, behavior: "smooth" });
    else if (dir < 0 && track.scrollLeft <= 4) track.scrollTo({ left: track.scrollWidth, behavior: "smooth" });
    else track.scrollBy({ left: dir * step(), behavior: "smooth" });
  };
  const update = () => {
    const scrollable = track.scrollWidth > track.clientWidth + 4;
    nav.hidden = !scrollable;
    box.classList.toggle("is-static", !scrollable);
    const index = Math.round(track.scrollLeft / (step() || 1));
    const dots = dotsBox.children;
    for (let k = 0; k < dots.length; k++) dots[k].classList.toggle("active", k === Math.min(index, dots.length - 1));
  };
  const pause = () => { paused = true; clearTimeout(resumeTimer); };
  const resumeLater = () => { clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { paused = false; }, 6000); };

  nav.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.dir) go(Number(b.dataset.dir));
    else if (b.dataset.i) track.scrollTo({ left: Number(b.dataset.i) * step(), behavior: "smooth" });
    pause(); resumeLater();
  });
  track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  box.addEventListener("mouseenter", pause);
  box.addEventListener("mouseleave", () => { paused = false; });
  box.addEventListener("focusin", pause);
  box.addEventListener("focusout", resumeLater);
  track.addEventListener("touchstart", pause, { passive: true });
  track.addEventListener("touchend", resumeLater, { passive: true });
  window.addEventListener("resize", update);
  if (!reduceMotion) {
    timer = setInterval(() => {
      if (paused || document.hidden || nav.hidden) return;
      go(1);
    }, 4500);
  }

  const c = {
    rebuild() {
      const n = track.children.length;
      dotsBox.innerHTML = n <= 16
        ? Array.from({ length: n }, (_, k) => `<button type="button" class="carousel-dot" data-i="${k}" aria-label="Élément ${k + 1}"></button>`).join("")
        : "";
      track.scrollLeft = 0;
      requestAnimationFrame(update);
    }
  };
  carousels.set(track, c);
  return c;
}

/* ============ PAGE MATÉRIEL ============ */

function initEquipment() {
  const grid = $("#equipmentGrid");
  if (!grid) return;
  grid.innerHTML = products.filter(isEquipment).map((p, i) => `
    <article class="equip-card reveal-card" style="--delay:${i * 60}ms">
      <div class="media equip-img">
        <img src="${p.image}" alt="${p.name}" loading="lazy" decoding="async" width="600" height="400">
      </div>
      <div class="equip-body">
        <span class="equip-num">${String(i + 1).padStart(2, "0")}</span>
        <h3>${p.name}</h3>
        <p>${p.description}</p>
        <div class="equip-actions">
          <a class="btn btn-gold" target="_blank" rel="noopener" href="${whatsappLink(orderMessage(p))}">${WA_ICON}<span>Demander le prix</span></a>
          <a class="text-link" href="${productUrl(p)}">Détails →</a>
        </div>
      </div>
    </article>`).join("");
}

/* ============ FORMULAIRES → WHATSAPP ============ */

function formatDate(value) {
  const [y, m, d] = value.split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

function buildQuoteMessage(form) {
  const v = name => (form.elements[name]?.value || "").trim();
  const type = eventTypes.find(ev => ev.name === v("type"));
  const lines = [`Bonjour Le Kadior, je souhaite demander un devis pour ${type ? type.label : "un événement"}.`, ""];
  const add = (label, value) => { if (value) lines.push(`• ${label} : ${value}`); };
  add("Nom", v("name"));
  add("Téléphone", v("phone"));
  add("Type d'événement", v("type"));
  add("Date", v("date") && formatDate(v("date")));
  add("Nombre de personnes", v("guests"));
  add("Budget approximatif", v("budget"));
  add("Message", v("message"));
  return lines.join("\n");
}

function buildContactMessage(form) {
  const v = name => (form.elements[name]?.value || "").trim();
  const lines = ["Bonjour Le Kadior,", ""];
  if (v("subject")) lines.push(`Sujet : ${v("subject")}`, "");
  lines.push(v("message"), "", `— ${v("name")}`);
  if (v("phone")) lines.push(`Téléphone : ${v("phone")}`);
  if (v("email")) lines.push(`Email : ${v("email")}`);
  return lines.join("\n");
}

function setupWhatsAppForms() {
  document.querySelectorAll("form[data-wa-form]").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const message = form.dataset.waForm === "devis" ? buildQuoteMessage(form) : buildContactMessage(form);
      window.open(whatsappLink(message), "_blank", "noopener");
      const note = $(".form-note", form);
      if (note) note.hidden = false;
    });
  });
}

/* ============ COMMUN ============ */

// Image absente : on affiche un fond Gold & Brown au lieu d'une image cassée
function setupImageFallbacks(root = document) {
  root.querySelectorAll(".media img, .brand-mark img").forEach(img => {
    if (img.dataset.fallback) return;
    img.dataset.fallback = "1";
    const fail = () => {
      img.parentElement.classList.add("is-missing");
      console.warn("Image manquante :", img.getAttribute("src"));
    };
    if (img.complete && img.naturalWidth === 0) fail();
    else img.addEventListener("error", fail, {once: true});
  });
}

function setupHeroSlider() {
  const slides = [...document.querySelectorAll(".hero-slide")];
  const dots = [...document.querySelectorAll(".hero-dots button")];
  if (slides.length < 2) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let current = 0;
  let timer;

  const show = index => {
    current = (index + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle("active", k === current));
    dots.forEach((d, k) => {
      d.classList.toggle("active", k === current);
      if (k === current) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    });
  };
  const start = () => {
    if (reduceMotion) return;
    clearInterval(timer);
    timer = setInterval(() => show(current + 1), 5000);
  };

  dots.forEach((d, k) => d.addEventListener("click", () => { show(k); start(); }));
  $(".hero-prev")?.addEventListener("click", () => { show(current - 1); start(); });
  $(".hero-next")?.addEventListener("click", () => { show(current + 1); start(); });
  start();
}

function setupWhatsApp() {
  document.querySelectorAll("[data-whatsapp]").forEach(link => {
    link.href = whatsappLink();
    link.target = "_blank";
    link.rel = "noopener";
  });
}

/* ============ PARAMÈTRES DU SITE (Supabase « site_settings ») ============
   Source de vérité : table site_settings (address, location, phone, whatsapp,
   email, openingHours, socials…), transmise par data/supabase-sync.js.
   Dans le HTML :
   - data-setting="clé"        : l'élément affiche la valeur du paramètre ;
                                 le texte déjà présent sert de secours si
                                 Supabase est indisponible ;
   - data-setting-prefix="…"   : texte conservé devant la valeur (ex. « 📍 ») ;
   - lien tel: / mailto:       : mis à jour automatiquement (phone / email) ;
   - data-social="facebook|instagram|tiktok|youtube" : lien du réseau social ;
   - data-map-link             : lien Google Maps construit depuis « location ».
   « address » (adresse complète) et « location » (localisation générale / carte)
   restent deux paramètres distincts.
   ======================================================================= */

// Chiffres d'un numéro ; un numéro sénégalais à 9 chiffres reçoit l'indicatif 221
function phoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 9 ? "221" + digits : digits;
}

// Affichage lisible : +221 78 466 62 59
function formatPhone(value) {
  const m = /^221(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phoneDigits(value));
  return m ? `+221 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : String(value).trim();
}

function settingText(settings, key) {
  const v = settings?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Remplace le texte d'un élément sans toucher à ses icônes (svg)
function setSettingText(el, text) {
  const value = (el.dataset.settingPrefix || "") + text;
  const nodes = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim());
  if (nodes.length) nodes[nodes.length - 1].nodeValue = value;
  else el.append(value);
}

function applySettings(settings = window.KADIOR_SETTINGS) {
  if (!settings || typeof settings !== "object") return;

  // WhatsApp : numéro utilisé par tous les boutons, liens et formulaires
  const wa = phoneDigits(settingText(settings, "whatsapp"));
  if (/^\d{8,15}$/.test(wa) && wa !== WHATSAPP) {
    WHATSAPP = wa;
    document.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
      a.href = a.getAttribute("href").replace(/wa\.me\/\d+/, `wa.me/${WHATSAPP}`);
    });
  }

  document.querySelectorAll("[data-setting]").forEach(el => {
    const key = el.dataset.setting;
    const value = settingText(settings, key);
    if (!value) return;                                   // absent : texte de secours conservé
    if (key === "phone" || key === "whatsapp") {
      const digits = phoneDigits(value);
      if (!/^\d{8,15}$/.test(digits)) return;
      setSettingText(el, formatPhone(value));
      if (key === "phone" && el.tagName === "A") el.href = `tel:+${digits}`;
    } else if (key === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
      setSettingText(el, value);
      if (el.tagName === "A") el.href = `mailto:${value}`;
    } else {
      setSettingText(el, value);
    }
  });

  const place = settingText(settings, "location");
  if (place) {
    document.querySelectorAll("[data-map-link]").forEach(a => {
      a.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
    });
  }

  const socials = settings.socials && typeof settings.socials === "object" ? settings.socials : {};
  document.querySelectorAll("[data-social]").forEach(a => {
    const url = socials[a.dataset.social];
    if (typeof url === "string" && /^https:\/\//i.test(url.trim())) a.href = url.trim();
  });
}

// Paramètres frais reçus de Supabase pendant la visite : appliqués immédiatement
document.addEventListener("kadior:settings", e => applySettings(e.detail));

/* ============ CATALOGUE : MISE À JOUR SANS RECHARGEMENT ============
   supabase-sync.js met à jour KADIOR_CATEGORIES / KADIOR_PRODUCTS puis émet
   « kadior:products » (seulement si les données ont changé). On redessine alors
   uniquement les zones catégories / produits de la page ouverte. */
function refreshCatalogViews() {
  syncCatalogData();
  renderCategories();
  renderProducts();
  renderBoxes(true);
  if (rerenderCatalog) rerenderCatalog();
  if (rerenderProductPage) rerenderProductPage();
  initEquipment();
  // Éléments recréés : affichés sans rejouer l'animation, avec le secours « Photo à venir »
  ["#categoryGrid", "#productGrid", "#catalogGrid", "#productDetail", "#relatedGrid", "#equipmentGrid"].forEach(sel => {
    const root = $(sel);
    if (!root) return;
    root.querySelectorAll(".reveal, .reveal-card").forEach(el => el.classList.add("visible"));
    setupImageFallbacks(root);
  });
}
document.addEventListener("kadior:products", refreshCatalogViews);

function setupActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll("#mainNav a").forEach(a => {
    const on = a.dataset.page === page;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
  });
}

function setupMenu() {
  const button = $("#menuToggle");
  const nav = $("#mainNav");
  const setOpen = open => {
    nav.classList.toggle("open", open);
    button.setAttribute("aria-expanded", open);
    button.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    button.textContent = open ? "✕" : "☰";
  };
  button.addEventListener("click", () => {
    setSearchOpen(false);
    setOpen(!nav.classList.contains("open"));
  });
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
}

function setSearchOpen(open) {
  const bar = $("#searchBar");
  const button = $("#searchToggle");
  if (!bar || !button) return;
  bar.classList.toggle("open", open);
  button.setAttribute("aria-expanded", open);
  if (open) {
    const input = $("input", bar);
    input.focus();
    requestAnimationFrame(() => input.focus());
  } else bar.dispatchEvent(new Event("suggest:close"));
}

/* ============ RECHERCHE : AUTOCOMPLÉTION ============
   Lit la même source que le catalogue (KADIOR_PRODUCTS) : compatible avec la future
   alimentation par Supabase tant que « products » garde les mêmes champs. */

const SUGGEST_MAX = 6;
const normalizeText = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Pertinence : début du nom > début d'un mot du nom > nom > catégorie > description
// (description seulement à partir de 4 lettres : « cro » ne doit pas remonter « croustillante »)
function searchProducts(query) {
  const q = normalizeText(query.trim());
  if (!q) return [];
  return products
    .map((p, i) => {
      const name = normalizeText(p.name);
      let score = -1;
      if (name.startsWith(q)) score = 0;
      else if (name.split(/[\s'’-]+/).some(w => w.startsWith(q))) score = 1;
      else if (name.includes(q)) score = 2;
      else if (normalizeText(p.category).includes(q)) score = 3;
      else if (q.length >= 4 && normalizeText(p.description).includes(q)) score = 4;
      return {p, i, score};
    })
    .filter(r => r.score >= 0)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map(r => r.p);
}

function setupSearchSuggest(bar) {
  const input = $("input", bar);
  if (!input) return;
  // Le champ est enveloppé pour ancrer la liste juste sous lui
  const field = document.createElement("div");
  field.className = "search-field";
  input.replaceWith(field);
  field.appendChild(input);
  const list = document.createElement("div");
  list.className = "search-suggest";
  list.id = "searchSuggest";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  field.appendChild(list);

  input.setAttribute("role", "combobox");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");

  let items = [];
  let active = -1;

  const setActive = index => {
    items.forEach((el, i) => el.classList.toggle("active", i === index));
    active = index;
    if (index >= 0) {
      input.setAttribute("aria-activedescendant", items[index].id);
      items[index].scrollIntoView({block: "nearest"});
    } else input.removeAttribute("aria-activedescendant");
  };

  const close = () => {
    list.hidden = true;
    list.innerHTML = "";
    items = [];
    input.setAttribute("aria-expanded", "false");
    setActive(-1);
  };

  const update = () => {
    const query = input.value.trim();
    if (!query) return close();
    const results = searchProducts(query);
    const allUrl = `produits.html?q=${encodeURIComponent(query)}`;
    list.innerHTML = results.length
      ? results.slice(0, SUGGEST_MAX).map((p, i) => `
        <a class="suggest-item" id="suggest-${i}" role="option" href="${productUrl(p)}">
          <span class="media suggest-thumb"><img src="${p.image}" alt="" width="44" height="44" style="object-position:${p.imageFocus || "center"}"></span>
          <span class="suggest-text">
            <span class="suggest-name">${escapeHtml(p.name)}</span>
            <span class="suggest-meta"><span class="suggest-cat">${escapeHtml(p.category)}</span> · ${escapeHtml(priceText(p))}</span>
          </span>
        </a>`).join("") +
        (results.length > SUGGEST_MAX
          ? `<a class="suggest-item suggest-all" id="suggest-${SUGGEST_MAX}" role="option" href="${allUrl}">Voir tous les résultats (${results.length}) →</a>`
          : "")
      : `<p class="suggest-empty">Aucun produit trouvé pour « ${escapeHtml(query)} »</p>`;
    items = [...list.querySelectorAll(".suggest-item")];
    setupImageFallbacks(list);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(-1);
  };

  input.addEventListener("input", update);
  input.addEventListener("focus", () => { if (input.value.trim()) update(); });
  input.addEventListener("keydown", e => {
    if (list.hidden || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(active < items.length - 1 ? active + 1 : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active > 0 ? active - 1 : items.length - 1);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      location.href = items[active].href;
    }
  });
  // Clic en dehors du champ et de la liste → on masque les suggestions
  document.addEventListener("pointerdown", e => { if (!field.contains(e.target)) close(); });
  bar.addEventListener("suggest:close", close);
}

function setupSearch() {
  const button = $("#searchToggle");
  const bar = $("#searchBar");
  if (!button || !bar) return;
  setupSearchSuggest(bar);
  button.addEventListener("click", () => {
    $("#mainNav").classList.remove("open");
    setSearchOpen(!bar.classList.contains("open"));
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setSearchOpen(false); });
}

function setupReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, {threshold: .12});
  document.querySelectorAll(".reveal:not(.visible), .reveal-card:not(.visible)").forEach(el => observer.observe(el));
}

// Le contenu généré en JS décale les ancres (#devis…) : on se repositionne après le rendu
function restoreHashScroll() {
  if (!location.hash) return;
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) requestAnimationFrame(() => target.scrollIntoView({behavior: "instant", block: "start"}));
}

$("#newsletter")?.addEventListener("submit", e => {
  e.preventDefault();
  alert("Merci ! La gestion newsletter sera connectée à la base de données dans la prochaine phase.");
});

validateCatalog();
applySettings();
renderCategories();
renderProducts();
initCatalog();
initProductPage();
initEvents();
initPromotionsAndGallery();
renderBoxes();
initEquipment();
setupWhatsAppForms();
setupImageFallbacks();
setupHeroSlider();
setupWhatsApp();
setupActiveNav();
setupMenu();
setupSearch();
setupReveal();
restoreHashScroll();
