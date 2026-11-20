/* =====================================================================
   LE KADIOR — LOGICIEL DE GESTION : NOYAU COMMUN
   ---------------------------------------------------------------------
   Chargé en premier. Expose window.KA (Kadior Admin), utilisé par tous
   les modules : client Supabase, outils, messages, images, formulaires.

   - Configuration : data/supabase-config.js (clé PUBLIQUE uniquement).
   - La sécurité réelle est dans la base (RLS + fonctions SQL) : même en
     contournant cette interface, un compte ne peut faire que ce que son
     rôle autorise.
   Aucun mot de passe, aucune clé secrète n'est stocké dans ce fichier.
   ===================================================================== */

(function () {
  "use strict";

  const KA = window.KA = {};

  /* ---------- Constantes ---------- */

  KA.BUCKET = "lekadior-images";
  KA.MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  KA.IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
  KA.IMAGE_TABLES = ["products", "categories", "events", "promotions", "gallery", "news"];
  // Les employés se connectent avec un identifiant : « adja » → adja@equipe.lekadior.local
  KA.LOGIN_DOMAIN = "equipe.lekadior.local";

  // Rôles (doivent correspondre à la contrainte profiles_role_check de la base)
  KA.ROLES = {
    admin:        "Administrateur",
    gestionnaire: "Gestionnaire",
    caissier:     "Caissier",
    livreur:      "Livreur",
    petrisseur:   "Pétrisseur",
    patissier:    "Pâtissier",
    user:         "Sans rôle"
  };
  // Rôles attribuables depuis le logiciel (jamais « admin »)
  KA.STAFF_ROLES = ["gestionnaire", "caissier", "livreur", "petrisseur", "patissier"];

  /* ---------- Outils DOM ---------- */

  const $ = KA.$ = (sel, root = document) => root.querySelector(sel);
  KA.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = KA.esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  KA.norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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

  // Message bloquant affiché par app.js si la configuration est inutilisable
  KA.fatalMessage = null;
  if (!SUPA_URL || !SUPA_KEY) {
    KA.fatalMessage = "Supabase n'est pas configuré (data/supabase-config.js).";
  } else if (isSecretKey(SUPA_KEY)) {
    KA.fatalMessage = "Clé secrète détectée dans data/supabase-config.js : remplacez-la par la clé publique (anon / publishable).";
  } else if (!window.supabase || typeof window.supabase.createClient !== "function") {
    KA.fatalMessage = "La bibliothèque Supabase n'a pas pu être chargée. Vérifiez la connexion Internet puis rechargez la page.";
  }
  if (KA.fatalMessage) return;

  const sb = KA.sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const PUBLIC_PREFIX = sb.storage.from(KA.BUCKET).getPublicUrl("").data.publicUrl.replace(/\/?$/, "/");

  // Utilisateur connecté : { id, email, role, full_name, username }
  KA.state = { user: null, profile: null };
  KA.isAdmin = () => KA.state.profile?.role === "admin";
  KA.hasRole = roles => !!KA.state.profile && (KA.isAdmin() || roles.includes(KA.state.profile.role));

  /* ---------- Messages ---------- */

  let toastTimer;
  KA.toast = function (message, type = "success") {
    const el = $("#toast");
    el.textContent = message;
    el.className = "toast toast-" + type;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, type === "error" ? 7000 : 3500);
  };

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
    site_settings_validation_check: "Statut de validation invalide.",
    profiles_role_check: "Rôle invalide."
  };

  KA.describeError = function (err) {
    if (!err) return "Erreur inconnue.";
    if (err.detailed) return err.message;                   // message déjà détaillé : affiché tel quel
    const msg = String(err.message || err);
    const code = err.code || "";
    for (const [name, text] of Object.entries(CONSTRAINT_MESSAGES)) if (msg.includes(name)) return text;
    // Messages rédigés en français par les fonctions SQL du logiciel : affichés tels quels
    if (code === "22023" || code === "P0002") return msg;
    if (code === "23505") return /identifiant/i.test(msg) ? msg : "Cette valeur existe déjà (identifiant, nom ou clé en double).";
    if (code === "23503") return "Opération impossible : cet élément est lié à d'autres données (ex. une catégorie qui contient encore des produits).";
    if (code === "23502") return "Un champ obligatoire est vide.";
    if (code === "23514") return "Valeur refusée par une règle de la base de données.";
    if (code === "42501" || /row-level security|permission denied/i.test(msg))
      return /administrat/i.test(msg) ? msg : "Action refusée : votre rôle ne le permet pas.";
    if (code === "PGRST202" || /Could not find the function|schema cache/i.test(msg))
      return "Fonction absente de la base : exécutez le dernier script du dossier supabase/ dans le SQL Editor.";
    if (/JWT|expired|refresh token/i.test(msg)) return "Session expirée : reconnectez-vous.";
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Connexion à Supabase impossible. Vérifiez votre connexion Internet.";
    return msg;
  };

  /* ---------- Formats ---------- */

  KA.fmtPrice = n => Number(n).toLocaleString("fr-FR") + " FCFA";
  KA.fmtNombre = n => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

  /* ---------- Dates et sessions (heure locale = heure de Dakar) ---------- */

  const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  KA.today = () => isoDay(new Date());
  KA.yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDay(d); };
  KA.longDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  // Session par défaut : celle de l'employé, sinon matin avant 15 h et soir après
  KA.defaultSession = () => KA.state.profile.session || (new Date().getHours() < 15 ? "matin" : "soir");
  // Date et session partagées entre Production et Caisse
  KA.journee = { date: null, session: null };
  KA.badge = (text, kind) => `<span class="badge badge-${kind}">${esc(text)}</span>`;
  KA.activeBadge = on => on ? KA.badge("Visible", "ok") : KA.badge("Masqué", "off");
  KA.nextId = function (rows, prefix, width) {
    const re = new RegExp("^" + prefix + "(\\d+)$");
    const max = rows.reduce((m, r) => { const x = re.exec(String(r.id)); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return prefix + String(max + 1).padStart(width, "0");
  };

  /* ---------- Images ---------- */

  KA.resolveImage = function (value) {
    const v = String(value || "").trim();
    if (!v) return "";
    if (/^(https?:|blob:|data:image\/)/i.test(v)) return v;
    return "../" + v.replace(/^\/+/, "");                    // chemins du site : assets/images/…
  };

  KA.thumb = function (value) {
    const src = KA.resolveImage(value);
    return src
      ? `<img class="thumb" src="${esc(src)}" alt="" loading="lazy" onerror="this.classList.add('thumb-missing')">`
      : `<span class="thumb thumb-empty" aria-hidden="true"></span>`;
  };

  KA.checkImageFile = function (file) {
    if (!KA.IMAGE_TYPES[file.type]) return "Format non accepté : utilisez JPEG, PNG, WebP ou AVIF.";
    if (file.size > KA.MAX_IMAGE_SIZE) return `Image trop lourde (${(file.size / 1048576).toFixed(1)} Mo) : 5 Mo maximum.`;
    if (file.size === 0) return "Fichier vide.";
    return null;
  };

  KA.uploadImage = async function (file, folder) {
    const problem = KA.checkImageFile(file);
    if (problem) throw new Error(problem);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${folder}/${Date.now()}-${rand}.${KA.IMAGE_TYPES[file.type]}`;
    const fileInfo = { name: file.name, type: file.type, size: file.size };

    // 1. Lecture du fichier en mémoire : une erreur ici vient du fichier local, pas de Supabase
    let body;
    try {
      body = new Blob([await file.arrayBuffer()], { type: file.type });
    } catch (readError) {
      console.error("[Kadior] Lecture du fichier impossible", { path, file: fileInfo,
        name: readError && readError.name, message: readError && readError.message });
      throw Object.assign(new Error(`Le navigateur n'a pas pu lire le fichier « ${file.name} » (${readError && readError.name}: ${readError && readError.message}). ` +
        "Copiez l'image dans un dossier local (hors synchronisation), puis sélectionnez-la à nouveau."), { detailed: true });
    }

    // 2. Envoi vers Supabase Storage
    const { error } = await sb.storage.from(KA.BUCKET).upload(path, body, {
      contentType: file.type, cacheControl: "31536000", upsert: false
    });
    if (error) {
      console.error("[Kadior] Échec de l'envoi Storage", { bucket: KA.BUCKET, path, file: fileInfo,
        status: error.status, statusCode: error.statusCode, name: error.name, message: error.message });
      const status = error.statusCode || error.status;
      throw Object.assign(new Error(`Envoi de l'image impossible (${path}${status ? ", HTTP " + status : ""}) : ` +
        `${error.message || error.name} — ${KA.describeError(error)}`), { detailed: true });
    }
    return { path, url: sb.storage.from(KA.BUCKET).getPublicUrl(path).data.publicUrl };
  };

  // Chemin dans le bucket si l'URL désigne une image envoyée depuis le logiciel, sinon null
  // (les images du dossier assets/images/ du site ne sont JAMAIS supprimées)
  function bucketPath(url) {
    const v = String(url || "");
    if (!v.startsWith(PUBLIC_PREFIX)) return null;
    return decodeURIComponent(v.slice(PUBLIC_PREFIX.length).split("?")[0]) || null;
  }

  // Supprime une ancienne image du bucket si plus aucune ligne ne l'utilise
  KA.removeImageIfUnused = async function (url) {
    const path = bucketPath(url);
    if (!path) return;
    try {
      for (const table of KA.IMAGE_TABLES) {
        const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq("image", url);
        if (error) return;                                    // doute → on conserve l'image
        if (count > 0) return;
      }
      await sb.storage.from(KA.BUCKET).remove([path]);
    } catch (e) { /* suppression facultative : on conserve l'image */ }
  };

  /* ---------- Données ---------- */

  KA.fetchAll = async function (table, columns = "*", orderBy = [["sort_order"], ["id"]]) {
    let q = sb.from(table).select(columns);
    for (const [col] of orderBy) q = q.order(col, { ascending: true, nullsFirst: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  };

  // Appel d'une fonction SQL ; lève l'erreur pour être affichée par l'appelant
  KA.rpc = async function (name, params) {
    const { data, error } = await sb.rpc(name, params);
    if (error) throw error;
    return data;
  };

  /* ---------- Vues ---------- */

  const main = () => $("#main");

  KA.setView = function (html) {
    main().innerHTML = html;
    main().focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };

  KA.loading = title => KA.setView(`<header class="page-head"><h1>${esc(title)}</h1></header><p class="muted">Chargement…</p>`);

  KA.showLoadError = function (title, err) {
    KA.setView(`<header class="page-head"><h1>${esc(title)}</h1></header>
      <p class="alert">${esc(KA.describeError(err))}</p>
      <button class="btn" type="button" onclick="location.reload()">Réessayer</button>`);
  };

  /* ---------- Formulaires : rendu des champs ---------- */

  KA.fieldHtml = function (f, value, editing) {
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
        const opts = (f.noEmpty ? [] : [`<option value="">— Aucun —</option>`]).concat(f.options.map(([val, text]) =>
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
      case "password":
        return `<label for="${id}">${esc(f.label)}${req}</label><input type="password" id="${id}" name="${f.key}" autocomplete="new-password" minlength="8">${help}`;
      case "image":
        return `<label for="${id}">${esc(f.label)}${req}</label>
          <div class="image-field" data-image="${f.key}">
            <div class="image-preview">${KA.resolveImage(v) ? `<img src="${esc(KA.resolveImage(v))}" alt="Aperçu">` : `<span>Aucune image</span>`}</div>
            <div class="image-controls">
              <input type="file" accept="${Object.keys(KA.IMAGE_TYPES).join(",")}" data-file-for="${f.key}">
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
        const auto = f.autocomplete ? ` autocomplete="${esc(f.autocomplete)}"` : "";
        return `<label for="${id}">${esc(f.label)}${req}</label><input type="text" id="${id}" name="${f.key}" value="${esc(v)}"${ro}${pat}${auto}>${help}`;
      }
    }
  };

  // Lit et contrôle les valeurs du formulaire ; renvoie { values } ou { error }
  KA.readForm = function (form, fields, editing) {
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
        case "password": v = el.value === "" ? null : el.value; break;   // jamais « nettoyé »
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
      if (v && f.pattern && !f.pattern.test(v)) return { error: `« ${f.label} » : ${f.patternMessage || "format invalide."}` };
      values[f.key] = v;
    }
    return { values };
  };

  // Rendu d'une liste de champs, regroupés en <fieldset> selon « group »
  KA.fieldsHtml = function (fields, valueOf, editing) {
    let group = null;
    const parts = [];
    for (const f of fields) {
      if (f.group && f.group !== group) {
        if (group !== null) parts.push("</fieldset>");
        group = f.group;
        parts.push(`<fieldset><legend>${esc(group)}</legend>`);
      }
      parts.push(`<div class="field field-${f.type || "text"}">${KA.fieldHtml(f, valueOf(f), editing)}</div>`);
    }
    if (group !== null) parts.push("</fieldset>");
    return parts.join("");
  };

  /* ---------- Modules ---------- */
  // Chaque module déclare : { id, label, group, icon, roles, render(action, id) }
  // - roles : rôles autorisés (l'administrateur a toujours accès) ;
  // - le menu et la navigation n'affichent que les modules du rôle connecté.
  KA.modules = [];
  KA.register = mod => { KA.modules.push(mod); };

  // Icônes du menu (traits SVG)
  KA.icons = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    products: '<path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    categories: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    events: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    promotions: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    production: '<path d="M4 15c0-4 3.6-7 8-7s8 3 8 7v2H4v-2Z"/><path d="M8 11.5 9 17M12 10.5V17M16 11.5 15 17"/><path d="M3 20h18"/>',
    caisse: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/><path d="M7 6V4h10v2"/>',
    team: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19"/>'
  };
  KA.icon = name => `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${KA.icons[name] || ""}</svg>`;
})();
