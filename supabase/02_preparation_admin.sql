-- =====================================================================
-- LE KADIOR — PRÉPARATION ADMINISTRATION / PÂTISSERIE / SÉCURITÉ
-- ---------------------------------------------------------------------
-- À exécuter dans Supabase > SQL Editor APRÈS 01_schema_et_donnees.sql.
-- Idempotent et non destructif (relançable sans risque) :
--   - uniquement des AJOUTS (tables, colonnes, contraintes, politiques) ;
--   - aucun DROP de table/colonne, aucun DELETE, aucun TRUNCATE ;
--   - aucun prix, aucune note, aucun avis, aucune promotion, aucune actualité
--     et aucune photo n'est créé : seulement la structure.
--   - nouvelles contraintes en NOT VALID : appliquées aux nouvelles lignes,
--     sans jamais bloquer ni modifier les lignes déjà présentes.
-- =====================================================================

begin;

-- Utilitaire : ajoute une contrainte seulement si elle n'existe pas encore
create or replace function public.kadior_add_constraint(tbl text, cname text, def text)
returns void language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = cname and conrelid = to_regclass('public.' || tbl)) then
    execute format('alter table public.%I add constraint %I %s not valid', tbl, cname, def);
  end if;
end $$;
revoke all on function public.kadior_add_constraint(text, text, text) from public, anon, authenticated;

-- Fonction updated_at : search_path figé (recommandation Supabase)
alter function public.kadior_set_updated_at() set search_path = '';

-- ---------------------------------------------------------------------
-- 1. PÂTISSERIE : types de produits (référentiel pilotable depuis l'admin)
--    Ce sont des TYPES, pas des produits : aucun produit n'est créé.
-- ---------------------------------------------------------------------
create table if not exists public.product_types (
  key         text primary key,
  label       text not null,
  description text,
  event_id    text references public.events(id) on update cascade on delete set null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.product_types (key, label, description, event_id, sort_order)
select v.key, v.label, v.description, e.id, v.sort_order
from (values
  ('portion_individuelle',    'Portion individuelle',    'Pâtisserie vendue à la part / à l''unité',           null,           1),
  ('gateau_familial',         'Gâteau familial',         'Gâteau à partager en famille',                      null,           2),
  ('gateau_anniversaire',     'Gâteau anniversaire',     'Gâteau pour un anniversaire',                       'anniversaire', 3),
  ('gateau_bapteme',          'Gâteau de baptême',       'Gâteau pour un baptême',                            'bapteme',      4),
  ('gateau_mariage',          'Gâteau de mariage',       'Gâteau ou pièce pour un mariage',                   'mariage',      5),
  ('gateau_personnalise',     'Gâteau personnalisé',     'Création sur mesure (forme, décor, message)',       null,           6),
  ('commande_evenementielle', 'Commande événementielle', 'Commande groupée pour cérémonie ou événement pro',   null,           7)
) as v(key, label, description, event_key, sort_order)
left join public.events e on e.key = v.event_key
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. PRODUCTS : champs pâtisserie / commande (tous facultatifs, vides par défaut)
-- ---------------------------------------------------------------------
alter table public.products add column if not exists product_type    text references public.product_types(key) on update cascade on delete set null;
alter table public.products add column if not exists order_mode      text;     -- direct / sur_commande / sur_devis (null = non précisé)
alter table public.products add column if not exists servings_min    integer;  -- nombre de parts
alter table public.products add column if not exists servings_max    integer;
alter table public.products add column if not exists lead_time_hours integer;  -- délai de commande
alter table public.products add column if not exists customizable    boolean;  -- null = non précisé
select public.kadior_add_constraint('products', 'products_order_mode_check',
  $c$check (order_mode is null or order_mode in ('direct','sur_commande','sur_devis'))$c$);
select public.kadior_add_constraint('products', 'products_servings_check',
  $c$check ((servings_min is null or servings_min > 0) and (servings_max is null or servings_max > 0)
           and (servings_min is null or servings_max is null or servings_max >= servings_min))$c$);
select public.kadior_add_constraint('products', 'products_lead_time_check',
  $c$check (lead_time_hours is null or lead_time_hours >= 0)$c$);
create index if not exists products_type_idx on public.products(product_type);

-- Rattachement des 3 gâteaux existants dont le type est explicite dans leur nom
-- (uniquement si aucun type n'est encore renseigné ; prix, dispo et textes inchangés)
update public.products set product_type = 'gateau_anniversaire' where id = 'P006' and product_type is null;
update public.products set product_type = 'gateau_mariage'      where id = 'P015' and product_type is null;
update public.products set product_type = 'gateau_bapteme'      where id = 'P016' and product_type is null;

-- ---------------------------------------------------------------------
-- 3. PROMOTIONS : cible produit OU catégorie, prix promo OU remise, image, ordre
-- ---------------------------------------------------------------------
alter table public.promotions add column if not exists category_id      text references public.categories(id) on update cascade on delete cascade;
alter table public.promotions add column if not exists discount_percent numeric(5,2);
alter table public.promotions add column if not exists discount_amount  integer;
alter table public.promotions add column if not exists image            text;
alter table public.promotions add column if not exists sort_order       integer not null default 0;
-- new_price (déjà présent) = prix promotionnel ; old_price = prix barré éventuel
select public.kadior_add_constraint('promotions', 'promotions_single_target',
  $c$check (product_id is null or category_id is null)$c$);
select public.kadior_add_constraint('promotions', 'promotions_single_discount',
  $c$check (num_nonnulls(new_price, discount_percent, discount_amount) <= 1)$c$);
select public.kadior_add_constraint('promotions', 'promotions_discount_values',
  $c$check ((discount_percent is null or (discount_percent > 0 and discount_percent <= 100))
           and (discount_amount is null or discount_amount > 0))$c$);

-- ---------------------------------------------------------------------
-- 4. NEWS : ordre d'affichage + date de publication automatique
-- ---------------------------------------------------------------------
alter table public.news add column if not exists sort_order integer not null default 0;

create or replace function public.kadior_news_publish_date()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'news_set_published_at') then
    create trigger news_set_published_at before insert or update on public.news
      for each row execute function public.kadior_news_publish_date();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. GALLERY : thème de la photo, liens, mise en avant, consentement client
-- ---------------------------------------------------------------------
alter table public.gallery add column if not exists theme          text;     -- voir contrainte ci-dessous
alter table public.gallery add column if not exists description    text;
alter table public.gallery add column if not exists product_id     text references public.products(id) on update cascade on delete set null;
alter table public.gallery add column if not exists event_id       text references public.events(id)   on update cascade on delete set null;
alter table public.gallery add column if not exists featured       boolean not null default false;
alter table public.gallery add column if not exists client_consent boolean not null default false; -- droit à l'image
select public.kadior_add_constraint('gallery', 'gallery_theme_check',
  $c$check (theme is null or theme in ('gateaux','portions','viennoiseries','pains',
                                       'realisations_clients','equipe','atelier','materiel','autre'))$c$);

-- ---------------------------------------------------------------------
-- 6. SITE_SETTINGS : regroupement + statut de validation par le propriétaire
-- ---------------------------------------------------------------------
alter table public.site_settings add column if not exists group_name        text;
alter table public.site_settings add column if not exists validation_status text not null default 'pending';
select public.kadior_add_constraint('site_settings', 'site_settings_validation_check',
  $c$check (validation_status in ('pending','validated'))$c$);

update public.site_settings set group_name = 'contact'  where key in ('phone','whatsapp','email','location','address') and group_name is null;
update public.site_settings set group_name = 'general'  where key in ('brand','openingHours','about','theme')         and group_name is null;
update public.site_settings set group_name = 'reseaux'  where key = 'socials'                                          and group_name is null;

-- Clés prévues mais SANS valeur (null) et NON publiques tant que non renseignées :
-- aucune coordonnée n'est inventée ni remplacée.
insert into public.site_settings (key, value, is_public, group_name, description) values
  ('address', 'null', false, 'contact', 'Adresse complète — À FOURNIR par le propriétaire'),
  ('about',   'null', false, 'general', 'Texte de présentation — À FOURNIR / valider par le propriétaire')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 7. Déclencheurs updated_at pour la nouvelle table
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'product_types_set_updated_at') then
    create trigger product_types_set_updated_at before update on public.product_types
      for each row execute function public.kadior_set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. SÉCURITÉ : RLS partout, lecture publique ciblée, aucune écriture publique
-- ---------------------------------------------------------------------
alter table public.product_types enable row level security;

revoke insert, update, delete, truncate, references, trigger on
  public.categories, public.products, public.events, public.news, public.gallery,
  public.site_settings, public.promotions, public.product_types
from anon;
-- La vue equipment (si c'est la vue du projet) ne doit jamais être modifiable
do $$
begin
  if to_regclass('public.equipment') is not null then
    execute 'revoke insert, update, delete, truncate on public.equipment from anon';
  end if;
end $$;

grant select on public.product_types to anon, authenticated;

-- Politiques de lecture : créées si absentes, sinon ALIGNÉES sur la règle attendue
do $$
declare pol record;
begin
  for pol in
    select * from (values
      ('categories',    'public_read_categories',    'active = true'),
      ('products',      'public_read_products',      'published = true'),
      ('events',        'public_read_events',        'active = true'),
      ('product_types', 'public_read_product_types', 'active = true'),
      -- actualités : publiées ET date de publication atteinte (pas de brouillon, pas d'article programmé)
      ('news',          'public_read_news',
         'status = ''published'' and (published_at is null or published_at <= now())'),
      -- galerie : photo active ; photo client seulement avec consentement
      ('gallery',       'public_read_gallery',
         'active = true and (theme is distinct from ''realisations_clients'' or client_consent = true)'),
      ('site_settings', 'public_read_site_settings', 'is_public = true'),
      -- promotions : actives et dans leur période (une promo expirée n'est jamais visible)
      ('promotions',    'public_read_promotions',
         'active = true and (start_date is null or start_date <= current_date)
                        and (end_date   is null or end_date   >= current_date)')
    ) as v(tbl, name, cond)
  loop
    if exists (select 1 from pg_policies
               where schemaname = 'public' and tablename = pol.tbl and policyname = pol.name) then
      execute format('alter policy %I on public.%I to anon, authenticated using (%s)',
                     pol.name, pol.tbl, pol.cond);
    else
      execute format('create policy %I on public.%I for select to anon, authenticated using (%s)',
                     pol.name, pol.tbl, pol.cond);
    end if;
  end loop;
end $$;
-- Aucune politique INSERT/UPDATE/DELETE : les écritures passeront par l'espace admin
-- (utilisateur authentifié + politiques dédiées, à créer à l'étape « administration »).

-- Alerte si une politique d'ÉCRITURE créée à la main existe déjà sur ces tables
do $$
declare r record;
begin
  for r in select tablename, policyname, cmd from pg_policies
           where schemaname = 'public' and cmd <> 'SELECT'
             and tablename in ('categories','products','events','news','gallery',
                               'site_settings','promotions','product_types')
  loop
    raise warning 'Politique d''écriture existante à vérifier : %.% (%)', r.tablename, r.policyname, r.cmd;
  end loop;
end $$;

commit;

-- Contrôles après exécution :
-- select key, label from product_types order by sort_order;                    -- 7 types
-- select id, name, product_type from products where product_type is not null;  -- P006, P015, P016
-- select key, validation_status, is_public from site_settings order by key;
