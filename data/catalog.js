/* =====================================================================
   LE KADIOR — CATALOGUE DE SECOURS (catégories + produits)
   ---------------------------------------------------------------------
   Source de vérité : Supabase (tables « categories » et « products »),
   modifiables depuis /admin. data/supabase-sync.js remplace ces données
   par celles de Supabase dès qu'elles sont disponibles.

   Ce fichier sert de SECOURS : première visite (avant la réponse de
   Supabase) ou Supabase momentanément indisponible.
   Copie des données publiques de Supabase au 2026-09-27 : 6 catégories,
   25 produits visibles, dans l'ordre d'affichage (sort_order).
   Même forme que les données converties par supabase-sync.js : si rien n'a
   changé dans Supabase, la page n'est pas redessinée.
   À régénérer après des modifications importantes dans l'admin.

   Règles :
   - price       : nombre en FCFA si le prix est connu, sinon null
   - priceLabel  : texte affiché à la place du prix calculé
                   ("Prix sur demande", "Sur devis", "À partir de …") ou null
   - rating / reviewCount : uniquement de VRAIS avis clients (sinon null / 0)
                   → le site affiche « Pas encore d'avis »
   - image       : URL Supabase Storage, ou chemin dans assets/images/
                   (fichier absent = « Photo à venir »)
   ===================================================================== */

const KADIOR_CATEGORIES = [
  {id:"C01", name:"Pain", label:"Pain", description:"Pains traditionnels et spéciaux",
   image:"https://yvfwhjixhqxejvhefvyx.supabase.co/storage/v1/object/public/lekadior-images/categories/1790428204682-eyn5zu.jpg", imageFocus:"65% 60%", href:null, order:1},
  {id:"C02", name:"Viennoiserie", label:"Viennoiserie", description:"Croissants, pains chocolat et plus encore",
   image:"assets/images/viennoiserie.png", imageFocus:null, href:null, order:2},
  {id:"C03", name:"Pâtisserie", label:"Pâtisserie", description:"Douceurs et créations maison",
   image:"assets/images/category-patisserie.png", imageFocus:null, href:null, order:3},
  {id:"C04", name:"Snack", label:"Snack", description:"Sandwichs, burgers et petites restaurations",
   image:"assets/images/snack.png", imageFocus:null, href:null, order:4},
  {id:"C05", name:"Gâteaux", label:"Gâteaux & Événements", description:"Anniversaire, mariage, baptême, etc.",
   image:"assets/images/gateaux.png", imageFocus:null, href:"evenements.html", order:5},
  {id:"C06", name:"Matériel", label:"Matériel", description:"Équipements pour boulangerie & pâtisserie",
   image:"assets/images/materiels.png", imageFocus:null, href:"materiel.html", order:6}
];

const KADIOR_PRODUCTS = [
  {id:"P018", name:"Palmier", category:"Viennoiserie",
   description:"",
   price:150, priceLabel:null, currency:"FCFA", available:true,
   image:"https://yvfwhjixhqxejvhefvyx.supabase.co/storage/v1/object/public/lekadior-images/products/1790506932127-8lqh3j.jpg", imageFocus:"center", rating:null, reviewCount:0, featured:true},
  {id:"P001", name:"Baguette Tradition", category:"Pain",
   description:"Notre baguette croustillante à la mie légère, cuite chaque jour pour accompagner tous vos repas.",
   price:150, priceLabel:null, currency:"FCFA", available:true,
   image:"assets/images/product-baguette.jpg", imageFocus:"center 45%", rating:null, reviewCount:0, featured:true},
  {id:"P002", name:"Croissant au beurre", category:"Viennoiserie",
   description:"Un croissant feuilleté et doré, fondant à l'intérieur, idéal pour bien commencer la journée.",
   price:500, priceLabel:null, currency:"FCFA", available:true,
   image:"https://yvfwhjixhqxejvhefvyx.supabase.co/storage/v1/object/public/lekadior-images/products/1790426985374-87jwto.jpg", imageFocus:null, rating:null, reviewCount:0, featured:true},
  {id:"P017", name:"cookies", category:"Pâtisserie",
   description:"",
   price:150, priceLabel:null, currency:"FCFA", available:true,
   image:"https://yvfwhjixhqxejvhefvyx.supabase.co/storage/v1/object/public/lekadior-images/products/1790448284080-2iuqd7.jpg", imageFocus:"centrer", rating:null, reviewCount:0, featured:false},
  {id:"P003", name:"Pain au chocolat", category:"Viennoiserie",
   description:"Une pâte feuilletée généreuse garnie de chocolat, pour une pause gourmande à toute heure.",
   price:500, priceLabel:null, currency:"FCFA", available:true,
   image:"https://yvfwhjixhqxejvhefvyx.supabase.co/storage/v1/object/public/lekadior-images/products/1790434591120-cyrr5d.jpg", imageFocus:"centrer", rating:null, reviewCount:0, featured:true},
  {id:"P004", name:"Brioche maison", category:"Viennoiserie",
   description:"Une brioche moelleuse et dorée, préparée maison, à déguster nature ou avec de la confiture.",
   price:500, priceLabel:null, currency:"FCFA", available:true,
   image:"assets/images/product-brioche.jpg", imageFocus:null, rating:null, reviewCount:0, featured:true},
  {id:"P005", name:"Roche coco", category:"Pâtisserie",
   description:"Un petit gâteau à la noix de coco, doré à l'extérieur et moelleux à cœur.",
   price:100, priceLabel:null, currency:"FCFA", available:true,
   image:"assets/images/product-roche-coco.jpg", imageFocus:null, rating:null, reviewCount:0, featured:true},
  {id:"P006", name:"Gâteau anniversaire", category:"Gâteaux",
   description:"Un gâteau personnalisé selon vos envies (taille, parfum, décoration) pour célébrer un anniversaire. Pensez à commander à l'avance.",
   price:8000, priceLabel:"À partir de 8 000 FCFA", currency:"FCFA", available:true,
   image:"https://yvfwhjixhqxejvhefvyx.supabase.co/storage/v1/object/public/lekadior-images/products/1790506766780-w7f47j.jpg", imageFocus:"Center", rating:null, reviewCount:0, featured:true},
  {id:"P007", name:"Pain de maïs", category:"Pain",
   description:"Un pain spécial à la farine de maïs, à la saveur douce et à la mie généreuse.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-pain-mais.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P008", name:"Pain de mil", category:"Pain",
   description:"Un pain spécial à base de mil, céréale locale, au goût authentique.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-pain-mil.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P009", name:"Pain niébé", category:"Pain",
   description:"Un pain spécial au niébé, savoureux et nourrissant.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-pain-niebe.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P010", name:"Pain thiéré", category:"Pain",
   description:"Un pain spécial de la maison, à la croûte parsemée et au goût typé.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-pain-thiere.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P011", name:"Pain diabétique", category:"Pain",
   description:"Un pain spécial pensé pour une alimentation attentive. Demandez-nous sa composition et la version sans sel.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-pain-diabetique.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P012", name:"Pain miche", category:"Pain",
   description:"Un pain au format généreux, idéal à partager en famille.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-pain-miche.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P013", name:"Sandwich", category:"Snack",
   description:"Des sandwichs préparés avec notre pain du jour, garnitures selon disponibilité.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-sandwich.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P014", name:"Burger", category:"Snack",
   description:"Un burger gourmand servi dans un pain moelleux, pour une pause rapide et savoureuse.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/product-burger.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P015", name:"Gâteau de mariage", category:"Gâteaux",
   description:"Une pièce élégante réalisée sur mesure pour le plus beau jour, selon le nombre d'invités et vos envies.",
   price:null, priceLabel:"Sur devis", currency:"FCFA", available:true,
   image:"assets/images/product-gateau-mariage.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"P016", name:"Gâteau de baptême", category:"Gâteaux",
   description:"Un gâteau délicat et personnalisé pour célébrer l'arrivée de bébé en famille.",
   price:null, priceLabel:"Sur devis", currency:"FCFA", available:true,
   image:"assets/images/product-gateau-bapteme.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"M001", name:"Fours", category:"Matériel",
   description:"Fours pour la cuisson du pain, des viennoiseries et des pâtisseries.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/materiel-fours.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"M002", name:"Pétrins", category:"Matériel",
   description:"Pétrins pour préparer vos pâtes en quantité, de façon régulière.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/materiel-petrins.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"M003", name:"Batteurs", category:"Matériel",
   description:"Batteurs-mélangeurs pour crèmes, pâtes et préparations pâtissières.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/materiel-batteurs.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"M004", name:"Plaques", category:"Matériel",
   description:"Plaques et supports de cuisson pour baguettes, viennoiseries et pâtisseries.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/materiel-plaques.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"M005", name:"Ustensiles", category:"Matériel",
   description:"Coupe-pâte, spatules, grilles, corbeilles et petits outils du quotidien.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/materiel-ustensiles.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"M006", name:"Matériel de pâtisserie", category:"Matériel",
   description:"Moules, cercles, poches, douilles et accessoires de décoration.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/materiel-patisserie.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false},
  {id:"M007", name:"Équipements professionnels", category:"Matériel",
   description:"Équipements pour boulangeries, pâtisseries et points de vente. Parlons de votre projet.",
   price:null, priceLabel:"Prix sur demande", currency:"FCFA", available:true,
   image:"assets/images/materiel-equipements.jpg", imageFocus:null, rating:null, reviewCount:0, featured:false}
];
