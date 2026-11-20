/* =====================================================================
   LE KADIOR — MODULE « SITE WEB »
   ---------------------------------------------------------------------
   Rubriques qui pilotent le site public : produits, catégories,
   événements, promotions, galerie, paramètres.
   Accès : administrateur uniquement (contrôlé aussi par la base).
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  if (KA.fatalMessage) return;
  const { esc, thumb, badge, activeBadge, fmtPrice, nextId } = KA;
  const catName = (lk, id) => KA.catName(lk, id);

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

  // Menu : groupe « Site web », dans cet ordre
  const MENU = [
    ["products",   "Produits",    "products"],
    ["categories", "Catégories",  "categories"],
    ["events",     "Événements",  "events"],
    ["promotions", "Promotions",  "promotions"],
    ["gallery",    "Galerie",     "gallery"],
    ["settings",   "Paramètres",  "settings"]
  ];
  for (const [id, label, icon] of MENU) {
    KA.register(KA.crudModule(Object.assign({}, RESOURCES[id], { id, label, icon, group: "Site web", roles: [] })));
  }
})();
