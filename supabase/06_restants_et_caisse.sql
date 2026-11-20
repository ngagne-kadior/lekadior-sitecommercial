-- =====================================================================
-- LE KADIOR — LOGICIEL DE GESTION : RESTANTS, PÂTISSERIE ET CAISSE
-- ---------------------------------------------------------------------
-- À exécuter dans Supabase > SQL Editor APRÈS 05_production.sql.
-- Idempotent et non destructif (relançable sans risque).
--
-- Reprend les règles du logiciel Lovable :
--   PRODUCTION
--   - le caissier saisit le RESTANT de chaque produit en fin de session ;
--     vendu = disponible − restant ; montant = vendu × prix ;
--   - disponible = reste précédent + total produit ;
--     boulangerie : le soir reprend le restant du matin ; le matin part de 0 ;
--     pâtisserie  : reprend le restant de la session immédiatement précédente
--                   (matin ← soir de la veille, soir ← matin du jour) ;
--   - restant non saisi = TOUT VENDU (vendu = disponible ; rien n'est reporté) ;
--   - un restant saisi par un caissier est VERROUILLÉ : seul l'administrateur
--     peut le corriger ; la production d'un produit dont le restant est saisi
--     ne peut plus être modifiée que par l'administrateur.
--   CAISSE
--   - ventes boutique (espèces) = boulangerie + pâtisserie + abonnements
--                                  + monnaie de départ ;
--   - total dépenses = 12 postes + Wave + Orange Money + Wave Direct
--                      + Livraison (valeur boutique) + dépenses produits
--                      + crédits clients ;
--   - montant à verser = ventes − dépenses + règlements clients livraison
--                        + encaissements de crédits ;
--   - état = versement − montant à verser (excédent / manquant / équilibré) ;
--   - seul le caissier saisit sa caisse ; l'administrateur seulement si le
--     caissier de la session est déclaré absent.
--   Livraisons, abonnements, crédits et règlements valent 0 en attendant
--   leurs modules.
--
-- Tous les montants sont RECALCULÉS par la base, à l'enregistrement puis
-- automatiquement à chaque correction de production, de restant ou de
-- dépense produit. La somme versée par le caissier n'est JAMAIS modifiée.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. CONTRÔLES COMMUNS
-- ---------------------------------------------------------------------

-- Date et session autorisées pour l'utilisateur connecté (lève une erreur sinon)
create or replace function public.kadior_controle_saisie(p_date date, p_session text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session text := public.kadior_my_session();
begin
  if p_session is null or p_session not in ('matin','soir') then
    raise exception 'Session invalide (matin ou soir).' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'Date manquante.' using errcode = '22023';
  end if;
  if p_date > current_date then
    raise exception 'Impossible d''enregistrer une date future.' using errcode = '22023';
  end if;
  if not public.is_admin() then
    if v_session is not null and p_session <> v_session then
      raise exception 'Vous ne pouvez saisir que la session %.', v_session using errcode = '42501';
    end if;
    if p_date < current_date - 1 then
      raise exception 'Saisie possible seulement pour aujourd''hui ou hier. Demandez à l''administrateur pour une autre date.' using errcode = '42501';
    end if;
  end if;
end $$;
revoke all on function public.kadior_controle_saisie(date, text) from public, anon;
grant execute on function public.kadior_controle_saisie(date, text) to authenticated;

-- L'utilisateur peut-il LIRE cette session ? (session fixée = sa session uniquement)
create or replace function public.kadior_session_visible(p_session text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
      or public.kadior_my_role() = 'gestionnaire'
      or public.kadior_my_session() is null
      or p_session = public.kadior_my_session();
$$;
revoke all on function public.kadior_session_visible(text) from public, anon;
grant execute on function public.kadior_session_visible(text) to authenticated;

-- ---------------------------------------------------------------------
-- B. PRODUITS PÂTISSERIE (actifs dans Lovable au 20/11/2026, ordre métier)
-- ---------------------------------------------------------------------
insert into public.production_produits (id, nom, categorie, prix, sans_plats, ordre) values
  ('PT01', 'Brioche petite',  'patisserie',   100, true,  1),
  ('PT02', 'Brioche moyenne', 'patisserie',   150, true,  2),
  ('PT03', 'Brioche grande',  'patisserie',   200, true,  3),
  ('PT04', 'Roche coco',      'patisserie',   100, true,  4),
  ('PT05', 'Beignet',         'patisserie',   150, true,  5),
  ('PT06', 'Dakaroise',       'patisserie',   350, true,  6),
  ('PT07', 'Biscuit',         'patisserie',   100, true,  7),
  ('PT08', 'Cake 150',        'patisserie',   150, true,  8),
  ('PT09', 'Cake 300',        'patisserie',   300, true,  9),
  ('PT10', 'Cake 500',        'patisserie',   500, true, 10),
  ('PT11', 'Madeleine',       'patisserie',     0, true, 11),
  ('PT12', 'Hambourger',      'patisserie',   150, true, 12),
  ('PT13', 'Palmier',         'patisserie',   150, true, 13),
  ('PT14', 'Biscuit Sablé',   'patisserie',   150, true, 14),
  ('PT15', 'Croissant',       'patisserie',   500, true, 15),
  ('PT16', 'Tranche gâteau',  'patisserie',  1200, true, 16),
  ('PT17', 'Gâteau 6000',     'patisserie',  6000, true, 17),
  ('PT18', 'Gâteau 8000',     'patisserie',  8000, true, 18),
  ('PT19', 'Gâteau 10000',    'patisserie', 10000, true, 19),
  ('PT20', 'Gâteau 13000',    'patisserie', 12000, true, 20),
  ('PT21', 'Cookies',         'patisserie',   150, true, 21),
  ('PT22', 'Feuilletage',     'patisserie',   350, true, 22),
  ('PT23', 'Drops',           'patisserie',   700, true, 23),
  ('PT24', 'Etincelle',       'patisserie',   500, true, 24),
  ('PT25', 'Étincelle',       'patisserie',   800, true, 25),
  ('PT26', 'Pain coco',       'patisserie',   350, true, 26),
  ('PT27', 'Pain Raisin',     'patisserie',   500, true, 27)
on conflict do nothing;
-- Madeleine n'existe pas dans la liste active de Lovable : créée INACTIVE (à activer avec son prix)
update public.production_produits set actif = false where id = 'PT11' and prix = 0;

-- ---------------------------------------------------------------------
-- C. LIGNES DE PRODUCTION : prix, reste précédent, restant
-- ---------------------------------------------------------------------
alter table public.production_lignes add column if not exists prix_unitaire     integer;
alter table public.production_lignes add column if not exists reste_precedent   integer not null default 0;
alter table public.production_lignes add column if not exists restant           integer;
alter table public.production_lignes add column if not exists restant_saisi_par uuid references public.profiles(id) on delete set null;
alter table public.production_lignes add column if not exists restant_saisi_le  timestamptz;
select public.kadior_add_constraint('production_lignes', 'production_lignes_restant_check',
  $c$check ((restant is null or restant >= 0) and reste_precedent >= 0 and (prix_unitaire is null or prix_unitaire >= 0))$c$);

-- Prix figé sur les lignes existantes (prix du produit au moment de la saisie)
update public.production_lignes l set prix_unitaire = p.prix
  from public.production_produits p
 where p.id = l.produit_id and l.prix_unitaire is null;

-- Reste précédent d'un produit pour une date et une session
-- (= restant saisi de la session précédente ; restant non saisi = tout vendu, rien reporté)
create or replace function public.kadior_reste_precedent(p_produit text, p_date date, p_session text)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select coalesce(l.restant, 0)
      from public.production_lignes l
      join public.production_produits p on p.id = l.produit_id
     where l.produit_id = p_produit
       and case
             when p.categorie = 'boulangerie' then p_session = 'soir' and l.date = p_date and l.session = 'matin'
             else (p_session = 'soir' and l.date = p_date and l.session = 'matin')
               or (p_session = 'matin' and l.date = p_date - 1 and l.session = 'soir')
           end
  ), 0);
$$;
revoke all on function public.kadior_reste_precedent(text, date, text) from public, anon, authenticated;

-- Met à jour le reste précédent mémorisé de la session SUIVANTE (chaînage)
create or replace function public.kadior_rafraichir_suivant(p_date date, p_session text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_date    date := case when p_session = 'matin' then p_date else p_date + 1 end;
  v_session text := case when p_session = 'matin' then 'soir' else 'matin' end;
begin
  update public.production_lignes l
     set reste_precedent = public.kadior_reste_precedent(l.produit_id, l.date, l.session)
   where l.date = v_date and l.session = v_session;
end $$;
revoke all on function public.kadior_rafraichir_suivant(date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- D. VUE D'UNE SESSION DE PRODUCTION (calculée par la base)
-- ---------------------------------------------------------------------
create or replace function public.kadior_production_vue(p_date date, p_session text)
returns table (
  produit_id text, nom text, categorie text, ordre integer, prix integer,
  contenu_fixe integer, contenu_defaut integer, sans_plats boolean, poids_rendement numeric,
  nombre_plats integer, contenu_par_plat integer, plus integer, quantite_produite integer,
  reste_precedent integer, disponible integer, restant integer, vendu integer, montant integer,
  restant_saisi_par_nom text, restant_saisi_le timestamptz, ligne_existe boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.kadior_has_role(array['caissier','gestionnaire','petrisseur','patissier']) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if not public.kadior_session_visible(p_session) then
    raise exception 'Vous ne pouvez consulter que la session %.', public.kadior_my_session() using errcode = '42501';
  end if;

  return query
  with base as (
    select p.id, p.nom, p.categorie, p.ordre, p.contenu_fixe, p.contenu_defaut,
           p.sans_plats, p.poids_rendement, p.actif, l.id as ligne_id,
           coalesce(l.prix_unitaire, p.prix) as prix,
           coalesce(l.nombre_plats, 0) as plats, coalesce(l.contenu_par_plat, 0) as contenu,
           coalesce(l.plus, 0) as plus, coalesce(l.quantite_produite, 0) as produite,
           public.kadior_reste_precedent(p.id, p_date, p_session) as reste,
           l.restant, l.restant_saisi_par, l.restant_saisi_le
      from public.production_produits p
      left join public.production_lignes l
        on l.produit_id = p.id and l.date = p_date and l.session = p_session
  )
  select b.id, b.nom, b.categorie, b.ordre, b.prix,
         b.contenu_fixe, b.contenu_defaut, b.sans_plats, b.poids_rendement,
         b.plats, b.contenu, b.plus, b.produite,
         b.reste, b.reste + b.produite,
         b.restant,
         greatest(b.reste + b.produite - coalesce(b.restant, 0), 0),
         greatest(b.reste + b.produite - coalesce(b.restant, 0), 0) * b.prix,
         pr.full_name, b.restant_saisi_le, b.ligne_id is not null
    from base b
    left join public.profiles pr on pr.id = b.restant_saisi_par
   where b.actif or b.ligne_id is not null or b.reste > 0
   order by case when b.categorie = 'boulangerie' then 0 else 1 end, b.ordre;
end $$;
revoke all on function public.kadior_production_vue(date, text) from public, anon;
grant execute on function public.kadior_production_vue(date, text) to authenticated;

-- Montants vendus d'une session, calculés directement depuis les tables
-- (même règle que kadior_production_vue : vendu = disponible − restant ;
--  restant non saisi = rien de vendu)
create or replace function public.kadior_montants_production(p_date date, p_session text, out boulangerie integer, out patisserie integer)
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(m.montant) filter (where m.categorie = 'boulangerie'), 0)::integer,
         coalesce(sum(m.montant) filter (where m.categorie = 'patisserie'), 0)::integer
    from (
      select p.categorie,
             greatest(public.kadior_reste_precedent(l.produit_id, l.date, l.session) + l.quantite_produite
                      - coalesce(l.restant, 0), 0) * coalesce(l.prix_unitaire, p.prix) as montant
        from public.production_lignes l
        join public.production_produits p on p.id = l.produit_id
       where l.date = p_date and l.session = p_session
    ) m;
$$;
revoke all on function public.kadior_montants_production(date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- E. ENREGISTREMENT DE LA PRODUCTION
-- ---------------------------------------------------------------------

-- Écriture d'une ligne de production (commun boulangerie / pâtisserie)
create or replace function public.kadior_ecrire_ligne(
  p_date date, p_session text, p_produit public.production_produits,
  p_plats integer, p_contenu integer, p_plus integer
)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_old   public.production_lignes%rowtype;
  v_total integer := p_plats * p_contenu + p_plus;
  v_reste integer := public.kadior_reste_precedent(p_produit.id, p_date, p_session);
begin
  select * into v_old from public.production_lignes
   where date = p_date and session = p_session and produit_id = p_produit.id;

  if not found then
    if v_total = 0 then return false; end if;          -- ligne vide jamais saisie
  elsif v_old.restant is not null then
    if (v_old.nombre_plats, v_old.contenu_par_plat, v_old.plus) is distinct from (p_plats, p_contenu, p_plus) then
      if not public.is_admin() then
        raise exception 'La caisse a déjà saisi le restant de % : seule l''administration peut modifier sa production.', p_produit.nom using errcode = '42501';
      end if;
      if v_old.restant > v_reste + v_total then
        raise exception 'Production de % inférieure au restant déjà saisi par la caisse (%).', p_produit.nom, v_old.restant using errcode = '22023';
      end if;
    end if;
  end if;

  insert into public.production_lignes
    (date, session, produit_id, nombre_plats, contenu_par_plat, plus, quantite_produite,
     prix_unitaire, reste_precedent, saisi_par, saisi_le)
  values
    (p_date, p_session, p_produit.id, p_plats, p_contenu, p_plus, v_total,
     p_produit.prix, v_reste, (select auth.uid()), now())
  on conflict (date, session, produit_id) do update
    set nombre_plats = excluded.nombre_plats, contenu_par_plat = excluded.contenu_par_plat,
        plus = excluded.plus, quantite_produite = excluded.quantite_produite,
        reste_precedent = excluded.reste_precedent,
        saisi_par = excluded.saisi_par, saisi_le = excluded.saisi_le;
  return true;
end $$;
revoke all on function public.kadior_ecrire_ligne(date, text, public.production_produits, integer, integer, integer) from public, anon, authenticated;

-- Boulangerie (pétrisseur / administrateur) — remplace la version de 05
create or replace function public.kadior_enregistrer_production(
  p_date date, p_session text, p_sacs numeric, p_lignes jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l jsonb; v_p public.production_produits%rowtype;
  v_plats integer; v_contenu integer; v_plus integer;
  v_pains numeric; v_sacs numeric; v_nb integer := 0;
begin
  if not public.kadior_has_role(array['petrisseur']) then
    raise exception 'Action réservée au pétrisseur ou à l''administrateur.' using errcode = '42501';
  end if;
  perform public.kadior_controle_saisie(p_date, p_session);
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Lignes de production invalides.' using errcode = '22023';
  end if;

  if p_sacs is not null then
    if p_sacs < 0 or p_sacs > 200 or (p_sacs * 8) <> trunc(p_sacs * 8) then
      raise exception 'Nombre de sacs invalide (fractions de 1/8 de sac uniquement).' using errcode = '22023';
    end if;
    insert into public.sacs_petris (date, session, sacs, saisi_par, saisi_le)
    values (p_date, p_session, p_sacs, (select auth.uid()), now())
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
    if public.kadior_ecrire_ligne(p_date, p_session, v_p, v_plats, v_contenu, v_plus) then
      v_nb := v_nb + 1;
    end if;
  end loop;
  perform public.kadior_rafraichir_suivant(p_date, p_session);

  select coalesce(sum(l.quantite_produite * p.poids_rendement), 0) into v_pains
    from public.production_lignes l join public.production_produits p on p.id = l.produit_id
   where l.date = p_date and l.session = p_session;
  select sacs into v_sacs from public.sacs_petris where date = p_date and session = p_session;

  return jsonb_build_object(
    'lignes', v_nb, 'sacs', coalesce(v_sacs, 0), 'pains_ponderes', v_pains,
    'rendement', case when coalesce(v_sacs, 0) > 0 then round(v_pains / v_sacs, 1) else null end
  );
end $$;
revoke all on function public.kadior_enregistrer_production(date, text, numeric, jsonb) from public, anon;
grant execute on function public.kadior_enregistrer_production(date, text, numeric, jsonb) to authenticated;

-- Pâtisserie (pâtissier / administrateur) : p_lignes = [{ "produit_id": "PT01", "quantite": 40 }, …]
create or replace function public.kadior_enregistrer_patisserie(p_date date, p_session text, p_lignes jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l jsonb; v_p public.production_produits%rowtype; v_q integer; v_nb integer := 0;
begin
  if not public.kadior_has_role(array['patissier']) then
    raise exception 'Action réservée au pâtissier ou à l''administrateur.' using errcode = '42501';
  end if;
  perform public.kadior_controle_saisie(p_date, p_session);
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Lignes de production invalides.' using errcode = '22023';
  end if;
  for v_l in select * from jsonb_array_elements(p_lignes) loop
    select * into v_p from public.production_produits
     where id = v_l->>'produit_id' and actif and categorie = 'patisserie';
    if not found then
      raise exception 'Produit inconnu ou inactif : %.', coalesce(v_l->>'produit_id', '?') using errcode = '22023';
    end if;
    begin
      v_q := coalesce(nullif(v_l->>'quantite', '')::integer, 0);
    exception when others then
      raise exception 'Quantité invalide pour % : nombres entiers uniquement.', v_p.nom using errcode = '22023';
    end;
    if v_q < 0 or v_q > 100000 then
      raise exception 'Quantité invalide pour %.', v_p.nom using errcode = '22023';
    end if;
    if public.kadior_ecrire_ligne(p_date, p_session, v_p, 0, 0, v_q) then v_nb := v_nb + 1; end if;
  end loop;
  perform public.kadior_rafraichir_suivant(p_date, p_session);
  return jsonb_build_object('lignes', v_nb);
end $$;
revoke all on function public.kadior_enregistrer_patisserie(date, text, jsonb) from public, anon;
grant execute on function public.kadior_enregistrer_patisserie(date, text, jsonb) to authenticated;

-- Restants (caissier / administrateur) : p_lignes = [{ "produit_id": "PB01", "restant": 12 }, …]
create or replace function public.kadior_enregistrer_restants(p_date date, p_session text, p_lignes jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_l jsonb; v_p public.production_produits%rowtype; v_old public.production_lignes%rowtype;
  v_r integer; v_reste integer; v_dispo integer; v_nb integer := 0; v_admin boolean := public.is_admin();
begin
  if not public.kadior_has_role(array['caissier']) then
    raise exception 'Action réservée au caissier ou à l''administrateur.' using errcode = '42501';
  end if;
  perform public.kadior_controle_saisie(p_date, p_session);
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Restants invalides.' using errcode = '22023';
  end if;

  for v_l in select * from jsonb_array_elements(p_lignes) loop
    select * into v_p from public.production_produits where id = v_l->>'produit_id';
    if not found then
      raise exception 'Produit inconnu : %.', coalesce(v_l->>'produit_id', '?') using errcode = '22023';
    end if;
    begin
      v_r := nullif(v_l->>'restant', '')::integer;
    exception when others then
      raise exception 'Restant invalide pour % : nombre entier uniquement.', v_p.nom using errcode = '22023';
    end;
    if v_r is null then continue; end if;
    if v_r < 0 then
      raise exception 'Restant invalide pour %.', v_p.nom using errcode = '22023';
    end if;

    select * into v_old from public.production_lignes
     where date = p_date and session = p_session and produit_id = v_p.id;
    if found and v_old.restant is not null and v_old.restant <> v_r and not v_admin then
      raise exception 'Le restant de % est déjà enregistré (%) : seule l''administration peut le corriger.', v_p.nom, v_old.restant using errcode = '42501';
    end if;
    if found and v_old.restant is not distinct from v_r then continue; end if;

    v_reste := public.kadior_reste_precedent(v_p.id, p_date, p_session);
    v_dispo := v_reste + coalesce(v_old.quantite_produite, 0);
    if v_r > v_dispo then
      raise exception 'Le restant de % (%) dépasse le disponible (%).', v_p.nom, v_r, v_dispo using errcode = '22023';
    end if;

    insert into public.production_lignes
      (date, session, produit_id, nombre_plats, contenu_par_plat, plus, quantite_produite,
       prix_unitaire, reste_precedent, restant, restant_saisi_par, restant_saisi_le, saisi_par, saisi_le)
    values
      (p_date, p_session, v_p.id, 0, 0, 0, 0, v_p.prix, v_reste, v_r, (select auth.uid()), now(), (select auth.uid()), now())
    on conflict (date, session, produit_id) do update
      set restant = excluded.restant, reste_precedent = excluded.reste_precedent,
          restant_saisi_par = excluded.restant_saisi_par, restant_saisi_le = excluded.restant_saisi_le;
    v_nb := v_nb + 1;
  end loop;
  perform public.kadior_rafraichir_suivant(p_date, p_session);
  return jsonb_build_object('lignes', v_nb);
end $$;
revoke all on function public.kadior_enregistrer_restants(date, text, jsonb) from public, anon;
grant execute on function public.kadior_enregistrer_restants(date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- F. CAISSE : catalogue des dépenses produits, achats, absences, fiches
-- ---------------------------------------------------------------------
create table if not exists public.catalogue_depenses (
  id          text primary key,
  categorie   text not null,
  designation text not null unique,
  prix_defaut integer not null default 0 check (prix_defaut >= 0),
  ordre       integer not null default 0,
  actif       boolean not null default true
);
insert into public.catalogue_depenses (id, categorie, designation, ordre) values
  ('CD01', 'Matières premières',  'Farine',               1),
  ('CD02', 'Matières premières',  'Levure',               2),
  ('CD03', 'Matières premières',  'Produit',              3),
  ('CD04', 'Matières premières',  'Oeufs',                4),
  ('CD05', 'Matières premières',  'Beurre',               5),
  ('CD06', 'Matières premières',  'Sucre',                6),
  ('CD07', 'Services et hygiène', 'Produit d''entretien', 7),
  ('CD08', 'Services et hygiène', 'Sacs',                 8),
  ('CD09', 'Services et hygiène', 'Emballages',           9),
  ('CD10', 'Services et hygiène', 'Service hygiène',     10),
  ('CD11', 'Charges',             'Eau',                 11),
  ('CD12', 'Charges',             'Électricité',         12),
  ('CD13', 'Charges',             'Gazoil Four',         13),
  ('CD14', 'Charges',             'Transport',           14)
on conflict do nothing;

create table if not exists public.caisse_achats (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  session       text not null check (session in ('matin','soir')),
  article_id    text references public.catalogue_depenses(id) on update cascade on delete set null,
  libelle       text not null,
  categorie     text,
  quantite      numeric(10,2) not null check (quantite > 0),
  prix_unitaire integer not null check (prix_unitaire >= 0),
  montant       integer not null check (montant >= 0),
  saisi_par     uuid references public.profiles(id) on delete set null,
  saisi_le      timestamptz not null default now()
);
create index if not exists caisse_achats_date_idx on public.caisse_achats(date, session);

create table if not exists public.caisse_absences (
  date        date not null,
  session     text not null check (session in ('matin','soir')),
  declare_par uuid references public.profiles(id) on delete set null,
  declare_le  timestamptz not null default now(),
  primary key (date, session)
);

create table if not exists public.caisse_fiches (
  date                   date not null,
  session                text not null check (session in ('matin','soir')),
  responsable_nom        text,
  monnaie_depart         integer not null default 0 check (monnaie_depart >= 0),
  -- 12 postes de dépenses (Lovable)
  dep_abonnement         integer not null default 0 check (dep_abonnement >= 0),
  dep_ration             integer not null default 0 check (dep_ration >= 0),
  dep_journee            integer not null default 0 check (dep_journee >= 0),
  dep_glace              integer not null default 0 check (dep_glace >= 0),
  dep_offert             integer not null default 0 check (dep_offert >= 0),
  dep_frais_boulanger    integer not null default 0 check (dep_frais_boulanger >= 0),
  dep_madar              integer not null default 0 check (dep_madar >= 0),
  dep_divers             integer not null default 0 check (dep_divers >= 0),
  dep_frais_patisserie   integer not null default 0 check (dep_frais_patisserie >= 0),
  dep_retour             integer not null default 0 check (dep_retour >= 0),
  dep_transport          integer not null default 0 check (dep_transport >= 0),
  dep_commission         integer not null default 0 check (dep_commission >= 0),
  -- Encaissements hors espèces (comptés comme sorties de caisse)
  wave                   integer not null default 0 check (wave >= 0),
  orange_money           integer not null default 0 check (orange_money >= 0),
  wave_direct            integer not null default 0 check (wave_direct >= 0),
  livraison              integer not null default 0 check (livraison >= 0),   -- auto (module Livraisons)
  verser                 integer not null default 0 check (verser >= 0),
  -- Calculs (figés par la base à l'enregistrement)
  montant_boulangerie    integer not null default 0,
  montant_patisserie     integer not null default 0,
  total_abonnements      integer not null default 0,
  total_achats           integer not null default 0,
  total_credits          integer not null default 0,
  reglements_livraison   integer not null default 0,
  encaissements_credits  integer not null default 0,
  ventes_especes         integer not null default 0,
  total_designation      integer not null default 0,
  total_depenses         integer not null default 0,
  montant_a_verser       integer not null default 0,
  etat                   integer not null default 0,
  saisi_par              uuid references public.profiles(id) on delete set null,
  saisi_le               timestamptz not null default now(),
  saisi_par_admin        boolean not null default false,
  primary key (date, session)
);

-- Sécurité : lecture ciblée, aucune écriture directe
alter table public.catalogue_depenses enable row level security;
alter table public.caisse_achats      enable row level security;
alter table public.caisse_absences    enable row level security;
alter table public.caisse_fiches      enable row level security;
revoke all on public.catalogue_depenses, public.caisse_achats, public.caisse_absences, public.caisse_fiches from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.catalogue_depenses, public.caisse_achats, public.caisse_absences, public.caisse_fiches from authenticated;
grant select on public.catalogue_depenses, public.caisse_achats, public.caisse_absences, public.caisse_fiches to authenticated;

do $$
declare pol record;
begin
  for pol in
    select * from (values
      ('catalogue_depenses', 'equipe_lit_catalogue_depenses',
         '(select public.kadior_has_role(array[''caissier'',''gestionnaire'']))'),
      ('caisse_achats', 'equipe_lit_caisse_achats',
         '(select public.kadior_has_role(array[''caissier'',''gestionnaire''])) and public.kadior_session_visible(session)'),
      ('caisse_absences', 'equipe_lit_caisse_absences',
         '(select public.kadior_has_role(array[''caissier'',''gestionnaire''])) and public.kadior_session_visible(session)'),
      ('caisse_fiches', 'equipe_lit_caisse_fiches',
         '(select public.kadior_has_role(array[''caissier'',''gestionnaire''])) and public.kadior_session_visible(session)')
    ) as v(tbl, name, cond)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = pol.tbl and policyname = pol.name) then
      execute format('alter policy %I on public.%I to authenticated using (%s)', pol.name, pol.tbl, pol.cond);
    else
      execute format('create policy %I on public.%I for select to authenticated using (%s)', pol.name, pol.tbl, pol.cond);
    end if;
  end loop;
end $$;

-- Droit d'écrire dans la caisse d'une session : caissier, ou admin si absence déclarée
create or replace function public.kadior_controle_caisse(p_date date, p_session text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.kadior_controle_saisie(p_date, p_session);
  if public.is_admin() then
    if not exists (select 1 from public.caisse_absences where date = p_date and session = p_session) then
      raise exception 'La caisse % est réservée au caissier. Déclarez d''abord le caissier absent.', p_session using errcode = '42501';
    end if;
  elsif public.kadior_my_role() is distinct from 'caissier' then
    raise exception 'Action réservée au caissier.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.kadior_controle_caisse(date, text) from public, anon;
grant execute on function public.kadior_controle_caisse(date, text) to authenticated;

-- Montants automatiques d'une session de caisse
create or replace function public.kadior_caisse_auto(p_date date, p_session text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_m record;
  v_achats integer;
begin
  if not public.kadior_has_role(array['caissier','gestionnaire']) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if not public.kadior_session_visible(p_session) then
    raise exception 'Vous ne pouvez consulter que la session %.', public.kadior_my_session() using errcode = '42501';
  end if;
  select * into v_m from public.kadior_montants_production(p_date, p_session);
  select coalesce(sum(montant), 0)::integer into v_achats
    from public.caisse_achats where date = p_date and session = p_session;
  return jsonb_build_object(
    'montant_boulangerie',   v_m.boulangerie,
    'montant_patisserie',    v_m.patisserie,
    'total_abonnements',     0,   -- module Abonnements (à venir)
    'livraison',             0,   -- module Livraisons (à venir)
    'total_credits',         0,   -- crédits clients (à venir)
    'reglements_livraison',  0,   -- règlements clients livraison (à venir)
    'encaissements_credits', 0,   -- encaissements de crédits (à venir)
    'total_achats',          v_achats,
    'absence', exists (select 1 from public.caisse_absences where date = p_date and session = p_session)
  );
end $$;
revoke all on function public.kadior_caisse_auto(date, text) from public, anon;
grant execute on function public.kadior_caisse_auto(date, text) to authenticated;

-- Enregistrement de la fiche de caisse : tous les totaux sont recalculés ici
create or replace function public.kadior_enregistrer_caisse(p_date date, p_session text, p_fiche jsonb)
returns public.caisse_fiches
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_auto  jsonb;
  v_f     public.caisse_fiches%rowtype;
  v_cle   text;
  v_val   integer;
  v_postes constant text[] := array['monnaie_depart','dep_abonnement','dep_ration','dep_journee','dep_glace',
    'dep_offert','dep_frais_boulanger','dep_madar','dep_divers','dep_frais_patisserie','dep_retour',
    'dep_transport','dep_commission','wave','orange_money','wave_direct','verser'];
  v_vals  jsonb := '{}'::jsonb;
begin
  perform public.kadior_controle_caisse(p_date, p_session);
  if p_fiche is null or jsonb_typeof(p_fiche) <> 'object' then
    raise exception 'Fiche de caisse invalide.' using errcode = '22023';
  end if;

  foreach v_cle in array v_postes loop
    begin
      v_val := coalesce(nullif(p_fiche->>v_cle, '')::integer, 0);
    exception when others then
      raise exception 'Montant invalide (%) : nombre entier en FCFA uniquement.', v_cle using errcode = '22023';
    end;
    if v_val < 0 or v_val > 100000000 then
      raise exception 'Montant invalide (%).', v_cle using errcode = '22023';
    end if;
    v_vals := v_vals || jsonb_build_object(v_cle, v_val);
  end loop;

  v_auto := public.kadior_caisse_auto(p_date, p_session);

  v_f := jsonb_populate_record(null::public.caisse_fiches, v_vals);
  v_f.date := p_date;
  v_f.session := p_session;
  v_f.responsable_nom := coalesce(nullif(trim(p_fiche->>'responsable_nom'), ''),
    (select coalesce(full_name, email) from public.profiles where id = (select auth.uid())));
  v_f.livraison             := (v_auto->>'livraison')::integer;
  v_f.montant_boulangerie   := (v_auto->>'montant_boulangerie')::integer;
  v_f.montant_patisserie    := (v_auto->>'montant_patisserie')::integer;
  v_f.total_abonnements     := (v_auto->>'total_abonnements')::integer;
  v_f.total_achats          := (v_auto->>'total_achats')::integer;
  v_f.total_credits         := (v_auto->>'total_credits')::integer;
  v_f.reglements_livraison  := (v_auto->>'reglements_livraison')::integer;
  v_f.encaissements_credits := (v_auto->>'encaissements_credits')::integer;

  v_f.ventes_especes := v_f.montant_boulangerie + v_f.montant_patisserie + v_f.total_abonnements + v_f.monnaie_depart;
  v_f.total_designation := v_f.dep_abonnement + v_f.dep_ration + v_f.dep_journee + v_f.dep_glace + v_f.dep_offert
    + v_f.dep_frais_boulanger + v_f.dep_madar + v_f.dep_divers + v_f.dep_frais_patisserie + v_f.dep_retour
    + v_f.dep_transport + v_f.dep_commission + v_f.wave + v_f.livraison + v_f.wave_direct + v_f.orange_money;
  v_f.total_depenses   := v_f.total_designation + v_f.total_achats + v_f.total_credits;
  v_f.montant_a_verser := v_f.ventes_especes - v_f.total_depenses + v_f.reglements_livraison + v_f.encaissements_credits;
  v_f.etat             := v_f.verser - v_f.montant_a_verser;
  v_f.saisi_par        := (select auth.uid());
  v_f.saisi_le         := now();
  v_f.saisi_par_admin  := public.is_admin();

  insert into public.caisse_fiches select v_f.*
  on conflict (date, session) do update set
    responsable_nom = excluded.responsable_nom, monnaie_depart = excluded.monnaie_depart,
    dep_abonnement = excluded.dep_abonnement, dep_ration = excluded.dep_ration, dep_journee = excluded.dep_journee,
    dep_glace = excluded.dep_glace, dep_offert = excluded.dep_offert, dep_frais_boulanger = excluded.dep_frais_boulanger,
    dep_madar = excluded.dep_madar, dep_divers = excluded.dep_divers, dep_frais_patisserie = excluded.dep_frais_patisserie,
    dep_retour = excluded.dep_retour, dep_transport = excluded.dep_transport, dep_commission = excluded.dep_commission,
    wave = excluded.wave, orange_money = excluded.orange_money, wave_direct = excluded.wave_direct,
    livraison = excluded.livraison, verser = excluded.verser,
    montant_boulangerie = excluded.montant_boulangerie, montant_patisserie = excluded.montant_patisserie,
    total_abonnements = excluded.total_abonnements, total_achats = excluded.total_achats,
    total_credits = excluded.total_credits, reglements_livraison = excluded.reglements_livraison,
    encaissements_credits = excluded.encaissements_credits, ventes_especes = excluded.ventes_especes,
    total_designation = excluded.total_designation, total_depenses = excluded.total_depenses,
    montant_a_verser = excluded.montant_a_verser, etat = excluded.etat,
    saisi_par = excluded.saisi_par, saisi_le = excluded.saisi_le, saisi_par_admin = excluded.saisi_par_admin;

  select * into v_f from public.caisse_fiches where date = p_date and session = p_session;
  return v_f;
end $$;
revoke all on function public.kadior_enregistrer_caisse(date, text, jsonb) from public, anon;
grant execute on function public.kadior_enregistrer_caisse(date, text, jsonb) to authenticated;

-- Dépenses produits (catalogue)
create or replace function public.kadior_ajouter_achat(
  p_date date, p_session text, p_article text, p_quantite numeric, p_prix integer
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_a public.catalogue_depenses%rowtype;
  v_id uuid;
begin
  perform public.kadior_controle_caisse(p_date, p_session);
  select * into v_a from public.catalogue_depenses where id = p_article and actif;
  if not found then
    raise exception 'Choisissez un article du catalogue.' using errcode = '22023';
  end if;
  if p_quantite is null or p_quantite <= 0 or p_quantite > 100000 then
    raise exception 'Quantité invalide.' using errcode = '22023';
  end if;
  if p_prix is null or p_prix < 0 or p_prix > 100000000 then
    raise exception 'Prix unitaire invalide.' using errcode = '22023';
  end if;
  if round(p_quantite * p_prix) > 100000000 then
    raise exception 'Montant trop élevé.' using errcode = '22023';
  end if;
  insert into public.caisse_achats (date, session, article_id, libelle, categorie, quantite, prix_unitaire, montant, saisi_par)
  values (p_date, p_session, v_a.id, v_a.designation, v_a.categorie, p_quantite, p_prix,
          round(p_quantite * p_prix)::integer, (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.kadior_ajouter_achat(date, text, text, numeric, integer) from public, anon;
grant execute on function public.kadior_ajouter_achat(date, text, text, numeric, integer) to authenticated;

create or replace function public.kadior_supprimer_achat(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_a public.caisse_achats%rowtype;
begin
  select * into v_a from public.caisse_achats where id = p_id;
  if not found then
    raise exception 'Dépense introuvable.' using errcode = 'P0002';
  end if;
  perform public.kadior_controle_caisse(v_a.date, v_a.session);
  delete from public.caisse_achats where id = p_id;
end $$;
revoke all on function public.kadior_supprimer_achat(uuid) from public, anon;
grant execute on function public.kadior_supprimer_achat(uuid) to authenticated;

-- Absence du caissier (administrateur) : bascule et renvoie le nouvel état
create or replace function public.kadior_basculer_absence(p_date date, p_session text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Action réservée à l''administrateur.' using errcode = '42501';
  end if;
  if p_session is null or p_session not in ('matin','soir') or p_date is null then
    raise exception 'Date ou session invalide.' using errcode = '22023';
  end if;
  if exists (select 1 from public.caisse_absences where date = p_date and session = p_session) then
    delete from public.caisse_absences where date = p_date and session = p_session;
    return false;
  end if;
  insert into public.caisse_absences (date, session, declare_par) values (p_date, p_session, (select auth.uid()));
  return true;
end $$;
revoke all on function public.kadior_basculer_absence(date, text) from public, anon;
grant execute on function public.kadior_basculer_absence(date, text) to authenticated;

-- ---------------------------------------------------------------------
-- G. RECALCUL AUTOMATIQUE DES CAISSES
--    Ce que le caissier a SAISI ne change jamais (versé, monnaie, dépenses,
--    Wave / OM…). Tout ce qui est CALCULÉ se met à jour seul quand la
--    production, les restants ou les dépenses produits changent ; une
--    correction du matin met aussi à jour le soir, et le soir le lendemain matin.
-- ---------------------------------------------------------------------
-- Recalcule les montants d'une fiche de caisse existante sans toucher aux saisies
create or replace function public.kadior_recalculer_caisse(p_date date, p_session text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_m      record;
  v_achats integer;
begin
  if not exists (select 1 from public.caisse_fiches where date = p_date and session = p_session) then
    return;                                    -- pas encore de fiche : rien à recalculer
  end if;
  select * into v_m from public.kadior_montants_production(p_date, p_session);
  select coalesce(sum(montant), 0)::integer into v_achats
    from public.caisse_achats where date = p_date and session = p_session;

  update public.caisse_fiches f set
    montant_boulangerie   = v_m.boulangerie,
    montant_patisserie    = v_m.patisserie,
    total_abonnements     = 0,     -- module Abonnements (à venir)
    livraison             = 0,     -- module Livraisons (à venir)
    total_credits         = 0,     -- crédits clients (à venir)
    reglements_livraison  = 0,
    encaissements_credits = 0,
    total_achats          = v_achats
   where f.date = p_date and f.session = p_session;

  update public.caisse_fiches f set
    ventes_especes    = f.montant_boulangerie + f.montant_patisserie + f.total_abonnements + f.monnaie_depart,
    total_designation = f.dep_abonnement + f.dep_ration + f.dep_journee + f.dep_glace + f.dep_offert
                      + f.dep_frais_boulanger + f.dep_madar + f.dep_divers + f.dep_frais_patisserie
                      + f.dep_retour + f.dep_transport + f.dep_commission
                      + f.wave + f.livraison + f.wave_direct + f.orange_money
   where f.date = p_date and f.session = p_session;

  update public.caisse_fiches f set
    total_depenses = f.total_designation + f.total_achats + f.total_credits
   where f.date = p_date and f.session = p_session;

  update public.caisse_fiches f set
    montant_a_verser = f.ventes_especes - f.total_depenses + f.reglements_livraison + f.encaissements_credits
   where f.date = p_date and f.session = p_session;

  update public.caisse_fiches f set
    etat = f.verser - f.montant_a_verser       -- la somme versée n'est jamais modifiée
   where f.date = p_date and f.session = p_session;
end $$;
revoke all on function public.kadior_recalculer_caisse(date, text) from public, anon, authenticated;

-- Recalcule la session touchée ET la suivante (qui reprend ses restants)
create or replace function public.kadior_recalculer_caisses_apres(p_date date, p_session text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.kadior_recalculer_caisse(p_date, p_session);
  if p_session = 'matin' then
    perform public.kadior_recalculer_caisse(p_date, 'soir');
  else
    perform public.kadior_recalculer_caisse(p_date + 1, 'matin');
  end if;
end $$;
revoke all on function public.kadior_recalculer_caisses_apres(date, text) from public, anon, authenticated;

-- Déclencheurs : toute modification de production ou de dépenses produits
-- relance le calcul des caisses concernées
create or replace function public.kadior_trg_recalcul_caisse()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.kadior_recalculer_caisses_apres(old.date, old.session);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or new.date <> old.date or new.session <> old.session then
      perform public.kadior_recalculer_caisses_apres(new.date, new.session);
    end if;
  end if;
  return null;
end $$;
revoke all on function public.kadior_trg_recalcul_caisse() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'production_lignes_recalcul_caisse') then
    create trigger production_lignes_recalcul_caisse
      after insert or update or delete on public.production_lignes
      for each row execute function public.kadior_trg_recalcul_caisse();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'caisse_achats_recalcul_caisse') then
    create trigger caisse_achats_recalcul_caisse
      after insert or update or delete on public.caisse_achats
      for each row execute function public.kadior_trg_recalcul_caisse();
  end if;
end $$;

-- Remise à jour des restes reportés (dans l'ordre des journées) puis des caisses
do $$
declare r record;
begin
  for r in select date, session from public.production_lignes
           group by date, session
           order by date, case when session = 'matin' then 0 else 1 end loop
    update public.production_lignes l
       set reste_precedent = public.kadior_reste_precedent(l.produit_id, l.date, l.session)
     where l.date = r.date and l.session = r.session;
  end loop;
  for r in select date, session from public.caisse_fiches loop
    perform public.kadior_recalculer_caisse(r.date, r.session);
  end loop;
end $$;

commit;

-- Contrôles après exécution (lecture seule) :
-- select id, nom, categorie, prix, actif from production_produits order by categorie, ordre;   -- 5 pains + 27 pâtisseries
-- select * from catalogue_depenses order by ordre;                                               -- 14 articles
