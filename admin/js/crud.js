/* =====================================================================
   LE KADIOR — LOGICIEL DE GESTION : LISTES ET FORMULAIRES GÉNÉRIQUES
   ---------------------------------------------------------------------
   KA.crudModule(def) fabrique un module complet (liste + recherche +
   ajout / modification / suppression) à partir d'une description de table.
   Utilisé par les rubriques du site web (produits, catégories, …).
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  if (KA.fatalMessage) return;
  const { $, $$, esc, sb } = KA;

  /* ---------- Données de référence (listes déroulantes) ---------- */

  async function loadLookups() {
    const [categories, productTypes, products, events] = await Promise.all([
      KA.fetchAll("categories", "id,name,label,active"),
      KA.fetchAll("product_types", "key,label,active", [["sort_order"], ["key"]]),
      KA.fetchAll("products", "id,name,category_id"),
      KA.fetchAll("events", "id,key,name")
    ]);
    return { categories, productTypes, products, events };
  }
  KA.loadLookups = loadLookups;
  KA.catName = (lk, id) => (lk.categories.find(c => c.id === id) || {}).name || id || "—";

  /* ---------- Liste ---------- */

  async function renderList(key, res) {
    KA.loading(res.title);
    let rows, lk;
    try {
      [rows, lk] = await Promise.all([
        KA.fetchAll(res.table, "*", res.orderBy || [["sort_order"], [res.pk]]),
        loadLookups()
      ]);
    } catch (err) { return KA.showLoadError(res.title, err); }

    const catFilter = res.filterByCategory
      ? `<select id="list-cat" aria-label="Filtrer par catégorie"><option value="">Toutes les catégories</option>
          ${lk.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>` : "";
    KA.setView(`<header class="page-head">
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

    const draw = () => {
      const q = KA.norm($("#list-search").value.trim());
      const cat = res.filterByCategory ? $("#list-cat").value : "";
      const shown = rows.filter(r => (!cat || r.category_id === cat) &&
        (!q || res.search(r, lk).some(s => KA.norm(s).includes(q))));
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
      KA.toast(error ? KA.describeError(error) : "Suppression refusée (droits insuffisants ou élément introuvable).", "error");
      return false;
    }
    await KA.removeImageIfUnused(row.image);
    KA.toast("Supprimé.");
    return true;
  }

  /* ---------- Formulaire ---------- */

  async function renderForm(key, res, id) {
    const editing = id != null;
    KA.loading(res.title);
    let rows, lk, row = null;
    try {
      [rows, lk] = await Promise.all([
        KA.fetchAll(res.table, "*", res.orderBy || [["sort_order"], [res.pk]]),
        loadLookups()
      ]);
      if (editing) {
        row = rows.find(r => String(r[res.pk]) === id);
        if (!row) throw new Error("Élément introuvable : " + id);
      }
    } catch (err) { return KA.showLoadError(res.title, err); }

    const fields = res.fields(lk, rows);
    const fieldsHtml = KA.fieldsHtml(fields, f => editing ? row[f.key]
      : typeof f.default === "function" ? f.default() : f.default, editing);

    const heading = editing
      ? `Modifier ${res.singular} « ${row.name || row.title || row[res.pk]} »`
      : `${res.title} — ajout`;
    KA.setView(`<header class="page-head">
        <h1>${esc(heading)}</h1>
        <a class="btn" href="#${key}">← Retour à la liste</a>
      </header>
      <form id="edit-form" class="form" novalidate>
        <p id="form-error" class="alert" hidden></p>
        ${fieldsHtml}
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
        const problem = KA.checkImageFile(file);
        if (problem) { input.value = ""; KA.toast(problem, "error"); return; }
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
        const src = KA.resolveImage(input.value);
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

      const { values, error } = KA.readForm(form, fields, editing);
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
          const up = await KA.uploadImage(file, res.folder);
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
        if (uploaded.length) await sb.storage.from(KA.BUCKET).remove(uploaded).catch(() => {});
        submit.disabled = false;
        submit.textContent = "Enregistrer";
        return showError(KA.describeError(err));
      }
      // Image remplacée : l'ancienne est supprimée du bucket si plus rien ne l'utilise
      if (editing) {
        for (const f of fields) {
          if (f.type === "image" && row[f.key] && row[f.key] !== values[f.key]) await KA.removeImageIfUnused(row[f.key]);
        }
      }
      KA.toast("Enregistré.");
      location.hash = "#" + key;
    });
  }

  /* ---------- Fabrique de module ---------- */
  // def : description de la table (title, table, pk, columns, fields, …)
  //       + id, label, group, icon, roles pour le menu.
  KA.crudModule = function (def) {
    return {
      id: def.id, label: def.label || def.title, group: def.group, icon: def.icon, roles: def.roles || [],
      render(action, id) {
        if (action === "new" && def.canCreate) return renderForm(def.id, def, null);
        if (action === "edit" && id) return renderForm(def.id, def, id);
        return renderList(def.id, def);
      }
    };
  };
})();
