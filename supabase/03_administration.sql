-- =====================================================================
-- LE KADIOR — ESPACE ADMINISTRATEUR (rôles, droits, images)
-- ---------------------------------------------------------------------
-- À exécuter dans Supabase > SQL Editor APRÈS 01_schema_et_donnees.sql
-- et 02_preparation_admin.sql.
--
-- Idempotent et non destructif (relançable sans risque) :
--   - aucun DROP, aucun DELETE, aucun TRUNCATE ;
--   - aucun produit, aucune catégorie, aucun prix n'est modifié ;
--   - politiques créées si absentes, sinon ALIGNÉES sur la règle attendue.
--
-- Principe de sécurité :
--   - le public (clé anon) garde EXACTEMENT la même lecture qu'avant ;
--   - un utilisateur simplement connecté (rôle « user ») n'a AUCUN droit
--     d'écriture : il voit la même chose que le public ;
--   - seul un profil au rôle « admin » peut écrire, et ce rôle ne peut
--     être attribué QUE depuis le SQL Editor (section F).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. TABLE PROFILES : un profil par compte Supabase Auth
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,                                   -- copie informative de auth.users.email
  role       text not null default 'user'
             constraint profiles_role_check check (role in ('admin','user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists role       text not null default 'user';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
select public.kadior_add_constraint('profiles', 'profiles_role_check',
  $c$check (role in ('admin','user'))$c$);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_set_updated_at') then
    create trigger profiles_set_updated_at before update on public.profiles
      for each row execute function public.kadior_set_updated_at();
  end if;
end $$;

-- Sécurité de la table : lecture de SON profil (ou de tous pour un admin),
-- AUCUNE écriture depuis le site ou l'API : le rôle ne se change qu'en SQL.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- B. FONCTION is_admin() : l'utilisateur connecté est-il administrateur ?
--    - security definer : lit profiles sans dépendre de ses politiques RLS
--      (évite toute boucle de politiques) ;
--    - search_path vide : aucun détournement possible par un autre schéma ;
--    - stable : évaluée une seule fois par requête dans les politiques.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Politique de lecture des profils (créée après is_admin, qu'elle utilise)
do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read_own_or_admin') then
    alter policy profiles_read_own_or_admin on public.profiles to authenticated
      using (id = (select auth.uid()) or (select public.is_admin()));
  else
    create policy profiles_read_own_or_admin on public.profiles for select to authenticated
      using (id = (select auth.uid()) or (select public.is_admin()));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- C. CRÉATION AUTOMATIQUE DU PROFIL (trigger sur auth.users)
--    - tout nouveau compte reçoit le rôle « user », JAMAIS « admin » ;
--    - les métadonnées envoyées à l'inscription (raw_user_meta_data) sont
--      ignorées : impossible de s'auto-proclamer administrateur ;
--    - un changement d'e-mail met seulement à jour la copie de l'e-mail.
-- ---------------------------------------------------------------------
create or replace function public.kadior_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do update set email = excluded.email;   -- le rôle n'est jamais touché
  return new;
end $$;
revoke all on function public.kadior_handle_new_user() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger
                 where tgname = 'kadior_on_auth_user_created' and tgrelid = 'auth.users'::regclass) then
    create trigger kadior_on_auth_user_created
      after insert or update of email on auth.users
      for each row execute function public.kadior_handle_new_user();
  end if;
end $$;

-- Comptes déjà existants (dont le compte administrateur créé avant ce script) :
-- un profil « user » est créé s'il manque. Aucun profil existant n'est modifié.
insert into public.profiles (id, email, role)
select u.id, u.email, 'user' from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- D. DROITS D'ADMINISTRATION SUR LES DONNÉES DU SITE
--    Politiques ajoutées À CÔTÉ des politiques de lecture publique
--    (public_read_*), qui restent inchangées : le site public lit
--    exactement les mêmes lignes qu'avant.
-- ---------------------------------------------------------------------

-- RLS garanti sur les 8 tables (déjà actif : sans effet s'il l'est)
alter table public.categories    enable row level security;
alter table public.products      enable row level security;
alter table public.events        enable row level security;
alter table public.news          enable row level security;
alter table public.gallery       enable row level security;
alter table public.site_settings enable row level security;
alter table public.promotions    enable row level security;
alter table public.product_types enable row level security;

-- Privilèges : le rôle « authenticated » peut tenter d'écrire, mais chaque
-- ligne est filtrée par les politiques ci-dessous (admin uniquement).
-- TRUNCATE n'est pas soumis au RLS : il est retiré à tous les rôles du site.
grant select, insert, update, delete on
  public.categories, public.products, public.events, public.news, public.gallery,
  public.site_settings, public.promotions, public.product_types
to authenticated;
revoke truncate, references, trigger on
  public.categories, public.products, public.events, public.news, public.gallery,
  public.site_settings, public.promotions, public.product_types
from anon, authenticated;
-- La vue equipment reste en lecture seule pour tout le monde
revoke insert, update, delete, truncate on public.equipment from anon, authenticated;

-- 4 politiques par table : admin_select_*, admin_insert_*, admin_update_*, admin_delete_*
do $$
declare
  t   text;
  c   text;
  cl  text;
  pol text;
  adm constant text := '(select public.is_admin())';
begin
  foreach t in array array['categories','products','events','news','gallery',
                           'site_settings','promotions','product_types'] loop
    foreach c in array array['select','insert','update','delete'] loop
      cl := case c
              when 'insert' then format('with check (%s)', adm)
              when 'update' then format('using (%s) with check (%s)', adm, adm)
              else               format('using (%s)', adm)
            end;
      pol := 'admin_' || c || '_' || t;
      if exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = t and policyname = pol) then
        execute format('alter policy %I on public.%I to authenticated %s', pol, t, cl);
      else
        execute format('create policy %I on public.%I for %s to authenticated %s', pol, t, c, cl);
      end if;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- E. STOCKAGE DES IMAGES : bucket « lekadior-images »
--    - bucket PUBLIC en lecture : les images s'affichent sur le site via
--      leur URL publique (…/storage/v1/object/public/lekadior-images/…) ;
--    - 5 Mo maximum, formats JPEG / PNG / WebP / AVIF uniquement
--      (contrôlé par Supabase lui-même, en plus du contrôle de l'admin) ;
--    - envoi, remplacement, suppression et listage : ADMIN UNIQUEMENT,
--      dans les dossiers prévus, avec une extension d'image autorisée ;
--    - aucune politique de lecture publique sur storage.objects : personne
--      ne peut lister le contenu du bucket sans être administrateur.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lekadior-images', 'lekadior-images', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  c    text;
  cl   text;
  pol  text;
  base constant text :=
    $b$bucket_id = 'lekadior-images' and (select public.is_admin())$b$;
  file constant text :=
    $f$bucket_id = 'lekadior-images' and (select public.is_admin())
       and (storage.foldername(name))[1] = any (array['products','categories','events',
                                                      'promotions','gallery','news','settings'])
       and lower(storage.extension(name)) = any (array['jpg','jpeg','png','webp','avif'])$f$;
begin
  foreach c in array array['select','insert','update','delete'] loop
    cl := case c
            when 'insert' then format('with check (%s)', file)
            when 'update' then format('using (%s) with check (%s)', base, file)
            else               format('using (%s)', base)
          end;
    pol := 'kadior_admin_' || c || '_images';
    if exists (select 1 from pg_policies
               where schemaname = 'storage' and tablename = 'objects' and policyname = pol) then
      execute format('alter policy %I on storage.objects to authenticated %s', pol, cl);
    else
      execute format('create policy %I on storage.objects for %s to authenticated %s', pol, c, cl);
    end if;
  end loop;
end $$;

commit;

-- =====================================================================
-- F. PROMOUVOIR VOTRE COMPTE ADMINISTRATEUR (à faire UNE fois, à la main)
-- ---------------------------------------------------------------------
-- Volontairement laissé en commentaire : aucun UUID n'est inscrit dans
-- la logique permanente de la base.
--
-- 1. Supabase > Authentication > Users : copier l'« UID » de votre compte.
-- 2. Vérifier que son profil existe (créé par ce script) :
--      select id, email, role from public.profiles;
-- 3. Dans une NOUVELLE requête du SQL Editor, remplacer l'UUID puis exécuter :
--
--      update public.profiles
--      set role = 'admin'
--      where id = '00000000-0000-0000-0000-000000000000';   -- ← votre UID
--
--    Résultat attendu : « Success. 1 row affected ».
--    (0 row → l'UUID est faux, ou le script ci-dessus n'a pas été exécuté.)
--
-- Retirer les droits plus tard :
--      update public.profiles set role = 'user' where id = '…';
-- =====================================================================

-- Contrôles après exécution (lecture seule) :
-- select id, email, role from public.profiles;                                   -- votre compte
-- select tablename, policyname, cmd from pg_policies
--   where policyname like 'admin_%' or policyname like 'kadior_admin_%' or tablename = 'profiles'
--   order by 1, 2;                                                               -- 32 + 4 + 1 politiques
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'lekadior-images';
-- select count(*) from public.products;    -- 23
-- select count(*) from public.categories;  -- 6
