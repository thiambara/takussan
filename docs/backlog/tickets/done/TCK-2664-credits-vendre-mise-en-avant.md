---
id: TCK-2664
title: "Crédits : vendre la mise en avant depuis la page du solde"
status: done
phase: P1
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-13
depends_on: [TCK-2663, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#92-boostproduct-"
    - "docs/models-spec.md#95-creditlot-"
    - "docs/models-spec.md#96-creditmovement-"
tags: [front, credits, boost, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin voit son solde, ce que ses mises en avant ont rapporté, et met un bien en avant sans quitter la page.

## Contrat de données

- Solde, lots, historique : `GET /api/credits` (existant).
- Offres et coûts : `GET /api/boost-products` (existant ; les prix viennent de l'API, jamais du code).
- Mises en avant en cours et suggestions : `GET /api/credits/boosts`, `GET /api/credits/suggestions` (TCK-2663).
- Mettre en avant : `POST /api/properties/{property}/boosts` (existant, `StorePropertyBoostRequest`), avec ses refus (solde insuffisant, Remontée pas encore disponible : `bump_available_at`).
- Biens à choisir : la liste des biens publiés de l'agence, recherche par titre ou référence, filtrée côté serveur.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-credits&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Crédits » et « Mettre en avant », téléphone et bureau.
- **Téléphone** : carte du solde (crédits, prochaine expiration « 60 expirent le 24 déc. »), bouton primaire « Mettre un bien en avant », « Recharger · Bientôt » inerte ; « En avant en ce moment » (photo, bien, offre, jours restants, vues, contacts) ; « À pousser » (« 3 biens sans contact depuis 30 jours ») ; « Ce que ça coûte » (la grille des offres) ; liens « Historique » et « Lots de crédits ». L'historique devient une liste : opération et objet (lien vers le bien), ± crédits à droite, date et motif dessous.
- **Mettre en avant** : plein écran en deux temps au téléphone (1 · Quel bien ? les suggestions d'abord, recherche ; 2 · Quelle mise en avant ? les offres et leur coût, « Il vous restera 40 crédits »), bouton collant « Mettre en avant · 20 crédits » ; au bureau, un dialogue large : biens à gauche, offres à droite, résumé et confirmation en bas.
- **Bureau** : en-tête avec solde, expiration et bouton primaire, grille des offres à droite ; tableau « En avant en ce moment » (Bien, Offre, Fin, Vues, Contacts, Visites) ; « À pousser » ; puis lots et historique, en deux colonnes dès `lg`.

## Contraintes strictes (métier)

Fonctions existantes à garder (`credits/page.tsx`, `CreditsPanel.tsx`, `boost/api.ts`, `BoostDialog`) :

- Solde ; lots (origine, restant sur initial, expiration ou « sans expiration ») ; historique paginé (date et heure, opération, ± crédits, objet, motif) ; états chargement, erreur avec « Réessayer », lots vides, historique vide.
- Le bouton « Mettre en avant » de la page d'un bien (`PropertyHeaderActions`) reste ; les deux points d'entrée suivent les mêmes règles que `BoostDialog`.
- Menu : visible de l'admin seulement (`voitLePortefeuille`), module masquable par l'agence. Un membre qui ouvre l'URL sans `boost.spend` voit une page qui le lui dit, jamais une erreur brute (l'API rend 403).
- « Recharger » n'est pas une action (`aria-disabled`, mention « Bientôt ») : l'achat est la phase 2 d'ADR-0061. **Décision 14** : quand l'achat existera, son prix s'affichera en F CFA à cet endroit ; aujourd'hui aucun prix en F CFA n'est inventé.
- Pas de « × la semaine d'avant » : la mesure n'existe pas (TCK-2663).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] Page Crédits refaite (téléphone et bureau) avec les sections ci-dessus.
- [ ] Parcours « Mettre un bien en avant » en deux temps depuis la page.
- [ ] Historique en liste au téléphone, objet lié au bien.
- [ ] État « réservé » pour un membre sans `boost.spend`.
- [ ] Tests : grille lue de l'API ; confirmation qui appelle la route du bien et met le solde à jour ; refus « solde insuffisant » rendu ; « Recharger » inerte ; état réservé.

## Critères d'acceptation

- [ ] AC1 — Si l'API rend une Vedette 7 jours à 25 crédits, la grille affiche 25, pas 20 (aucun prix codé en dur).
- [ ] AC2 — Confirmer « Vedette 7 jours » sur un bien envoie `POST /api/properties/{id}/boosts` avec l'offre choisie, puis le solde affiché baisse du coût sans rechargement de la page.
- [ ] AC3 — Avec 10 crédits, l'offre à 20 est désactivée avec sa raison affichée à côté (« Il vous manque 10 crédits »).
- [ ] AC4 — À 390 px, une ligne d'historique tient sur trois lignes de texte au plus et le motif est à l'écran.
- [ ] AC5 — Un agent qui ouvre `/app/credits` lit une phrase qui dit que la page est réservée, et aucun message d'erreur générique.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2664.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'achat de crédits et son prix (phase 2).
- Le rapport détaillé d'une mise en avant.
- La pastille de boost dans la liste des biens (approche C, non retenue ; la liste relève de la famille 4).

## Notes d'implémentation

- **Page** : `components/credits/PageCredits.tsx` remplace `CreditsPanel` (supprimé avec son test) ; la route ne
  rend plus que le client. Téléphone sous `md` (`REQUETE_DE_LA_BARRE`) : `PagePleineLargeur` + `DeclarerEnTete`,
  « Historique » et « Lots de crédits » en `LigneDeListe` qui ouvrent un `PanneauDroit` ; bureau : `PageHeader`,
  grille de la maquette (`xl:grid-cols-[minmax(0,1fr)_min(20rem,calc(100%-42.5rem))]`, puis `5fr/7fr` dès `xl`).
- **Accès (AC5)** : lu de `GET /api/credits` ; un 403 rend « Cette page est réservée aux administrateurs de
  l'espace », et AUCUNE autre lecture ne part tant que le solde n'est pas rendu (boosts, suggestions, offres).
- **Grille (AC1)** : `lecture.ts › grilleDesOffres` — familles fixes, offres actives de `GET /api/boost-products`,
  aucun prix dans le code ; sans Remontée active, aucun « Remonter ».
- **Parcours (AC2, AC3)** : `MettreEnAvant.tsx` (formulaire plein écran au téléphone, dialogue 55rem en deux
  colonnes au bureau). Les règles de l'achat sont extraites de `BoostDialog` dans `boost/useAchatDeBoost.ts`
  (solde, manque, effet sur le boost en place, refus `credits.insufficient`, clé d'idempotence bien + offre,
  renouvelée après succès) ; `BoostDialog` n'en garde que le rendu (ses 11 tests verts). Biens proposés :
  `GET /api/credits/suggestions?limit=5` ; recherche serveur sur les biens en ligne (`filter[public]=1`,
  `filter[search]`, temporisée). Une famille ou une durée que le solde ne couvre pas est désactivée, sa raison
  reliée par `aria-describedby`. Le choix d'un bien ne masque plus tout le corps (lecture de ses boosts en place
  à part : confirmer attend l'effet).
- **Historique (AC4)** : ligne du téléphone = objet tronqué (lien vers `/app/properties/{id}` pour une mise en
  avant) + détail `line-clamp-2` (opération, date et heure, motif) ; 5 par page au bureau, 20 dans le panneau
  (`useCreditsJournal`, taille de page dans la clé).
- **« Vues » = `measures.clicks`** ; pas de « × la semaine d'avant », pas de « Rapport », pas de « Lots épuisés »
  (motifs dans la fiche de fidélité). « Recharger » : `aria-disabled`, « Bientôt », aucun prix.
- **Décisions 1 à 10 : « a » partout** (team-lead, 2026-11-12), avec leurs conditions :
  - 1 — « vues » = `measures.clicks` (fiche ouverte depuis un emplacement de la mise en avant) ; les impressions
    ne s'affichent jamais sous « vues » (alias motivé dans la fiche).
  - 2 — la confirmation dit ce qui sera dépensé et ce qui restera (« Il vous restera 40 crédits sur 60 »).
  - 5, 7 — aucune taille de page ne dépend de la largeur : chaque liste lit sa propre taille, fixe (mises en
    avant 10, biens à pousser 3 sur la page et 5 dans le parcours, historique 5 dans le tableau du bureau,
    20 dans le panneau, taille dans la clé de requête), et n'en change jamais après l'hydratation. Le choix
    téléphone/bureau passe par `useMatchesMedia` (instantané serveur `false`), mais la page ne rend qu'un
    squelette tant que `GET /api/credits` n'a pas répondu — lecture du navigateur seul — : aucune liste n'est
    rendue par le serveur, aucune ne se redimensionne. Le tableau du bureau ne lit son historique que hors
    téléphone (`enabled`), il ne change pas de taille.
  - 6 — « Sans contact depuis 30 jours, les moins vus d'abord » : alias motivé dans la fiche.
  - 8 — `BoostDialog` inchangé dans son rendu (11 tests verts) ; ablations par règle extraite (clé
    d'idempotence, `credits.insufficient`).
  - 9 a appliquée : `CreditBoostResource` rend `duration_days` (cumulée par prolongation, 0 pour une
    Remontée ; `CreditsBoostsListTest`). « Vedette 7 j » ; « Relancer » rachète l'offre ACTIVE de même famille
    et de même durée au prix d'aujourd'hui ; sans offre correspondante (Vedette prolongée à 14 j, offre
    retirée), pas de « Relancer ».
  - 10 — le libellé du solde suit la NATURE de l'espace actif (`natureDeLEspaceActif`, `GET /api/me/profiles`),
    pas le rôle : l'hôte de démo (utilisateur 50) est `agency_admin` de son espace `individual` — mesuré — et lit
    « Solde de votre espace » ; une agence `standard` lit « Solde de l'agence » ; un espace inconnu, « de votre
    espace ».
  - Les phrases de l'effet sur le boost en place sont celles de la fenêtre d'achat (`boost.dialog.effect.*`),
    aucune copie dans `credits.*`.
- Tests : `credits/__tests__/credits.tck-2664.test.tsx` (15) et `CreditsBoostsListTest` (API) ; 27 ablations toutes
  rouges (dont `duration_days` de la ressource, la durée dans « Relancer », l'espace du libellé, l'espace i18n de
  l'effet). Le bien choisi reste en
  tête de la liste quelle que soit la recherche (on n'achète jamais pour un bien qu'on ne voit plus). Relevé du panneau « Historique » à 390 : 42
  opérations, deux lignes au plus, aucun détail coupé (les motifs de démo sont courts : 31 caractères au plus). Fiche :
  `docs/qa/audit-ux-2026-11/fidelite/TCK-2664.json`.

**Reprise après vérification (2026-11-12, `$S/impl/verif/TCK-2664-verif.json`).**
- **Refus `credits.insufficient`** : le solde que le refus porte (`params.balance`) fait foi dans `useAchatDeBoost`
  dès la réponse — le manque se recalcule, « Il vous restera » disparaît, Confirmer se ferme, dans le parcours comme
  dans `BoostDialog` (qui ne répète plus le manque deux fois). Les crédits sont relus (`credits.refetch()` : la même
  lecture `['credits', 1]` que la carte du solde de la page), puis le refus s'efface et le solde relu parle — un solde
  relu qui couvre l'offre rouvre la confirmation. Tests : relecture retenue (le solde du refus fait foi avant elle),
  puis solde relu 3 ; solde relu 25 → « Il vous restera 15 crédits sur 25 ».
- **Prestataire et client** : `GET /api/credits` leur rend 422 `credits.no_space` (mesuré : prestataire, client ;
  403 pour l'agent et le bailleur, 200 pour l'hôte). La page leur montre le même état réservé, sans « Réessayer »,
  et ne lit rien d'autre. Test ; une autre panne garde l'erreur.

