# LE KADIOR — Site commercial et logiciel de gestion

Ce dossier contient deux choses qui partagent la même base de données (Supabase) :

1. **Le site public** : ce que voient les clients (produits, prix, promotions, galerie, événements, contact).
2. **Le logiciel de gestion** (dossier `admin/`) : ce qu'utilisent l'équipe et le PDG (production, caisse, équipe, et la gestion du site).

Objectif final : **un seul logiciel** pour toute l'entreprise. Il remplacera l'application Lovable et le projet Kadior_Manager. L'application Lovable reste en service tant que le nouveau logiciel n'a pas tourné **2 semaines en parallèle sans écart**.

---

## 1. Ce qui est déjà fait

| Partie | Ce que ça fait | État |
|---|---|---|
| Site public | Produits, catégories, promotions, galerie, événements, contact, commande par WhatsApp | En ligne |
| Gestion du site | L'admin modifie produits, prix, photos, promotions, galerie, paramètres | Fait |
| Équipe | L'admin crée les comptes employés (identifiant + mot de passe), choisit le rôle et la session (matin / soir), désactive un compte | Fait |
| Production — pétrisseur | Sacs pétris, plats et « plus » par pain, total, rendement (pains par sac) | Fait et testé |
| Production — pâtissier | Quantités de pâtisserie produites | Fait, à tester |
| Production — caissier | Saisie des restants en fin de session ; vendu et montant calculés | Fait, à tester |
| Caisse simple | Monnaie de départ, dépenses, Wave / Orange Money, dépenses produits, versé, montant à verser, écart | Fait et testé |
| Bande animée | En haut de toutes les pages : les promotions en cours (automatique) puis les informations écrites par l'admin (Paramètres → bandeau_infos, une ligne = une information) | Fait, à tester |
| Page Promotions | Toutes les offres en cours, prix, date de fin (« Plus que 2 jours »), bouton Commander ; lien dans le menu | Fait, à tester |
| Diaporamas | Promotions, box et galerie de l'accueil défilent toutes seules | Fait, à tester |
| Box sur le site | Catégorie « Box » ; chaque box est un produit (contenu dans la description) ; section « Nos box » sur l'accueil | Fait, à tester |
| Box dans le logiciel | L'admin crée les box (nom, type, prix, photo, contenu) ; publication automatique sur le site | Fait, à tester |

---

## 2. Les règles importantes

- **Chacun ne voit que son travail.** Le pétrisseur voit la production, la caissière voit la caisse et les restants, l'admin voit tout.
- **Les calculs d'argent sont faits par la base**, jamais seulement par l'écran. Personne ne peut tricher en modifiant la page.
- **Un restant laissé vide compte comme tout vendu.** Le montant s'affiche dès que la production est saisie.
- **Un restant enregistré par la caissière est verrouillé.** Seul l'admin peut le corriger.
- **La somme versée par la caissière ne change jamais.** Si l'admin corrige la production ou un restant, le montant à verser et l'écart se recalculent tout seuls.
- **La caisse appartient au caissier.** L'admin ne peut la remplir que s'il déclare le caissier absent.
- **Le soir reprend les restes du matin** (pain et pâtisserie) ; la pâtisserie du matin reprend les restes de la veille au soir.
- **Une seule carte QR par client**, qui servira à la fois pour l'identifier, pour la fidélité et pour son abonnement.

---

## 3. Le plan, étape par étape

On avance **une étape à la fois**. Une étape commence seulement quand la précédente est testée.

### Étape 1 — Tester la caisse simple *(fait)*
Une journée complète de test : pétrisseur → pâtissier → caissière (restants puis caisse) → correction par l'admin.

### Étape 2 — Le site : diaporamas et box *(fait)*
- Les photos de la **galerie** et des **promotions** défilent toutes seules (diaporama).
- Les **box** (salée, sucrée, mixte…) s'affichent sur le site comme des produits.

### Étape 3 — Les box dans le logiciel *(en cours)*
- **L'admin crée chaque box** : nom, type (salée / sucrée / mixte), prix, photo et contenu (ex. 2 mini-croissants, 1 jus). Le contenu décrit la box : il n'a pas de prix à l'unité (produits plus petits ou préparés à part).
- **La box se publie toute seule sur le site** (section « Nos box » et catalogue).
- Les ventes passées gardent le contenu et le prix du jour de la vente.

### Étape 4 — La caisse enregistreuse
- Au comptoir, la caissière touche les produits sur l'écran (ex. « Sicap × 3 », « Box sucrée »). Le total s'affiche.
- Paiement en espèces, Wave ou Orange Money. Un ticket peut s'imprimer.
- Une box se vend en un clic, à son prix ; ses produits sont retirés du disponible en arrière-plan.
- **Les ventes officielles = les tickets de caisse.** Ce sont eux qui donnent le montant à verser.
- **La caissière compte toujours les restants** en fin de session. Le logiciel compare : ce qui est sorti (disponible − restant) et ce qui a été encaissé (tickets). **La différence = produits sortis sans être encaissés**, signalée à l'admin.
- Matériel possible : tablette ou petit PC, imprimante à tickets, tiroir-caisse, douchette de scan (facultative : la caméra peut suffire).

### Étape 5 — Les clients et leur carte
- **Tout client qui le veut** reçoit une carte avec un QR code.
- **Comment il achète avec sa carte :** il donne sa carte → la caissière la scanne → son nom s'affiche sur le ticket → elle ajoute les produits comme d'habitude → il paie normalement (espèces, Wave, Orange Money).
- La carte **n'est pas un moyen de paiement** : elle sert à savoir **qui achète**, pour garder l'historique de ses achats.
- Carte oubliée : la caissière peut taper son numéro de téléphone.

### Étape 6 — Les abonnements
- Repris de l'application Lovable : la caissière scanne la carte d'abonnement, le logiciel vérifie qu'elle est valide et enregistre le passage du matin ou du soir.
- Même carte que la carte client.

### Étape 7 — Les commandes et les factures
- Commandes de gâteaux, de pains et de viennoiseries pour les clients et les partenaires (restaurants, hôtels…).
- Chaque commande : client, produits, date de livraison ou de retrait, acompte, reste à payer.
- **Facture en PDF avec un QR code.** En scannant le QR, on retrouve la commande et on voit si elle est payée, payée en partie ou livrée.
- Partenaires réguliers : une facture par semaine ou par mois qui regroupe toutes leurs livraisons, avec leur tarif à eux.

### Étape 8 — Les livraisons
Reprises de l'application Lovable : tournées des livreurs, versements, reliquats des clients.

### Étape 9 — La fidélité *(plus tard, pas prioritaire)*
- Le PDG ouvre l'écran Fidélité, voit les clients réguliers et ce qu'ils achètent.
- Quand il le décide, il offre une récompense à un client : une box déjeuner, une réduction pendant X jours, ou un abonnement offert pendant X jours.
- La récompense s'applique automatiquement quand la caissière scanne la carte du client.

### Ensuite
Stock, dépenses du mois, rapports, rôle Gestionnaire (contrôle des versements), puis **arrêt de l'application Lovable** après 2 semaines en parallèle sans écart.

---

## 4. Décisions prises

| Sujet | Décision |
|---|---|
| Logiciel final | L'admin du site commercial devient le logiciel unique ; Lovable et Kadior_Manager seront arrêtés |
| Ventes officielles | Les tickets de caisse (quand la caisse enregistreuse existera) |
| Restants | Toujours comptés par la caissière, pour contrôler les écarts |
| Box | Contenu et prix fixés par l'admin, modifiables ; vendue en un clic à la caisse |
| Carte client | Pour tous ceux qui en veulent ; sert à identifier le client, pas à payer |
| Fidélité | Décidée à la main par le PDG ; pas prioritaire |
| Factures | Factures de Le Kadior pour ses clients et partenaires, avec QR code |
| Caisse | Version simple d'abord, sans dettes, crédits, livraisons ni abonnements |

---

## 5. Pour la partie technique

### Lancer sur l'ordinateur
1. Ouvrir le dossier dans VS Code.
2. Installer l'extension **Live Server**.
3. Clic droit sur `index.html` (site) ou `admin/index.html` (logiciel) → **Open with Live Server**.

### Les scripts de la base (dossier `supabase/`)
À lancer **dans l'ordre**, dans Supabase → SQL Editor. Chaque script peut être relancé sans risque.

| Script | Contenu |
|---|---|
| `00_verifier_etat.sql` | Vérifie l'état de la base (lecture seule) |
| `01_schema_et_donnees.sql` | Tables du site, sécurité, données de départ |
| `02_preparation_admin.sql` | Types de pâtisserie, promotions, galerie, actualités, paramètres |
| `03_administration.sql` | Compte administrateur, images, sécurité de l'espace admin |
| `04_equipe_et_roles.sql` | Rôles de l'équipe et comptes employés |
| `05_production.sql` | Production boulangerie : pains, sacs pétris, rendement, session matin / soir |
| `06_restants_et_caisse.sql` | Pâtisserie, restants, caisse simple, recalcul automatique |
| `07_site_box_bandeau.sql` | Catégorie « Box » (créée masquée) et informations de la bande animée |
| `08_box.sql` | Les box du logiciel (contenu, prix) et leur publication automatique sur le site |

### Les fichiers
- `index.html`, `promotions.html` et les autres pages, `style.css`, `script.js` : le site public.
- `data/catalog.js` : catalogue de secours, utilisé si Supabase ne répond pas.
- `data/supabase-config.js` : adresse Supabase et clé **publique** seulement. **Ne jamais y mettre la clé secrète (`service_role`).**
- `data/supabase-sync.js` : charge les données de Supabase pour le site.
- `admin/index.html` : le logiciel de gestion.
- `admin/js/core.js` : outils communs ; `admin/js/crud.js` : listes et formulaires ; `admin/js/app.js` : connexion et menu (chargé en dernier).
- `admin/modules/` : un fichier par écran (`tableau-de-bord.js`, `caisse.js`, `production.js`, `box.js`, `equipe.js`, `site-web.js`…). L'ordre des fichiers dans `admin/index.html` donne l'ordre du menu.

### Connexion des employés
Un employé se connecte avec son **identifiant** (ex. `adja`). Le logiciel le transforme en adresse technique `adja@equipe.lekadior.local` ; aucun e-mail n'est envoyé. Le rôle administrateur ne se donne qu'en SQL.
