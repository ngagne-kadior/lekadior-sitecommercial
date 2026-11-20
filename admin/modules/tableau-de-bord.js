/* =====================================================================
   LE KADIOR — MODULE « TABLEAU DE BORD »
   ---------------------------------------------------------------------
   - Administrateur : vue d'ensemble (équipe + site web).
   - Autres rôles : page d'accueil avec leurs rubriques.
   Les chiffres de gestion (production, caisse…) s'ajouteront ici au fil
   des modules.
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  if (KA.fatalMessage) return;
  const { esc, sb } = KA;

  const card = (href, label, value, note) => `<a class="stat" href="#${href}">
      <span class="stat-label">${esc(label)}</span><strong>${esc(value)}</strong>
      ${note ? `<small>${esc(note)}</small>` : ""}</a>`;

  async function countOf(table, filter) {
    let q = sb.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  }

  async function renderAdmin() {
    KA.loading("Tableau de bord");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [staff, staffInactive, prod, prodHidden, prodPending, cats, catsHidden, events, promos, gallery, settingsPending] = await Promise.all([
        countOf("profiles", q => q.neq("role", "user")),
        countOf("profiles", q => q.neq("role", "user").eq("active", false)),
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
      KA.setView(`<header class="page-head"><h1>Tableau de bord</h1></header>
        <h2 class="section-title">Gestion</h2>
        <div class="stats">
          ${card("equipe", "Équipe", staff, staffInactive ? `${staffInactive} désactivé(s)` : "comptes actifs")}
        </div>
        <h2 class="section-title">Site web</h2>
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
            <li>Les images du dossier <code>assets/images/</code> du site ne sont jamais supprimées depuis le logiciel.</li>
            <li>Les employés se connectent avec leur <strong>identifiant</strong> et leur mot de passe, créés dans la rubrique Équipe.</li>
          </ul>
        </section>`);
    } catch (err) { KA.showLoadError("Tableau de bord", err); }
  }

  function renderStaffHome() {
    const p = KA.state.profile;
    const mine = KA.modules.filter(m => m.id !== "dashboard" && KA.hasRole(m.roles));
    KA.setView(`<header class="page-head"><h1>Bonjour ${esc(p.full_name || p.username || "")}</h1></header>
      <p class="muted">Connecté en tant que <strong>${esc(KA.ROLES[p.role] || p.role)}</strong>.</p>
      ${mine.length
        ? `<div class="stats">${mine.map(m => card(m.id, m.group || "", m.label, "")).join("")}</div>`
        : `<section class="panel"><h2>Bientôt disponible</h2>
             <p>Les écrans de votre poste sont en cours de construction. Ils apparaîtront ici automatiquement.</p></section>`}`);
  }

  KA.register({
    id: "dashboard", label: "Tableau de bord", group: null, icon: "dashboard",
    // L'admin voit la vue d'ensemble. Pétrisseur, pâtissier et caissier n'ont pas
    // de tableau de bord : ils arrivent directement sur leur écran (comme dans Lovable).
    roles: ["gestionnaire", "livreur"],
    render() { return KA.isAdmin() ? renderAdmin() : renderStaffHome(); }
  });
})();
