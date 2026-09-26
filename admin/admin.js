/* =====================================================================
   LE KADIOR — ESPACE ADMINISTRATEUR
   ---------------------------------------------------------------------
   - Configuration : data/supabase-config.js (clé PUBLIQUE uniquement).
   - Connexion : Supabase Auth (e-mail + mot de passe).
   - Accès : réservé aux profils « admin » (fonction SQL is_admin()).
     Le contrôle réel est fait par la base (RLS) : même en contournant
     cette page, un compte non admin ne peut rien modifier.
   - Images : bucket Storage « lekadior-images » (5 Mo, JPEG/PNG/WebP/AVIF).
   Aucun mot de passe, aucune clé secrète n'est stocké dans ce fichier.
   ===================================================================== */

(function () {
  "use strict";

  const BUCKET = "lekadior-images";
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
  const IMAGE_TABLES = ["products", "categories", "events", "promotions", "gallery", "news"];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Configuration et client Supabase ---------- */

  const cfg = window.KADIOR_SUPABASE || {};
  const SUPA_URL = String(cfg.url || "").replace(/\/+$/, "");
  const SUPA_KEY = String(cfg.anonKey || "");

  function isSecretKey(k) {
    if (k.startsWith("sb_secret_")) return true;
    try {
      const payload = JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.role === "service_role";
    } catch (e) { return false; }
  }

  function fatal(message) {
    $("#boot").hidden = true;
    $("#admin-view").hidden = true;
    $("#login-view").hidden = false;
    $("#login-form").querySelectorAll("input, button").forEach(el => { el.disabled = true; });
    setLoginMessage(message);
  }

  if (!SUPA_URL || !SUPA_KEY) return fatal("Supabase n'est pas configuré (data/supabase-config.js).");
  if (isSecretKey(SUPA_KEY)) return fatal("Clé secrète détectée dans data/supabase-config.js : remplacez-la par la clé publique (anon / publishable).");
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    return fatal("La bibliothèque Supabase n'a pas pu être chargée. Vérifiez la connexion Internet puis rechargez la page.");
  }

  const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const PUBLIC_PREFIX = sb.storage.from(BUCKET).getPublicUrl("").data.publicUrl.replace(/\/?$/, "/");

  const state = { user: null };

  /* ---------- Messages ---------- */

  let toastTimer;
  function toast(message, type = "success") {
    const el = $("#toast");
    el.textContent = message;
    el.className = "toast toast-" + type;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, type === "error" ? 7000 : 3500);
  }

  function setLoginMessage(message) {
    const el = $("#login-message");
    el.textContent = message || "";
    el.hidden = !message;
  }

  const CONSTRAINT_MESSAGES = {
    products_price_or_label: "Indiquez un prix ou un libellé de prix (ex. « Prix sur demande »).",
    products_rating_requires_reviews: "Une note ne peut exister sans avis clients.",
    products_order_mode_check: "Mode de commande invalide.",
    products_servings_check: "Nombre de parts invalide (le maximum doit être supérieur ou égal au minimum).",
    products_lead_time_check: "Le délai de commande doit être positif.",
    promotions_single_target: "Une promotion cible un produit OU une catégorie, pas les deux.",
    promotions_single_discount: "Choisissez un seul type de réduction : prix promotionnel, pourcentage ou montant.",
    promotions_discount_values: "Réduction invalide (pourcentage entre 0 et 100, montant positif).",
    promotions_dates: "La date de fin doit être postérieure à la date de début.",
    gallery_theme_check: "Thème de galerie invalide.",
    site_settings_validation_check: "Statut de validation invalide."
  };

  function describeError(err) {
    if (!err) return "Erreur inconnue.";
    if (err.detailed) return err.message;                   // message déjà détaillé : affiché tel quel
    const msg = String(err.message || err);
    const code = err.code || "";
    for (const [name, text] of Object.entries(CONSTRAINT_MESSAGES)) if (msg.includes(name)) return text;
    if (code === "23505") return "Cette valeur existe déjà (identifiant, nom ou clé en double).";
    if (code === "23503") return "Opération impossible : cet élément est lié à d'autres données (ex. une catégorie qui contient encore des produits).";
    if (code === "23502") return "Un champ obligatoire est vide.";
    if (code === "23514") return "Valeur refusée par une règle de la base de données.";
    if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "Action refusée : droits administrateur requis.";
    if (/JWT|expired|refresh token/i.test(msg)) return "Session expirée : reconnectez-vous.";
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Connexion à Supabase impossible. Vérifiez votre connexion Internet.";
    return msg;
  }

  /* ---------- Images ---------- */

  function resolveImage(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    if (/^(https?:|blob:|data:image\/)/i.test(v)) return v;
    return "../" + v.replace(/^\/+/, "");                    // chemins du site : assets/images/…
  }

  function thumb(value) {
    const src = resolveImage(value);
    return src
      ? `<img class="thumb" src="${esc(src)}" alt="" loading="lazy" onerror="this.classList.add('thumb-missing')">`
      : `<span class="thumb thumb-empty" aria-hidden="true"></span>`;
  }

  function checkImageFile(file) {
    if (!IMAGE_TYPES[file.type]) return "Format non accepté : utilisez JPEG, PNG, WebP ou AVIF.";
    if (file.size > MAX_IMAGE_SIZE) return `Image trop lourde (${(file.size / 1048576).toFixed(1)} Mo) : 5 Mo maximum.`;
    if (file.size === 0) return "Fichier vide.";
    return null;
  }

  async function uploadImage(file, folder) {
    const problem = checkImageFile(file);
    if (problem) throw new Error(problem);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${folder}/${Date.now()}-${rand}.${IMAGE_TYPES[file.type]}`;
    const fileInfo = { name: file.name, type: file.type, size: file.size };

    // 1. Lecture du fichier en mémoire : une erreur ici vient du fichier local, pas de Supabase
    let body;
    try {
      body = new Blob([await file.arrayBuffer()], { type: file.type });
    } catch (readError) {
      console.error("[Kadior admin] Lecture du fichier impossible", { path, file: fileInfo,
        name: readError && readError.name, message: readError && readError.message });
      throw Object.assign(new Error(`Le navigateur n'a pas pu lire le fichier « ${file.name} » (${readError && readError.name}: ${readError && readError.message}). ` +
        "Copiez l'image dans un dossier local (hors synchronisation), puis sélectionnez-la à nouveau."), { detailed: true });
    }

    // 2. Envoi vers Supabase Storage
    const started = Date.now();
    const { error } = await sb.storage.from(BUCKET).upload(path, body, {
      contentType: file.type, cacheControl: "31536000", upsert: false
    });
    if (error) {
      // Diagnostic temporaire : détail complet de l'erreur réelle dans la console
      const original = error.originalError || error.cause;
      console.error("[Kadior admin] Échec de l'envoi Storage", {
        bucket: BUCKET, path, file: fileInfo, durationMs: Date.now() - started,
        status: error.status, statusCode: error.statusCode,
        name: error.name, message: error.message,
        originalName: original && original.name, originalMessage: original && original.message
      });
      const status = error.statusCode || error.status;
      throw Object.assign(new Error(`Envoi de l'image impossible (${path}${status ? ", HTTP " + status : ""}) : ` +
        `${error.message || error.name} — ${describeError(error)}`), { detailed: true });
    }
    return { path, url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  }

  // Chemin dans le bucket si l'URL désigne une image envoyée depuis l'admin, sinon null
  // (les images du dossier assets/images/ du site ne sont JAMAIS supprimées)
  function bucketPath(url) {
    const v = String(url || "");
    if (!v.startsWith(PUBLIC_PREFIX)) return null;
    return decodeURIComponent(v.slice(PUBLIC_PREFIX.length).split("?")[0]) || null;
  }

  // Supprime une ancienne image du bucket si plus aucune ligne ne l'utilise
  async function removeImageIfUnused(url) {
    const path = bucketPath(url);
    if (!path) return;
    try {
      for (const table of IMAGE_TABLES) {
        const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq("image", url);
        if (error) return;                                    // doute → on conserve l'image
        if (count > 0) return;
      }
      await sb.storage.from(BUCKET).remove([path]);
    } catch (e) { /* suppression facultative : on conserve l'image */ }
  }

  /* ---------- Données de référence (listes déroulantes) ---------- */

  async function fetchAll(table, columns = "*", orderBy = [["sort_order"], ["id"]]) {
    let q = sb.from(table).select(columns);
    for (const [col] of orderBy) q = q.order(col, { ascending: true, nullsFirst: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function loadLookups() {
    const [categories, productTypes, products, events] = await Promise.all([
      fetchAll("categories", "id,name,label,active"),
      fetchAll("product_types", "key,label,active", [["sort_order"], ["key"]]),
      fetchAll("products", "id,name,category_id"),
      fetchAll("events", "id,key,name")
    ]);
    return { categories, productTypes, products, events };
  }

  const catName = (lk, id) => (lk.categories.find(c => c.id === id) || {}).name || id || "—";
  const fmtPrice = n => Number(n).toLocaleString("fr-FR") + " FCFA";

  function nextId(rows, prefix, width) {
    const re = new RegExp("^" + prefix + "(\\d+)$");
    const max = rows.reduce((m, r) => { const x = re.exec(String(r.id)); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return prefix + String(max + 1).padStart(width, "0");
  }

  const badge = (text, kind) => `<span class="badge badge-${kind}">${esc(text)}</span>`;
  const activeBadge = on => on ? badge("Visible", "ok") : badge("Masqué", "off");

  /* ---------- Définition des rubriques ---------- */

  const GALLERY_THEMES = [
    ["gateaux", "Gâteaux"], ["portions", "Portions"], ["viennoiseries", "Viennoiseries"], ["pains", "Pains"],
    ["realisations_clients", "Réalisations clients"], ["equipe", "Équipe"], ["atelier", "Atelier"],
    ["materiel", "Matériel"], ["autre", "Autre"]
  ];

  const RESOURCES = {
    products: {
      title: "Produits", singular: "le produit", table: "products", pk: "id", folder: "products",
      canCreate: true, canDelete: true,
      deleteWarning: "Les promotions liées à ce produit seront également supprimées.",
      filterByCategory: true,
      search: (r, lk) => [r.id, r.name, r.description, catName(lk, r.category_id)],
      columns: [
        { label: "", html: r => thumb(r.image) },
        { label: "Réf.", html: r => `<code>${esc(r.id)}</code>` },
        { label: "Nom", html: r => `<strong>${esc(r.name)}</strong>` },
        { label: "Catégorie", html: (r, lk) => esc(catName(lk, r.category_id)) },
        { label: "Prix", html: r => esc(r.price != null && !r.price_label ? fmtPrice(r.price) : (r.price_label || "—")) },
        { label: "Statut", html: r => [
            activeBadge(r.published),
            r.available ? "" : badge("Indisponible", "warn"),
            r.validation_status === "validated" ? badge("Prix validé", "ok") : badge("À valider", "warn"),
            r.featured ? badge("Accueil", "gold") : ""
          ].join(" ") }
      ],
      fields: (lk, rows) => [
        { group: "Informations", key: "id", label: "Référence", type: "text", required: true, readonlyOnEdit: true,
          pattern: /^[A-Za-z0-9_-]{1,20}$/, default: () => nextId(rows, "P", 3),
          help: "P… pour les produits, M… pour le matériel. Non modifiable après création." },
        { key: "name", label: "Nom", type: "text", required: true },
        { key: "category_id", label: "Catégorie", type: "select", required: true,
          options: lk.categories.map(c => [c.id, c.name + (c.active ? "" : " (masquée)")]) },
        { key: "product_type", label: "Type de produit", type: "select",
          options: lk.productTypes.map(t => [t.key, t.label]), help: "Facultatif — utile pour les gâteaux." },
        { key: "description", label: "Description", type: "textarea" },
        { group: "Prix", key: "price", label: "Prix (FCFA)", type: "int", min: 0,
          help: "Laisser vide si le prix n'est pas encore validé." },
        { key: "price_label", label: "Libellé de prix", type: "text",
          help: "Ex. « Prix sur demande », « Sur devis », « À partir de 8 000 FCFA ». Prioritaire sur le prix à l'affichage." },
        { key: "validation_status", label: "Validation du prix", type: "select", required: true, default: "pending",
          options: [["pending", "À valider"], ["validated", "Validé"]] },
        { group: "Affichage", key: "published", label: "Visible sur le site", type: "bool", default: true },
        { key: "available", label: "Disponible", type: "bool", default: true },
        { key: "featured", label: "Mis en avant sur l'accueil", type: "bool", default: false },
        { key: "sort_order", label: "Ordre d'affichage", type: "int", default: 0 },
        { group: "Image", key: "image", label: "Photo", type: "image" },
        { key: "image_focus", label: "Cadrage de la photo", type: "text", help: "Facultatif, ex. « center 45% »." },
        { group: "Pâtisserie / commande (facultatif)", key: "order_mode", label: "Mode de commande", type: "select",
          options: [["direct", "Vente directe"], ["sur_commande", "Sur commande"], ["sur_devis", "Sur devis"]] },
        { key: "servings_min", label: "Parts minimum", type: "int", min: 1 },
        { key: "servings_max", label: "Parts maximum", type: "int", min: 1 },
        { key: "lead_time_hours", label: "Délai de commande (heures)", type: "int", min: 0 },
        { key: "customizable", label: "Personnalisable", type: "tristate" }
      ],
      validate: v => (v.price == null && !v.price_label) ? "Indiquez un prix ou un libellé de prix." : null,
      enhanceForm(form, ctx) {
        if (ctx.editing) return;
        const idInput = form.elements.id, cat = form.elements.category_id;
        let touched = false;
        idInput.addEventListener("input", () => { touched = true; });
        cat.addEventListener("change", () => {
          if (touched) return;
          const isMateriel = (ctx.lk.categories.find(c => c.id === cat.value) || {}).name === "Matériel";
          idInput.value = nextId(ctx.rows, isMateriel ? "M" : "P", 3);
        });
      }
    },

    categories: {
      title: "Catégories", singular: "la catégorie", table: "categories", pk: "id", folder: "categories",
      canCreate: true, canDelete: false,
      intro: "Une catégorie n'est jamais supprimée : décochez « Visible sur le site » pour la masquer (ses produits sont alors masqués aussi).",
      search: r => [r.id, r.name, r.label, r.description],
      columns: [
        { label: "", html: r => thumb(r.image) },
        { label: "Réf.", html: r => `<code>${esc(r.id)}</code>` },
        { label: "Nom", html: r => `<strong>${esc(r.name)}</strong>` },
        { label: "Libellé affiché", html: r => esc(r.label || "—") },
        { label: "Ordre", html: r => esc(r.sort_order) },
        { label: "Statut", html: r => activeBadge(r.active) }
      ],
      fields: (lk, rows) => [
        { key: "id", label: "Référence", type: "text", required: true, readonlyOnEdit: true,
          pattern: /^[A-Za-z0-9_-]{1,20}$/, default: () => nextId(rows, "C", 2), help: "Non modifiable après création." },
        { key: "name", label: "Nom", type: "text", required: true,
          help: "Utilisé par les filtres du site. Le modifier renomme la catégorie partout." },
        { key: "label", label: "Libellé affiché", type: "text", help: "Ex. « Gâteaux & Événements »." },
        { key: "description", label: "Description", type: "textarea" },
        { key: "href", label: "Lien spécial", type: "text", help: "Facultatif, ex. « evenements.html »." },
        { key: "sort_order", label: "Ordre d'affichage", type: "int", default: 0 },
        { key: "active", label: "Visible sur le site", type: "bool", default: true },
        { key: "image", label: "Image", type: "image" },
        { key: "image_focus", label: "Cadrage de l'image", type: "text", help: "Facultatif, ex. « 65% 60% »." }
      ]
    },

    events: {
      title: "Événements", singular: "l'événement", table: "events", pk: "id", folder: "events",
      canCreate: true, canDelete: false,
      intro: "Tous les champs sont nécessaires pour que la page Événements utilise les données de la base. Un événement n'est jamais supprimé : décochez « Visible » pour le masquer.",
      search: r => [r.id, r.key, r.name, r.title],
      columns: [
        { label: "", html: r => thumb(r.image) },
        { label: "Réf.", html: r => `<code>${esc(r.id)}</code>` },
        { label: "Nom", html: r => `<strong>${esc(r.name)}</strong>` },
        { label: "Titre", html: r => esc(r.title || "—") },
        { label: "Ordre", html: r => esc(r.sort_order) },
        { label: "Statut", html: r => activeBadge(r.active) }
      ],
      fields: (lk, rows) => [
        { key: "id", label: "Référence", type: "text", required: true, readonlyOnEdit: true,
          pattern: /^[A-Za-z0-9_-]{1,20}$/, default: () => nextId(rows, "EV", 3) },
        { key: "key", label: "Clé (ancre de page)", type: "text", required: true, pattern: /^[a-z0-9-]{1,40}$/,
          help: "Minuscules, chiffres et tirets, ex. « mariage »." },
        { key: "name", label: "Nom", type: "text", required: true },
        { key: "label", label: "Libellé (message WhatsApp)", type: "text", required: true, help: "Ex. « un mariage »." },
        { key: "title", label: "Titre", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea", required: true },
        { key: "sort_order", label: "Ordre d'affichage", type: "int", default: 0 },
        { key: "active", label: "Visible sur le site", type: "bool", default: true },
        { key: "image", label: "Image", type: "image", required: true }
      ]
    },

    promotions: {
      title: "Promotions", singular: "la promotion", table: "promotions", pk: "id", folder: "promotions",
      canCreate: true, canDelete: true,
      intro: "Une promotion n'est visible que si elle est active et dans sa période.",
      search: (r, lk) => [r.title, r.description, catName(lk, r.category_id),
        (lk.products.find(p => p.id === r.product_id) || {}).name],
      columns: [
        { label: "", html: r => thumb(r.image) },
        { label: "Titre", html: r => `<strong>${esc(r.title)}</strong>` },
        { label: "Cible", html: (r, lk) => esc(r.product_id ? (lk.products.find(p => p.id === r.product_id) || {}).name || r.product_id
                                                 : r.category_id ? "Catégorie " + catName(lk, r.category_id) : "—") },
        { label: "Période", html: r => esc([r.start_date || "…", r.end_date || "…"].join(" → ")) },
        { label: "Statut", html: r => r.active ? badge("Active", "ok") : badge("Inactive", "off") }
      ],
      fields: lk => [
        { key: "title", label: "Titre", type: "text", required: true },
        { key: "description", label: "Description", type: "textarea" },
        { group: "Cible (un produit OU une catégorie)", key: "product_id", label: "Produit", type: "select",
          options: lk.products.map(p => [p.id, `${p.name} (${p.id})`]) },
        { key: "category_id", label: "Catégorie", type: "select", options: lk.categories.map(c => [c.id, c.name]) },
        { group: "Réduction (une seule)", key: "old_price", label: "Ancien prix (FCFA, barré)", type: "int", min: 0 },
        { key: "new_price", label: "Prix promotionnel (FCFA)", type: "int", min: 0 },
        { key: "discount_percent", label: "Remise en %", type: "decimal", min: 0.01, max: 100 },
        { key: "discount_amount", label: "Remise en FCFA", type: "int", min: 1 },
        { group: "Période et affichage", key: "start_date", label: "Début", type: "date" },
        { key: "end_date", label: "Fin", type: "date" },
        { key: "active", label: "Active", type: "bool", default: false },
        { key: "sort_order", label: "Ordre d'affichage", type: "int", default: 0 },
        { key: "image", label: "Image", type: "image" }
      ],
      validate(v) {
        if (v.product_id && v.category_id) return "Choisissez un produit OU une catégorie, pas les deux.";
        if ([v.new_price, v.discount_percent, v.discount_amount].filter(x => x != null).length > 1)
          return "Choisissez un seul type de réduction : prix promotionnel, pourcentage ou montant.";
        if (v.start_date && v.end_date && v.end_date < v.start_date) return "La date de fin doit suivre la date de début.";
        return null;
      }
    },

    gallery: {
      title: "Galerie", singular: "la photo", table: "gallery", pk: "id", folder: "gallery",
      canCreate: true, canDelete: true,
      intro: "Une photo de réalisation client n'est affichée qu'avec le consentement du client.",
      search: r => [r.title, r.alt, r.description, r.theme],
      columns: [
        { label: "", html: r => thumb(r.image) },
        { label: "Titre", html: r => `<strong>${esc(r.title || "Sans titre")}</strong>` },
        { label: "Thème", html: r => esc((GALLERY_THEMES.find(t => t[0] === r.theme) || [])[1] || "—") },
        { label: "Statut", html: r => [activeBadge(r.active), r.featured ? badge("En avant", "gold") : "",
            r.theme === "realisations_clients" && !r.client_consent ? badge("Sans consentement", "warn") : ""].join(" ") }
      ],
      fields: lk => [
        { key: "image", label: "Photo", type: "image", required: true },
        { key: "title", label: "Titre", type: "text" },
        { key: "alt", label: "Texte alternatif", type: "text", help: "Description courte de la photo (accessibilité)." },
        { key: "description", label: "Description", type: "textarea" },
        { key: "theme", label: "Thème", type: "select", options: GALLERY_THEMES },
        { key: "category_id", label: "Catégorie liée", type: "select", options: lk.categories.map(c => [c.id, c.name]) },
        { key: "product_id", label: "Produit lié", type: "select", options: lk.products.map(p => [p.id, `${p.name} (${p.id})`]) },
        { key: "event_id", label: "Événement lié", type: "select", options: lk.events.map(e => [e.id, e.name]) },
        { key: "client_consent", label: "Consentement du client (droit à l'image)", type: "bool", default: false },
        { key: "featured", label: "Mise en avant", type: "bool", default: false },
        { key: "active", label: "Visible", type: "bool", default: true },
        { key: "sort_order", label: "Ordre d'affichage", type: "int", default: 0 }
      ]
    },

    settings: {
      title: "Paramètres", singular: "le paramètre", table: "site_settings", pk: "key",
      canCreate: false, canDelete: false,
      orderBy: [["group_name"], ["key"]],
      intro: "Les paramètres « Masqué » ne sont jamais lisibles par le site public.",
      search: r => [r.key, r.description, r.group_name, JSON.stringify(r.value)],
      columns: [
        { label: "Clé", html: r => `<code>${esc(r.key)}</code>` },
        { label: "Groupe", html: r => esc(r.group_name || "—") },
        { label: "Valeur", html: r => `<span class="clip">${esc(settingPreview(r.value))}</span>` },
        { label: "Statut", html: r => [r.is_public ? badge("Public", "ok") : badge("Masqué", "off"),
            r.validation_status === "validated" ? badge("Validé", "ok") : badge("À valider", "warn")].join(" ") }
      ],
      fields: () => [
        { key: "key", label: "Clé", type: "text", required: true, readonlyOnEdit: true },
        { key: "description", label: "Description", type: "readonly" },
        { key: "value", label: "Valeur", type: "setting" },
        { key: "group_name", label: "Groupe", type: "text" },
        { key: "is_public", label: "Visible par le site public", type: "bool", default: true },
        { key: "validation_status", label: "Validation", type: "select", required: true, default: "pending",
          options: [["pending", "À valider"], ["validated", "Validé"]] }
      ]
    }
  };

  function settingPreview(value) {
    if (value === null || value === undefined) return "(vide)";
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  /* ---------- Rendu des champs ---------- */

  function fieldHtml(f, value, editing) {
    const id = "f-" + f.key;
    const req = f.required ? ` <span class="req" title="Obligatoire">*</span>` : "";
    const help = f.help ? `<small class="help">${esc(f.help)}</small>` : "";
    const ro = editing && f.readonlyOnEdit ? " readonly" : "";
    const v = value ?? "";
    switch (f.type) {
      case "bool":
        return `<label class="check"><input type="checkbox" id="${id}" name="${f.key}"${value ? " checked" : ""}> ${esc(f.label)}</label>${help}`;
      case "textarea":
        return `<label for="${id}">${esc(f.label)}${req}</label><textarea id="${id}" name="${f.key}" rows="4">${esc(v)}</textarea>${help}`;
      case "readonly":
        return `<label>${esc(f.label)}</label><p class="readonly">${esc(v || "—")}</p>`;
      case "select": {
        const opts = [`<option value="">— Aucun —</option>`].concat(f.options.map(([val, text]) =>
          `<option value="${esc(val)}"${String(val) === String(v) ? " selected" : ""}>${esc(text)}</option>`));
        if (v !== "" && !f.options.some(([val]) => String(val) === String(v)))
          opts.push(`<option value="${esc(v)}" selected>${esc(v)}</option>`);
        return `<label for="${id}">${esc(f.label)}${req}</label><select id="${id}" name="${f.key}">${opts.join("")}</select>${help}`;
      }
      case "tristate": {
        const cur = value === true ? "true" : value === false ? "false" : "";
        const o = [["", "Non précisé"], ["true", "Oui"], ["false", "Non"]]
          .map(([val, text]) => `<option value="${val}"${val === cur ? " selected" : ""}>${text}</option>`).join("");
        return `<label for="${id}">${esc(f.label)}</label><select id="${id}" name="${f.key}">${o}</select>${help}`;
      }
      case "int":
      case "decimal": {
        const step = f.type === "int" ? "1" : "0.01";
        const min = f.min != null ? ` min="${f.min}"` : "", max = f.max != null ? ` max="${f.max}"` : "";
        return `<label for="${id}">${esc(f.label)}${req}</label><input type="number" id="${id}" name="${f.key}" step="${step}"${min}${max} value="${esc(v)}">${help}`;
      }
      case "date":
        return `<label for="${id}">${esc(f.label)}${req}</label><input type="date" id="${id}" name="${f.key}" value="${esc(v)}">${help}`;
      case "image":
        return `<label for="${id}">${esc(f.label)}${req}</label>
          <div class="image-field" data-image="${f.key}">
            <div class="image-preview">${resolveImage(v) ? `<img src="${esc(resolveImage(v))}" alt="Aperçu">` : `<span>Aucune image</span>`}</div>
            <div class="image-controls">
              <input type="file" accept="${Object.keys(IMAGE_TYPES).join(",")}" data-file-for="${f.key}">
              <small class="help">JPEG, PNG, WebP ou AVIF — 5 Mo maximum. L'image est envoyée à l'enregistrement.</small>
              <input type="text" id="${id}" name="${f.key}" value="${esc(v)}" placeholder="Chemin ou URL de l'image">
              <small class="help">Ou saisissez un chemin existant, ex. « assets/images/product-baguette.jpg ».</small>
            </div>
          </div>`;
      case "setting": {
        const isText = value === null || value === undefined || typeof value === "string";
        const text = isText ? (value ?? "") : JSON.stringify(value, null, 2);
        return `<label for="${id}">${esc(f.label)}</label>
          <textarea id="${id}" name="${f.key}" rows="${isText ? 3 : 8}" data-mode="${isText ? "text" : "json"}"
            data-was-null="${value === null || value === undefined ? "1" : ""}"${isText ? "" : ' class="mono"'}>${esc(text)}</textarea>
          <small class="help">${isText ? "Texte simple." : "Format JSON : conservez les accolades, guillemets et virgules."}</small>`;
      }
      default: {
        const pat = f.pattern ? ` data-pattern="1"` : "";
        return `<label for="${id}">${esc(f.label)}${req}</label><input type="text" id="${id}" name="${f.key}" value="${esc(v)}"${ro}${pat}>${help}`;
      }
    }
  }

  // Lit et contrôle les valeurs du formulaire ; renvoie { values } ou { error }
  function readForm(form, fields, editing) {
    const values = {};
    for (const f of fields) {
      if (f.type === "readonly") continue;
      if (editing && f.readonlyOnEdit) continue;               // clé primaire : jamais réécrite
      const el = form.elements[f.key];
      if (!el) continue;
      let v;
      switch (f.type) {
        case "bool": v = el.checked; break;
        case "tristate": v = el.value === "" ? null : el.value === "true"; break;
        case "int":
        case "decimal": {
          const raw = el.value.trim();
          if (raw === "") { v = null; break; }
          v = Number(raw);
          if (!Number.isFinite(v) || (f.type === "int" && !Number.isInteger(v)))
            return { error: `« ${f.label} » : nombre ${f.type === "int" ? "entier " : ""}attendu.` };
          if (f.min != null && v < f.min) return { error: `« ${f.label} » doit être au moins ${f.min}.` };
          if (f.max != null && v > f.max) return { error: `« ${f.label} » doit être au plus ${f.max}.` };
          break;
        }
        case "setting": {
          const raw = el.value.trim();
          if (el.dataset.mode === "json") {
            try { v = JSON.parse(raw); } catch (e) { return { error: "La valeur n'est pas un JSON valide." }; }
            if (v === null || typeof v !== "object") return { error: "La valeur doit rester un objet JSON { … }." };
          } else {
            if (raw === "" && el.dataset.wasNull) continue;     // valeur encore à fournir : inchangée
            v = raw;
          }
          break;
        }
        default: {
          v = el.value.trim();
          if (v === "") v = null;
        }
      }
      if (f.required && (v === null || v === "") && f.type !== "image")
        return { error: `« ${f.label} » est obligatoire.` };
      if (v && f.pattern && !f.pattern.test(v)) return { error: `« ${f.label} » : format invalide.` };
      values[f.key] = v;
    }
    return { values };
  }

  /* ---------- Vues ---------- */

  const main = () => $("#main");

  function setView(html) {
    main().innerHTML = html;
    main().focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function loading(title) {
    setView(`<header class="page-head"><h1>${esc(title)}</h1></header><p class="muted">Chargement…</p>`);
  }

  function showLoadError(title, err) {
    setView(`<header class="page-head"><h1>${esc(title)}</h1></header>
      <p class="alert">${esc(describeError(err))}</p>
      <button class="btn" type="button" onclick="location.reload()">Réessayer</button>`);
  }

  async function renderDashboard() {
    loading("Tableau de bord");
    const countOf = async (table, filter) => {
      let q = sb.from(table).select("*", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [prod, prodHidden, prodPending, cats, catsHidden, events, promos, gallery, settingsPending] = await Promise.all([
        countOf("products"),
        countOf("products", q => q.eq("published", false)),
        countOf("products", q => q.eq("validation_status", "pending")),
        countOf("categories"),
        countOf("categories", q => q.eq("active", false)),
        countOf("events"),
        countOf("promotions", q => q.eq("active", true).or(`end_date.is.null,end_date.gte.${today}`)),
        countOf("gallery"),
        countOf("site_settings", q => q.eq("validation_status", "pending"))
      ]);
      const card = (href, label, value, note) => `<a class="stat" href="#${href}">
          <span class="stat-label">${esc(label)}</span><strong>${esc(value)}</strong>
          ${note ? `<small>${esc(note)}</small>` : ""}</a>`;
      setView(`<header class="page-head"><h1>Tableau de bord</h1></header>
        <div class="stats">
          ${card("products", "Produits", prod, `${prodHidden} masqué(s) · ${prodPending} prix à valider`)}
          ${card("categories", "Catégories", cats, catsHidden ? `${catsHidden} masquée(s)` : "toutes visibles")}
          ${card("events", "Événements", events, "")}
          ${card("promotions", "Promotions actives", promos, "")}
          ${card("gallery", "Photos en galerie", gallery, "")}
          ${card("settings", "Paramètres à valider", settingsPending, "")}
        </div>
        <section class="panel">
          <h2>Bon à savoir</h2>
          <ul>
            <li>Le site public se met à jour automatiquement : une modification apparaît au plus tard au <strong>deuxième rechargement</strong> d'une page du site (mise en cache).</li>
            <li>Les images envoyées ici sont stockées dans Supabase (5 Mo maximum, JPEG, PNG, WebP ou AVIF).</li>
            <li>Les images du dossier <code>assets/images/</code> du site ne sont jamais supprimées depuis l'administration.</li>
          </ul>
        </section>`);
    } catch (err) { showLoadError("Tableau de bord", err); }
  }

  async function renderList(key, res) {
    loading(res.title);
    let rows, lk;
    try {
      [rows, lk] = await Promise.all([
        fetchAll(res.table, "*", res.orderBy || [["sort_order"], [res.pk]]),
        loadLookups()
      ]);
    } catch (err) { return showLoadError(res.title, err); }

    const catFilter = res.filterByCategory
      ? `<select id="list-cat" aria-label="Filtrer par catégorie"><option value="">Toutes les catégories</option>
          ${lk.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>` : "";
    setView(`<header class="page-head">
        <h1>${esc(res.title)}</h1>
        ${res.canCreate ? `<a class="btn btn-primary" href="#${key}/new">+ Ajouter</a>` : ""}
      </header>
      ${res.intro ? `<p class="muted">${esc(res.intro)}</p>` : ""}
      <div class="toolbar">
        <input type="search" id="list-search" placeholder="Rechercher…" aria-label="Rechercher">
        ${catFilter}
        <span id="list-count" class="muted"></span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr>${res.columns.map(c => `<th>${esc(c.label)}</th>`).join("")}<th class="actions">Actions</th></tr></thead>
        <tbody id="list-body"></tbody>
      </table></div>`);

    const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const draw = () => {
      const q = norm($("#list-search").value.trim());
      const cat = res.filterByCategory ? $("#list-cat").value : "";
      const shown = rows.filter(r => (!cat || r.category_id === cat) &&
        (!q || res.search(r, lk).some(s => norm(s).includes(q))));
      $("#list-count").textContent = `${shown.length} / ${rows.length}`;
      $("#list-body").innerHTML = shown.length ? shown.map(r => {
        const id = encodeURIComponent(r[res.pk]);
        return `<tr>${res.columns.map(c => `<td data-label="${esc(c.label)}">${c.html(r, lk)}</td>`).join("")}
          <td class="actions">
            <a class="btn btn-small" href="#${key}/edit/${id}">Modifier</a>
            ${res.canDelete ? `<button class="btn btn-small btn-danger" type="button" data-delete="${esc(r[res.pk])}">Supprimer</button>` : ""}
          </td></tr>`;
      }).join("") : `<tr><td colspan="${res.columns.length + 1}" class="empty">Aucun élément.</td></tr>`;
    };
    $("#list-search").addEventListener("input", draw);
    if (res.filterByCategory) $("#list-cat").addEventListener("change", draw);
    $("#list-body").addEventListener("click", async e => {
      const btn = e.target.closest("[data-delete]");
      if (!btn) return;
      const row = rows.find(r => String(r[res.pk]) === btn.dataset.delete);
      if (row && await deleteRow(res, row)) { rows = rows.filter(r => r !== row); draw(); }
    });
    draw();
  }

  async function deleteRow(res, row) {
    const name = row.name || row.title || row[res.pk];
    const warn = res.deleteWarning ? "\n\n" + res.deleteWarning : "";
    if (!window.confirm(`Supprimer définitivement ${res.singular} « ${name} » ?${warn}`)) return false;
    const { data, error } = await sb.from(res.table).delete().eq(res.pk, row[res.pk]).select(res.pk);
    if (error || !data || !data.length) {
      toast(error ? describeError(error) : "Suppression refusée (droits insuffisants ou élément introuvable).", "error");
      return false;
    }
    await removeImageIfUnused(row.image);
    toast("Supprimé.");
    return true;
  }

  async function renderForm(key, res, id) {
    const editing = id != null;
    loading(res.title);
    let rows, lk, row = null;
    try {
      [rows, lk] = await Promise.all([
        fetchAll(res.table, "*", res.orderBy || [["sort_order"], [res.pk]]),
        loadLookups()
      ]);
      if (editing) {
        row = rows.find(r => String(r[res.pk]) === id);
        if (!row) throw new Error("Élément introuvable : " + id);
      }
    } catch (err) { return showLoadError(res.title, err); }

    const fields = res.fields(lk, rows);
    let group = null;
    const parts = [];
    for (const f of fields) {
      if (f.group && f.group !== group) {
        if (group !== null) parts.push("</fieldset>");
        group = f.group;
        parts.push(`<fieldset><legend>${esc(group)}</legend>`);
      }
      const value = editing ? row[f.key]
        : typeof f.default === "function" ? f.default() : f.default;
      parts.push(`<div class="field field-${f.type}">${fieldHtml(f, value, editing)}</div>`);
    }
    if (group !== null) parts.push("</fieldset>");

    const heading = editing
      ? `Modifier ${res.singular} « ${row.name || row.title || row[res.pk]} »`
      : `${res.title} — ajout`;
    setView(`<header class="page-head">
        <h1>${esc(heading)}</h1>
        <a class="btn" href="#${key}">← Retour à la liste</a>
      </header>
      <form id="edit-form" class="form" novalidate>
        <p id="form-error" class="alert" hidden></p>
        ${parts.join("")}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
          <a class="btn" href="#${key}">Annuler</a>
        </div>
      </form>`);

    const form = $("#edit-form");
    const pendingFiles = {};

    // Sélection d'image : contrôle immédiat + aperçu local
    $$("input[type=file][data-file-for]", form).forEach(input => {
      input.addEventListener("change", () => {
        const fieldKey = input.dataset.fileFor;
        const preview = $(`[data-image="${fieldKey}"] .image-preview`, form);
        const file = input.files[0];
        delete pendingFiles[fieldKey];
        if (!file) return;
        const problem = checkImageFile(file);
        if (problem) { input.value = ""; toast(problem, "error"); return; }
        pendingFiles[fieldKey] = file;
        const img = document.createElement("img");
        img.alt = "Aperçu";
        img.src = URL.createObjectURL(file);
        preview.replaceChildren(img);
      });
    });
    $$(".image-field input[type=text]", form).forEach(input => {
      input.addEventListener("change", () => {
        if (pendingFiles[input.name]) return;                  // le fichier choisi reste prioritaire
        const preview = $(`[data-image="${input.name}"] .image-preview`, form);
        const src = resolveImage(input.value);
        if (!src) { preview.innerHTML = "<span>Aucune image</span>"; return; }
        const img = document.createElement("img");
        img.alt = "Aperçu";
        img.src = src;
        preview.replaceChildren(img);
      });
    });

    if (res.enhanceForm) res.enhanceForm(form, { editing, rows, lk });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const errBox = $("#form-error");
      const showError = msg => { errBox.textContent = msg; errBox.hidden = false; errBox.scrollIntoView({ block: "center" }); };
      errBox.hidden = true;

      const { values, error } = readForm(form, fields, editing);
      if (error) return showError(error);
      for (const f of fields) {
        if (f.type === "image" && f.required && !values[f.key] && !pendingFiles[f.key])
          return showError(`« ${f.label} » est obligatoire.`);
      }
      const custom = res.validate && res.validate(values);
      if (custom) return showError(custom);

      const submit = $("button[type=submit]", form);
      submit.disabled = true;
      submit.textContent = "Enregistrement…";
      const uploaded = [];
      try {
        for (const [fieldKey, file] of Object.entries(pendingFiles)) {
          const up = await uploadImage(file, res.folder);
          uploaded.push(up.path);
          values[fieldKey] = up.url;
        }
        const q = editing
          ? sb.from(res.table).update(values).eq(res.pk, row[res.pk]).select()
          : sb.from(res.table).insert(values).select();
        const { data, error: saveError } = await q;
        if (saveError) throw saveError;
        if (!data || !data.length) throw new Error("Enregistrement refusé (droits insuffisants ou élément introuvable).");
      } catch (err) {
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded).catch(() => {});
        submit.disabled = false;
        submit.textContent = "Enregistrer";
        return showError(describeError(err));
      }
      // Image remplacée : l'ancienne est supprimée du bucket si plus rien ne l'utilise
      if (editing) {
        for (const f of fields) {
          if (f.type === "image" && row[f.key] && row[f.key] !== values[f.key]) await removeImageIfUnused(row[f.key]);
        }
      }
      toast("Enregistré.");
      location.hash = "#" + key;
    });
  }

  /* ---------- Navigation ---------- */

  function route() {
    if (!state.user) return;
    const decode = s => { try { return decodeURIComponent(s || ""); } catch (e) { return ""; } };
    const [section = "dashboard", action, id] = location.hash.replace(/^#/, "").split("/").map(decode);
    const current = RESOURCES[section] ? section : "dashboard";
    $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.section === current));
    const res = RESOURCES[section];
    if (!res) return renderDashboard();
    if (action === "new" && res.canCreate) return renderForm(section, res, null);
    if (action === "edit" && id) return renderForm(section, res, id);
    return renderList(section, res);
  }
  window.addEventListener("hashchange", route);

  /* ---------- Connexion / accès ---------- */

  function showLogin(message) {
    state.user = null;
    $("#boot").hidden = true;
    $("#admin-view").hidden = true;
    $("#main").innerHTML = "";
    $("#login-view").hidden = false;
    if (message) setLoginMessage(message);
  }

  async function enterIfAdmin(session) {
    const { data: isAdmin, error } = await sb.rpc("is_admin");
    if (error || isAdmin !== true) {
      await sb.auth.signOut();
      const notReady = error && /is_admin|function|schema cache/i.test(error.message || "");
      showLogin(error
        ? (notReady ? "L'administration n'est pas encore installée dans Supabase (script supabase/03_administration.sql)."
                    : "Vérification des droits impossible : " + describeError(error))
        : "Accès refusé : ce compte n'a pas les droits administrateur.");
      return;
    }
    state.user = session.user;
    $("#user-email").textContent = session.user.email || "";
    $("#boot").hidden = true;
    $("#login-view").hidden = true;
    $("#admin-view").hidden = false;
    setLoginMessage("");
    route();
  }

  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) return setLoginMessage("Saisissez votre e-mail et votre mot de passe.");
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    btn.textContent = "Connexion…";
    setLoginMessage("");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    form.elements.password.value = "";
    btn.disabled = false;
    btn.textContent = "Se connecter";
    if (error) {
      return setLoginMessage(/invalid login|invalid_credentials/i.test(error.message || error.code || "")
        ? "E-mail ou mot de passe incorrect."
        : /not confirmed/i.test(error.message || "") ? "Adresse e-mail non confirmée." : describeError(error));
    }
    await enterIfAdmin(data.session);
  });

  $("#logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    history.replaceState(null, "", location.pathname);
    showLogin("Vous êtes déconnecté.");
  });

  sb.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT" && state.user) showLogin("Session terminée : reconnectez-vous.");
  });

  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      if (data.session) await enterIfAdmin(data.session);
      else showLogin();
    } catch (err) {
      showLogin(describeError(err));
    }
  })();
})();
