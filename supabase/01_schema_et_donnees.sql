-- =====================================================================
-- LE KADIOR — SCHÉMA + DONNÉES INITIALES (idempotent, non destructif)
-- ---------------------------------------------------------------------
-- À exécuter dans Supabase > SQL Editor APRÈS 00_verifier_etat.sql.
-- Peut être relancé sans risque :
--   - aucune table existante n'est recréée (create table if not exists) ;
--   - les colonnes manquantes sont seulement AJOUTÉES (add column if not exists) ;
--   - aucune ligne existante n'est modifiée ni supprimée (on conflict do nothing) ;
--   - aucun DROP, DELETE ou TRUNCATE.
-- Source des données : data/catalog.js (6 catégories, 23 produits) et script.js (événements).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Utilitaire : mise à jour automatique de updated_at
-- ---------------------------------------------------------------------
create or replace function public.kadior_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- CATEGORIES
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          text primary key,                 -- C01…C06 (identifiants du site)
  name        text not null unique,             -- nom utilisé par les produits et filtres
  label       text,                             -- libellé affiché (ex. « Gâteaux & Événements »)
  description text,
  image       text,
  image_focus text,
  href        text,                             -- lien spécial (evenements.html, materiel.html)
  sort_order  integer not null default 0,
  active      boolean not null default true,    -- visible sur le site public
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.categories add column if not exists label       text;
alter table public.categories add column if not exists description text;
alter table public.categories add column if not exists image       text;
alter table public.categories add column if not exists image_focus text;
alter table public.categories add column if not exists href        text;
alter table public.categories add column if not exists sort_order  integer not null default 0;
alter table public.categories add column if not exists active      boolean not null default true;
alter table public.categories add column if not exists created_at  timestamptz not null default now();
alter table public.categories add column if not exists updated_at  timestamptz not null default now();

-- ---------------------------------------------------------------------
-- PRODUCTS (inclut le matériel, catégorie « Matériel », comme sur le site)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id                text primary key,           -- P001…, M001…
  name              text not null,
  category_id       text not null references public.categories(id) on update cascade on delete restrict,
  description       text,
  price             integer check (price is null or price >= 0),   -- FCFA ; null = prix non validé
  price_label       text,                       -- « Prix sur demande », « Sur devis », « À partir de … »
  currency          text not null default 'FCFA',
  available         boolean not null default true,
  image             text,
  image_focus       text,
  featured          boolean not null default false,               -- affiché sur l'accueil
  rating            numeric(2,1) check (rating is null or rating between 0 and 5),
  review_count      integer not null default 0 check (review_count >= 0),
  validation_status text not null default 'pending'
                    check (validation_status in ('pending','validated')), -- validation commerciale
  published         boolean not null default true,                -- visible sur le site public
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Pas de note sans vrais avis : empêche toute note « maquette »
  constraint products_rating_requires_reviews check (rating is null or review_count > 0),
  -- Un produit affiche toujours soit un prix, soit un libellé
  constraint products_price_or_label check (price is not null or price_label is not null)
);
alter table public.products add column if not exists category_id       text references public.categories(id);
alter table public.products add column if not exists description       text;
alter table public.products add column if not exists price             integer;
alter table public.products add column if not exists price_label       text;
alter table public.products add column if not exists currency          text not null default 'FCFA';
alter table public.products add column if not exists available         boolean not null default true;
alter table public.products add column if not exists image             text;
alter table public.products add column if not exists image_focus       text;
alter table public.products add column if not exists featured          boolean not null default false;
alter table public.products add column if not exists rating            numeric(2,1);
alter table public.products add column if not exists review_count      integer not null default 0;
alter table public.products add column if not exists validation_status text not null default 'pending';
alter table public.products add column if not exists published         boolean not null default true;
alter table public.products add column if not exists sort_order        integer not null default 0;
alter table public.products add column if not exists created_at        timestamptz not null default now();
alter table public.products add column if not exists updated_at        timestamptz not null default now();
create index if not exists products_category_idx on public.products(category_id);

-- ---------------------------------------------------------------------
-- EVENTS (types d'événements de la page evenements.html)
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id          text primary key,                 -- EV001…
  key         text not null unique,             -- ancre de page (#mariage…)
  name        text not null,
  label       text,                             -- utilisé dans le message WhatsApp
  title       text,
  description text,
  image       text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.events add column if not exists label       text;
alter table public.events add column if not exists title       text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists image       text;
alter table public.events add column if not exists sort_order  integer not null default 0;
alter table public.events add column if not exists active      boolean not null default true;
alter table public.events add column if not exists created_at  timestamptz not null default now();
alter table public.events add column if not exists updated_at  timestamptz not null default now();

-- ---------------------------------------------------------------------
-- NEWS (actualités) — structure seulement, aucune donnée inventée
-- ---------------------------------------------------------------------
create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  slug         text unique,
  excerpt      text,
  content      text,
  image        text,
  status       text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- GALLERY — structure seulement
-- ---------------------------------------------------------------------
create table if not exists public.gallery (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  image       text not null,
  alt         text,
  category_id text references public.categories(id) on update cascade on delete set null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SITE_SETTINGS (clé / valeur)
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  is_public   boolean not null default true,    -- false = jamais lisible par le site public
  description text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PROMOTIONS — structure seulement, aucune promotion inventée
-- ---------------------------------------------------------------------
create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  product_id  text references public.products(id) on update cascade on delete cascade,
  title       text not null,
  description text,
  old_price   integer check (old_price is null or old_price >= 0),
  new_price   integer check (new_price is null or new_price >= 0),
  start_date  date,
  end_date    date,
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint promotions_dates check (end_date is null or start_date is null or end_date >= start_date)
);

-- ---------------------------------------------------------------------
-- EQUIPMENT : vue sur les produits de la catégorie « Matériel »
-- (évite de dupliquer M001…M007 ; créée seulement si « equipment » n'existe pas)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.equipment') is null then
    execute $v$
      create view public.equipment with (security_invoker = true) as
      select p.*
      from public.products p
      join public.categories c on c.id = p.category_id
      where c.name = 'Matériel'
    $v$;
  else
    raise notice 'equipment existe déjà : conservé tel quel';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Déclencheurs updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories','products','events','news','gallery','site_settings','promotions'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_set_updated_at') then
      execute format('create trigger %I before update on public.%I
                      for each row execute function public.kadior_set_updated_at()',
                     t || '_set_updated_at', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- SÉCURITÉ : RLS + lecture publique limitée + aucune écriture publique
-- ---------------------------------------------------------------------
alter table public.categories    enable row level security;
alter table public.products      enable row level security;
alter table public.events        enable row level security;
alter table public.news          enable row level security;
alter table public.gallery       enable row level security;
alter table public.site_settings enable row level security;
alter table public.promotions    enable row level security;

-- Aucune écriture possible avec la clé publique (anon), même par erreur de politique
revoke insert, update, delete, truncate on
  public.categories, public.products, public.events, public.news,
  public.gallery, public.site_settings, public.promotions
from anon;

-- Politiques de LECTURE publique (créées seulement si absentes)
do $$
declare
  pol record;
begin
  for pol in
    select * from (values
      ('categories',    'public_read_categories',    'active = true'),
      ('products',      'public_read_products',      'published = true'),
      ('events',        'public_read_events',        'active = true'),
      ('news',          'public_read_news',          'status = ''published'''),
      ('gallery',       'public_read_gallery',       'active = true'),
      ('site_settings', 'public_read_site_settings', 'is_public = true'),
      ('promotions',    'public_read_promotions',
         'active = true and (start_date is null or start_date <= current_date)
                        and (end_date   is null or end_date   >= current_date)')
    ) as v(tbl, name, cond)
  loop
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = pol.tbl and policyname = pol.name) then
      execute format('create policy %I on public.%I for select to anon, authenticated using (%s)',
                     pol.name, pol.tbl, pol.cond);
    end if;
  end loop;
end $$;
-- NB : aucune politique INSERT/UPDATE/DELETE → écriture impossible depuis le site.
-- Les politiques d'administration seront ajoutées avec l'espace admin (authentification).

grant select on public.equipment to anon, authenticated;

-- ---------------------------------------------------------------------
-- DONNÉES : catégories (aucun doublon : conflit sur id OU nom → ignoré)
-- ---------------------------------------------------------------------
insert into public.categories (id, name, label, description, image, image_focus, href, sort_order) values
  ('C01', 'Pain',         'Pain',                 'Pains traditionnels et spéciaux',            'assets/images/category-pain.jpg',         '65% 60%', null,              1),
  ('C02', 'Viennoiserie', 'Viennoiserie',         'Croissants, pains chocolat et plus encore',  'assets/images/viennoiserie.png', null,      null,              2),
  ('C03', 'Pâtisserie',   'Pâtisserie',           'Douceurs et créations maison',               'assets/images/category-patisserie.png',   null,      null,              3),
  ('C04', 'Snack',        'Snack',                'Sandwichs, burgers et petites restaurations','assets/images/snack.png',        null,      null,              4),
  ('C05', 'Gâteaux',      'Gâteaux & Événements', 'Anniversaire, mariage, baptême, etc.',       'assets/images/gateaux.png',      null,      'evenements.html', 5),
  ('C06', 'Matériel',     'Matériel',             'Équipements pour boulangerie & pâtisserie',  'assets/images/materiels.png',     null,      'materiel.html',   6)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- DONNÉES : 23 produits
--   - prix uniquement pour les 6 prix validés, sinon « Prix sur demande » / « Sur devis »
--   - rating = null, review_count = 0 (aucun avis inventé)
--   - disponibilité conservée telle qu'affichée actuellement
--   - produits déjà présents en base : NON modifiés
--   - catégorie rattachée par NOM (robuste si les identifiants diffèrent en base)
-- ---------------------------------------------------------------------
insert into public.products
  (id, name, category_id, description, price, price_label, currency, available,
   image, image_focus, featured, validation_status, sort_order, rating, review_count)
select v.id, v.name, c.id, v.description, v.price, v.price_label, v.currency, v.available,
       v.image, v.image_focus, v.featured, v.validation_status, v.sort_order, null, 0
from (values
  ('P001', 'Baguette Tradition', 'Pain', 'Notre baguette croustillante à la mie légère, cuite chaque jour pour accompagner tous vos repas.', 150, null, 'FCFA', true, 'assets/images/product-baguette.jpg', 'center 45%', true, 'validated', 1),
  ('P002', 'Croissant au beurre', 'Viennoiserie', 'Un croissant feuilleté et doré, fondant à l''intérieur, idéal pour bien commencer la journée.', 500, null, 'FCFA', true, 'assets/images/product-croissant.jpg', null, true, 'validated', 2),
  ('P003', 'Pain au chocolat', 'Viennoiserie', 'Une pâte feuilletée généreuse garnie de chocolat, pour une pause gourmande à toute heure.', 500, null, 'FCFA', true, 'assets/images/product-pain-chocolat.jpg', null, true, 'validated', 3),
  ('P004', 'Brioche maison', 'Viennoiserie', 'Une brioche moelleuse et dorée, préparée maison, à déguster nature ou avec de la confiture.', 500, null, 'FCFA', true, 'assets/images/product-brioche.jpg', null, true, 'validated', 4),
  ('P005', 'Roche coco', 'Pâtisserie', 'Un petit gâteau à la noix de coco, doré à l''extérieur et moelleux à cœur.', 500, null, 'FCFA', true, 'assets/images/product-roche-coco.jpg', null, true, 'validated', 5),
  ('P006', 'Gâteau anniversaire', 'Gâteaux', 'Un gâteau personnalisé selon vos envies (taille, parfum, décoration) pour célébrer un anniversaire. Pensez à commander à l''avance.', 8000, 'À partir de 8 000 FCFA', 'FCFA', true, 'assets/images/product-gateau.jpg', null, true, 'validated', 6),
  ('P007', 'Pain de maïs', 'Pain', 'Un pain spécial à la farine de maïs, à la saveur douce et à la mie généreuse.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-pain-mais.jpg', null, false, 'pending', 7),
  ('P008', 'Pain de mil', 'Pain', 'Un pain spécial à base de mil, céréale locale, au goût authentique.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-pain-mil.jpg', null, false, 'pending', 8),
  ('P009', 'Pain niébé', 'Pain', 'Un pain spécial au niébé, savoureux et nourrissant.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-pain-niebe.jpg', null, false, 'pending', 9),
  ('P010', 'Pain thiéré', 'Pain', 'Un pain spécial de la maison, à la croûte parsemée et au goût typé.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-pain-thiere.jpg', null, false, 'pending', 10),
  ('P011', 'Pain diabétique', 'Pain', 'Un pain spécial pensé pour une alimentation attentive. Demandez-nous sa composition et la version sans sel.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-pain-diabetique.jpg', null, false, 'pending', 11),
  ('P012', 'Pain miche', 'Pain', 'Un pain au format généreux, idéal à partager en famille.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-pain-miche.jpg', null, false, 'pending', 12),
  ('P013', 'Sandwich', 'Snack', 'Des sandwichs préparés avec notre pain du jour, garnitures selon disponibilité.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-sandwich.jpg', null, false, 'pending', 13),
  ('P014', 'Burger', 'Snack', 'Un burger gourmand servi dans un pain moelleux, pour une pause rapide et savoureuse.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/product-burger.jpg', null, false, 'pending', 14),
  ('P015', 'Gâteau de mariage', 'Gâteaux', 'Une pièce élégante réalisée sur mesure pour le plus beau jour, selon le nombre d''invités et vos envies.', null, 'Sur devis', 'FCFA', true, 'assets/images/product-gateau-mariage.jpg', null, false, 'pending', 15),
  ('P016', 'Gâteau de baptême', 'Gâteaux', 'Un gâteau délicat et personnalisé pour célébrer l''arrivée de bébé en famille.', null, 'Sur devis', 'FCFA', true, 'assets/images/product-gateau-bapteme.jpg', null, false, 'pending', 16),
  ('M001', 'Fours', 'Matériel', 'Fours pour la cuisson du pain, des viennoiseries et des pâtisseries.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/materiel-fours.jpg', null, false, 'pending', 17),
  ('M002', 'Pétrins', 'Matériel', 'Pétrins pour préparer vos pâtes en quantité, de façon régulière.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/materiel-petrins.jpg', null, false, 'pending', 18),
  ('M003', 'Batteurs', 'Matériel', 'Batteurs-mélangeurs pour crèmes, pâtes et préparations pâtissières.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/materiel-batteurs.jpg', null, false, 'pending', 19),
  ('M004', 'Plaques', 'Matériel', 'Plaques et supports de cuisson pour baguettes, viennoiseries et pâtisseries.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/materiel-plaques.jpg', null, false, 'pending', 20),
  ('M005', 'Ustensiles', 'Matériel', 'Coupe-pâte, spatules, grilles, corbeilles et petits outils du quotidien.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/materiel-ustensiles.jpg', null, false, 'pending', 21),
  ('M006', 'Matériel de pâtisserie', 'Matériel', 'Moules, cercles, poches, douilles et accessoires de décoration.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/materiel-patisserie.jpg', null, false, 'pending', 22),
  ('M007', 'Équipements professionnels', 'Matériel', 'Équipements pour boulangeries, pâtisseries et points de vente. Parlons de votre projet.', null, 'Prix sur demande', 'FCFA', true, 'assets/images/materiel-equipements.jpg', null, false, 'pending', 23)
) as v(id, name, category_name, description, price, price_label, currency, available,
       image, image_focus, featured, validation_status, sort_order)
join public.categories c on c.name = v.category_name
on conflict do nothing;

-- ---------------------------------------------------------------------
-- DONNÉES : types d'événements (textes repris de script.js, rien d'inventé)
-- ---------------------------------------------------------------------
insert into public.events (id, key, name, label, title, description, image, sort_order) values
  ('EV001', 'anniversaire', 'Anniversaire', 'un anniversaire', 'Un gâteau à l''image de la personne fêtée',
   'Parfums, taille, couleurs, décoration, prénom : nous créons avec vous le gâteau d''anniversaire qui fera briller les yeux de vos invités, petits et grands.',
   'assets/images/event-anniversaire.jpg', 1),
  ('EV002', 'mariage', 'Mariage', 'un mariage', 'Des créations élégantes pour le plus beau jour',
   'Pièce montée, gâteau à étages ou douceurs pour vos invités : une création sur mesure, pensée selon le nombre de convives et le style de votre célébration.',
   'assets/images/event-mariage.jpg', 2),
  ('EV003', 'bapteme', 'Baptême', 'un baptême', 'Des douceurs pour accueillir bébé',
   'Gâteaux délicats et gourmandises à partager pour célébrer l''arrivée d''un nouveau membre de la famille, dans une ambiance douce et chaleureuse.',
   'assets/images/event-bapteme.jpg', 3),
  ('EV004', 'ceremonie', 'Cérémonie', 'une cérémonie', 'Le sucré qui accompagne vos cérémonies',
   'Gâteaux, viennoiseries et petites douceurs en quantité pour recevoir vos proches dans les meilleures conditions, le jour venu.',
   'assets/images/event-ceremonie.jpg', 4),
  ('EV005', 'professionnel', 'Événement professionnel', 'un événement professionnel', 'Pauses, séminaires et réceptions',
   'Viennoiseries du matin, snacks et gâteaux pour vos réunions, séminaires, lancements et réceptions d''entreprise. Livraison possible.',
   'assets/images/event-professionnel.jpg', 5)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- DONNÉES : paramètres du site (repris de data/site.json et script.js)
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value, description) values
  ('brand',        '"Le Kadior"',                                   'Nom de la marque'),
  ('location',     '"Mbour, Sénégal"',                              'Localisation'),
  ('openingHours', '"Lun - Dim : 6h - 22h"',                        'Horaires d''ouverture'),
  ('whatsapp',     '"221784666259"',                                'Numéro WhatsApp des commandes (format international sans +)'),
  ('phone',        '"+221 77 123 45 67"',                           'Téléphone affiché — À VALIDER (semble être un exemple)'),
  ('email',        '"lekadior@gmail.com"',                          'E-mail de contact'),
  ('socials',      '{"instagram":"https://www.instagram.com/lekadior_officiel/","facebook":"https://www.facebook.com/share/1EYZV6tKAs/?mibextid=wwXIfr","tiktok":"https://www.tiktok.com/@lekadior_officiel","youtube":""}',
                                                                    'Réseaux sociaux'),
  ('theme',        '{"primary":"#D4A72C","brown":"#4A2C20","cream":"#FFF8EC","dark":"#24150F"}',
                                                                    'Couleurs de la charte (référence, non appliquées dynamiquement)')
on conflict do nothing;

commit;

-- Contrôle rapide après exécution :
-- select c.name as categorie, count(p.id) from categories c left join products p on p.category_id = c.id group by c.name, c.sort_order order by c.sort_order;
-- select validation_status, count(*) from products group by 1;   -- attendu : 6 validated / 17 pending
