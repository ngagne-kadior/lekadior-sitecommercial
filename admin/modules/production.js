/* =====================================================================
   LE KADIOR — MODULE « PRODUCTION »
   ---------------------------------------------------------------------
   Un seul écran, adapté au rôle (comme dans le logiciel Lovable) :
   - pétrisseur : boulangerie — sacs pétris, plats / plus, rendement ;
   - pâtissier  : pâtisserie — quantités produites ;
   - caissier   : saisie des RESTANTS (boulangerie + pâtisserie) ;
                  vendu = disponible − restant ; montant = vendu × prix ;
   - administrateur : tout, toutes sessions, corrections comprises.
   Les chiffres affichés aident la saisie ; la base les RECALCULE et
   applique les verrous (supabase/05 et 06).
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  if (KA.fatalMessage) return;
  const { $, $$, esc, sb } = KA;

  const ID = "production";
  const FRACTIONS = [
    ["0", "Aucune"], ["0.125", "3 bols (0,125)"], ["0.25", "1/4 sac (0,25)"],
    ["0.375", "1/4 + 3 bols (0,375)"], ["0.5", "1/2 sac (0,5)"], ["0.625", "1/2 + 3 bols (0,625)"],
    ["0.75", "3/4 sac (0,75)"], ["0.875", "3/4 + 3 bols (0,875)"]
  ];

  const nb = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const fmt = n => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
  const ui = { dirtyProd: new Set(), dirtyRest: new Set(), dirtySacs: false };

  function droits() {
    const role = KA.state.profile.role, admin = KA.isAdmin();
    return {
      admin,
      boulangerie: admin || role === "petrisseur" || role === "caissier",
      patisserie:  admin || role === "patissier" || role === "caissier",
      editBoul:    admin || role === "petrisseur",
      editPat:     admin || role === "patissier",
      editRest:    admin || role === "caissier",
      ventes:      admin || role === "caissier",          // prix, restant, vendu, montant
      sacs:        admin || role === "petrisseur"
    };
  }

  async function load(date, session, d) {
    const [vue, sacs] = await Promise.all([
      sb.rpc("kadior_production_vue", { p_date: date, p_session: session }),
      d.sacs ? sb.from("sacs_petris").select("sacs").eq("date", date).eq("session", session).maybeSingle()
             : Promise.resolve({ data: null })
    ]);
    if (vue.error) throw vue.error;
    if (sacs.error) throw sacs.error;
    return { lignes: vue.data || [], sacs: sacs.data ? nb(sacs.data.sacs) : 0 };
  }

  function sousTitre(d, session, date) {
    const role = KA.state.profile.role;
    const quoi = d.admin ? "Boulangerie et pâtisserie" : role === "caissier" ? "Saisie des restants"
      : role === "patissier" ? "Pâtisserie" : "Boulangerie";
    return `${quoi} — session ${session} du ${KA.longDate(date)}`;
  }

  async function render() {
    const d = droits();
    const forced = KA.isAdmin() ? null : (KA.state.profile.session || null);
    const J = KA.journee;
    J.date = J.date || KA.today();
    J.session = forced || J.session || KA.defaultSession();
    ui.dirtyProd.clear(); ui.dirtyRest.clear(); ui.dirtySacs = false;

    KA.loading("Production journalière");
    let data;
    try { data = await load(J.date, J.session, d); }
    catch (err) { return KA.showLoadError("Production journalière", err); }

    const pains = data.lignes.filter(l => l.categorie === "boulangerie");
    const pats = data.lignes.filter(l => l.categorie === "patisserie");
    const byId = Object.fromEntries(data.lignes.map(l => [l.produit_id, l]));
    const sacsEntiers = Math.floor(data.sacs + 1e-9);
    const sacsFraction = String(Number((data.sacs - sacsEntiers).toFixed(3)));
    // « Déjà enregistrée » : seulement pour ce que ce rôle saisit
    const dejaEnregistre = data.lignes.some(l => (l.categorie === "boulangerie" ? d.editBoul : d.editPat) && l.quantite_produite > 0)
      || (d.sacs && data.sacs > 0) || (d.editRest && data.lignes.some(l => l.restant != null));
    const sessions = forced ? [forced] : ["matin", "soir"];
    const initiales = n => String(n || "").split(/\s+/).map(m => m[0] || "").join("").toUpperCase().slice(0, 3);

    const input = (l, field, value, label, extra = "") =>
      `<input class="num" type="number" min="0" step="1" inputmode="numeric" data-field="${field}" data-id="${esc(l.produit_id)}"
         value="${esc(value)}" aria-label="${esc(label)} ${esc(l.nom)}"${extra}>`;
    const show = v => v ? esc(fmt(v)) : ``;

    // Restant : saisissable, ou verrouillé (déjà saisi par la caisse) pour un non-admin
    function restantCell(l) {
      if (!d.editRest) return l.restant == null ? `` : esc(fmt(l.restant));
      if (l.restant != null && !d.admin) {
        return `<span class="locked" title="Saisi par ${esc(l.restant_saisi_par_nom || "?")}">${esc(fmt(l.restant))}
          <span class="initials">${esc(initiales(l.restant_saisi_par_nom))}</span></span>`;
      }
      const v = l.restant == null ? "" : l.restant;
      return input(l, "restant", v, "Restant") +
        (l.restant != null ? ` <span class="initials" title="Saisi par ${esc(l.restant_saisi_par_nom || "?")}">${esc(initiales(l.restant_saisi_par_nom))}</span>` : "");
    }
    // Production verrouillée pour un non-admin dès que la caisse a saisi le restant
    const prodLocked = l => l.restant != null && !d.admin;

    /* ---------- Boulangerie ---------- */
    let boulHtml = "";
    if (d.boulangerie) {
      const head = `<th>Pain</th>${d.ventes ? "<th>Prix</th>" : ""}<th>Plats</th><th>Contenu / plat</th><th>Plus</th>
        <th>Total${d.ventes ? " produit" : ""}</th>${d.ventes ? "<th>Reste préc.</th><th>Restant</th><th>Vendu</th><th>Montant</th>" : ""}`;
      const rows = pains.map(l => {
        const canEdit = d.editBoul && !prodLocked(l);
        const contenuSaisi = !l.contenu_fixe && !l.sans_plats && l.contenu_par_plat ? l.contenu_par_plat : "";
        return `<tr>
          <td data-label="Pain" class="pain">${esc(l.nom)}</td>
          ${d.ventes ? `<td data-label="Prix">${esc(KA.fmtPrice(l.prix))}</td>` : ""}
          <td data-label="Plats">${l.sans_plats ? `` : canEdit ? input(l, "plats", l.nombre_plats || "", "Plats") : show(l.nombre_plats)}</td>
          <td data-label="Contenu / plat">${l.sans_plats ? ``
            : l.contenu_fixe ? `<strong>${esc(l.contenu_fixe)}</strong>`
            : canEdit ? input(l, "contenu", contenuSaisi, "Contenu par plat", ` placeholder="${esc(l.contenu_defaut)}"`) : show(l.contenu_par_plat)}</td>
          <td data-label="Plus">${canEdit ? input(l, "plus", l.plus || "", "Plus") : show(l.plus)}</td>
          <td data-label="Total" class="total" data-total="${esc(l.produit_id)}"></td>
          ${d.ventes ? `<td data-label="Reste préc.">${l.reste_precedent ? esc(fmt(l.reste_precedent)) : ``}</td>
            <td data-label="Restant">${restantCell(l)}</td>
            <td data-label="Vendu" class="strong" data-vendu="${esc(l.produit_id)}"></td>
            <td data-label="Montant" class="strong" data-montant="${esc(l.produit_id)}"></td>` : ""}
        </tr>`;
      }).join("");
      const cols = d.ventes ? 10 : 5;
      boulHtml = `<h2 class="prod-title">Boulangerie · ${esc(J.session.toUpperCase())}</h2>
        ${d.sacs ? `<div class="prod-card prod-sacs">
          <div class="field"><label for="sacs-entiers">Nombre de sacs pétris</label>
            <input type="number" id="sacs-entiers" min="0" step="1" inputmode="numeric" placeholder="ex : 5" value="${sacsEntiers || ""}"></div>
          <div class="field"><label for="sacs-fraction">Fraction de sac</label>
            <select id="sacs-fraction">${FRACTIONS.map(([v, t]) => `<option value="${v}"${v === sacsFraction ? " selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="pill">Total sacs pétris : <strong id="sacs-total">—</strong></div>
        </div>` : ""}
        <div class="table-wrap prod-table"><table class="table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${cols}" class="empty">Aucun pain actif.</td></tr>`}</tbody>
          ${d.ventes ? `<tfoot><tr><td colspan="${cols - 1}" class="foot-label">Total boulangerie ${esc(J.session)}</td>
            <td class="strong" id="total-boul"></td></tr></tfoot>` : ""}
        </table></div>
        ${d.sacs ? `<div class="rendement"><span>${d.admin ? "Rendement du jour" : "Votre rendement"}</span>
          <strong id="rendement">Saisissez les sacs pétris</strong></div>` : ""}`;
    }

    /* ---------- Pâtisserie ---------- */
    let patHtml = "";
    if (d.patisserie) {
      const head = `<th>Produit</th>${d.ventes ? "<th>Prix</th><th>Reste préc.</th>" : ""}<th>Production</th>
        ${d.ventes ? "<th>Total dispo.</th><th>Restant</th><th>Vendu</th><th>Montant</th>" : ""}`;
      const rows = pats.map(l => {
        const canEdit = d.editPat && !prodLocked(l);
        return `<tr>
          <td data-label="Produit" class="pain">${esc(l.nom)}</td>
          ${d.ventes ? `<td data-label="Prix">${esc(KA.fmtPrice(l.prix))}</td>
            <td data-label="Reste préc.">${l.reste_precedent ? esc(fmt(l.reste_precedent)) : ``}</td>` : ""}
          <td data-label="Production">${canEdit ? input(l, "quantite", l.quantite_produite || "", "Production") : show(l.quantite_produite)}</td>
          ${d.ventes ? `<td data-label="Total dispo." class="strong" data-total="${esc(l.produit_id)}"></td>
            <td data-label="Restant">${restantCell(l)}</td>
            <td data-label="Vendu" class="strong" data-vendu="${esc(l.produit_id)}"></td>
            <td data-label="Montant" class="strong" data-montant="${esc(l.produit_id)}"></td>` : ""}
        </tr>`;
      }).join("");
      const cols = d.ventes ? 8 : 2;
      patHtml = `<h2 class="prod-title">Pâtisserie · ${esc(J.session.toUpperCase())}</h2>
        <div class="table-wrap prod-table"><table class="table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${cols}" class="empty">Aucun produit actif.</td></tr>`}</tbody>
          ${d.ventes ? `<tfoot><tr><td colspan="${cols - 1}" class="foot-label">Total pâtisserie ${esc(J.session)}</td>
            <td class="strong" id="total-pat"></td></tr></tfoot>` : ""}
        </table></div>`;
    }

    KA.setView(`<div class="prod-wrap">
      <header class="page-head prod-head"><div>
        <h1>Production journalière</h1>
        <p class="muted sub">${esc(sousTitre(d, J.session, J.date))}</p>
      </div></header>

      <div class="prod-card prod-top">
        <div class="field"><label for="prod-date">Date de production</label>
          <input type="date" id="prod-date" value="${esc(J.date)}" max="${esc(KA.today())}"${d.admin ? "" : ` min="${KA.yesterday()}"`}></div>
        <div class="session-switch" role="group" aria-label="Session">
          ${sessions.map(s => `<button type="button" data-session="${s}" class="${s === J.session ? "on" : ""}">${s.toUpperCase()}</button>`).join("")}
        </div>
      </div>

      ${boulHtml}
      ${patHtml}

      ${d.ventes ? `<div class="rendement total-session"><span>Total ventes ${esc(J.session)}</span><strong id="total-session"></strong></div>` : ""}

      <div class="prod-actions">
        <button type="button" id="prod-save" class="btn btn-brown">${KA.state.profile.role === "caissier" ? "Enregistrer les restants" : "Enregistrer la production"}</button>
        ${dejaEnregistre ? `<span class="muted small">Session ${esc(J.session)} déjà enregistrée — l'enregistrement mettra à jour les données.</span>` : ""}
      </div>
      ${d.ventes ? `<p class="muted small">Un restant laissé vide compte comme <strong>tout vendu</strong>.${d.editRest && !d.admin ? " Un restant enregistré est verrouillé : seule l'administration peut le corriger." : ""}</p>` : ""}
    </div>`);

    const root = $(".prod-wrap");
    const val = (id, field) => { const el = $(`input[data-id="${CSS.escape(id)}"][data-field="${field}"]`, root); return el ? el.value.trim() : null; };
    const num = (id, field, fallback) => { const v = val(id, field); return v === null ? fallback : nb(v); };
    const contenuOf = l => l.sans_plats ? 0 : (l.contenu_fixe || nb(val(l.produit_id, "contenu")) || l.contenu_defaut);
    const produiteOf = l => l.categorie === "patisserie"
      ? num(l.produit_id, "quantite", l.quantite_produite)
      : (l.sans_plats ? 0 : num(l.produit_id, "plats", l.nombre_plats) * (val(l.produit_id, "plats") === null ? l.contenu_par_plat || contenuOf(l) : contenuOf(l)))
        + num(l.produit_id, "plus", l.plus);
    const restantOf = l => { const v = val(l.produit_id, "restant"); return v === null ? l.restant : (v === "" ? null : nb(v)); };
    const sacs = () => $("#sacs-entiers") ? nb($("#sacs-entiers").value) + nb($("#sacs-fraction").value) : data.sacs;

    function refresh() {
      let ponderes = 0, totB = 0, totP = 0;
      for (const l of data.lignes) {
        const prod = produiteOf(l);
        const dispo = l.reste_precedent + prod;
        const r = restantOf(l);
        const vendu = Math.max(dispo - (r == null ? 0 : r), 0);   // restant vide = tout vendu
        const montant = vendu * l.prix;
        if (l.categorie === "boulangerie") { ponderes += prod * nb(l.poids_rendement); totB += montant; } else totP += montant;
        const t = $(`[data-total="${CSS.escape(l.produit_id)}"]`, root);
        const tv = l.categorie === "patisserie" ? dispo : prod;
        if (t) t.textContent = tv ? fmt(tv) : "";
        const v = $(`[data-vendu="${CSS.escape(l.produit_id)}"]`, root);
        if (v) v.textContent = vendu ? fmt(vendu) : "";
        const m = $(`[data-montant="${CSS.escape(l.produit_id)}"]`, root);
        if (m) m.textContent = montant ? KA.fmtPrice(montant) : "";
        const inp = $(`input[data-id="${CSS.escape(l.produit_id)}"][data-field="restant"]`, root);
        if (inp) inp.classList.toggle("over", r != null && r > dispo);
      }
      if ($("#total-boul")) $("#total-boul").textContent = KA.fmtPrice(totB);
      if ($("#total-pat")) $("#total-pat").textContent = KA.fmtPrice(totP);
      if ($("#total-session")) $("#total-session").textContent = KA.fmtPrice(totB + totP);
      if ($("#sacs-total")) {
        const s = sacs();
        $("#sacs-total").textContent = s ? fmt(s) : "—";
        $("#rendement").textContent = s ? `${(ponderes / s).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} pains/sac` : "Saisissez les sacs pétris";
      }
    }

    root.addEventListener("input", e => {
      const el = e.target.closest("input[data-id]");
      if (el) (el.dataset.field === "restant" ? ui.dirtyRest : ui.dirtyProd).add(el.dataset.id);
      if (e.target.id === "sacs-entiers") ui.dirtySacs = true;
      refresh();
    });
    root.addEventListener("change", e => { if (e.target.id === "sacs-fraction") { ui.dirtySacs = true; refresh(); } });
    root.addEventListener("keydown", e => {
      if (e.key !== "Enter" || !e.target.matches('input[type="number"]')) return;
      e.preventDefault();
      const inputs = $$('input[type="number"]', root);
      const next = inputs[inputs.indexOf(e.target) + 1];
      if (next) { next.focus(); next.select(); }
    });

    const unsaved = () => ui.dirtyProd.size > 0 || ui.dirtyRest.size > 0 || ui.dirtySacs;
    $("#prod-date").addEventListener("change", e => {
      const v = e.target.value;
      if (!v || (unsaved() && !window.confirm("Quitter cette date et abandonner les modifications non enregistrées ?"))) { e.target.value = J.date; return; }
      J.date = v; render();
    });
    $$(".session-switch button", root).forEach(b => b.addEventListener("click", () => {
      if (b.dataset.session === J.session) return;
      if (unsaved() && !window.confirm("Changer de session et abandonner les modifications non enregistrées ?")) return;
      J.session = b.dataset.session; render();
    }));

    $("#prod-save").addEventListener("click", async () => {
      // Restant laissé vide = tout vendu (rien à enregistrer pour ce produit)
      if (!unsaved()) return KA.toast("Aucune modification saisie pour cette session.", "error");
      for (const el of $$("input[type=number]", root)) {
        if (el.value.trim() !== "" && (!Number.isInteger(Number(el.value)) || Number(el.value) < 0)) {
          el.focus();
          return KA.toast("Les quantités doivent être des nombres entiers positifs ou nuls.", "error");
        }
      }
      const depasse = data.lignes.find(l => { const r = restantOf(l); return r != null && r > l.reste_precedent + produiteOf(l); });
      if (depasse) return KA.toast(`Le restant de ${depasse.nom} dépasse le disponible.`, "error");
      if (dejaEnregistre && (ui.dirtyProd.size || ui.dirtySacs) &&
          !window.confirm(`Une production existe déjà pour la session ${J.session} du ${KA.longDate(J.date)}. Voulez-vous la modifier ?`)) return;
      if (ui.dirtyRest.size && !d.admin &&
          !window.confirm("Les restants enregistrés seront verrouillés (seule l'administration pourra les corriger). Confirmer ?")) return;

      const dirtyBoul = pains.filter(l => ui.dirtyProd.has(l.produit_id));
      const dirtyPat = pats.filter(l => ui.dirtyProd.has(l.produit_id));
      const restants = data.lignes.filter(l => ui.dirtyRest.has(l.produit_id))
        .map(l => ({ produit_id: l.produit_id, restant: val(l.produit_id, "restant") || null }));

      const btn = $("#prod-save");
      btn.disabled = true;
      btn.textContent = "Enregistrement…";
      const msgs = [];
      try {
        if (d.editBoul && (dirtyBoul.length || ui.dirtySacs)) {
          const r = await KA.rpc("kadior_enregistrer_production", {
            p_date: J.date, p_session: J.session, p_sacs: ui.dirtySacs ? sacs() : null,
            p_lignes: dirtyBoul.map(l => ({
              produit_id: l.produit_id,
              plats: l.sans_plats ? null : (val(l.produit_id, "plats") || null),
              contenu: l.sans_plats || l.contenu_fixe ? null : (val(l.produit_id, "contenu") || null),
              plus: val(l.produit_id, "plus") || null
            }))
          });
          msgs.push(`${r.lignes} pain(s)` + (r.rendement != null ? ` — rendement ${String(r.rendement).replace(".", ",")} pains/sac` : ""));
        }
        if (d.editPat && dirtyPat.length) {
          const r = await KA.rpc("kadior_enregistrer_patisserie", {
            p_date: J.date, p_session: J.session,
            p_lignes: dirtyPat.map(l => ({ produit_id: l.produit_id, quantite: val(l.produit_id, "quantite") || null }))
          });
          msgs.push(`${r.lignes} pâtisserie(s)`);
        }
        if (d.editRest && restants.length) {
          const r = await KA.rpc("kadior_enregistrer_restants", { p_date: J.date, p_session: J.session, p_lignes: restants });
          msgs.push(`${r.lignes} restant(s)`);
        }
        KA.toast(`Session ${J.session} enregistrée : ${msgs.join(" · ") || "aucun changement"}`);
        render();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = KA.state.profile.role === "caissier" ? "Enregistrer les restants" : "Enregistrer la production";
        KA.toast((msgs.length ? `Enregistré : ${msgs.join(" · ")}. ` : "") + KA.describeError(err), "error");
        if (msgs.length) render();
      }
    });

    refresh();
  }

  KA.register({
    id: ID, label: "Production", group: "Gestion", icon: "production",
    roles: ["petrisseur", "patissier", "caissier"],
    render
  });
})();
