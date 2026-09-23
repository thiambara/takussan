---
id: TCK-558
title: "Zéro résultat : deux fois « aucun bien » et une seule issue, « Effacer tous les filtres », là où un seul filtre suffit souvent à retrouver des biens"
status: todo
phase: P2
family: front
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, recherche, etat-vide, ux]
---

## Objectif utilisateur

Un visiteur dont la recherche ne donne rien retrouve des biens en retirant **le** critère de trop,
sans perdre tous les autres — ou choisit d'être prévenu quand un bien correspondra.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat E1, partie contenu ; la partie « contrôles inutiles » est
dans TCK-552), sur `?q=zzzqqq&contract_type=rent` à 360 × 740.

- Le compteur dit « 0 biens trouvés » et, dessous, l'état vide dit « Aucun bien trouvé » : la même
  affirmation deux fois.
- La seule action offerte est « Effacer tous les filtres » : retirer la transaction, les types, le
  prix et la recherche pour un seul critère fautif.
- L'état vide n'est pas le repli conjonctif de TCK-338 (`WidenedSearchNotice`), qui ne s'applique
  qu'aux termes de `q` ayant chacun des résultats.

Revue adverse intégrée : l'action de sauvegarde **reste** à zéro résultat — c'est précisément le cas
où une alerte sert.

## Contrat de données

Aucun endpoint nouveau. Les filtres actifs et leurs libellés viennent de `puceDeChaqueFiltreActif`
(TCK-340), déjà utilisée par les puces de la barre d'outils.

## Direction UX / Artistique

- Un seul énoncé du résultat nul.
- Les filtres actifs sont proposés, chacun retirable individuellement, dans l'état vide même.
- « Tout effacer » reste disponible, en second.
- La sauvegarde / alerte est proposée comme issue positive.

## Contraintes strictes (métier)

- Retirer un filtre depuis l'état vide suit exactement le même chemin que la puce de la barre
  d'outils (`onRemoveFilter`), valeurs multiples comprises (`type`, `condition`).
- Pas de requête supplémentaire pour « deviner » le filtre le plus restrictif dans ce ticket.

## Delta à produire

- [x] État vide : un seul énoncé de résultat nul.
- [x] Filtres actifs retirables un à un depuis l'état vide.
- [x] « Tout effacer » en action secondaire ; sauvegarde proposée.
- [x] Tests : retrait d'un filtre depuis l'état vide ; valeurs multiples ; un seul énoncé.

## Critères d'acceptation

- [x] AC1 — sur `?q=zzzqqq&contract_type=rent`, le texte « 0 » / « aucun bien » n'apparaît qu'une
      fois dans `main`.
- [x] AC2 — l'état vide propose deux retraits distincts (`zzzqqq`, Location) ; retirer `zzzqqq`
      laisse `contract_type=rent` dans l'URL et affiche des résultats.
- [x] AC3 — sous `q=zzzqqq&type=villa,house` (zéro résultat), retirer « Villa » depuis l'état vide
      laisse `type=house` et `q=zzzqqq` dans l'URL.
- [x] AC4 — l'action de sauvegarde est atteignable depuis l'écran à zéro résultat.

## Hors périmètre

- Le calcul serveur du « filtre le plus restrictif ».
- Le masquage du tri et de la bascule carte à zéro résultat (TCK-552).

## Notes d'implémentation

### Prémisses re-mesurées (2026-09-23, avant toute modification)

Relevé au navigateur (Chrome headless par CDP, 360 × 740, `mobile: true`, `innerWidth` 360 =
largeur demandée), front du worktree sur `feat/audit-mobile-liste` (`fa8444ab`), API partagée :8002.

Sur `?q=zzzqqq&contract_type=rent` :

- **Confirmé** — deux énoncés du résultat nul dans `main` : le compteur `0 biens trouvés` (et le
  pluriel est faux en français : `=1 {…} other {…}` range 0 dans `other`) PUIS le titre de l'état
  vide `Aucun bien trouvé`.
- **Confirmé** — l'état vide n'offre qu'un bouton : `Effacer tous les filtres`.
- **Différait** — la puce de transaction se lit `En location`, pas « Location » (libellé unique de
  TCK-552). AC2 vise donc la puce « En location ».
- **Différait** — l'AC4 était DÉJÀ vert avant ce ticket : TCK-552 a posé `Sauvegarder la
  recherche` au bout des puces, rendu à zéro résultat (visible, actif). Ce ticket le déplace dans
  l'état vide, il ne le crée pas.
- `?q=zzzqqq&type=villa,house` : 0 résultat, puces `zzzqqq`, `Villa`, `Maison` ; même unique
  bouton dans l'état vide.
- Témoin de l'AC2 : `contract_type=rent` seul rend 180 biens côté API.

### Décisions

- **Le compteur porte l'unique énoncé, pas l'état vide.** C'est la région `aria-live` : le
  retirer à zéro aurait privé les lecteurs d'écran de l'annonce. `search.toolbar.resultCount`
  reçoit une branche `=0` (« Aucun bien trouvé » / « No properties found » / « Gisunu benn kër »),
  ce qui corrige aussi le pluriel « 0 biens trouvés ». L'état vide ne constate plus rien : titre
  « Élargissez votre recherche », description qui dit quoi faire. `search.results.empty_title` et
  `empty_description` n'avaient plus d'autre lecteur : remplacés par `vide_*` dans les trois
  langues.
- **Les puces à zéro résultat vivent dans l'état vide, et SEULEMENT là.** La barre d'outils
  reçoit `afficherPuces={!aucunResultat}` : sinon la même rangée (et la sauvegarde au bout)
  paraissait deux fois. Pour la même raison, la sauvegarde de la rangée du bureau n'est pas rendue
  à zéro résultat : une sauvegarde par écran, à toutes les largeurs.
- **Un seul rendu de puce, un seul chemin de retrait.** Le rendu des puces est extrait en
  `PucesDeFiltres`, exporté de `SearchToolbar.tsx` et utilisé par la barre ET par l'état vide ; il
  reste dans CE fichier pour que les couples de contraste consignés par la garde TCK-458
  (`components/search/SearchToolbar.tsx · text-primary sur bg-primary/8…`) restent les mêmes. Le
  gestionnaire inline de la page devient `retirerFiltre`, passé aux deux.
- **`SearchEmpty` est sorti dans `components/search/SearchEmpty.tsx`** (le moins d'édition
  possible dans `PropertiesDiscoveryPage`, que TCK-553 et TCK-555 éditent en parallèle). Ordre des
  issues : puces → `Sauvegarder la recherche` (le libellé reste celui-là : le bouton envoie
  `notification_frequency: 'off'`, rien ici ne promet une alerte) → « Effacer tous les filtres »,
  en `ghost`. Sans aucun critère (p. ex. `?page=3` sur une liste vide), ni puce ni sauvegarde, mais
  « tout effacer » reste : c'est alors la seule sortie.

### Vérification

**Tests** — `PropertiesDiscoveryPage.etat-vide.test.tsx` (10, neufs) et 4 cas ajoutés à
`SearchToolbar.test.tsx`. Deux tests existants affirmaient l'ancien texte et sont mis à jour :
`PropertiesDiscoveryPage.error.test.tsx` (« le compteur à zéro » attendait `0 biens trouvés`) et
le `monte()` de `PropertiesDiscoveryPage.outils.test.tsx` (attendait `^\d+ biens? trouvés?$`).

**Ablation** (chaque altération appliquée seule, puis restaurée) — toutes rougissent :

| altération | tests rouges |
|---|---|
| l'état vide retire par `removeFilter(k)` (sous-clé ignorée) | les deux « valeurs multiples » (`type`, `condition`) |
| `afficherPuces` toujours vrai | « puces pas deux fois », « sauvegarde une seule fois » |
| `=0` retiré du pluriel fr | les deux tests du compteur |
| titre de l'état vide « Aucun bien trouvé » | AC1 (un seul énoncé) et « le titre dit quoi faire » |
| sauvegarde retirée de l'état vide | AC4 et « tout effacer après la sauvegarde » |

**Navigateur** (Chrome headless par CDP, 360 × 740, `mobile: true`, `innerWidth` = 360 et
`scrollWidth` = 360 à chaque relevé) :

- AC1 — `?q=zzzqqq&contract_type=rent` : dans `main.innerText`, « aucun bien » ×1 (le compteur),
  « 0 » isolé ×0. Avant : ×1 et ×1.
- AC2 — deux puces dans l'état vide, `zzzqqq` et `En location` (32 px de haut). Clic sur `zzzqqq`
  → URL `?contract_type=rent&page=1`, 30 cartes, compteur `180 biens trouvés`.
- AC3 — `?q=zzzqqq&type=villa,house` : puces `zzzqqq`, `Villa`, `Maison`. Clic sur `Villa` → URL
  `?q=zzzqqq&type=house&page=1` (toujours 0 résultat, état vide avec `zzzqqq`, `Maison`).
- AC4 — `Sauvegarder la recherche` visible et actif dans l'état vide ; une seule instance visible
  dans la page, à 360 comme à 1366.
- en et wo à 360 : même structure, rien ne déborde (`No properties found` / `Broaden your
  search` ; `Gisunu benn kër` / `Yaatal sa seet`). À 1366 : compteur « Aucun bien trouvé », tri et
  onglets du bureau inchangés, une seule rangée de puces (dans l'état vide).

**Gardes** — `npx vitest run src/test` (4 fichiers, 34 tests, dont le contraste de la surface
publique : `ENCRES_INVERSES` inchangé), `tsc --noEmit`, ESLint sur les fichiers touchés,
`check:i18n`, `check:i18n-namespaces`, `check:classes-emises`, et toutes les `scripts/check-*.mjs`
de la racine : vertes.
