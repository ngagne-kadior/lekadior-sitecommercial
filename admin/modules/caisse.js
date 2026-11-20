/* =====================================================================
   LE KADIOR — MODULE « CAISSE » (version simple)
   ---------------------------------------------------------------------
   Reprend la caisse du logiciel Lovable, sans dettes, crédits,
   livraisons, abonnements ni versements différés (modules à venir) :
   - ventes boutique (espèces) = boulangerie + pâtisserie (vendus calculés
     en Production ; restant vide = tout vendu) + monnaie de départ ;
   - total dépenses = 12 postes + Wave + Orange Money + Wave Direct
     + dépenses produits (catalogue) ;
   - montant à verser = ventes − dépenses ; état = versement − à verser.
   Seul le caissier saisit ; l'administrateur seulement si le caissier
   de la session est déclaré absent. La base RECALCULE tout à
   l'enregistrement (supabase/06_restants_et_caisse.sql).
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  if (KA.fatalMessage) return;
  const { $, $$, esc, sb } = KA;

  const ID = "caisse";
  const POSTES_DEPENSES = [
    ["dep_abonnement", "Abonnement"], ["dep_ration", "Ration"], ["dep_journee", "Journée"],
    ["dep_glace", "Glace"], ["dep_offert", "Offert"], ["dep_frais_boulanger", "Frais Boulanger"],
    ["dep_madar", "Madar"], ["dep_divers", "Divers"], ["dep_frais_patisserie", "Frais Pâtisserie"],
    ["dep_retour", "Retour"], ["dep_transport", "Transport"], ["dep_commission", "Commission"]
  ];
  const POSTES_ENCAISSEMENT = [["wave", "Wave"], ["wave_direct", "Wave Direct"], ["orange_money", "Orange Money"]];
  const POSTES = POSTES_DEPENSES.concat(POSTES_ENCAISSEMENT);

  const nb = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const F = n => KA.fmtPrice(Math.round(n));
  const libelleEtat = e => e > 0 ? `${F(e)} · Excédent` : e < 0 ? `-${F(Math.abs(e))} · Manquant` : "Équilibré";
  const classeEtat = e => e < 0 ? "etat-neg" : "etat-pos";

  // Calcul identique à kadior_enregistrer_caisse (aperçu ; la base fait foi)
  function calcul(f, auto) {
    const designation = POSTES.reduce((t, [k]) => t + nb(f[k]), 0) + nb(auto.livraison);
    const ventes = nb(auto.montant_boulangerie) + nb(auto.montant_patisserie) + nb(auto.total_abonnements) + nb(f.monnaie_depart);
    const depenses = designation + nb(auto.total_achats) + nb(auto.total_credits);
    const aVerser = ventes - depenses + nb(auto.reglements_livraison) + nb(auto.encaissements_credits);
    return { designation, ventes, depenses, aVerser, versement: nb(f.verser), etat: nb(f.verser) - aVerser };
  }

  async function load(date, session, admin) {
    const sessions = admin ? ["matin", "soir"] : [session];
    const [autos, fiches, achats, catalogue] = await Promise.all([
      Promise.all(sessions.map(s => sb.rpc("kadior_caisse_auto", { p_date: date, p_session: s }))),
      sb.from("caisse_fiches").select("*").eq("date", date).in("session", sessions),
      sb.from("caisse_achats").select("id,libelle,quantite,prix_unitaire,montant,saisi_le").eq("date", date).eq("session", session).order("saisi_le"),
      sb.from("catalogue_depenses").select("id,designation,prix_defaut").eq("actif", true).order("ordre")
    ]);
    for (const r of [...autos, fiches, achats, catalogue]) if (r.error) throw r.error;
    const auto = {}, fiche = {};
    sessions.forEach((s, i) => { auto[s] = autos[i].data || {}; });
    for (const f of fiches.data || []) fiche[f.session] = f;
    return { auto, fiche, achats: achats.data || [], catalogue: catalogue.data || [] };
  }

  async function render() {
    const admin = KA.isAdmin();
    const forced = admin ? null : (KA.state.profile.session || null);
    const J = KA.journee;
    J.date = J.date || KA.today();
    J.session = forced || J.session || KA.defaultSession();

    KA.loading("Gestion de caisse");
    let data;
    try { data = await load(J.date, J.session, admin); }
    catch (err) { return KA.showLoadError("Gestion de caisse", err); }

    const auto = data.auto[J.session];
    const saved = data.fiche[J.session] || null;
    const f = Object.assign({ monnaie_depart: 0, verser: 0 }, Object.fromEntries(POSTES.map(([k]) => [k, 0])), saved || {});
    const lecture = admin && !auto.absence;            // admin : lecture seule sauf absence
    const dis = lecture ? " disabled" : "";
    const sessions = forced ? [forced] : ["matin", "soir"];
    const responsable = (saved && saved.responsable_nom) || KA.state.profile.full_name || KA.state.profile.email || "";
    const moneyInput = (k, v, label) => `<input type="number" min="0" step="1" inputmode="numeric" class="money" id="c-${k}" data-k="${k}"
      value="${nb(v) ? esc(v) : ""}" aria-label="${esc(label)}"${dis}>`;

    KA.setView(`<div class="prod-wrap caisse">
      <header class="page-head prod-head"><div>
        <h1>Gestion de caisse</h1>
        <p class="muted sub">Caisse ${esc(J.session)} du ${esc(KA.longDate(J.date))}</p>
      </div></header>

      <div class="prod-card prod-top caisse-top">
        <div class="field"><label for="c-date">Date</label>
          <input type="date" id="c-date" value="${esc(J.date)}" max="${esc(KA.today())}"${admin ? "" : ` min="${KA.yesterday()}"`}></div>
        <div class="field"><label for="c-resp">Responsable</label>
          <input type="text" id="c-resp" value="${esc(responsable)}"${dis}></div>
        <div class="field"><label for="c-monnaie_depart">Monnaie de départ</label>${moneyInput("monnaie_depart", f.monnaie_depart, "Monnaie de départ")}</div>
        <div class="session-switch" role="group" aria-label="Session">
          ${sessions.map(s => `<button type="button" data-session="${s}" class="${s === J.session ? "on" : ""}">CAISSE ${s.toUpperCase()}</button>`).join("")}
        </div>
      </div>

      ${lecture ? `<div class="banner banner-lock">Saisie réservée au caissier — Lecture seule</div>` : ""}
      ${!admin && auto.absence ? `<div class="banner">Caisse saisie par l'administrateur (absence enregistrée) — vérifiez les montants.</div>` : ""}
      ${admin ? `<div class="prod-card absence">
          <p>${auto.absence ? `Caissier ${esc(J.session)} déclaré absent : la saisie est ouverte à l'administrateur.`
                             : `La saisie de la caisse ${esc(J.session)} est réservée au caissier.`}</p>
          <button type="button" id="c-absence" class="btn ${auto.absence ? "" : "btn-brown"}">${auto.absence ? "Annuler l'absence" : `Marquer caissier absent (${J.session === "matin" ? "Matin" : "Soir"})`}</button>
        </div>` : ""}

      <div class="caisse-grid">
        <section class="prod-card col">
          <h2>Désignation / Dépenses (${esc(J.session)})</h2>
          <div class="postes">
            ${POSTES.map(([k, label]) => `<div class="poste"><label for="c-${k}">${esc(label)}</label>${moneyInput(k, f[k], label)}</div>`).join("")}
            <div class="poste poste-total"><span>Total désignation</span><strong id="t-designation"></strong></div>
          </div>

          <div class="poste verser"><label for="c-verser">Verser (remis par le caissier)</label>${moneyInput("verser", f.verser, "Verser")}</div>

          <h3>Dépenses produits · session ${esc(J.session)}</h3>
          <div class="achat-form">
            <div class="field grow"><label for="a-article">Article</label>
              <select id="a-article"${dis}><option value="">Choisir…</option>
                ${data.catalogue.map(a => `<option value="${esc(a.id)}" data-prix="${esc(a.prix_defaut)}">${esc(a.designation)}</option>`).join("")}</select></div>
            <div class="field"><label for="a-qte">Qté</label><input type="number" id="a-qte" min="0" step="any" value="1"${dis}></div>
            <div class="field"><label for="a-prix">Prix unit.</label><input type="number" id="a-prix" min="0" step="1"${dis}></div>
            <button type="button" id="a-add" class="btn btn-brown"${dis}>Ajouter</button>
          </div>
          <div class="achats">
            ${data.achats.length ? data.achats.map(a => `<div class="achat">
                <span class="grow">${esc(a.libelle)}</span>
                <span class="muted">${esc(KA.fmtNombre(a.quantite))} × ${esc(KA.fmtNombre(a.prix_unitaire))}</span>
                <strong>${esc(F(a.montant))}</strong>
                ${lecture ? "" : `<button type="button" class="icon-btn" data-del="${esc(a.id)}" aria-label="Supprimer ${esc(a.libelle)}">✕</button>`}
              </div>`).join("") : `<p class="muted small">Aucune dépense produit pour la session ${esc(J.session)}.</p>`}
          </div>
          <div class="line"><span>Total achats produits</span><strong>${esc(F(auto.total_achats))}</strong></div>
          <div class="line big"><span>Total dépenses</span><strong id="t-depenses-g"></strong></div>
        </section>

        <section class="prod-card col">
          <h2>Caisse</h2>
          <div class="kv"><span>Boulangerie (production ${esc(J.session)})</span><strong>${esc(F(auto.montant_boulangerie))}</strong></div>
          <div class="kv"><span>Pâtisserie (production ${esc(J.session)})</span><strong>${esc(F(auto.montant_patisserie))}</strong></div>
          <div class="kv"><span>Monnaie de départ</span><strong id="t-monnaie"></strong></div>
          <div class="line big"><span>Ventes boutique (espèces)</span><strong id="t-ventes"></strong></div>
          <div class="line big"><span>Total dépenses</span><strong id="t-depenses"></strong></div>
          <div class="line big sep"><span>Montant à verser</span><strong id="t-averser"></strong></div>
          <div class="line big sep"><span>Versement total</span><strong id="t-versement"></strong></div>
          <div class="line big"><span>État</span><strong id="t-etat"></strong></div>
          <button type="button" id="c-save" class="btn btn-brown btn-block"${dis}>${lecture ? "Saisie réservée au caissier" : `Enregistrer la caisse ${esc(J.session)}`}</button>
          ${saved ? `<p class="muted small center">Dernier enregistrement : ${esc(new Date(saved.saisi_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }))}${saved.saisi_par_admin ? " (par l'administrateur)" : ""}</p>` : ""}
          <p class="muted small">Boulangerie et pâtisserie viennent des restants saisis dans Production. Un produit sans restant saisi compte comme entièrement vendu.</p>
        </section>
      </div>

      <section class="prod-card resume">
        <h2>Résumé ${esc(J.session.toUpperCase())} · ${esc(KA.longDate(J.date))}</h2>
        <div class="stats" id="resume-session"></div>
      </section>

      ${admin ? `<section class="prod-card resume"><h2>Résumé journalier · ${esc(KA.longDate(J.date))}</h2><div id="resume-jour"></div></section>` : ""}
    </div>`);

    const root = $(".caisse");
    const current = () => {
      const o = Object.assign({}, f);
      for (const el of $$("input[data-k]", root)) o[el.dataset.k] = nb(el.value);
      return o;
    };
    const card = (t, v, cls) => `<div class="stat"><span class="stat-label">${esc(t)}</span><strong class="${cls || ""}">${esc(v)}</strong></div>`;

    function refresh() {
      const cur = current();
      const c = calcul(cur, auto);
      $("#t-designation").textContent = F(c.designation);
      $("#t-depenses-g").textContent = F(c.depenses);
      $("#t-monnaie").textContent = F(cur.monnaie_depart);
      $("#t-ventes").textContent = F(c.ventes);
      $("#t-depenses").textContent = F(c.depenses);
      $("#t-averser").textContent = F(c.aVerser);
      $("#t-versement").textContent = F(c.versement);
      const e = $("#t-etat");
      e.textContent = libelleEtat(c.etat);
      e.className = classeEtat(c.etat);
      $("#resume-session").innerHTML = card("Monnaie de départ", F(cur.monnaie_depart)) + card("Ventes boutique (espèces)", F(c.ventes)) +
        card("Total dépenses", F(c.depenses)) + card("Montant à verser", F(c.aVerser)) +
        card("Versement total", F(c.versement)) + card("État de la session", libelleEtat(c.etat), classeEtat(c.etat));
      if (admin) {
        const parSession = ["matin", "soir"].map(s => {
          const fs = s === J.session ? cur : Object.assign({ monnaie_depart: 0, verser: 0 }, data.fiche[s] || {});
          return [s, calcul(fs, data.auto[s] || {}), !!data.fiche[s]];
        });
        const tot = k => parSession.reduce((t, [, c]) => t + c[k], 0);
        $("#resume-jour").innerHTML = parSession.map(([s, c, ok]) => `<h3 class="section-title">${s}${ok ? "" : " — non enregistrée"}</h3>
          <div class="stats">${card("Ventes boutique (espèces)", F(c.ventes))}${card("Total dépenses", F(c.depenses))}
            ${card("Montant à verser", F(c.aVerser))}${card("Versement total", F(c.versement))}${card("État", libelleEtat(c.etat), classeEtat(c.etat))}</div>`).join("") +
          `<h3 class="section-title">Total journalier</h3><div class="stats">
            ${card("Total ventes", F(tot("ventes")))}${card("Total dépenses", F(tot("depenses")))}${card("Total à verser", F(tot("aVerser")))}
            ${card("Total versé", F(tot("versement")))}${card("État global du jour", libelleEtat(tot("etat")), classeEtat(tot("etat")))}</div>`;
      }
    }

    let dirty = false;
    root.addEventListener("input", e => { if (e.target.matches("input[data-k], #c-resp")) { dirty = true; refresh(); } });
    root.addEventListener("keydown", e => {
      if (e.key !== "Enter" || !e.target.matches("input[data-k]")) return;
      e.preventDefault();
      const inputs = $$("input[data-k]", root);
      const next = inputs[inputs.indexOf(e.target) + 1];
      if (next) { next.focus(); next.select(); }
    });

    const leave = () => !dirty || window.confirm("Abandonner les montants non enregistrés ?");
    $("#c-date").addEventListener("change", e => {
      if (!e.target.value || !leave()) { e.target.value = J.date; return; }
      J.date = e.target.value; render();
    });
    $$(".session-switch button", root).forEach(b => b.addEventListener("click", () => {
      if (b.dataset.session === J.session || !leave()) return;
      J.session = b.dataset.session; render();
    }));

    if (admin) $("#c-absence").addEventListener("click", async () => {
      if (!auto.absence && !window.confirm(`Déclarer le caissier ${J.session} absent ? Vous pourrez alors saisir sa caisse.`)) return;
      try { await KA.rpc("kadior_basculer_absence", { p_date: J.date, p_session: J.session }); render(); }
      catch (err) { KA.toast(KA.describeError(err), "error"); }
    });

    $("#a-article").addEventListener("change", e => {
      const opt = e.target.selectedOptions[0];
      if (opt && opt.dataset.prix && nb(opt.dataset.prix) > 0) $("#a-prix").value = opt.dataset.prix;
    });
    $("#a-add").addEventListener("click", async () => {
      const article = $("#a-article").value, q = nb($("#a-qte").value), p = $("#a-prix").value.trim();
      if (!article) return KA.toast("Choisissez un article du catalogue.", "error");
      if (q <= 0) return KA.toast("Quantité invalide.", "error");
      if (p === "" || !Number.isInteger(Number(p)) || Number(p) < 0) return KA.toast("Prix unitaire invalide (FCFA, nombre entier).", "error");
      if (dirty && !window.confirm("Les montants non enregistrés de la fiche seront perdus. Ajouter quand même ?")) return;
      try {
        await KA.rpc("kadior_ajouter_achat", { p_date: J.date, p_session: J.session, p_article: article, p_quantite: q, p_prix: Number(p) });
        KA.toast("Dépense produit ajoutée. Pensez à enregistrer la caisse.");
        render();
      } catch (err) { KA.toast(KA.describeError(err), "error"); }
    });
    root.addEventListener("click", async e => {
      const b = e.target.closest("[data-del]");
      if (!b) return;
      if (!window.confirm("Supprimer cette dépense produit ?")) return;
      if (dirty && !window.confirm("Les montants non enregistrés de la fiche seront perdus. Continuer ?")) return;
      try { await KA.rpc("kadior_supprimer_achat", { p_id: b.dataset.del }); render(); }
      catch (err) { KA.toast(KA.describeError(err), "error"); }
    });

    $("#c-save").addEventListener("click", async () => {
      for (const el of $$("input[data-k]", root)) {
        if (el.value.trim() !== "" && (!Number.isInteger(Number(el.value)) || Number(el.value) < 0)) {
          el.focus();
          return KA.toast("Les montants doivent être des nombres entiers positifs (FCFA).", "error");
        }
      }
      const cur = current();
      const payload = { responsable_nom: $("#c-resp").value.trim() };
      for (const k of ["monnaie_depart", "verser", ...POSTES.map(([key]) => key)]) payload[k] = cur[k];
      const btn = $("#c-save");
      btn.disabled = true;
      btn.textContent = "Enregistrement…";
      try {
        const r = await KA.rpc("kadior_enregistrer_caisse", { p_date: J.date, p_session: J.session, p_fiche: payload });
        KA.toast(`Caisse ${J.session} enregistrée — à verser ${F(r.montant_a_verser)} · ${libelleEtat(r.etat)}`);
        render();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = `Enregistrer la caisse ${J.session}`;
        KA.toast(KA.describeError(err), "error");
      }
    });

    refresh();
  }

  KA.register({ id: ID, label: "Caisse", group: "Gestion", icon: "caisse", roles: ["caissier"], render });
})();
