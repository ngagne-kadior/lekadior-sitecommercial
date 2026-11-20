-- =====================================================================
-- LE KADIOR — LOGICIEL DE GESTION : PRODUCTION BOULANGERIE
-- ---------------------------------------------------------------------
-- À exécuter dans Supabase > SQL Editor APRÈS 04_equipe_et_roles.sql.
-- Idempotent et non destructif (relançable sans risque).
--
-- Reprend les règles de l'écran Production du logiciel Lovable :
--   - sacs pétris par date et par session (matin / soir), fractions de
--     1/8 de sac (« 3 bols » = 0,125) ;
--   - pour chaque pain : plats × contenu par plat + « plus » = total produit ;
--     Sicap 13, Dieck 22, Double Sicap 13 par plat (contenu fixe) ;
--     Sans Sel, Diabétique… : saisie directe dans « plus », sans plats ;
--   - rendement = pains pondérés / sacs pétris
--     (Sicap et Double Sicap comptent 1, Dieck 1/2, les autres 0).
--
-- Sécurité :
--   - écriture UNIQUEMENT via la fonction kadior_enregistrer_production,
--     qui RECALCULE les totaux dans la base (le navigateur ne fait foi de rien) ;
--   - un pétrisseur n'écrit que dans SA session (si elle est fixée dans
--     Équipe) et seulement pour aujourd'hui ou hier ;
--   - chaque saisie garde son auteur et son heure.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. SESSION DE TRAVAIL D'UN EMPLOYÉ (matin / soir / non fixée)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists session text;
alter table public.profiles drop constraint if exists profiles_session_check;
alter table public.profiles add constraint profiles_session_check
  check (session is null or session in ('matin','soir'));

create or replace function public.kadior_my_session()
returns text
language sql stable security definer set search_path = ''
as $$
  select session from public.profiles where id = (select auth.uid()) and active;
$$;
revoke all on function public.kadior_my_session() from public, anon;
grant execute on function public.kadior_my_session() to authenticated;

-- Le profil renvoyé à la connexion inclut la session
drop function if exists public.kadior_my_profile();
create function public.kadior_my_profile()
returns table (id uuid, email text, role text, full_name text, username text, active boolean, session text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email, p.role, p.full_name, p.username, p.active, p.session
  from public.profiles p
  where p.id = (select auth.uid());
$$;
revoke all on function public.kadior_my_profile() from public, anon;
grant execute on function public.kadior_my_profile() to authenticated;

-- Création / modification d'employé : ajout du paramètre « session »
drop function if exists public.kadior_create_employee(text, text, text, text, text);
create or replace function public.kadior_create_employee(
  p_username  text,
  p_full_name text,
  p_role      text,
  p_password  text,
  p_phone     text default null,
  p_session   text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_email    text;
  v_id       uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'Action réservée à l''administrateur.' using errcode = '42501';
  end if;
  if v_username !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Identifiant invalide : 3 à 30 caractères (lettres minuscules, chiffres, point, tiret), sans espace ni accent.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Le nom de l''employé est obligatoire.' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('caissier','livreur','petrisseur','patissier','gestionnaire') then
    raise exception 'Rôle invalide (le rôle administrateur ne s''attribue pas depuis le logiciel).' using errcode = '22023';
  end if;
  if p_session is not null and p_session not in ('matin','soir') then
    raise exception 'Session invalide (matin ou soir).' using errcode = '22023';
  end if;
  perform public.kadior_check_password(p_password);

  v_email := v_username || '@equipe.lekadior.local';
  if exists (select 1 from auth.users where lower(email) = v_email)
     or exists (select 1 from public.profiles where lower(username) = v_username) then
    raise exception 'Cet identifiant est déjà utilisé.' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (id, email, role, full_name, username, phone, active, session)
  values (v_id, v_email, p_role, trim(p_full_name), v_username,
          nullif(trim(coalesce(p_phone, '')), ''), true, p_session)
  on conflict (id) do update
    set role = excluded.role, full_name = excluded.full_name, username = excluded.username,
        phone = excluded.phone, active = true, session = excluded.session;

  return v_id;
end $$;
revoke all on function public.kadior_create_employee(text, text, text, text, text, text) from public, anon;
grant execute on function public.kadior_create_employee(text, text, text, text, text, text) to authenticated;

drop function if exists public.kadior_update_employee(uuid, text, text, text, boolean);
create or replace function public.kadior_update_employee(
  p_user      uuid,
  p_full_name text,
  p_role      text,
  p_phone     text,
  p_active    boolean,
  p_session   text default null
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_current text;
begin
  if not public.is_admin() then
    raise exception 'Action réservée à l''administrateur.' using errcode = '42501';
  end if;
  select role into v_current from public.profiles where id = p_user;
  if v_current is null then
    raise exception 'Employé introuvable.' using errcode = 'P0002';
  end if;
  if v_current = 'admin' then
    raise exception 'Un administrateur ne se modifie pas depuis le logiciel (SQL Editor uniquement).' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('caissier','livreur','petrisseur','patissier','gestionnaire','user') then
    raise exception 'Rôle invalide (le rôle administrateur ne s''attribue pas depuis le logiciel).' using errcode = '22023';
  end if;
  if p_session is not null and p_session not in ('matin','soir') then
    raise exception 'Session invalide (matin ou soir).' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Le nom de l''employé est obligatoire.' using errcode = '22023';
  end if;

  update public.profiles
     set full_name = trim(p_full_name), role = p_role,
         phone = nullif(trim(coalesce(p_phone, '')), ''),
         active = coalesce(p_active, true), session = p_session
   where id = p_user;

  if coalesce(p_active, true) then
    update auth.users set banned_until = null, updated_at = now() where id = p_user;
  else
    update auth.users set banned_until = 'infinity', updated_at = now() where id = p_user;
    delete from auth.sessions where user_id = p_user;
  end if;
end $$;
revoke all on function public.kadior_update_employee(uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.kadior_update_employee(uuid, text, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- B. PRODUITS DE PRODUCTION (pains fabriqués à l'atelier)
--    Distincts du catalogue du site (table products) : noms et prix
--    internes, ordre métier du fichier Excel d'origine.
-- ---------------------------------------------------------------------
create table if not exists public.production_produits (
  id              text primary key,                 -- PB01… (boulangerie)
  nom             text not null unique,
  categorie       text not null default 'boulangerie'
                  check (categorie in ('boulangerie','patisserie')),
  prix            integer not null default 0 check (prix >= 0),   -- FCFA
  contenu_fixe    integer check (contenu_fixe is null or contenu_fixe > 0),  -- pains par plat
  contenu_defaut  integer not null default 13 check (contenu_defaut > 0),
  sans_plats      boolean not null default false,   -- saisie directe dans « plus »
  poids_rendement numeric(4,2) not null default 0 check (poids_rendement >= 0),
  ordre           integer not null default 0,
  actif           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Pains actifs du logiciel Lovable (prix au 20/11/2026)
insert into public.production_produits
  (id, nom, categorie, prix, contenu_fixe, sans_plats, poids_rendement, ordre) values
  ('PB01', 'Sicap',        'boulangerie', 150, 13,   false, 1,   1),
  ('PB02', 'Dieck',        'boulangerie', 100, 22,   false, 0.5, 2),
  ('PB03', 'Double Sicap', 'boulangerie', 200, 13,   false, 1,   3),
  ('PB04', 'Sans Sel',     'boulangerie', 150, null, true,  0,   4),
  ('PB05', 'Diabétique',   'boulangerie', 150, null, true,  0,   5)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- C. SACS PÉTRIS (une valeur par date et par session)
-- ---------------------------------------------------------------------
create table if not exists public.sacs_petris (
  date       date not null,
  session    text not null check (session in ('matin','soir')),
  sacs       numeric(6,3) not null check (sacs >= 0 and sacs <= 200 and (sacs * 8) = trunc(sacs * 8)),
  saisi_par  uuid references public.profiles(id) on delete set null,
  saisi_le   timestamptz not null default now(),
  primary key (date, session)
);

-- ---------------------------------------------------------------------
-- D. LIGNES DE PRODUCTION (une ligne par date, session et pain)
-- ---------------------------------------------------------------------
create table if not exists public.production_lignes (
  id                uuid primary key default gen_random_uuid(),
  date              date not null,
  session           text not null check (session in ('matin','soir')),
  produit_id        text not null references public.production_produits(id) on update cascade on delete restrict,
  nombre_plats      integer not null default 0 check (nombre_plats >= 0),
  contenu_par_plat  integer not null default 0 check (contenu_par_plat >= 0),
  plus              integer not null default 0 check (plus >= 0),
  quantite_produite integer not null default 0 check (quantite_produite >= 0),
  saisi_par         uuid references public.profiles(id) on delete set null,
  saisi_le          timestamptz not null default now(),
  unique (date, session, produit_id),
  constraint production_lignes_total check (quantite_produite = nombre_plats * contenu_par_plat + plus)
);
create index if not exists production_lignes_date_idx on public.production_lignes(date);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'production_produits_set_updated_at') then
    create trigger production_produits_set_updated_at before update on public.production_produits
      for each row execute function public.kadior_set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- E. SÉCURITÉ
-- ---------------------------------------------------------------------
alter table public.production_produits enable row level security;
alter table public.sacs_petris         enable row level security;
alter table public.production_lignes   enable row level security;

-- Aucune écriture directe : uniquement par les fonctions ci-dessous
revoke all on public.production_produits, public.sacs_petris, public.production_lignes from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.production_produits, public.sacs_petris, public.production_lignes from authenticated;
grant select on public.production_produits, public.sacs_petris, public.production_lignes to authenticated;

-- Lecture : équipe concernée ; un pétrisseur à session fixée ne voit que sa session
do $$
declare pol record;
begin
  for pol in
    select * from (values
      ('production_produits', 'equipe_lit_production_produits',
         '(select public.kadior_has_role(array[''petrisseur'',''patissier'',''caissier'',''gestionnaire'']))'),
      ('sacs_petris', 'equipe_lit_sacs_petris',
         '(select public.kadior_has_role(array[''caissier'',''gestionnaire'']))
          or ((select public.kadior_has_role(array[''petrisseur'']))
              and ((select public.kadior_my_session()) is null or session = (select public.kadior_my_session())))'),
      ('production_lignes', 'equipe_lit_production_lignes',
         '(select public.kadior_has_role(array[''caissier'',''gestionnaire'']))
          or ((select public.kadior_has_role(array[''petrisseur'']))
              and ((select public.kadior_my_session()) is null or session = (select public.kadior_my_session())))')
    ) as v(tbl, name, cond)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = pol.tbl and policyname = pol.name) then
      execute format('alter policy %I on public.%I to authenticated using (%s)', pol.name, pol.tbl, pol.cond);
    else
      execute format('create policy %I on public.%I for select to authenticated using (%s)', pol.name, pol.tbl, pol.cond);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- F. ENREGISTREMENT D'UNE SESSION DE PRODUCTION BOULANGERIE
--    p_lignes : [{ "produit_id": "PB01", "plats": 10, "contenu": null, "plus": 3 }, …]
--    Les totaux sont recalculés ici ; les valeurs du navigateur ne servent
--    que de saisie brute. Renvoie le rendement recalculé.
-- ---------------------------------------------------------------------
create or replace function public.kadior_enregistrer_production(
  p_date    date,
  p_session text,
  p_sacs    numeric,
  p_lignes  jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    text := public.kadior_my_role();
  v_session text := public.kadior_my_session();
  v_l       jsonb;
  v_p       public.production_produits%rowtype;
  v_plats   integer;
  v_contenu integer;
  v_plus    integer;
  v_pains   numeric;
  v_sacs    numeric;
  v_nb      integer := 0;
begin
  if v_role is null or v_role not in ('admin','petrisseur') then
    raise exception 'Action réservée au pétrisseur ou à l''administrateur.' using errcode = '42501';
  end if;
  if p_session is null or p_session not in ('matin','soir') then
    raise exception 'Session invalide (matin ou soir).' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Date de production manquante.' using errcode = '22023';
  end if;
  if v_role = 'petrisseur' then
    if v_session is not null and p_session <> v_session then
      raise exception 'Vous ne pouvez saisir que la session %.', v_session using errcode = '42501';
    end if;
    if p_date not between current_date - 1 and current_date then
      raise exception 'Le pétrisseur ne peut saisir que la production d''aujourd''hui ou d''hier. Demandez à l''administrateur pour une autre date.' using errcode = '42501';
    end if;
  end if;
  if p_date > current_date then
    raise exception 'Impossible d''enregistrer une production dans le futur.' using errcode = '22023';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Lignes de production invalides.' using errcode = '22023';
  end if;

  -- Sacs pétris (null = non modifié)
  if p_sacs is not null then
    if p_sacs < 0 or p_sacs > 200 or (p_sacs * 8) <> trunc(p_sacs * 8) then
      raise exception 'Nombre de sacs invalide (fractions de 1/8 de sac uniquement).' using errcode = '22023';
    end if;
    insert into public.sacs_petris (date, session, sacs, saisi_par, saisi_le)
    values (p_date, p_session, p_sacs, v_uid, now())
    on conflict (date, session) do update
      set sacs = excluded.sacs, saisi_par = excluded.saisi_par, saisi_le = excluded.saisi_le;
  end if;

  for v_l in select * from jsonb_array_elements(p_lignes) loop
    select * into v_p from public.production_produits
     where id = v_l->>'produit_id' and actif and categorie = 'boulangerie';
    if not found then
      raise exception 'Pain inconnu ou inactif : %.', coalesce(v_l->>'produit_id', '?') using errcode = '22023';
    end if;

    begin
      v_plats   := coalesce(nullif(v_l->>'plats', '')::integer, 0);
      v_plus    := coalesce(nullif(v_l->>'plus', '')::integer, 0);
      v_contenu := nullif(v_l->>'contenu', '')::integer;
    exception when others then
      raise exception 'Quantité invalide pour % : nombres entiers uniquement.', v_p.nom using errcode = '22023';
    end;
    if v_plats < 0 or v_plus < 0 or coalesce(v_contenu, 0) < 0 or v_plats > 10000 or v_plus > 100000 then
      raise exception 'Quantité invalide pour %.', v_p.nom using errcode = '22023';
    end if;

    if v_p.sans_plats then
      v_plats := 0; v_contenu := 0;
    else
      v_contenu := coalesce(v_p.contenu_fixe, nullif(v_contenu, 0), v_p.contenu_defaut);
    end if;

    -- Ligne vide jamais saisie : rien à créer
    if v_plats = 0 and v_plus = 0 and not exists (
         select 1 from public.production_lignes
          where date = p_date and session = p_session and produit_id = v_p.id) then
      continue;
    end if;

    insert into public.production_lignes
      (date, session, produit_id, nombre_plats, contenu_par_plat, plus, quantite_produite, saisi_par, saisi_le)
    values
      (p_date, p_session, v_p.id, v_plats, v_contenu, v_plus, v_plats * v_contenu + v_plus, v_uid, now())
    on conflict (date, session, produit_id) do update
      set nombre_plats = excluded.nombre_plats, contenu_par_plat = excluded.contenu_par_plat,
          plus = excluded.plus, quantite_produite = excluded.quantite_produite,
          saisi_par = excluded.saisi_par, saisi_le = excluded.saisi_le;
    v_nb := v_nb + 1;
  end loop;

  -- Rendement recalculé par la base
  select coalesce(sum(l.quantite_produite * p.poids_rendement), 0) into v_pains
    from public.production_lignes l join public.production_produits p on p.id = l.produit_id
   where l.date = p_date and l.session = p_session;
  select sacs into v_sacs from public.sacs_petris where date = p_date and session = p_session;

  return jsonb_build_object(
    'lignes', v_nb,
    'sacs', coalesce(v_sacs, 0),
    'pains_ponderes', v_pains,
    'rendement', case when coalesce(v_sacs, 0) > 0 then round(v_pains / v_sacs, 1) else null end
  );
end $$;
revoke all on function public.kadior_enregistrer_production(date, text, numeric, jsonb) from public, anon;
grant execute on function public.kadior_enregistrer_production(date, text, numeric, jsonb) to authenticated;

commit;

-- Contrôles après exécution (lecture seule) :
-- select id, nom, prix, contenu_fixe, sans_plats, poids_rendement from production_produits order by ordre;  -- 5 pains
-- select * from sacs_petris order by date desc, session limit 10;
-- select * from production_lignes order by date desc, session, produit_id limit 20;
