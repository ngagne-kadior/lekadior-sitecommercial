/* =====================================================================
   LE KADIOR — MODULE « BOX »
   ---------------------------------------------------------------------
   L'administrateur crée les box : nom, type, prix, photo, contenu.
   Le contenu DÉCRIT la box (pas de prix à l'unité) : produit de l'atelier
   ou ligne libre (« 1 jus »).
   Chaque box enregistrée est publiée automatiquement sur le site
   (catégorie « Box »). Écriture par les fonctions SQL de
   supabase/08_box.sql (administrateur uniquement).
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  if (KA.fatalMessage) return;
  const { $, $$, esc, sb, badge } = KA;

  const ID = "box";
  const TYPES = { sucree: ["Sucrée", "pink"], salee: ["Salée", "coral"], mixte: ["Mixte", "teal"] };
  const typeBadge = t => `<span class="box-type box-type-${esc(t)}">${esc((TYPES[t] || [t])[0])}</span>`;
  const contenuText = lignes => lignes.map(c => `${c.quantite} ${c.libelle}`).join(", ");

  async function load() {
    const [box, contenu, produits] = await Promise.all([
      sb.from("box").select("*").order("ordre"),
      sb.from("box_contenu").select("box_id,ordre,quantite,produit_id,libelle").order("ordre"),
      sb.from("production_produits").select("id,nom,categorie,actif").order("categorie").order("ordre")
    ]);
    for (const r of [box, contenu, produits]) if (r.error) throw r.error;
    const parBox = {};
    for (const c of contenu.data || []) (parBox[c.box_id] = parBox[c.box_id] || []).push(c);
    return { box: box.data || [], parBox, produits: produits.data || [] };
  }

  /* ---------- Liste ---------- */

  async function renderList() {
    KA.loading("Box");
    let data;
    try { data = await load(); } catch (err) { return KA.showLoadError("Box", err); }

    const rows = data.box.map(b => `<tr>
        <td data-label="Box"><div class="box-name">${KA.thumb(b.image)}<strong>${esc(b.nom)}</strong></div></td>
        <td data-label="Type">${typeBadge(b.type)}</td>
        <td data-label="Contenu" class="muted">${esc(contenuText(data.parBox[b.id] || []))}</td>
        <td data-label="Prix"><strong>${esc(KA.fmtPrice(b.prix))}</strong></td>
        <td data-label="Site">${b.publie_site ? badge("En ligne", "ok") : badge("Masquée", "off")}</td>
        <td class="actions">
          <a class="btn btn-small" href="#${ID}/edit/${encodeURIComponent(b.id)}">Modifier</a>
          <button class="btn btn-small btn-danger" type="button" data-delete="${esc(b.id)}">Supprimer</button>
        </td></tr>`).join("");

    KA.setView(`<header class="page-head">
        <h1>Box</h1>
        <a class="btn btn-primary" href="#${ID}/new">+ Nouvelle box</a>
      </header>
      <p class="muted">Chaque box enregistrée apparaît automatiquement sur le site, dans « Nos box » et dans le catalogue
        (sauf si « Afficher sur le site » est décoché). La vente des box en caisse arrivera avec la caisse enregistreuse.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Box</th><th>Type</th><th>Contenu</th><th>Prix</th><th>Site</th><th class="actions">Actions</th></tr></thead>
        <tbody id="list-body">${rows || `<tr><td colspan="6" class="empty">Aucune box pour l'instant. Créez la première avec « + Nouvelle box ».</td></tr>`}</tbody>
      </table></div>`);

    $("#list-body").addEventListener("click", async e => {
      const btn = e.target.closest("[data-delete]");
      if (!btn) return;
      const b = data.box.find(x => x.id === btn.dataset.delete);
      if (!b || !window.confirm(`Supprimer définitivement la box « ${b.nom} » ?\n\nElle disparaît aussi du site, avec ses éventuelles promotions.`)) return;
      try {
        await KA.rpc("kadior_supprimer_box", { p_box: b.id });
        await KA.removeImageIfUnused(b.image);
        KA.toast("Box supprimée.");
        renderList();
      } catch (err) { KA.toast(KA.describeError(err), "error"); }
    });
  }

  /* ---------- Formulaire ---------- */

  async function renderForm(id) {
    KA.loading("Box");
    let data, box = null;
    try {
      data = await load();
      if (id) {
        box = data.box.find(b => b.id === id);
        if (!box) throw new Error("Box introuvable.");
      }
    } catch (err) { return KA.showLoadError("Box", err); }

    const lignes = box ? (data.parBox[box.id] || []).map(c => ({ ...c })) : [{ quantite: 1, produit_id: "", libelle: "" }];
    const options = cat => data.produits.filter(p => p.categorie === cat && p.actif)
      .map(p => `<option value="${esc(p.id)}">${esc(p.nom)}</option>`).join("");
    const selectHtml = `<option value="">Ligne libre (texte)</option>
      <optgroup label="Boulangerie">${options("boulangerie")}</optgroup>
      <optgroup label="Pâtisserie">${options("patisserie")}</optgroup>`;

    KA.setView(`<header class="page-head">
        <h1>${box ? `Modifier « ${esc(box.nom)} »` : "Nouvelle box"}</h1>
        <a class="btn" href="#${ID}">← Retour aux box</a>
      </header>
      <form id="box-form" class="form box-form" novalidate>
        <p id="form-error" class="alert" hidden></p>
        <fieldset><legend>La box</legend>
          <div class="box-grid">
            <div class="field"><label for="b-nom">Nom <span class="req">*</span></label>
              <input type="text" id="b-nom" maxlength="80" value="${esc(box ? box.nom : "")}" placeholder="Box sucrée"></div>
            <div class="field"><label for="b-type">Type <span class="req">*</span></label>
              <select id="b-type">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}"${box && box.type === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="field"><label for="b-prix">Prix de la box (FCFA) <span class="req">*</span></label>
              <input type="number" id="b-prix" min="1" step="1" inputmode="numeric" value="${box ? esc(box.prix) : ""}" placeholder="2500"></div>
          </div>
        </fieldset>

        <fieldset><legend>Contenu</legend>
          <p class="muted small">Le contenu décrit la box sur le site (ex. « 2 mini-croissants, 1 jus »). Choisissez un produit de l'atelier ou une ligne libre.</p>
          <div class="box-lines" id="b-lines"></div>
          <button type="button" class="btn btn-small" id="b-add">+ Ajouter une ligne</button>
          <p class="box-preview"><span class="muted">Sur le site :</span> <span id="b-preview"></span></p>
        </fieldset>

        <fieldset><legend>Photo et site</legend>
          <div class="field field-image">${KA.fieldHtml({ key: "image", label: "Photo", type: "image" }, box ? box.image : "", !!box)}</div>
          <label class="check"><input type="checkbox" id="b-publie"${!box || box.publie_site ? " checked" : ""}> Afficher sur le site</label>
        </fieldset>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
          <a class="btn" href="#${ID}">Annuler</a>
        </div>
      </form>`);

    const form = $("#box-form");
    const linesBox = $("#b-lines");

    function lineHtml(c, i) {
      return `<div class="box-line" data-i="${i}">
        <input type="number" class="b-q" min="1" step="1" value="${esc(c.quantite || 1)}" aria-label="Quantité">
        <select class="b-p" aria-label="Produit">${selectHtml}</select>
        <input type="text" class="b-l" maxlength="80" value="${esc(c.libelle || "")}" placeholder="Libellé (ex. mini-croissant, jus)" aria-label="Libellé">
        <button type="button" class="icon-btn b-del" aria-label="Retirer la ligne">✕</button>
      </div>`;
    }
    function drawLines() {
      linesBox.innerHTML = lignes.map(lineHtml).join("");
      $$(".box-line", linesBox).forEach((row, i) => { $(".b-p", row).value = lignes[i].produit_id || ""; });
      preview();
    }
    function readLines() {
      $$(".box-line", linesBox).forEach((row, i) => {
        lignes[i].quantite = Number($(".b-q", row).value);
        lignes[i].produit_id = $(".b-p", row).value || null;
        lignes[i].libelle = $(".b-l", row).value.trim();
      });
    }
    function preview() {
      readLines();
      $("#b-preview").textContent = contenuText(lignes.filter(l => l.libelle)) || "—";
    }

    linesBox.addEventListener("change", e => {
      if (e.target.matches(".b-p")) {
        const row = e.target.closest(".box-line");
        const p = data.produits.find(x => x.id === e.target.value);
        if (p) $(".b-l", row).value = p.nom;                // libellé repris du produit (modifiable)
      }
      preview();
    });
    linesBox.addEventListener("input", preview);
    linesBox.addEventListener("click", e => {
      const del = e.target.closest(".b-del");
      if (!del) return;
      readLines();
      lignes.splice(Number(del.closest(".box-line").dataset.i), 1);
      if (!lignes.length) lignes.push({ quantite: 1, produit_id: "", libelle: "" });
      drawLines();
    });
    $("#b-add").addEventListener("click", () => { readLines(); lignes.push({ quantite: 1, produit_id: "", libelle: "" }); drawLines(); });

    // Photo : aperçu local, envoi à l'enregistrement
    let pendingFile = null;
    const fileInput = $('input[type=file][data-file-for="image"]', form);
    const imgPreview = $('[data-image="image"] .image-preview', form);
    fileInput.addEventListener("change", () => {
      pendingFile = null;
      const file = fileInput.files[0];
      if (!file) return;
      const problem = KA.checkImageFile(file);
      if (problem) { fileInput.value = ""; return KA.toast(problem, "error"); }
      pendingFile = file;
      const img = document.createElement("img");
      img.alt = "Aperçu";
      img.src = URL.createObjectURL(file);
      imgPreview.replaceChildren(img);
    });

    // Chemin saisi à la main : aperçu (le fichier choisi reste prioritaire)
    form.elements.image.addEventListener("change", () => {
      if (pendingFile) return;
      const src = KA.resolveImage(form.elements.image.value);
      if (!src) { imgPreview.innerHTML = "<span>Aucune image</span>"; return; }
      const img = document.createElement("img");
      img.alt = "Aperçu";
      img.src = src;
      imgPreview.replaceChildren(img);
    });

    drawLines();

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const errBox = $("#form-error");
      const showError = msg => { errBox.textContent = msg; errBox.hidden = false; errBox.scrollIntoView({ block: "center" }); };
      errBox.hidden = true;
      readLines();
      const nom = $("#b-nom").value.trim();
      const prix = $("#b-prix").value.trim();
      if (!nom) return showError("« Nom » est obligatoire.");
      if (!prix || !Number.isInteger(Number(prix)) || Number(prix) <= 0) return showError("Prix invalide : nombre entier en FCFA, supérieur à 0.");
      const contenu = lignes.filter(l => l.libelle || l.produit_id);
      if (!contenu.length) return showError("Ajoutez au moins une ligne au contenu.");
      const bad = contenu.find(l => !l.libelle || !Number.isInteger(l.quantite) || l.quantite <= 0);
      if (bad) return showError("Chaque ligne du contenu doit avoir une quantité (nombre entier) et un libellé.");

      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      btn.textContent = "Enregistrement…";
      let uploaded = null;
      try {
        let image = form.elements.image.value.trim() || null;
        if (pendingFile) { uploaded = await KA.uploadImage(pendingFile, "products"); image = uploaded.url; }
        await KA.rpc("kadior_enregistrer_box", { p_box: {
          id: box ? box.id : null, nom, type: $("#b-type").value, prix: Number(prix), image,
          publie_site: $("#b-publie").checked,
          contenu: contenu.map(l => ({ produit_id: l.produit_id, libelle: l.libelle, quantite: l.quantite }))
        } });
        if (box && box.image && box.image !== image) await KA.removeImageIfUnused(box.image);
        KA.toast($("#b-publie").checked ? "Box enregistrée et publiée sur le site." : "Box enregistrée (masquée sur le site).");
        location.hash = "#" + ID;
      } catch (err) {
        if (uploaded) await sb.storage.from(KA.BUCKET).remove([uploaded.path]).catch(() => {});
        btn.disabled = false;
        btn.textContent = "Enregistrer";
        showError(KA.describeError(err));
      }
    });
  }

  KA.register({
    id: ID, label: "Box", group: "Gestion", icon: "box", roles: [],
    render(action, id) {
      if (action === "new") return renderForm(null);
      if (action === "edit" && id) return renderForm(id);
      return renderList();
    }
  });
})();
