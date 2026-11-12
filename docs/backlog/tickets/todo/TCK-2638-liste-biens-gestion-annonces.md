---
id: TCK-2638
title: "Liste des biens en deux modes : Gestion (occupé, vacant, en retard) et Annonces (en ligne, vues)"
status: todo
phase: P1
family: front
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2637, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2678]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, properties, mobile, audit-ux, app]
---

## Objectif utilisateur

Le gestionnaire voit d'un coup d'œil ce qui est occupé, vacant ou en retard. L'agent commercial voit ce qui est en ligne et ce que ses annonces rapportent. Aucun geste de la liste actuelle ne se perd.

## Contrat de données

Endpoints consommés :

- `GET /api/properties`, avec `include=occupancy`, `include=online` (`is_online`), les filtres `occupancy`, `rent_late` et `tenant`, et le tri `retard` (TCK-2637) ;
- `GET /api/properties/portfolio-summary` pour les tuiles et les pastilles, en **un** appel (TCK-2637) ;
- les filtres, tris et actions existants de la liste : publier, dupliquer, booster, statut, archiver, supprimer, actions groupées ;
- `GET /api/me/quota` pour la jauge du mode Annonces.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-biens&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Liste — mode Gestion » et « Liste — mode Annonces », au téléphone et au bureau.
  - Le bien « Villa 5 chambres · Ouest Foire » de la maquette est une donnée fictive.
- **Sélecteur segmenté « Gestion · Annonces »** en tête :
  - le mode est mémorisé sur l'appareil et repris dans l'URL (un lien garde le mode) ;
  - il n'est pas proposé à un compte qui n'a aucun bien à louer.
- **Gestion, téléphone** :
  - pastilles défilantes comptées : « Tous », « Occupés », « Vacants », « Loyer en retard », « Préavis » ;
  - cartes compactes (vignette de 72 px à gauche), sur trois lignes :
    1. titre · quartier ;
    2. locataire et « bail jusqu'au … », ou « Vacant depuis N j », ou « Sans locataire » ;
    3. loyer **avec sa période** et l'état du mois (« Payé ✓ », « En retard de 6 j » en rouge, « Vacant » en ambre + « Publier l'annonce »).
- **Gestion, bureau** :
  - quatre tuiles cliquables : « Occupés n / total », « Vacants n · dont k depuis plus de 60 j », « Loyers en retard n · montant à encaisser », « Préavis n » ;
  - tableau : Bien (vignette, titre, quartier) · Bailleur · Locataire et fin de bail · Loyer / mois · Ce mois · Agent · « ⋯ » ;
  - tri « Retards d'abord » ;
  - recherche « Bien, locataire, bailleur, référence… ».
- **Annonces** :
  - pastilles « En ligne », « À valider », « Brouillons », « Hors ligne » ;
  - cartes à grande photo (3:2), avec le prix et sa période, la pastille « En ligne » et la visibilité, les vues et les favoris ;
  - le quota, discret en bas de liste au téléphone, en jauge fine au bureau.
- **Vocabulaire** ([décision 6](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10), [ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md)) :
  - « En ligne » ne se dit que de `is_online` ;
  - le mot « Publié » ne s'affiche plus comme état ;
  - la visibilité se dit « Public / Privé » et c'est un réglage ;
  - le libellé du statut `published` est **« Validé »** (décidé par le porteur le 2026-11-10, ADR-0097 § 4) ;
  - le motif d'un bien hors ligne est porté par TCK-2678 (décidé le 2026-11-10), pas par ce ticket.
- **Titre** :
  - « Biens » pour l'agence ;
  - « Mes biens » pour le bailleur, avec un seul libellé pour son geste de création, « Proposer un bien à mon agence » (en-tête comme barre). La bascule « Mes biens » ne lui est pas proposée.
- **Téléphone (360-390 px)** :
  - la case de sélection quitte la photo, cible ≥ 44 px ;
  - la barre d'actions groupées se pose en bas, à la place de la barre d'onglets, pendant une sélection ;
  - la feuille « Filtres et tri » garde son bouton collé, et son texte ne contredit plus le bouton (P3 de l'audit).
- **Bureau (≥ 1280 px)** : les colonnes du tableau naissent dès `lg`, jamais `md` (règle de la coque).

## Contraintes strictes (métier)

**Rien ne se perd** (relevé : audit famille 4, § 1, *Fonctions existantes* 1-12, lues dans `properties/(liste)/page.tsx` et `components/property-dashboard/*`). Les deux modes gardent :

- l'avertissement « numéro non vérifié » et « Vérifier mon numéro » ;
- la recherche plein texte (titre, référence, description) ;
- le tri plus récents / anciens, prix ↑↓, vues ↑↓ ;
- les bascules « Mes biens » (`only_mine`) et « Archivés » (`include_archived`) ;
- les filtres avancés : ville, prix min / max, statut, type, contrat, visibilité, agent (`user_id`), créé du / au. Les puces sont retirables, avec « Tout réinitialiser » ;
- sur la ligne : propriétaire (personnel seulement) et agent responsable, référence, ancienneté, vues, favoris, pastille « Boostée » ;
- « Modifier », et le menu « ⋯ » : Publier / Dépublier, Dupliquer, Booster, changer le statut (statuts permis), Archiver, Supprimer avec confirmation ;
- la sélection multiple et les actions groupées : Archiver, Dépublier, Changer l'agent responsable, Tout désélectionner, bilan par bien ;
- la pagination 10 / 20 / 50, Précédent / Suivant ;
- deux états vides distincts : portefeuille vide et filtre sans résultat ;
- l'entrée « Publier un bien », avec le brouillon serveur repris.

Autres contraintes :

- Changer de mode est une **vue** : recherche, filtres et page sont gardés. Un bien vacant à louer paraît dans les deux modes.
- **Écran du quota à l'entrée de création** (`/app/properties/new`, P1 de l'audit) :
  - le chiffre et sa définition sont ceux de `GET /api/me/quota`, dits tels quels (« annonces actives : en ligne ou en attente ») ;
  - le message s'adresse au rôle : l'agent ne tient ni le quota ni l'abonnement, l'admin peut changer d'offre ;
  - au téléphone, l'écran a la flèche de retour unique de la coque.
- Le loyer s'écrit toujours avec sa période. Un prix de vente n'en a pas.
- **i18n** :
  - tout libellé neuf existe en `fr`, `en` et `wo`, où le `wo` porte le texte français tel quel (wolof en pause) ;
  - vouvoiement ([décision 2c](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10)) : la maquette n'est pas une référence de ton ;
  - montants et dates par `useFormatteurs()`.

## Delta à produire

- [ ] Sélecteur de mode mémorisé, avec ses deux présentations au téléphone et au bureau.
- [ ] Pastilles et tuiles du mode Gestion branchées sur `portfolio-summary`. Celles du mode Annonces branchées sur les filtres existants et `is_online`.
- [ ] Carte et ligne de tableau du mode Gestion (occupation, état du mois) et carte du mode Annonces.
- [ ] Vocabulaire « En ligne » / visibilité / statut aligné sur l'ADR, dans la liste, les filtres et les puces.
- [ ] Écran de quota de l'entrée de création, réécrit pour le rôle.
- [ ] Tests :
  - parcours des gestes dans les deux modes ;
  - parité des comptes ;
  - mode mémorisé et repris de l'URL ;
  - aucune pastille « Publié ».

## Critères d'acceptation

- [ ] AC1 — À 390 px en mode Gestion, au moins **6 biens** sont visibles dans le premier écran sous les pastilles (mesure au navigateur sur la démo).
- [ ] AC2 — Pour le bailleur de la démo, le nombre de lignes qui portent la pastille « En ligne » sur une page égale le nombre de biens de cette page que rend `filter[public]=1`. Le texte « Publié » n'apparaît nulle part dans la liste (DOM).
- [ ] AC3 — À l'ouverture du mode Gestion, le réseau montre **un** appel `portfolio-summary` et aucun appel `per_page=1` de comptage.
- [ ] AC4 — Après une recherche « Mermoz » et un filtre « Vacants » en mode Gestion :
  - passer en Annonces, puis revenir, garde la recherche ;
  - recharger la page garde le mode.
- [ ] AC5 — Chacun des gestes listés dans *Contraintes strictes* est atteignable dans les deux modes, à 390 px et à 1280 px : menu « ⋯ » d'une ligne, actions groupées sur deux biens, pagination, réinitialisation des filtres. Un test parcourt chaque geste.
- [ ] AC6 — À 1280 px, le tableau Gestion tient sans défilement horizontal, avec le « ⋯ » de fin de ligne entier.
- [ ] AC7 — Aucun loyer ne s'affiche sans période (« 1 133 862 F CFA · Location » ne se reproduit pas sur la démo).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2638.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La fiche du bien (TCK-2639).
- L'assistant de création lui-même (famille 2).
- Le glisser-déposer, l'appui long et la vue « Portefeuille » de direction (ambition de l'audit).
- L'étiquette du menu « Biens » / « Mes biens » dans la coque (famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

### Suite back — « vacant » ne compte que les biens à louer (2026-11-12, décisions du porteur Q1a, Q2a, Q3a)

- **Un seul prédicat** : `Property::scopeForRent()` (`contract_type = rent`, toutes périodes). `occupied`, `notice`
  et `vacant` de `scopeOccupancyState()` le composent ; le nouvel état `not_rental` en est la **négation**
  (`whereNot`), jamais une copie. Il sert `filter[occupancy]=not_rental`, la tuile `for_sale` du résumé, et l'état du
  bloc `occupancy` : `PropertyOccupancy::attach()` le relit par une requête (constante, une par page) plutôt que par
  la colonne chargée, que `fields[properties]` peut omettre. Occupés + vacants + à vendre = tous.
- **Une vente avec un bail courant** (27 sur la démo, données du seeder) est `not_rental`, `vacant_since` nul ; ses
  blocs `lease`, `tenant`, `rent`, `current_month` restent servis à qui peut lire le bail — le bail est un fait.
  `filter[rent_late]` est **inchangé** (Q2a : l'argent dû est réel, quel que soit le contrat). **Écart d'affichage
  pour le lot B** : la ligne d'une vente n'affiche aucune puce du mois (`etatDuMois()` rend `null` pour une vente),
  alors qu'elle compte dans « En retard » quand son loyer l'est.
- **Limite connue (Q1a)** : une courte durée (`daily`, `weekly`) sans bail est `vacant` **sans** `vacant_since`, donc
  comptée parmi les vacants mais jamais dans `vacant_over_60_days`. 0 cas sur la démo au 2026-11-12. Les tableaux de
  bord, eux, excluent les courtes durées de leur taux (`PortfolioMetrics`, mensuel et annuel seulement).
- **Laissés à leur sens, délibérément** :
  - `RentMonthStatus::of()` → `month_status = 'vacant'` est un autre concept (un mois sans échéance d'un bail non
    occupant, dans le relevé du bailleur, `OwnerStatementService::monthStatus()`) ; `PropertyOccupancy` l'appelle avec
    `occupied = true`, il n'y rend jamais `vacant`.
  - `OwnerDirectory.occupied_properties_count` (`Occupation::whereOccupied()`) compte les biens qui ont un bail en
    cours, ventes comprises : il ne lit pas « vacant », et un bailleur dont la vente est louée a bien un bien occupé.
  - `PortfolioMetrics` (taux d'occupation des tableaux de bord, KPI, alertes de seuil) a sa propre éligibilité et ne
    lit pas le scope.
- **Front (après le commit du lot A)** : `types/property.ts` reçoit `'not_rental'` dans l'union de `state` et
  `for_sale` dans `ResumeDuPortefeuille` ; `ETATS_D_OCCUPATION` de `(liste)/page.tsx` la valeur `not_rental` (sans
  elle, le paramètre est écarté et la liste de la tuile ouvrirait tous les biens). Une pastille et une tuile
  « À vendre » (`aVendre`, comptée par `for_sale`, ouvrant `occupancy=not_rental`) s'ajoutent **seulement** quand le
  portefeuille a des biens hors location, ou quand elle est active (`pastilleGestionProposee`) : un portefeuille tout
  en location garde les cinq pastilles et les quatre tuiles de la maquette ; la grille passe à cinq colonnes sinon.
  `etat-locatif.ts` reconnaît une vente par `contract_type` **ou** par l'état `not_rental` de l'API (une page qui
  omet `contract_type` de ses champs la lisait « Occupé »). Mesuré sur la démo (2026-11-12, API locale) : agence
  `for_sale` 51 = `meta.total` de `not_rental` 51, 70 + 88 + 51 = 209 ; bailleur 9 = 9, 10 + 52 + 9 = 71 ; les
  autres tuiles égalent aussi leur liste. Ablations 8/8 rouges. **Décision (team-lead, 2026-11-12, a)** : la tuile
  « Occupés » se lit sur les biens à louer — « n / (occupés + vacants) », sa part libellée « des biens à louer »
  (clé `tuiles.partALouer`, qui remplace `partOccupee` « du portefeuille ») : sur la démo, 70 / 158 = 44 % au lieu de
  70 / 209 = 33 %. Un test avec des ventes au portefeuille tient que ni le taux ni le total affiché ne les reprennent ;
  ablations 3/3 rouges (dénominateur, total affiché, libellé).
- Tests : `tests/Feature/Property/OccupationHorsLocationTest.php` (filtre, bloc de la liste, fiche, résumé et
  concordance tuile/liste, bailleur, valeur inconnue). Ablations 5/5 rouges : sans `forRent` sur `vacant`, sans
  `not_rental` dans `attach`, sans `for_sale`, `vacant_since` d'une vente, état lu par la colonne chargée.

### Lot C — l'écran du quota de `/app/properties/new` (2026-11-12, terrain-6)

- **Prémisse re-mesurée** (API locale, GET seuls) : `GET /api/me/quota` rend `used 120 · limit 100 · can_create false`
  à l'admin ET à l'agent de la démo (le chiffre est celui de l'AGENCE), et la même agence compte 67 biens en ligne
  (`portfolio-summary.online` = `meta.total` de `filter[public]=1`). L'écran disait « Vous avez 120 annonces actives
  sur 100 … changez d'offre » aux deux. **Pas de maquette** pour cet écran (`app-biens` n'en dessine pas) : aucune
  référence de fidélité, rien à comparer.
- **La définition est celle d'ADR-0097 § 6, pas celle du ticket.** Le ticket écrit « en ligne ou en attente » ; le
  quota compte `QuotaResolver::ACTIVE_LISTING_STATUSES` (disponible, validé, en attente, en attente de validation)
  **sans regarder la visibilité** — un bien privé validé compte et n'est pas en ligne. L'écran dit donc « Une
  annonce est active quand elle est disponible, validée ou en attente de validation, qu'elle soit en ligne ou non ».
- **Par rôle** (`isAdmin`, celui qui décidait déjà du lien « Voir les offres ») : l'admin lit « Archivez une annonce ou
  changez d'offre … » et garde « Voir les offres » ; l'agent lit « Seul un administrateur de votre agence peut changer
  d'offre. Vous pouvez archiver une annonce dont vous avez la charge … », sans lien vers les offres. Le chiffre dit
  « Votre agence a 120 annonces actives sur 100 permises par son offre » aux deux. La note de l'assistant (sous la
  limite) dit « … permises par l'offre de votre agence (disponibles, validées ou en attente de validation) ».
- **Flèche de retour** : la route est plein écran (TCK-631), l'en-tête n'y avait que le logo. `EnTetePublication`
  reçoit `retour` (facultatif) et rend `LienFlecheDeRetour`, la flèche de la coque, vers `/app/properties` ; le
  parcours ne la reçoit jamais (sa sortie écrit le brouillon, TCK-465).
- Clés : `dashboard.pages.propertyNew.quota.{usage,definition,admin,agent,note}` ; `quotaUsage` et `quotaReachedBody`
  supprimées (leur seul lecteur était la page ; `pluriels.test.ts` lit désormais `quota.usage`).
- Tests : `page.quota.test.tsx` passe au traducteur RÉEL (`createTranslator`) — le double serveur rendait le gabarit
  ICU brut, et l'ancien test était vert sur « {used, plural, … } ». Ablations 4/4 rouges : message de l'admin donné à
  l'agent, définition retirée, flèche retirée, note revenue à l'ancien texte.

### Lot B — le mode Annonces (2026-11-12, terrain-6)

- **Décisions de la session** (1 a, 2 a, 3, 4 a, 5 a) : une pastille « Toutes » en tête, active par défaut (le mode
  reste une vue) ; « En ligne », « À valider », « Brouillons », « Hors ligne » sont une **partition** du portefeuille ;
  le sélecteur n'est pas proposé sans bien à louer ; le panneau de filtres du bureau et la barre recherche + tri
  intégrée vont dans un lot **B2**. Au téléphone, « Afficher les 20 suivants » dans les deux modes ; au bureau,
  10 / 20 / 50 et Précédent / Suivant restent.
- **Back** : `filter[listing]=online|pending|draft|offline` (`Property::scopeListingState()`, `ParametreUnique`, 422
  sur une valeur inconnue). « En ligne » est `scopePublic()` ; « Hors ligne » sa **négation** (`scopeNotOnline()`,
  `whereNotIn(id, public())`), jamais une copie de la règle, moins les brouillons et les biens à valider.
  `portfolio-summary` compte en plus `pending_validation`, `drafts`, `offline`, `sold_or_rented` et `archived`
  (« Archivés » se compte hors de la portée qui les exclut, `include_archived=1` sur une copie de la requête). Chaque
  compte égale le `meta.total` de la liste qu'ouvre sa pastille, sous la portée du lecteur (`EtatDAnnonceTest`, 6 tests,
  ablations 6 rouges sur 7 — la septième, compter les brouillons par statut, est une mutation équivalente).
- **Mesuré sur la démo** (GET seuls, 2026-11-12) : pour le bailleur, l'admin et l'agent, `online + pending_validation +
  drafts + offline = total` (71 ; 209 ; 209), chaque compte égal au `meta.total` de sa liste, et sur chaque page de 20
  de la liste, les lignes `is_online` sont exactement les biens de la page que rend `filter[public]=1` (0 écart sur 71
  et 209 lignes) — l'AC2 au niveau de l'API.
- **Front** : la page lance la liste, le résumé et (personnel seulement) le quota ensemble ; plus aucune liste
  `per_page=1` dans aucun mode — `countDashboardProperties` et `PropertyKpiStrip` (et leurs tests) sont supprimés.
  Sans bien à louer (`occupied + vacant = 0`), le mode est forcé à « Annonces » et le sélecteur disparaît ; sous une
  portée (« Mes biens », un agent choisi) il reste, pour que la bascule ne change pas de mode.
  `CarteAnnonce` : photo 3:2, prix avec sa période (AC7), titre · quartier, état d'annonce lu sur `is_online`
  (`etatDAnnonce`, même partition que le back), visibilité « Public / Privé », statut seulement quand l'état ne le dit
  pas, propriétaire et agent, référence et ancienneté, vues et favoris, « ⋯ » (`PropertyRowActions layout="menu"`),
  case de 44 px hors de la photo. Grille 1 / 2 (`lg`) / 3 (`xl`) colonnes, jamais `md`.
  Bureau : onglets soulignés (les pastilles + « Vendus, loués », « Archivés », les tuiles d'avant) et la jauge fine du
  quota ; téléphone : pastilles, cartes, « Afficher les 20 suivants » (`voir`), quota en bas de liste.
- **Vocabulaire** : `property.status.published` = « Validé » ; la jauge dit « N annonces actives sur L » et sa
  définition (ADR-0097 § 6), pas « en ligne ». Le bailleur lit « Mes biens » et « Proposer un bien à mon agence »
  (en-tête de page et en-tête du téléphone) ; la bascule « Mes biens » ne lui est plus proposée.
- **Hors du lot** : la pastille « Boostée » de la maquette n'existait pas dans la liste d'avant (rien ne se perd) ;
  « boostée » peut dire l'emplacement sponsorisé (`sponsored_until`) ou le badge acheté (`badge`) — question au porteur.
- **Mesuré au navigateur** (démo, 2026-11-12, `takussan-web/.fidelite/TCK-2638/lot-B/`, local) : AC1 — en Gestion au
  téléphone (390), six titres de biens visibles au-dessus de la barre d'onglets ; AC4 — une recherche « Mermoz » est
  gardée d'un mode à l'autre, `occupancy` est ignoré en Annonces et le sélecteur reste ; AC6 — balayage Annonces à
  390, 768, 1024, 1280 et 1440, Gestion à 390, 1024 et 1280 : aucun débordement horizontal, aucun texte coupé par
  des points de suspension à 1280 (la ligne propriétaire · agent de la carte passe désormais à la ligne : elle coupait
  les noms à 390 et 1280). La pagination du téléphone dit « Afficher le suivant » / « Afficher les N suivants »
  (pluriel ICU). Écarts restants à la maquette : la fiche de fidélité `docs/qa/audit-ux-2026-11/fidelite/TCK-2638.json`
  (données de la démo, pastille « Boostée », barre de filtres du bureau → lot B2).

### Lot B2 — le bureau : panneau de filtres, carte de la table, « Boostée » (2026-11-12, terrain-6)

- **Décisions de la session** : 1 a — sous `w1440`, « Filtres » déplie le panneau EN PLACE (la table défile alors
  dans sa carte) ; 2 — « Retards d'abord » est le tri par défaut de la Gestion, posé par le serveur (`page.tsx`,
  jamais pendant une recherche : pertinence, TCK-662) et jamais écrit dans l'URL (choisir le défaut retire `sort`) ;
  3 — la barre du bureau des Annonces avec le même composant ; 4 — aucun filtre par bailleur (l'API n'en a pas) :
  écart inscrit dans la fiche, aucun contrôle inventé.
- **Gestion, bureau** : `PropertyListFilters` porte la mise en page. À gauche, un panneau de 204 px de la maquette
  (`calc(var(--spacing)*56.67)`), ouvert dès `w1440`, replié en bouton dessous, refermable (« Replier les filtres ») :
  Occupation (les pastilles en boutons radio, même requête `requeteDeLaPastille`, mêmes comptes, « À vendre » aux
  mêmes conditions), Type et lieu, Agent et portée (« Mes biens », « Archivés » en interrupteurs), Plus de critères
  (prix + « Appliquer », statut, contrat, visibilité, dates), « Réinitialiser » (garde le mode). À droite, UNE carte :
  la barre (« Filtres » sous 1440, recherche, tri, « N biens » = `meta.total`), les puces, la table (son propre cadre
  effacé par `className`, la primitive `DataTable` intacte), la pagination en pied.
- **Annonces, bureau** : une rangée — « Filtres », recherche, type, visibilité, agent, tri ; « Mes biens »,
  « Archivés », le lieu et les autres critères dans le même panneau, replié au départ (aucun doublon de la barre).
- **Une seule commande par geste** : le bouton « Filtres » est UN bouton — feuille au téléphone, panneau au bureau
  (`matchMedia('(min-width: 64rem)')`) ; tous les contrôles appellent les mêmes `updateParam(s)` que la feuille
  (TCK-644). Le téléphone ne change pas.
- **« Boostée »** (décision du porteur : mise en avant payée EN COURS, `sponsored_until` > maintenant) :
  `PropertyResource` émet `sponsored_until` (ISO, nul sans boost) quand la liste pro le demande, jamais sur la
  surface publique (`BoostEnCoursDansLaListeTest`, 3 tests, 2 ablations rouges) ; `DASHBOARD_PROPERTY_FIELDS` le
  demande ; la carte pose « Boostée jusqu'au 18 nov. » sur la photo (`boostEnCours`, instant de référence unique de
  la liste). `requetes-du-front.json` régénéré, `RequetesDuFrontTest` vert.
- **Garde réparée** : `property-fields.coverage` rougissait depuis le lot B (12 colonnes lues < 13) — les lectures
  avaient quitté `PropertyList.tsx` pour `CarteAnnonce`, `GestionDuBien`, `etat-d-annonce` et `etat-locatif`, déclarés
  consommateurs (13/13).
- **Tests** : `PanneauDeFiltres.tck-2638.test.tsx` (19), `gestion.tck-2638` (+2 : défaut serveur, props de la barre),
  `CarteAnnonce.tck-2638` (+3 : cadre de la table, « Boostée »), les doubles de `PropertyListFilters` rendent la liste
  et sa pagination ; ablations front 19/19 rouges, restaurées.
