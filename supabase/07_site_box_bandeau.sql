-- =====================================================================
-- LE KADIOR — SITE : CATÉGORIE « BOX » ET BANDE ANIMÉE
-- ---------------------------------------------------------------------
-- À exécuter dans Supabase > SQL Editor APRÈS 06.
-- Idempotent et non destructif (relançable sans risque).
--
-- Ajoute la catégorie « Box » (box salées, sucrées, mixtes…).
-- Elle est créée MASQUÉE : rien n'apparaît sur le site tant que vous ne
-- l'avez pas rendue visible dans le logiciel (Site web > Catégories).
--
-- Ensuite, dans Site web > Produits, créez chaque box comme un produit :
--   - catégorie « Box » ;
--   - nom (ex. « Box sucrée ») ;
--   - description = contenu (ex. « 2 croissants, 2 cakes, 1 dakaroise ») ;
--   - prix et photo.
-- Les box s'affichent alors sur l'accueil, dans la section « Nos box »
-- (diaporama), et dans le catalogue (filtre « Box »).
-- Aucun produit d'exemple n'est créé : contenus et prix sont les vôtres.
--
-- Ajoute aussi le paramètre « bandeau_infos » : les informations qui
-- défilent dans la bande du haut du site, après les promotions.
-- Modifiable dans le logiciel : Site web > Paramètres > bandeau_infos.
-- UNE LIGNE = UNE INFORMATION. Valeur de départ : le texte actuel du site.
-- =====================================================================

insert into public.categories (id, name, label, description, image, sort_order, active)
values ('C07', 'Box', 'Box',
        'Box salées, sucrées et mixtes pour vos petits-déjeuners, pauses et réceptions',
        'assets/images/viennoiserie.png', 7, false)
on conflict do nothing;

insert into public.site_settings (key, value, is_public, group_name, validation_status, description)
values ('bandeau_infos', to_jsonb('Qualité · Fraîcheur · Savoir-faire'::text), true, 'general', 'validated',
        'Bande animée du haut du site : une ligne = une information (les promotions s''ajoutent automatiquement)')
on conflict do nothing;

-- Contrôle (lecture seule) :
-- select id, name, active from public.categories order by sort_order;
-- select key, value, is_public from public.site_settings where key = 'bandeau_infos';
