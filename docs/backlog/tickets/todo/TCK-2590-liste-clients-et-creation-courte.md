---
id: TCK-2590
title: "Liste des clients en lignes de contact, vues « À relancer / Mes clients », et création en deux temps avec le doublon dit pendant la frappe"
status: todo
phase: P2
family: front
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2583, TCK-2588, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [front, crm, customers, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent rappelle un client depuis la liste sans ouvrir sa fiche, voit d'un coup qui relancer, et crée un prospect en vingt secondes au téléphone sans créer de doublon.

## Contrat de données

- `GET /api/customers` avec `filter[follow_up]`, `filter[referent]`, `filter[stage_group]`, `filter[pipeline_stage]`, `filter[status]`, `filter[tags]`, `filter[search]`, tris `next_action_at`, `last_contacted_at`, `follow_up_days`, `per_page` réellement transmis, `fields[customers]` avec `next_action`, `follow_up`, `referent` et les critères (TCK-2588).
- `GET /api/customers/duplicates` pendant la frappe du téléphone ou de l'e-mail (TCK-2588) ; `POST /api/customers` (existant, 409 de doublon gardé).
- `POST /api/customers/{id}/contacts` au toucher d'Appeler / WhatsApp (TCK-2583).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-clients&a=a` — écrans « Liste », « Nouveau client : qui », « Nouveau client : sa recherche », « Liste vide » ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Vues rapides en pastilles : À relancer (compte) · Mes clients · Négociation · Tous ; « Sans référent » pour l'admin.
- **Téléphone (360-390 px)** : ligne de 96 px — initiales, nom, Appeler et WhatsApp à droite ; la prochaine action ou la relance en retard (point rouge) ; ce qu'il cherche (« Studio · Mermoz · ≤ 250 000 F »). **Bureau (≥ 1280 px)** : tableau Client · Cherche · Étape · Prochaine action (rouge si en retard) · Référent · Étiquettes, tri par colonne, gestes au survol (Appeler, WhatsApp, Planifier), vues en onglets au-dessus ; tableau dès `lg`, défilement horizontal dans son conteneur en deçà.
- Création en deux temps : 1) Prénom, Nom, Téléphone (+221) — « Déjà dans vos clients : Mariama Fall ▸ » apparaît pendant la frappe ; 2) « Ce qu'il cherche » : Louer / Acheter, six types courants en pastilles + « Plus », quartiers en pastilles avec saisie, budget ; lien « Compléter plus tard » (profession, langue, pièce) ; en feuille au téléphone, en panneau au bureau.
- Liste vide : « Pas encore de clients. Ils arrivent avec vos demandes de contact, ou ajoutez-en un. » + « Ajouter un client ».

## Contraintes strictes (métier)

**Pas de régression** (`CustomerList.tsx`, `CustomerListFilters.tsx`, `CustomerForm.tsx`, audit § 2) :
- recherche (nom, prénom, e-mail, téléphone), filtres étape, statut, étiquettes (menu à cases, compteur, « Tout effacer »), tout dans l'URL (`page`, `search`, `pipeline_stage`, `status`, `tags`), retour en page 1 à chaque filtre ;
- « Vue pipeline » (devient « Étapes ») et « Ajouter un client » pour le personnel seulement ; le bailleur lit ses fiches sans créer ; état vide avec ou sans « Ajouter » ;
- pagination ; le sélecteur « 20 / page » **fonctionne** (aujourd'hui `perPage: 20` en dur) et la pagination ne s'annonce qu'une fois ;
- les étiquettes de la liste sont cliquables (→ liste filtrée) ;
- la création garde tous les champs : prénom*, nom*, e-mail **ou** téléphone (E.164), profession, langue des messages, étape (Nouveau par défaut), critères complets (les 16 types restent dans « Plus »), pièce d'identité ; doublon à l'envoi + « Créer quand même » ; erreurs 422 ; garde de sortie ; redirection vers la fiche.
- Le badge « Actif » n'est plus affiché quand il vaut pour toutes les lignes ; le statut reste un filtre.
- Téléphone toujours visible sur la ligne quand il existe (aujourd'hui masqué par l'e-mail) ; formaté.
- i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement ; « Clients » sans « (CRM) ».

## Delta à produire

- [ ] Liste téléphone et tableau bureau ; vues rapides ; tri ; gestes en ligne.
- [ ] Création en deux temps avec sonde de doublon (frappe différée) ; « Compléter plus tard ».
- [ ] Tests : vues → filtres envoyés ; `per_page` transmis ; doublon affiché pendant la frappe et « Créer quand même » à l'envoi ; bailleur sans « Ajouter » ; étiquette cliquable.

## Critères d'acceptation

- [ ] AC1 — À 390 px, au moins six lignes sont visibles sous l'en-tête et les pastilles, chacune avec Appeler et WhatsApp ; une fiche à e-mail **et** téléphone montre le téléphone.
- [ ] AC2 — « À relancer » émet `filter[follow_up]=1&sort=-follow_up_days` (réseau) et affiche le compte de la pastille.
- [ ] AC3 — Taper « 70 648 20 » dans le téléphone de la création fait paraître « Déjà dans vos clients : Mariama Fall » avant tout envoi.
- [ ] AC4 — Choisir « 50 / page » change le nombre de lignes et l'URL.
- [ ] AC5 — Connecté en bailleur, ni « Ajouter un client » ni « Étapes » ne paraissent.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2590.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La fiche (TCK-2589) ; le pipeline (TCK-2592).
- Les vues enregistrées par l'utilisateur (au-delà des quatre vues fixes).

## Notes d'implémentation

**2026-11-12 — lots A (liste) et B (création) ; une seule ligne d'API, la sonde de doublons (Q1).**

- **Liste** : `ListeDesClients` (client) remplace `CustomerList`, la page reste serveur et lit en
  parallèle la liste, les étiquettes et un compte par vue (`per_page=1` → `meta.total` :
  `fetchCustomerCount`, aucune route de comptes). L'état vit dans l'URL (`lib/crm/liste-des-clients.ts`) :
  `?vue=a-relancer|mes-clients|negociation|sans-referent` (absente : « Tous »), `per_page` 10/20/50,
  `sort`. Tri par défaut : `-follow_up_days` sous « À relancer », `next_action_at` pour le personnel,
  `-created_at` pour le bailleur, aucun sous une recherche (TCK-702). « Sans référent » n'est qu'aux
  administrateurs. Choisir une étape quitte « Négociation » ; tout filtre ramène en page 1.
- **Gestes** : Appeler et WhatsApp sur chaque ligne (téléphone d'abord quand la fiche a les deux) ;
  le personnel enregistre le geste (`POST /customers/{id}/contacts {channel}`), jamais le bailleur
  (`CustomerPolicy::update`). La mutation vit dans la liste : un geste que l'API n'a pas noté le
  dit au-dessus de la liste (« Le contact n'a pas été noté… », P228.06), sans retenir l'appel. « Planifier » ouvre `PlanifierDialog` prérempli du client.
- **Création** : `CreationDuClient` (panneau droit, deux temps sous `xl`, un seul panneau dès `xl`),
  servie en place depuis la liste et par `/app/customers/new`. Sonde `GET /customers/duplicates`
  temporisée à 400 ms, partie dès 7 chiffres nationaux ou sur un e-mail complet (la route est
  limitée à 20/min).
  409 à l'envoi → « Créer quand même » (`allow_duplicate`, lié au contact saisi). « Compléter plus
  tard » crée la fiche sans sa recherche. Rien du formulaire d'avant ne se perd (16 types sous
  « Plus », profession, langue, étape, pièce, villes, budget minimum sous « Plus de champs » dès `xl`) ;
  sous `xl`, comme la maquette téléphone, le second temps n'a pas « Plus de champs » : une ligne
  renvoie ces champs à « Modifier » de la fiche, qui les porte tous (`CustomerForm`).
- **Décisions tranchées (team-lead, 2026-11-12)** :
  - *Q1 a)* — AC3 tient tel qu'écrit : la sonde compare un **préfixe** sénégalais dès 7 chiffres
    nationaux (`CustomerDuplicateDetector::probe`, `LIKE '+221<chiffres>%'`), même agence, même
    limiteur, cinq fiches au plus ; la création (`find`, 409) reste à l'égalité. Seule ligne d'API du
    ticket : `CustomerDuplicateDetector.php`, `CustomerDuplicateProbeController.php` et cinq tests
    dans `CustomerDuplicateProbeTest.php` (6 chiffres → rien, autre agence exclue, 5 au plus et
    masqués, la création ignore le préfixe, et les jokers `%` et `_` de l'appelant n'élargissent rien : une
    saisie hors de l'alphabet d'un numéro fait renoncer au préfixe, et le motif `LIKE` n'est bâti que
    de `+221` et de sept ou huit chiffres).
  - *Q2 a)* — la page lit les capacités du profil actif **dans le même `Promise.all`** que la liste,
    les étiquettes et les comptes ; un test épingle le lancement parallèle.
  - *Q7 a)* — « Me désigner » (`POST /customers/{id}/primary-contact {user_id}`) n'est offert qu'au
    porteur de `crm.assign`, jamais au bailleur ; le 403 est déjà éprouvé
    (`PrimaryContactScopeTest::test_without_crm_assign_it_is_a_403`). Sans action prévue ni
    référent, la cellule « Prochaine » dit « Sans référent » au personnel.
  - *Q8 b)* — rendu serveur gardé ; relevés sur la démo, écritures bloquées dans la page ; les écarts
    de contenu sont des « données », les cas absents de la démo (liste vide, a-5) sont éprouvés en
    test de composant avec les personnes de la maquette.
  - Libellé du menu « Clients (CRM) » → « Clients » (fr et en ; wo inchangé), tests de la barre
    latérale suivis.
- **Vues de l'administrateur** : À relancer · Mes clients · Sans référent · Tous (maquette bureau) ;
  l'agent garde « Négociation ». Cela remplace la décision 4 du plan.
- **Écarts restants** : pas de tri sur Étape ni Référent (l'API rend 400 sur `pipeline_stage` et
  `referent`) ; « Relances prévues cette semaine » non servi (aucune donnée) ; pagination au lieu
  de « Voir plus » ; pas de suggestions de quartier ; pas de référent dans l'alerte de doublon. Le
  détail est au tableau « écarts acceptés » de `docs/qa/audit-ux-2026-11/fidelite/TCK-2590.json`.
- **Fidélité** (fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2590.json`, relevés du 2026-11-12 sur la
  démo, `--roles` de la fiche) — conformes · écarts · absents · pixels :
  a-0 téléphone 42 · 19 · 14 · 14,99 % ; a-0 1440 47 · 229 · 72 · 7,6 % ; a-0 1280 48 · 228 · 72 ·
  8,15 % ; a-3 téléphone 20 · 7 · 53 · 1,4 % ; a-3 1440 / 1280 50 · 265 · 75 · 72,12 % / 68,65 % ;
  a-4 téléphone 8 · 22 · 57 · 5,8 % ; a-4 1440 / 1280 49 · 261 · 89 · 70,09 % / 66,37 %. Zones de
  a-0 : titre 0 %, en-tête « Client · Cherche » 0,11 %, barre de tri 0 %. Le gros des écarts de
  bureau : la coque (TCK-2617 à 2619), les données de la démo, et en a-3/a-4 le voile que le
  produit n'a pas (décision du porteur du 2026-11-10, `PanneauDroit`). a-5 (liste vide) éprouvé en
  test de composant. Aucun débord de 360 à 1440 (24 balayages, agent et admin, « Tous » et
  « À relancer »). Les deux requêtes refusées par la garde des relevés à chaque chargement sont
  `getNotificationsAction` (lecture de la cloche de la coque, POST par nature). Les gestes repliés des
  rangées ont été mesurés au navigateur : largeur 0 et hors d'atteinte au repos, 88 px au focus
  sans déplacer la colonne Référent.
- **Ablations** (une à la fois, restaurées) : tri et filtre d'« À relancer », enregistrement du
  geste, sonde sur numéro incomplet, `allow_duplicate`, « Compléter plus tard », création au
  bailleur, étape qui quitte « Négociation » — chacune rougit au moins un test.
  Après les décisions : « Me désigner » sans `crm.assign`, capacités jamais lues, lectures en série,
  case « Me désigner » jamais rendue, sonde au numéro complet seulement, seuil à 6 chiffres (front) ;
  côté API, `LIKE` retiré, seuil à 6, filtre d'agence retiré, limite de 5 retirée, `find()` au lieu
  de `probe()` dans le contrôleur ; l'élision de « Créer la fiche d’Astou » retirée, « Plus de champs » rendu au second temps du téléphone, l'échec du geste jamais affiché ; côté API,
  les jokers `%`/`_` nettoyés en chiffres — chacune rougit au moins un test (relevé :
  `ablation-2590/resultats.txt`, scratchpad du lot 2).
