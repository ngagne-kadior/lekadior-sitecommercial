-- =====================================================================
-- LE KADIOR — VÉRIFICATION DE L'ÉTAT SUPABASE (lecture seule)
-- ---------------------------------------------------------------------
-- À exécuter EN PREMIER dans Supabase > SQL Editor.
-- Ce script ne crée, ne modifie et ne supprime rien.
-- =====================================================================

-- 1. Tables / vues attendues : existent-elles ? RLS activé ?
select t.name as objet,
       coalesce(c.relkind::text, '—') as type,            -- r = table, v = vue
       case when c.oid is null then 'ABSENT' else 'présent' end as etat,
       coalesce(c.relrowsecurity::text, '—') as rls_active
from unnest(array['categories','products','events','equipment','news','product_types',
                  'gallery','site_settings','promotions']) as t(name)
left join pg_class c on c.oid = to_regclass('public.' || t.name)
order by 1;

-- 2. Colonnes des tables existantes (pour comparer avec 01_schema_et_donnees.sql)
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('categories','products','events','equipment','news','product_types',
                     'gallery','site_settings','promotions')
order by table_name, ordinal_position;

-- 3. Politiques RLS en place
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4. Droits d'écriture accordés au rôle public « anon » (doit être vide après migration)
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
order by 1, 2;

-- 4 bis. Politiques d'ÉCRITURE existantes (doit être vide tant que l'espace admin n'existe pas)
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and cmd <> 'SELECT'
order by 1, 2;

-- 5. Contenu : nombre de lignes (à lancer seulement si les tables existent)
-- select 'categories' t, count(*) from categories
-- union all select 'products', count(*) from products
-- union all select 'events', count(*) from events;

-- 6. Catégorie Viennoiserie présente ? (à lancer si « categories » existe)
-- select * from categories where name ilike 'viennoiserie';
