/* =====================================================================
   LE KADIOR — MODULE « ÉQUIPE »
   ---------------------------------------------------------------------
   Comptes des employés : création (identifiant + mot de passe), rôle,
   activation / désactivation, nouveau mot de passe.
   Accès : administrateur uniquement. Toutes les opérations passent par
   les fonctions SQL de supabase/04 et 05, qui revérifient
   les droits : rien ne se fait par écriture directe dans les tables.
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  if (KA.fatalMessage) return;
  const { $, esc, sb, badge } = KA;

  const ID = "equipe";
  const roleOptions = (withNone) => KA.STAFF_ROLES.map(r => [r, KA.ROLES[r]])
    .concat(withNone ? [["user", KA.ROLES.user + " (aucun accès)"]] : []);

  async function loadStaff() {
    const { data, error } = await sb.from("profiles")
      .select("id,email,role,full_name,username,phone,active,session,created_at")
      .order("role").order("full_name", { nullsFirst: false });
    if (error) throw error;
    return data || [];
  }

  const SESSIONS = [["", "Non fixée (choisit matin ou soir)"], ["matin", "Matin"], ["soir", "Soir"]];
  const sessionField = { key: "session", label: "Session de travail", type: "select", noEmpty: true, options: SESSIONS,
    help: "Pétrisseur ou caissier : s'il travaille toujours le matin ou toujours le soir, il ne verra que cette session." };
  const sessionLabel = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

  const roleBadge = r => r.role === "admin" ? badge(KA.ROLES.admin, "gold")
    : r.role === "user" ? badge(KA.ROLES.user, "off") : badge(KA.ROLES[r.role] || r.role, "ok");
  const login = r => r.username || r.email || "—";

  /* ---------- Liste ---------- */

  async function renderList() {
    KA.loading("Équipe");
    let rows;
    try { rows = await loadStaff(); } catch (err) { return KA.showLoadError("Équipe", err); }

    KA.setView(`<header class="page-head">
        <h1>Équipe</h1>
        <a class="btn btn-primary" href="#${ID}/new">+ Ajouter un employé</a>
      </header>
      <p class="muted">Chaque employé se connecte avec son <strong>identifiant</strong> et son mot de passe, et ne voit que les écrans de son rôle.
        Un employé qui quitte l'entreprise est <strong>désactivé</strong> (jamais supprimé) : son historique est conservé.</p>
      <div class="toolbar">
        <input type="search" id="list-search" placeholder="Rechercher…" aria-label="Rechercher">
        <label class="check inline"><input type="checkbox" id="show-inactive"> Afficher les désactivés</label>
        <span id="list-count" class="muted"></span>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>Téléphone</th><th>Statut</th><th class="actions">Actions</th></tr></thead>
        <tbody id="list-body"></tbody>
      </table></div>`);

    const draw = () => {
      const q = KA.norm($("#list-search").value.trim());
      const showInactive = $("#show-inactive").checked;
      const shown = rows.filter(r => (showInactive || r.active) &&
        (!q || [r.full_name, r.username, r.email, KA.ROLES[r.role], r.phone].some(s => KA.norm(s).includes(q))));
      $("#list-count").textContent = `${shown.length} / ${rows.length}`;
      $("#list-body").innerHTML = shown.length ? shown.map(r => {
        const self = r.id === KA.state.user.id;
        const actions = r.role === "admin"
          ? `<span class="muted small">${self ? "Vous" : "Modifiable en SQL"}</span>`
          : `<a class="btn btn-small" href="#${ID}/edit/${r.id}">Modifier</a>
             <a class="btn btn-small" href="#${ID}/password/${r.id}">Mot de passe</a>`;
        return `<tr>
          <td data-label="Nom"><strong>${esc(r.full_name || (r.role === "admin" ? "Administrateur" : "—"))}</strong></td>
          <td data-label="Identifiant"><code>${esc(login(r))}</code></td>
          <td data-label="Rôle">${roleBadge(r)}${r.session ? ` <span class="muted small">${esc(sessionLabel(r.session))}</span>` : ""}</td>
          <td data-label="Téléphone">${esc(r.phone || "—")}</td>
          <td data-label="Statut">${r.active ? badge("Actif", "ok") : badge("Désactivé", "off")}</td>
          <td class="actions">${actions}</td></tr>`;
      }).join("") : `<tr><td colspan="6" class="empty">Aucun employé.</td></tr>`;
    };
    $("#list-search").addEventListener("input", draw);
    $("#show-inactive").addEventListener("change", draw);
    draw();
  }

  /* ---------- Formulaires ---------- */

  function formView(title, fieldsHtml, submitLabel) {
    KA.setView(`<header class="page-head">
        <h1>${esc(title)}</h1>
        <a class="btn" href="#${ID}">← Retour à l'équipe</a>
      </header>
      <form id="edit-form" class="form" novalidate autocomplete="off">
        <p id="form-error" class="alert" hidden></p>
        ${fieldsHtml}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
          <a class="btn" href="#${ID}">Annuler</a>
        </div>
      </form>`);
    const form = $("#edit-form");
    const errBox = $("#form-error");
    const showError = msg => { errBox.textContent = msg; errBox.hidden = false; errBox.scrollIntoView({ block: "center" }); };
    return { form, showError, clearError: () => { errBox.hidden = true; } };
  }

  // Exécute une action en désactivant le bouton ; renvoie true si succès
  async function submitting(form, showError, action) {
    const btn = $("button[type=submit]", form);
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Enregistrement…";
    try { await action(); return true; }
    catch (err) { showError(KA.describeError(err)); return false; }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  const passwordFields = [
    { key: "password", label: "Mot de passe", type: "password", required: true,
      help: "8 caractères minimum. Communiquez-le à l'employé en personne, jamais par écrit dans un groupe." },
    { key: "password2", label: "Confirmer le mot de passe", type: "password", required: true }
  ];
  function checkPasswords(v) {
    if (!v.password || v.password.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
    if (v.password !== v.password2) return "Les deux mots de passe ne sont pas identiques.";
    return null;
  }

  function renderCreate() {
    const fields = [
      { group: "Employé", key: "full_name", label: "Nom complet", type: "text", required: true },
      { key: "username", label: "Identifiant de connexion", type: "text", required: true, autocomplete: "off",
        pattern: /^[a-z0-9][a-z0-9._-]{2,29}$/,
        patternMessage: "3 à 30 caractères : lettres minuscules, chiffres, point ou tiret, sans espace ni accent.",
        help: "Ex. « adja » ou « amath.badji ». Non modifiable ensuite." },
      { key: "role", label: "Rôle", type: "select", required: true, noEmpty: true, options: roleOptions(false) },
      sessionField,
      { key: "phone", label: "Téléphone", type: "text" },
      Object.assign({ group: "Mot de passe" }, passwordFields[0]),
      passwordFields[1]
    ];
    const { form, showError, clearError } = formView("Nouvel employé", KA.fieldsHtml(fields, () => null, false), "Créer le compte");

    // Identifiant proposé à partir du nom (modifiable)
    let touched = false;
    form.elements.username.addEventListener("input", () => { touched = true; });
    form.elements.full_name.addEventListener("input", () => {
      if (touched) return;
      form.elements.username.value = KA.norm(form.elements.full_name.value).trim()
        .replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 30);
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      clearError();
      const { values, error } = KA.readForm(form, fields, false);
      if (error) return showError(error);
      const pwdError = checkPasswords(values);
      if (pwdError) return showError(pwdError);
      const ok = await submitting(form, showError, () => KA.rpc("kadior_create_employee", {
        p_username: values.username, p_full_name: values.full_name, p_role: values.role,
        p_password: values.password, p_phone: values.phone, p_session: values.session || null
      }));
      if (!ok) return;
      KA.toast(`Compte créé. Identifiant : ${values.username}`);
      location.hash = "#" + ID;
    });
  }

  async function loadOne(id) {
    const rows = await loadStaff();
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error("Employé introuvable.");
    if (row.role === "admin") throw Object.assign(new Error("Un administrateur ne se modifie pas depuis le logiciel."), { detailed: true });
    return row;
  }

  async function renderEdit(id) {
    KA.loading("Équipe");
    let row;
    try { row = await loadOne(id); } catch (err) { return KA.showLoadError("Équipe", err); }

    const fields = [
      { key: "login", label: "Identifiant de connexion", type: "readonly" },
      { key: "full_name", label: "Nom complet", type: "text", required: true },
      { key: "role", label: "Rôle", type: "select", required: true, noEmpty: true, options: roleOptions(true) },
      sessionField,
      { key: "phone", label: "Téléphone", type: "text" },
      { key: "active", label: "Compte actif (peut se connecter)", type: "bool",
        help: "Décocher bloque immédiatement la connexion et ferme les sessions ouvertes." }
    ];
    const value = f => f.key === "login" ? login(row) : row[f.key];
    const { form, showError, clearError } = formView(`Modifier « ${row.full_name || login(row)} »`,
      KA.fieldsHtml(fields, value, true), "Enregistrer");

    form.addEventListener("submit", async e => {
      e.preventDefault();
      clearError();
      const { values, error } = KA.readForm(form, fields, true);
      if (error) return showError(error);
      if (row.active && !values.active &&
          !window.confirm(`Désactiver le compte de « ${values.full_name} » ? Il ne pourra plus se connecter.`)) return;
      const ok = await submitting(form, showError, () => KA.rpc("kadior_update_employee", {
        p_user: row.id, p_full_name: values.full_name, p_role: values.role,
        p_phone: values.phone, p_active: values.active, p_session: values.session || null
      }));
      if (!ok) return;
      KA.toast("Employé mis à jour.");
      location.hash = "#" + ID;
    });
  }

  async function renderPassword(id) {
    KA.loading("Équipe");
    let row;
    try { row = await loadOne(id); } catch (err) { return KA.showLoadError("Équipe", err); }

    const { form, showError, clearError } = formView(`Nouveau mot de passe — ${row.full_name || login(row)}`,
      `<p class="muted">Identifiant : <code>${esc(login(row))}</code>. L'ancien mot de passe cesse de fonctionner immédiatement.</p>` +
      KA.fieldsHtml(passwordFields, () => null, false), "Changer le mot de passe");

    form.addEventListener("submit", async e => {
      e.preventDefault();
      clearError();
      const { values, error } = KA.readForm(form, passwordFields, false);
      if (error) return showError(error);
      const pwdError = checkPasswords(values);
      if (pwdError) return showError(pwdError);
      const ok = await submitting(form, showError, () => KA.rpc("kadior_set_employee_password", {
        p_user: row.id, p_password: values.password
      }));
      if (!ok) return;
      KA.toast("Mot de passe changé.");
      location.hash = "#" + ID;
    });
  }

  KA.register({
    id: ID, label: "Équipe", group: "Gestion", icon: "team", roles: [],
    render(action, id) {
      if (action === "new") return renderCreate();
      if (action === "edit" && id) return renderEdit(id);
      if (action === "password" && id) return renderPassword(id);
      return renderList();
    }
  });
})();
