---
id: TCK-552
title: "Liste des biens sur mobile : 42 à 70 % du premier écran pris par six rangées de contrôles, qui disparaissent ensuite au défilement"
status: todo
phase: P1
family: front
estimate: M
wave: 68
created: 2026-09-22
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, mobile, recherche, filtres, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur voit des biens dès l'arrivée sur la liste, et peut affiner (filtres,
tri, carte) **à tout moment** du défilement sans remonter en haut de la page.

## Contexte

Audit UI/UX mobile de `/fr/properties` du 2026-09-22 (constats P1 à P8, M4, et la partie
« contrôles » de E1), mesuré à 390 × 844 et 360 × 740.

- **P1** — avant la première carte s'empilent six rangées : `<h1>`, compteur, « 30 / page » + tri +
  Filtres, puces actives, Liste/Carte, « Sauvegarder la recherche ». Première image à **356 px sur
  844** sans filtre (42 %), à **519 px sur 740** avec quatre filtres à 360 px (70 %) — aucune carte
  entière au premier écran.
- **P2** — « 30 / page » est le premier contrôle, avant Filtres.
- **P3** — Filtres, l'action principale sur mobile, est dernier, en style secondaire, et passe seul
  à la ligne à 360 px ; sa pastille de compte déborde du bouton.
- **P4** — à `scrollY = 1500`, seule la `nav` est fixe : Filtres, tri et carte sont hors d'atteinte
  sur une grille de ~4 400 px.
- **P5** — les onglets Liste/Carte font **24 px** de haut et occupent une rangée entière.
- **P6** — le `<h1>` est à 28 px et tient sur deux lignes à 360 px.
- **P7** — « Sauvegarder la recherche » est seul sur sa rangée ; sans filtre, il est `disabled` à
  50 % d'opacité **sans aucune explication** — il se lit comme un bouton cassé.
- **P8** — la puce de recherche libre affiche des guillemets bruts (`"Dakar"`) ; la même notion
  s'écrit « Location » (puce, tiroir), « En location » (carte) et « Louer » (menu) ; la puce de prix
  écrit « FCFA » quand les cartes écrivent « F CFA ».
- **M4** — en vue carte, « 30 / page » et le tri restent affichés alors qu'ils n'y agissent pas.
- **E1** (contrôles) — à 0 résultat, « 30 / page », le tri et Liste/Carte restent affichés.

Revue adverse intégrée : une barre **haute** collante ajouterait ~52 px permanents à la `nav` (déjà
68 px) ; l'accès pendant le défilement passe donc de préférence par un élément **flottant bas**,
qui doit cohabiter avec le dock flottant existant (TCK-275 : barre du comparateur, messagerie).

## Contrat de données

Aucun endpoint nouveau. `per_page` reste accepté dans l'URL et par l'API ; seul son contrôle
disparaît de l'interface mobile. Le compte vient de `meta.total`, déjà reçu.

## Direction UX / Artistique

- **Une seule rangée d'outils** sous le titre : Filtres en tête et en style principal, puis tri,
  puis bascule carte. Les puces actives suivent, et l'action de sauvegarde vient **au bout des
  puces** — elle n'a de sens que s'il y a quelque chose à sauvegarder.
- Pendant le défilement, Filtres et Carte restent à portée du pouce, dans le dock du bas, sans
  masquer la barre du comparateur ni la messagerie.
- Titre de page plus compact sur mobile : il reste le `<h1>` (TCK-432), il cesse de prendre deux
  lignes.
- Un seul mot pour une transaction dans toute la page ; la devise écrite par une seule fonction de
  formatage.
- Critère d'ensemble : **une carte entière visible au premier écran à 360 × 740 avec quatre
  filtres actifs.**

## Contraintes strictes (métier)

- Le `<h1>` dérivé des filtres (TCK-432) reste présent, avec le même texte.
- Le bureau (`lg` et plus) n'est pas modifié.
- `?per_page=60` dans une URL continue de rendre 60 résultats.
- Le dock flottant reste l'unique orchestrateur du bas d'écran (TCK-275) : aucun élément flottant
  n'en masque un autre.
- Libellés via next-intl, vérifiés en `fr`, `en` et `wo` à 360 px.

## Delta à produire

- [x] Rangée d'outils mobile unique : Filtres (principal), tri, bascule liste/carte ; plus de
      « 30 / page » sous `lg`.
- [x] Bascule liste/carte en un seul contrôle de 44 px de haut.
- [x] Accès à Filtres et à la carte pendant le défilement, via le dock flottant du bas.
- [x] Sauvegarde de recherche au bout des puces quand au moins un filtre est actif, absente sinon ;
      son libellé dit ce qu'elle fait (alerte ou non, selon `notification_frequency`).
- [x] `<h1>` plus compact sous `md`.
- [x] Puces : recherche libre signalée par une icône et non par des guillemets ; libellé de
      transaction unique sur la page ; montants par la fonction de formatage des cartes.
- [x] Vue carte et état à zéro résultat : tri et bascule masqués quand ils n'agissent pas.
- [x] Tests : présence/absence des contrôles selon vue et nombre de résultats ; `per_page` d'URL
      respecté.

## Critères d'acceptation

- [x] AC1 — à 360 × 740 sur `?contract_type=rent&type=villa,apartment&furnished=true&price_max=2000000`,
      le bas de la première carte (image + prix + titre) est au-dessus de 740 px.
- [x] AC2 — à 360 et 390 px, Filtres, tri et bascule tiennent sur **une** rangée en `fr`, `en` et
      `wo` (une seule valeur distincte de `top` arrondi parmi les trois contrôles).
- [x] AC3 — à `scrollY = 1500`, un contrôle Filtres et un contrôle Carte sont visibles et
      activables ; avec un bien ajouté au comparateur, la barre du comparateur reste entièrement
      visible et aucun élément flottant n'en chevauche un autre.
- [x] AC4 — aucun contrôle « par page » n'est rendu sous `lg` ; `?per_page=60` rend toujours 60
      cartes.
- [x] AC5 — sans filtre actif, aucun bouton désactivé de sauvegarde n'est rendu ; avec un filtre,
      l'action de sauvegarde est sur la rangée des puces.
- [x] AC6 — la bascule liste/carte a une zone tactile d'au moins 44 px de haut.
- [x] AC7 — aucune puce ne contient de guillemet `"` ; la page n'affiche qu'un seul libellé pour la
      transaction location ; la puce de prix et les cartes écrivent la devise à l'identique.
- [x] AC8 — en vue carte et à zéro résultat, le tri n'est pas rendu.

## Hors périmètre

- Le contenu de la vue carte (TCK-553) et du tiroir de filtres (TCK-556).
- Les cartes de résultat (TCK-554, TCK-555).
- La pagination (TCK-557) et le message de l'état vide (TCK-558).

## Notes d'implémentation

### Re-mesure des prémisses (2026-09-23, avant tout changement)

Chrome headless par CDP (`mobile:true`, DPR 3), `next dev` du worktree sur l'API partagée (247 biens,
sans photos). Charge machine `load average` 103 / 66 / 49 sur 8 cœurs : les **durées** relevées ici ne
valent rien, seules les **positions** comptent. `innerWidth` relevé à chaque mesure = largeur demandée.

| Prémisse | Mesuré | Écart |
|---|---|---|
| P1 — 1ʳᵉ image à 519 px sur 740, 4 filtres, 360 | **519** (carte 519 → 782 : bas hors écran) | aucun |
| P1 — 1ʳᵉ image à 356 px sur 844 sans filtre, 390 | **356** | aucun |
| P2/P3 — « 30 / page » en tête ; Filtres seul sur sa rangée à 360 | « 30 / page » `top` 219, tri 219, **Filtres 271** ; pastille `absolute -top-1.5 -right-1.5` | aucun |
| P4 — à `scrollY = 1500`, seule la `nav` est fixe | `nav` 0 → 69, plus un `div` vide 680 → 728 (l'indicateur de `next dev`, absent en production) | aucun sur le produit |
| P5 — onglets Liste/Carte à 24 px | **24** | aucun |
| P6 — `<h1>` à 28 px sur deux lignes à 360 | 28 px, **2 lignes** (« Biens immobiliers à louer ») | aucun |
| P7 — sauvegarde désactivée sans filtre, seule sur sa rangée | seule sur sa rangée (`top` 461, 4 filtres) ; `disabled` sans filtre | aucun |
| P8 — puce `"Dakar"`, « Location » / « En location » / « Louer », « FCFA » ≠ « F CFA » | puce prix « ≤ 2 000 000 FCFA » ; texte visible : « Location » ×1 (puce), « En location » ×10 (cartes) ; « Louer » n'est visible que menu ouvert (`Navbar`) | voir ci-dessous |

**Le libellé de sauvegarde ne ment pas aujourd'hui.** `SaveSearchButton` envoie
`notification_frequency: 'off'` en dur : aucune alerte n'est créée, et « Sauvegarder la recherche »
le dit exactement. Le renommer en « Créer une alerte » aurait introduit le mensonge que le ticket
demande d'éviter : le libellé est **conservé**.

### Reprise (2026-09-23) — un premier agent coupé avant de commiter

Le travail sur disque (12 fichiers) a été repris tel quel, puis **tout re-vérifié par exécution** :
rien de ce qu'il affirmait n'est recopié ici sans avoir été rejoué.

- **Ablation** : les 6 sources remises à `HEAD` (copie, pas de `stash`), les tests de la barre et de
  la page rougissent — **20 échecs sur 35** ; restaurées, **40/40 verts** sur les 4 fichiers. Seul
  `?per_page=60 part tel quel à l'API` reste vert sans le correctif, et c'est voulu : il garde une
  propriété qui ne doit pas bouger (AC4).
- `vitest related` sur les 4 sources touchées : **37 fichiers, 339 tests, verts** ; plus les 9
  fichiers de test qui citent « FCFA » ou « Location » (dont `favorites/`) : **79 verts**.

### Décisions non évidentes

- **Libellé de sauvegarde conservé** (vérifié ci-dessus : `notification_frequency: 'off'`).
- **La puce prend le mot des cartes, pas l'inverse** : `contract_type` rend `rentLong`/`saleLong`
  (« En location »), la clé de `ContractTypeChip`. La pastille est sur toutes les cartes du site, la
  puce n'existe qu'ici. ⚠ Effet de bord assumé : le **résumé** d'une recherche sauvegardée
  (`SavedSearchesList`, même fonction `puceDeChaqueFiltreActif`) écrit désormais aussi « En
  location » et « F CFA » — c'est la même notion, écrite une fois.
- **Devise** : `≥ {value}` / `≤ {value}` dans les trois langues, le montant par `formatPrice` (la
  fonction des cartes). Deux `toLocaleString('fr-SN')` disparaissent de `types/search.ts` : le
  cliquet de `scripts/check-locale-figee.mjs` rougissait (« 26 occurrences, le cliquet dit 28 ») et
  est **resserré à 26**, daté.
- **Puce `q`** : icône de recherche + texte saisi. Le `libelle` de `q` garde ses guillemets, parce
  qu'il sert aussi le résumé joint par « · » de `SavedSearchesList`, où rien d'autre ne distingue
  le texte libre d'une ville. La puce, elle, a l'icône.
- **Bascule mobile = icône seule, 44 × 44**, nom accessible = le mot. Avec le libellé, le tri était
  tronqué à 360 px. La pastille flottante, qui a la place, écrit le mot.
- **Pas de `flex-wrap` sur la rangée d'outils** (remplace TCK-505 #8) : le débordement est tenu par
  le tri (`min-w-0 flex-1`, valeur tronquée) ; `sm:max-w-60 lg:max-w-none` le borne sur tablette,
  où il s'étirait sur 526 px à 768 (mesuré, puis 240 px).
- **Pastille flottante dans le dock, priorité −1, `bottom-right`** : elle se pose au sol, le
  comparateur (priorité 1) et la messagerie (0) se décalent au-dessus. `enabled` suit exactement
  l'affichage (rangée d'outils dépassée par le haut, `IntersectionObserver` sous la `nav` de 68 px,
  tiroir fermé, sous `lg`) : invisible, elle ne réserve aucune place. Masquée tiroir ouvert.
- **À zéro résultat confirmé, sous `lg`, la vue retombe sur la liste** : la bascule masquée, un
  visiteur en vue carte y serait resté enfermé loin de l'état vide.
- **Tri masqué** en vue carte et à zéro résultat (sous `lg` seulement ; le bureau garde les siens).

### Vérification au navigateur (2026-09-23, après)

Même banc (CDP, `mobile:true`, DPR 3). `load average` jusqu'à 188 / 104 / 53 pendant les mesures
(autres agents) : **positions seules**. `innerWidth` = largeur demandée partout, `scrollWidth` =
`innerWidth` partout (aucun élargissement).

| AC | Mesure | Résultat |
|---|---|---|
| AC1 | 360 × 740, 4 filtres, `fr` : 1ʳᵉ carte `top` 335 → **`bottom` 599** (image + prix + titre ; titre 493 → 533) | ✓ (< 740 ; était 519 → 782) |
| AC2 | Filtres / tri / bascule, 4 filtres : `top` distincts **[145]** en `fr`, `en`, `wo` × 360 et 390 (6 mesures) ; valeur du tri jamais tronquée (`scrollWidth` = `clientWidth` : 102, 132, 90, 120) | ✓ |
| AC3 | 360 × 740, un bien ajouté au comparateur, `scrollY = 1500` : pastille « Filtres · Carte » 676 → 724 (x 79 → 281), comparateur 495 → 665 **entièrement visible**, **0 chevauchement** entre flottants ; `elementFromPoint` au centre de chaque bouton = le bouton ; Filtres ouvre le tiroir (pastille masquée), Carte rend la carte Leaflet et remonte la rangée à `top` 80 (sous la `nav`) | ✓ |
| AC4 | 360 × 740 : combobox « Résultats par page » non visible ; `?per_page=60` → **60 cartes distinctes** | ✓ |
| AC5 | sans filtre : le seul bouton de sauvegarde est celui du bureau, non affiché (`hidden lg:flex`) ; avec 4 filtres : « Sauvegarder la recherche » **actif, dans `[data-rangee="puces"]`**, après « Meublé » | ✓ |
| AC6 | bascule 44 × 44 (était 24 de haut) | ✓ |
| AC7 | 0 puce contenant `"` ; texte visible `fr` : « En location » ×11 (1 puce + 10 cartes), « Location » ×0 ; `en` « For rent » ×11 ; devises visibles : **{« F CFA »}** seulement | ✓ |
| AC8 | vue carte : tri non visible, bascule « Liste » ; `?price_max=1` (0 résultat) : tri non visible, bascule absente, état vide rendu | ✓ |
| `<h1>` | 22 px, **1 ligne** à 360 dans les trois langues ; texte inchangé (« Biens immobiliers à louer ») | ✓ |
| Bureau | 1366 × 900, sans filtre et 4 filtres : positions de tous les contrôles au-dessus de 420 px **identiques** à `HEAD` ; seuls diffèrent les textes des puces (« En location », « F CFA », voulu) et le compteur que le relevé d'avant avait pris en « Chargement… » ; aucune pastille flottante | ✓ |
