/* =====================================================================
   LE KADIOR — LOGICIEL DE GESTION : DÉMARRAGE, CONNEXION, MENU
   ---------------------------------------------------------------------
   Chargé en DERNIER, après tous les modules.
   - Connexion : e-mail (administrateur) ou identifiant (employé).
   - Accès : tout compte actif ayant un rôle. Le menu n'affiche que les
     modules autorisés pour ce rôle ; la base refuse le reste (RLS).
   ===================================================================== */

(function () {
  "use strict";
  const KA = window.KA;
  const { $, $$, esc } = KA;

  function setLoginMessage(message) {
    const el = $("#login-message");
    el.textContent = message || "";
    el.hidden = !message;
  }

  if (KA.fatalMessage) {
    $("#boot").hidden = true;
    $("#admin-view").hidden = true;
    $("#login-view").hidden = false;
    $("#login-form").querySelectorAll("input, button").forEach(el => { el.disabled = true; });
    return setLoginMessage(KA.fatalMessage);
  }
  const sb = KA.sb;

  /* ---------- Menu ---------- */

  const allowedModules = () => KA.modules.filter(m => KA.hasRole(m.roles));

  function buildMenu() {
    const groups = [];
    for (const m of allowedModules()) {
      let g = groups.find(x => x.name === (m.group || null));
      if (!g) groups.push(g = { name: m.group || null, items: [] });
      g.items.push(m);
    }
    $("#nav").innerHTML = groups.map(g =>
      (g.name ? `<div class="nav-group">${esc(g.name)}</div>` : "") +
      g.items.map(m => `<a href="#${esc(m.id)}" data-section="${esc(m.id)}">${KA.icon(m.icon)}<span>${esc(m.label)}</span></a>`).join("")
    ).join("");
  }

  /* ---------- Navigation ---------- */

  function route() {
    if (!KA.state.profile) return;
    const decode = s => { try { return decodeURIComponent(s || ""); } catch (e) { return ""; } };
    const [section, action, id] = location.hash.replace(/^#/, "").split("/").map(decode);
    const allowed = allowedModules();
    const mod = allowed.find(m => m.id === section) || allowed[0];
    if (!mod) {
      return KA.setView(`<header class="page-head"><h1>Aucun accès</h1></header>
        <p class="muted">Aucune rubrique n'est ouverte pour votre rôle.</p>`);
    }
    $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.section === mod.id));
    const result = mod.id === section ? mod.render(action, id) : mod.render();
    if (result && typeof result.catch === "function") result.catch(err => KA.showLoadError(mod.label, err));
  }
  window.addEventListener("hashchange", route);

  /* ---------- Connexion / accès ---------- */

  function showLogin(message) {
    KA.state.user = null;
    KA.state.profile = null;
    $("#boot").hidden = true;
    $("#admin-view").hidden = true;
    $("#main").innerHTML = "";
    $("#nav").innerHTML = "";
    $("#login-view").hidden = false;
    if (message) setLoginMessage(message);
  }

  async function enter(session) {
    const { data, error } = await sb.rpc("kadior_my_profile");
    const profile = Array.isArray(data) ? data[0] : data;
    if (error || !profile || !profile.active || !KA.ROLES[profile.role] || profile.role === "user") {
      await sb.auth.signOut();
      const notReady = error && /kadior_my_profile|function|schema cache/i.test(error.message || "");
      showLogin(error
        ? (notReady ? "Le logiciel n'est pas encore installé dans Supabase (script supabase/04_equipe_et_roles.sql)."
                    : "Vérification des droits impossible : " + KA.describeError(error))
        : !profile || profile.role === "user" ? "Accès refusé : ce compte n'a pas de rôle dans l'équipe."
        : "Accès refusé : ce compte est désactivé.");
      return;
    }
    KA.state.user = session.user;
    KA.state.profile = profile;
    const name = profile.full_name || profile.username || profile.email || session.user.email || "";
    $("#user-email").innerHTML = `${esc(name)}<br><span class="user-role">${esc(KA.ROLES[profile.role] || profile.role)}</span>`;
    $("#site-link").hidden = !KA.isAdmin();
    buildMenu();
    $("#boot").hidden = true;
    $("#login-view").hidden = true;
    $("#admin-view").hidden = false;
    setLoginMessage("");
    route();
  }

  // « adja » → « adja@equipe.lekadior.local » ; une adresse e-mail reste inchangée
  const toEmail = login => login.includes("@") ? login : `${login.toLowerCase()}@${KA.LOGIN_DOMAIN}`;

  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const login = form.elements.login.value.trim();
    const password = form.elements.password.value;
    if (!login || !password) return setLoginMessage("Saisissez votre identifiant et votre mot de passe.");
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    btn.textContent = "Connexion…";
    setLoginMessage("");
    const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(login), password });
    form.elements.password.value = "";
    btn.disabled = false;
    btn.textContent = "Se connecter";
    if (error) {
      const m = error.message || error.code || "";
      return setLoginMessage(/invalid login|invalid_credentials/i.test(m) ? "Identifiant ou mot de passe incorrect."
        : /banned/i.test(m) ? "Ce compte est désactivé. Contactez l'administrateur."
        : /not confirmed/i.test(m) ? "Adresse e-mail non confirmée." : KA.describeError(error));
    }
    await enter(data.session);
  });

  $("#logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    history.replaceState(null, "", location.pathname);
    showLogin("Vous êtes déconnecté.");
  });

  sb.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT" && KA.state.profile) showLogin("Session terminée : reconnectez-vous.");
  });

  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      if (data.session) await enter(data.session);
      else showLogin();
    } catch (err) {
      showLogin(KA.describeError(err));
    }
  })();
})();
