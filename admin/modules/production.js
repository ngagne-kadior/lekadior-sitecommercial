/* =====================================================================
   LE KADIOR — MODULE « PRODUCTION » (boulangerie, pétrisseur)
   ---------------------------------------------------------------------
   Reprend l'écran Production du logiciel Lovable :
   - date + session (imposée si l'employé a une session dans Équipe) ;
   - sacs pétris : nombre entier + fraction (bols / quarts de sac) ;
   - par pain : plats × contenu par plat + plus = total ;
   - rendement = pains pondérés / sacs (Sicap et Double Sicap 1, Dieck 1/2).
   Les totaux affichés ici sont une aide à la saisie : la base les
   RECALCULE à l'enregistrement (supabase/05_production.sql).
   Accès : pétrisseur (sa session) et administrateur (toutes les sessions).
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
  const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = () => isoDay(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDay(d); };
  const longDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  // État de l'écran (conservé pendant la navigation dans le module)
  const ui = { date: null, session: null, dirtyLines: new Set(), dirtySacs: false };

  function forcedSession() {
    return KA.isAdmin() ? null : (KA.state.profile.session || null);
  }

  async function load(date, session) {
    const [produits, lignes, sacs] = await Promise.all([
      sb.from("production_produits").select("id,nom,contenu_fixe,contenu_defaut,sans_plats,poids_rendement,ordre")
        .eq("actif", true).eq("categorie", "boulangerie").order("ordre"),
      sb.from("production_lignes").select("produit_id,nombre_plats,contenu_par_plat,plus,quantite_produite,saisi_le")
        .eq("date", date).eq("session", session),
      sb.from("sacs_petris").select("sacs").eq("date", date).eq("session", session).maybeSingle()
    ]);
    for (const r of [produits, lignes, sacs]) if (r.error) throw r.error;
    return { produits: produits.data || [], lignes: lignes.data || [], sacs: sacs.data ? nb(sacs.data.sacs) : 0 };
  }

  async function render() {
    const forced = forcedSession();
    ui.date = ui.date || today();
    ui.session = forced || ui.session || (new Date().getHours() < 15 ? "matin" : "soir");
    ui.dirtyLines.clear();
    ui.dirtySacs = false;

    KA.loading("Production journalière");
    let data;
    try { data = await load(ui.date, ui.session); }
    catch (err) { return KA.showLoadError("Production journalière", err); }

    const admin = KA.isAdmin();
    const minDate = admin ? "" : yesterday();
    const sessions = forced ? [forced] : ["matin", "soir"];
    const byId = Object.fromEntries(data.lignes.map(l => [l.produit_id, l]));
    const sacsEntiers = Math.floor(data.sacs + 1e-9);
    const sacsFraction = String(Number((data.sacs - sacsEntiers).toFixed(3)));
    const dejaEnregistre = data.lignes.length > 0 || data.sacs > 0;

    const rows = data.produits.map(p => {
      const l = byId[p.id] || {};
      const plats = l.nombre_plats || "";
      const plus = l.plus || "";
      const contenuSaisi = !p.contenu_fixe && !p.sans_plats && l.contenu_par_plat ? l.contenu_par_plat : "";
      const input = (field, value, label) =>
        `<input class="num" type="number" min="0" step="1" inputmode="numeric" data-field="${field}" data-id="${esc(p.id)}"
           value="${esc(value)}" aria-label="${esc(label)} ${esc(p.nom)}">`;
      return `<tr data-row="${esc(p.id)}">
        <td data-label="Pain" class="pain">${esc(p.nom)}</td>
        <td data-label="Plats">${p.sans_plats ? `<span class="muted">—</span>` : input("plats", plats, "Plats")}</td>
        <td data-label="Contenu / plat">${p.sans_plats ? `<span class="muted">—</span>`
          : p.contenu_fixe ? `<strong>${esc(p.contenu_fixe)}</strong>`
          : input("contenu", contenuSaisi, "Contenu par plat").replace('value=""', `value="" placeholder="${esc(p.contenu_defaut)}"`)}</td>
        <td data-label="Plus">${input("plus", plus, "Plus")}</td>
        <td data-label="Total" class="total" data-total="${esc(p.id)}"></td>
      </tr>`;
    }).join("");

    KA.setView(`<div class="prod-wrap"><header class="page-head prod-head">
        <div>
          <h1>Production journalière</h1>
          <p class="muted sub">Boulangerie — session ${esc(ui.session)} du ${esc(longDate(ui.date))}</p>
        </div>
      </header>

      <div class="prod-card prod-top">
        <div class="field">
          <label for="prod-date">Date de production</label>
          <input type="date" id="prod-date" value="${esc(ui.date)}" max="${esc(today())}"${minDate ? ` min="${minDate}"` : ""}>
        </div>
        <div class="session-switch" role="group" aria-label="Session">
          ${sessions.map(s => `<button type="button" data-session="${s}" class="${s === ui.session ? "on" : ""}">${s.toUpperCase()}</button>`).join("")}
        </div>
      </div>

      <h2 class="prod-title">Boulangerie · ${esc(ui.session.toUpperCase())}</h2>

      <div class="prod-card prod-sacs">
        <div class="field">
          <label for="sacs-entiers">Nombre de sacs pétris</label>
          <input type="number" id="sacs-entiers" min="0" step="1" inputmode="numeric" placeholder="ex : 5" value="${sacsEntiers || ""}">
        </div>
        <div class="field">
          <label for="sacs-fraction">Fraction de sac</label>
          <select id="sacs-fraction">${FRACTIONS.map(([v, t]) => `<option value="${v}"${v === sacsFraction ? " selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="pill">Total sacs pétris : <strong id="sacs-total">—</strong></div>
      </div>

      <div class="table-wrap prod-table"><table class="table">
        <thead><tr><th>Pain</th><th>Plats</th><th>Contenu / plat</th><th>Plus</th><th>Total</th></tr></thead>
        <tbody id="prod-body">${rows || `<tr><td colspan="5" class="empty">Aucun pain actif.</td></tr>`}</tbody>
      </table></div>

      <div class="rendement">
        <span>${admin ? "Rendement du jour" : "Votre rendement"}</span>
        <strong id="rendement">Saisissez les sacs pétris</strong>
      </div>

      <div class="prod-actions">
        <button type="button" id="prod-save" class="btn btn-brown">Enregistrer la production</button>
        ${dejaEnregistre ? `<span class="muted small">Session ${esc(ui.session)} déjà enregistrée — l'enregistrement mettra à jour les données.</span>` : ""}
      </div></div>`);

    const body = $("#prod-body");
    const val = (id, field) => { const el = $(`input[data-id="${CSS.escape(id)}"][data-field="${field}"]`, body); return el ? el.value.trim() : ""; };
    const contenuOf = p => p.sans_plats ? 0 : (p.contenu_fixe || nb(val(p.id, "contenu")) || p.contenu_defaut);
    const totalOf = p => (p.sans_plats ? 0 : nb(val(p.id, "plats")) * contenuOf(p)) + nb(val(p.id, "plus"));
    const sacs = () => nb($("#sacs-entiers").value) + nb($("#sacs-fraction").value);

    function refresh() {
      let ponderes = 0;
      for (const p of data.produits) {
        const t = totalOf(p);
        ponderes += t * nb(p.poids_rendement);
        $(`[data-total="${CSS.escape(p.id)}"]`, body).textContent = t ? fmt(t) : "";
      }
      const s = sacs();
      $("#sacs-total").textContent = s ? fmt(s) : "—";
      $("#rendement").textContent = s
        ? `${(ponderes / s).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} pains/sac`
        : "Saisissez les sacs pétris";
    }

    // Saisie : marque la ligne modifiée et recalcule
    body.addEventListener("input", e => {
      const el = e.target.closest("input[data-id]");
      if (!el) return;
      ui.dirtyLines.add(el.dataset.id);
      refresh();
    });
    $("#sacs-entiers").addEventListener("input", () => { ui.dirtySacs = true; refresh(); });
    $("#sacs-fraction").addEventListener("change", () => { ui.dirtySacs = true; refresh(); });

    // Entrée : passe au champ suivant (comme dans Lovable)
    $(".prod-wrap").addEventListener("keydown", e => {
      if (e.key !== "Enter" || !e.target.matches('input[type="number"]')) return;
      e.preventDefault();
      const inputs = $$('.prod-wrap input[type="number"]');
      const next = inputs[inputs.indexOf(e.target) + 1];
      if (next) { next.focus(); next.select(); }
    });

    const unsaved = () => ui.dirtyLines.size > 0 || ui.dirtySacs;
    $("#prod-date").addEventListener("change", e => {
      const v = e.target.value;
      if (!v || (unsaved() && !window.confirm("Quitter cette date et abandonner les modifications non enregistrées ?"))) {
        e.target.value = ui.date;
        return;
      }
      ui.date = v;
      render();
    });
    $$(".session-switch button").forEach(b => b.addEventListener("click", () => {
      const s = b.dataset.session;
      if (s === ui.session) return;
      if (unsaved() && !window.confirm("Changer de session et abandonner les modifications non enregistrées ?")) return;
      ui.session = s;
      render();
    }));

    $("#prod-save").addEventListener("click", async () => {
      if (!unsaved()) return KA.toast("Aucune modification saisie pour cette session.", "error");
      for (const el of $$(".prod-wrap input[type=number]")) {
        if (el.value.trim() !== "" && (!Number.isInteger(Number(el.value)) || Number(el.value) < 0)) {
          el.focus();
          return KA.toast("Les quantités doivent être des nombres entiers positifs ou nuls.", "error");
        }
      }
      if (dejaEnregistre && !window.confirm(`Une production existe déjà pour la session ${ui.session} du ${longDate(ui.date)}. Voulez-vous la modifier ?`)) return;

      const lignes = data.produits.filter(p => ui.dirtyLines.has(p.id)).map(p => ({
        produit_id: p.id,
        plats: p.sans_plats ? null : (val(p.id, "plats") || null),
        contenu: p.sans_plats || p.contenu_fixe ? null : (val(p.id, "contenu") || null),
        plus: val(p.id, "plus") || null
      }));
      const btn = $("#prod-save");
      btn.disabled = true;
      btn.textContent = "Enregistrement…";
      try {
        const res = await KA.rpc("kadior_enregistrer_production", {
          p_date: ui.date, p_session: ui.session,
          p_sacs: ui.dirtySacs ? sacs() : null,
          p_lignes: lignes
        });
        KA.toast(`${res.lignes} ligne(s) enregistrée(s) pour la session ${ui.session}` +
          (res.rendement != null ? ` — rendement ${String(res.rendement).replace(".", ",")} pains/sac` : ""));
        render();                                   // relecture depuis la base
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Enregistrer la production";
        KA.toast(KA.describeError(err), "error");   // saisies conservées
      }
    });

    refresh();
  }

  KA.register({
    id: ID, label: "Production", group: "Gestion", icon: "production", roles: ["petrisseur"],
    render
  });
})();
