-- =====================================================================
-- LE KADIOR — LOGICIEL DE GESTION : ÉQUIPE, RÔLES ET COMPTES EMPLOYÉS
-- ---------------------------------------------------------------------
-- À exécuter dans Supabase > SQL Editor APRÈS 01, 02 et 03.
--
-- Idempotent et non destructif (relançable sans risque) :
--   - aucune table supprimée, aucune donnée effacée ;
--   - le compte administrateur existant garde son rôle « admin ».
--
-- Ce script ajoute :
--   A. les rôles de l'équipe (caissier, livreur, pétrisseur, pâtissier,
--      gestionnaire) et les informations de chaque employé ;
--   B. les fonctions de contrôle des droits (rôle de l'utilisateur connecté) ;
--   C. les fonctions de gestion des comptes, utilisables UNIQUEMENT par un
--      administrateur depuis le logiciel :
--        - créer un employé (identifiant + mot de passe) ;
--        - modifier son nom, son rôle, son téléphone, l'activer / désactiver ;
--        - lui donner un nouveau mot de passe.
--
-- Règles de sécurité :
--   - le rôle « admin » ne s'attribue JAMAIS depuis le logiciel (SQL seulement) ;
--   - un administrateur ne peut pas être modifié ni désactivé depuis le logiciel ;
--   - un employé désactivé ne peut plus se connecter et perd ses sessions ;
--   - les mots de passe sont chiffrés par la base (bcrypt), jamais stockés en clair.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. PROFILS : rôles de l'équipe + informations employé
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists username  text;
alter table public.profiles add column if not exists phone     text;
alter table public.profiles add column if not exists active    boolean not null default true;

create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- Liste des rôles : la contrainte est remplacée par la liste élargie
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','caissier','livreur','petrisseur','patissier','gestionnaire','user'));

-- ---------------------------------------------------------------------
-- B. CONTRÔLE DES DROITS
-- ---------------------------------------------------------------------

-- Administrateur ACTIF (un admin désactivé perd ses droits immédiatement)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Rôle de l'utilisateur connecté (null si inconnu ou désactivé)
create or replace function public.kadior_my_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles
  where id = (select auth.uid()) and active;
$$;
revoke all on function public.kadior_my_role() from public, anon;
grant execute on function public.kadior_my_role() to authenticated;

-- L'utilisateur connecté a-t-il l'un de ces rôles ? (l'admin a tous les droits)
create or replace function public.kadior_has_role(roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
      and (role = 'admin' or role = any (roles))
  );
$$;
revoke all on function public.kadior_has_role(text[]) from public, anon;
grant execute on function public.kadior_has_role(text[]) to authenticated;

-- Profil de l'utilisateur connecté (utilisé à la connexion)
create or replace function public.kadior_my_profile()
returns table (id uuid, email text, role text, full_name text, username text, active boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email, p.role, p.full_name, p.username, p.active
  from public.profiles p
  where p.id = (select auth.uid());
$$;
revoke all on function public.kadior_my_profile() from public, anon;
grant execute on function public.kadior_my_profile() to authenticated;

-- ---------------------------------------------------------------------
-- C. GESTION DES COMPTES EMPLOYÉS (administrateur uniquement)
-- ---------------------------------------------------------------------
-- Les employés se connectent avec un IDENTIFIANT (ex. « adja ») :
-- le logiciel le transforme en adresse technique « adja@equipe.lekadior.local ».
-- Aucun e-mail n'est jamais envoyé à cette adresse.

create or replace function public.kadior_check_password(p_password text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_password is null or length(p_password) < 8 then
    raise exception 'Le mot de passe doit contenir au moins 8 caractères.' using errcode = '22023';
  end if;
  if length(p_password) > 72 then
    raise exception 'Le mot de passe ne doit pas dépasser 72 caractères.' using errcode = '22023';
  end if;
end $$;
revoke all on function public.kadior_check_password(text) from public, anon, authenticated;

-- Création d'un employé
create or replace function public.kadior_create_employee(
  p_username  text,
  p_full_name text,
  p_role      text,
  p_password  text,
  p_phone     text default null
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

  -- Le profil « user » vient d'être créé par le déclencheur de 03 : on le complète
  insert into public.profiles (id, email, role, full_name, username, phone, active)
  values (v_id, v_email, p_role, trim(p_full_name), v_username, nullif(trim(coalesce(p_phone, '')), ''), true)
  on conflict (id) do update
    set role      = excluded.role,
        full_name = excluded.full_name,
        username  = excluded.username,
        phone     = excluded.phone,
        active    = true;

  return v_id;
end $$;
revoke all on function public.kadior_create_employee(text, text, text, text, text) from public, anon;
grant execute on function public.kadior_create_employee(text, text, text, text, text) to authenticated;

-- Modification d'un employé (nom, rôle, téléphone, actif)
create or replace function public.kadior_update_employee(
  p_user      uuid,
  p_full_name text,
  p_role      text,
  p_phone     text,
  p_active    boolean
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
  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Le nom de l''employé est obligatoire.' using errcode = '22023';
  end if;

  update public.profiles
     set full_name = trim(p_full_name),
         role      = p_role,
         phone     = nullif(trim(coalesce(p_phone, '')), ''),
         active    = coalesce(p_active, true)
   where id = p_user;

  if coalesce(p_active, true) then
    update auth.users set banned_until = null, updated_at = now() where id = p_user;
  else
    -- Désactivation : connexion bloquée et sessions en cours fermées
    update auth.users set banned_until = 'infinity', updated_at = now() where id = p_user;
    delete from auth.sessions where user_id = p_user;
  end if;
end $$;
revoke all on function public.kadior_update_employee(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.kadior_update_employee(uuid, text, text, text, boolean) to authenticated;

-- Nouveau mot de passe pour un employé (mot de passe oublié)
create or replace function public.kadior_set_employee_password(p_user uuid, p_password text)
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
    raise exception 'Le mot de passe d''un administrateur se change dans le SQL Editor.' using errcode = '42501';
  end if;
  perform public.kadior_check_password(p_password);

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
  -- L'ancien mot de passe ne doit plus ouvrir de session
  delete from auth.sessions where user_id = p_user;
end $$;
revoke all on function public.kadior_set_employee_password(uuid, text) from public, anon;
grant execute on function public.kadior_set_employee_password(uuid, text) to authenticated;

commit;

-- Contrôles après exécution (lecture seule) :
-- select id, email, role, full_name, username, active from public.profiles order by role;
-- select public.is_admin();   -- dans le SQL Editor : false (normal, pas de session) ; true dans le logiciel
