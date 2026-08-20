---
id: TCK-292
title: "i18n — le reste du parc, en 12 lots"
status: doing
phase: P2
family: front
estimate: XL
wave: null
created: 2026-08-15
updated: 2026-08-17
depends_on: [TCK-286]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, i18n, qualite, dette]
---

## Objectif utilisateur

Qu'un utilisateur qui choisit l'anglais ou le wolof obtienne réellement l'anglais ou le wolof
**au-delà de la coquille et du tunnel d'authentification** — sur les écrans où il passe son temps :
la recherche publique, son tableau de bord, ses réservations, ses baux, ses paiements.

## Contrat de données

Aucun endpoint neuf. Le travail consiste à déplacer du texte du code vers
`src/messages/{fr,en,wo}.json` et à le résoudre par `useTranslations` (client) ou
`getTranslations` (serveur).

**Le périmètre est mesuré, pas estimé — et il se re-mesure à chaque reprise.**
`takussan-web/scripts/i18n-baseline.json` porte le compte **par fichier**.

⚠️ **Les chiffres d'origine de ce ticket (409 fichiers / 3 542 occurrences, mesurés le
2026-08-15) ne sont plus vrais, et ils ne l'étaient déjà plus quand le travail a commencé.**
TCK-291 en avait résorbé une partie avant même que TCK-292 démarre, et chaque lot livré les fait
dériver davantage. Un compte recopié d'un ticket est faux dès le lot suivant.

**La règle pour qui reprend : re-mesurer AVANT de commencer un lot**, jamais reprendre le tableau
ci-dessous de confiance. La commande :

```bash
cd takussan-web && node scripts/check-i18n.mjs --report
```

### État mesuré le 2026-08-17, après les lots B, C et D

**Total restant : 291 fichiers, 2 761 occurrences** (contre 3 467 à l'ouverture de la branche
`wave3/i18n`, et 3 542 à la rédaction du ticket).

| Lot | Surface | Fichiers restants | Occ. restantes | État |
|---|---|---:|---:|---|
| A | Console super-admin (`components/admin/super`, `components/super-admin`, `app/(super-admin)`) | 52 | 593 | intact |
| B | Surface publique (`app/(public)`, `components/{property,property-form,search,compare,favorites,map,home,agents,agency,contact,share,reviews}`) | 6 | 23 | **quasi fini** |
| C | Tableau de bord + portefeuille (`app/(dashboard)/app`, `components/property-dashboard`) | 6 | 116 | **bloqué** |
| D | Admin agence (`app/(dashboard)/admin`, `components/admin*`, `owners`, `service-providers`) | 16 | 261 | **en cours** |
| E | CRM & profil (`components/{customer*,pipeline,profile}`) | 27 | 303 | intact |
| F | Réservations · visites · calendrier | 16 | 228 | intact |
| G | Locatif : baux, états des lieux | 15 | 215 | intact |
| H | Finances : paiements, facturation | 11 | 148 | intact |
| I | Documents, médias, maintenance | 19 | 226 | intact |
| J | Schémas zod (`lib/schemas`) | 15 | 183 | intact |
| K | Server actions (`app/actions`) | 19 | 86 | intact |
| L | Résidu : reporting, onboarding, messagerie, hooks, `ui/`, route handlers, playground | 89 | 379 | intact |

> Les lots « intacts » ont malgré tout bougé de quelques occurrences : traduire une surface fait
> parfois disparaître du texte d'une autre (une table de libellés partagée, un composant réutilisé).
> C'est une raison de plus de re-mesurer plutôt que de soustraire.

⚠️ **Les douze lots sont disjoints par FICHIER, mais leurs définitions se chevauchent sur un cas** :
`app/(public)/playground/` tombe sous le motif du lot B alors que le Delta le range en lot L. Le
tableau ci-dessus l'attribue à B (10 des 23 occurrences), le travail l'a laissé à L.

## Direction UX / Artistique

Aucune. Ce ticket ne change **aucun rendu** : il change d'où vient le texte. Un libellé qui change
de formulation en passant au dictionnaire est un bug de ce ticket, pas une amélioration.

## Contraintes strictes (métier)

**Les trois langues partent ensemble.** `src/i18n/request.ts:95-101` deep-merge `fr` sous toute
locale ≠ `fr` : une clé sans traduction anglaise s'affiche **en français**, sans erreur, sans
avertissement, sans test rouge. Brancher une clé sans son anglais transforme un anglais complet en
anglais troué, en silence. La garde `check-i18n.mjs` refuse déjà toute clé `fr` sans `en`
(plafond 0) ; elle ne peut pas refuser la même chose sur `wo`, dont le plafond est un cliquet
(88 clés manquantes préexistantes au 2026-08-15) — **c'est au ticket de tenir le wolof, pas à la
garde**.

**Un lot se termine à zéro sur ses fichiers.** 18 fichiers du parc importent déjà next-intl ET
portent du texte en dur (jusqu'à 34 occurrences dans `admin-agency/AgencyConfigForm.tsx`) : la
conversion à moitié faite est le mode d'échec dominant de ce chantier. Le cliquet par fichier le
rend visible ; le respecter est le contrat.

**Trois surfaces ont un patron imposé, sous peine de casser le build :**

- **Lot J (zod)** — `src/lib/schemas/*` est importé par des server actions ET par des composants
  client. Ni `useTranslations` ni `getTranslations` n'y est appelable. Le schéma doit porter une
  **clé** de message, résolue à l'affichage dans `src/hooks/useApiForm.ts`.
  ⚠ `src/lib/__tests__/agent-fr-regressions.test.ts` importe `MAINTENANCE_PRIORITY_LABEL` et
  `statusFilterLabel` et assert sur les valeurs françaises exactes : convertir ces tables casse ce
  test, qui existe pour de bonnes raisons.
- **Lot K (server actions)** — modules serveur : `getTranslations()` de `next-intl/server` est la
  bonne primitive, et la seule.
- **Données hors composant** (tables de libellés, `NAV_GROUPS`, listes d'items) — la donnée
  transporte la **clé**, le rendu la résout. Patron posé par TCK-286 dans
  `src/components/layout/AppSidebar.tsx` et `src/data/navigation.ts`.

**Le harnais de test existe : ne pas le réinventer.** `src/test/intl.tsx` expose `withIntl(ui)`
pour les composants client et `mockTraductionsServeur()` pour les composants serveur. Les rendus
qui passent `messages={{}}` rendent la CLÉ et non le libellé : tout `getByText('…')` casse à la
conversion. 7 fichiers de test mockent `next-intl` en entier et devront exposer `useTranslations`.

## Delta à produire

- [ ] Traiter les lots **dans l'ordre B → C → D → E → F → G → H → I → J → K → A → L** : la valeur
      décroît avec la visibilité, et A (super-admin) a un public interne.
- [ ] Chaque lot : les trois dictionnaires complets, `node scripts/check-i18n.mjs --update` pour
      resserrer le cliquet, et le compte des fichiers du lot **à zéro**.
- [ ] Résorber les **88 clés wolof manquantes** restantes (`node scripts/check-i18n.mjs --report`
      les liste), et baisser `PLAFONDS_PARITE.wo` jusqu'à 0.
- [ ] Trancher la divergence `nav.categories.*` ↔ `property.types.*` : deux vocabulaires pour le
      même enum backend, qui divergent sur `shop` (« Commerce » / « Boutique ») et `resort`
      (« Complexe » / « Resort »). TCK-286 a conservé les deux pour ne rien changer à l'écran ;
      choisir lequel gagne est une décision produit, puis supprimer l'autre.
- [ ] Supprimer `src/components/layout/{Footer,Header,Navigation,Sidebar}.tsx` — **aucun importeur
      dans tout `src`**, 13 occurrences de texte en dur dont 7 libellés de navigation en doublon
      exact d'`AppSidebar`. Les traduire créerait deux tables de navigation dont une invisible.
- [ ] Décider du sort de `src/components/playground/` (7 fichiers, 26 occurrences — page de
      démonstration) et des route handlers `src/app/api/**` (15 fichiers, 31 occurrences — messages
      JSON techniques, probablement à requalifier hors périmètre plutôt qu'à traduire).
- [ ] Étendre la garde si le besoin s'en fait sentir : elle ne voit **pas** les gabarits interpolés
      (`` `Bonjour ${nom}` ``) ni les props de composants maison hors `ATTRS_AFFICHAGE`. Son total
      est un plancher, jamais un inventaire — le vrai reste est supérieur à 3 542.

## Critères d'acceptation

- [ ] AC1 — pour chaque lot livré, `node scripts/check-i18n.mjs` sort en **0** et la baseline ne
      contient plus aucun fichier de ce lot.
- [x] AC2 — `en` reste à **0 clé manquante** (la garde le tient déjà), et `PLAFONDS_PARITE.wo` a
      strictement baissé à chaque lot qui touche un sous-arbre concerné.
      **Tenu, et dépassé : `PLAFONDS_PARITE.wo` vaut désormais 0.** 70 → 27 (vague B–H) → **0**
      (fin de chantier), sur 4984 clés `fr`. Les 27 dernières étaient des `common.*`, lues partout
      donc possédées par aucun lot : elles ne pouvaient tomber qu'à la fin. Le plafond n'est plus
      un cliquet qu'on desserre — toute clé française ajoutée sans son wolof fait rougir.
      ⚠ La garde est EXACTE sur la présence d'une clé et MUETTE sur sa justesse : cf. la réserve
      sur le wolof au § *Vague du 2026-08-20*.
- [ ] AC3 — aucun libellé affiché n'a changé de formulation : un test de rendu existant qui
      assertait un texte français continue de passer **sans modification de son assertion**.
- [x] AC4 — `npx tsc --noEmit`, `npm run lint`, `npm run test` et `npm run build` verts.
      **Mesuré le 2026-08-20, sur exécution** (cf. § *Vague du 2026-08-20*) : `tsc` sortie 0 ·
      `lint` **0 erreur** (37 avertissements, contre 59 au début de la vague) ·
      `npm run test` **173 fichiers, 1160 tests, 0 échec** · `npm run build` sortie 0.

> **Aucune case n'est cochée, et c'est exact — mais elles ne sont pas toutes au même stade.**
> État mesuré au 2026-08-17, sur les lots B, C et D :
>
> - **AC1** — non atteint, et il ne peut pas l'être tel qu'il est écrit. Aucun lot n'est à zéro
>   *sur tous ses fichiers* : le lot B garde 5 occurrences qui **ne doivent pas être traduites**
>   (balisage SVG, appât de honeypot, noms de quartiers) et 8 bloquées par un module partagé.
>   *Le critère suppose qu'un lot peut atteindre zéro ; ce ticket a établi que non.* À reformuler
>   quand le sort des faux positifs sera tranché.
> - **AC2** — **tenu**. `en` est resté à 0 clé manquante à chaque commit, et
>   `PLAFONDS_PARITE.wo` est passé de 88 à 70. ⚠️ La baisse ne vient d'aucune traduction wolof
>   écrite pour elle : elle vient de la fusion de `property.types` avec `nav.categories`, qui a
>   résolu 18 clés d'un coup. Toute clé ajoutée par ce ticket part avec ses trois langues — le
>   script qui écrit le dictionnaire **refuse** une clé sans ses trois traductions.
> - **AC3** — **tenu**, dans sa forme vérifiable. Aucune assertion de test n'a été modifiée sur
>   les ~90 tests des surfaces touchées. Six fichiers de test ont dû être **branchés** sur
>   `withIntl` (ils montaient `messages={{}}` ou aucun provider, ce qui rend la CLÉ), et un mock
>   partiel de `next-intl` a été **supprimé** — mais les assertions françaises, elles, sont
>   intactes.
> - **AC4** — **partiel**. `tsc --noEmit` et `npm run lint` sont verts à chaque commit (35
>   warnings, la baseline `dev` exacte). `npm run test` **en entier** et `npm run build` n'ont
>   **pas** été lancés : la règle du dépôt réserve la suite complète à la session déléguante.

## Hors périmètre

- **Le texte produit par l'API.** Le principe n°5 du `CLAUDE.md` racine dit que « l'API émet des
  codes et des données », mais la part de libellés qui arrivent déjà rédigés de `takussan-api/`
  (messages de validation Laravel, libellés d'enums, notifications, gabarits d'e-mail et de PDF)
  **n'a pas été mesurée**. Si l'API renvoie des phrases françaises, traduire le front ne suffira
  pas : ce sera un ticket backend, pas celui-ci.
- **La qualité linguistique du wolof existant.** On établit que 92 % de ses valeurs diffèrent du
  français ; on n'établit pas qu'elles sont justes. Une relecture par un locuteur est un autre
  travail.
- **Le basculement FR→EN→WO vérifié au navigateur.** Tout ce qui précède est mesuré sur le code
  source, pas sur le rendu.

## Reste sur dev

**Rien de ce ticket n'est sur `dev`** — le travail vit sur la branche `wave3/i18n` (7 commits,
non poussée). Le statut est `doing` pour une raison plus forte que la non-fusion : **le ticket est
un XL et il n'est pas fini**. 3 lots sur 12 sont entamés, 2 le sont substantiellement.

*Un `done` ici mentirait sur 2 761 occurrences restantes.*

### Le compte, d'un coup d'œil

| | Occurrences | Fichiers |
|---|---:|---:|
| À l'ouverture de `wave3/i18n` | 3 467 | 408 |
| Aujourd'hui | **2 761** | **291** |
| Traité | **706 (−20 %)** | 117 |

Parité wolof : **88 → 70** clés manquantes, plafond `PLAFONDS_PARITE.wo` resserré d'autant.

### Lot par lot

| Lot | Fait | Reste | État |
|---|---|---|---|
| **B** — surface publique | 350 / 373 | 6 fichiers, 23 occ. | **terminé en pratique** — cf. ci-dessous |
| **C** — tableau de bord | 271 / 387 | 6 fichiers, 116 occ. | **bloqué** sur `options.ts` |
| **D** — admin agence | 98 / 359 | 16 fichiers, 261 occ. | **en cours** |
| **A, E → L** | 0 | 285 fichiers, 2 361 occ. | **non commencés** |

#### Lot B — terminé en pratique, et le reste est qualifié

`app/(public)/` est **intégralement à zéro**, ainsi que `components/{property,search,property-form
(sauf options.ts),favorites,compare,map,share,contact,reviews,home,agents}`.

Les 23 occurrences restantes se décomposent ainsi, et **aucune n'est du travail de traduction
ordinaire** :

| Fichier | Occ. | Nature |
|---|---:|---|
| `app/(public)/playground/page.tsx` | 10 | relève du **lot L** (page de démonstration) |
| `components/property-form/options.ts` | 8 | **module partagé** — cf. le blocage ci-dessous |
| `components/agents/ZoneMultiSelect.tsx` | 2 | **faux positif** — « Sicap Liberté », « Thiès » sont des quartiers de Dakar |
| `…/PropertyLocationMapInner.tsx`, `map/LocationPickerMap.tsx` | 1 + 1 | **faux positifs** — SVG inline en data-URI (marqueur Leaflet) |
| `…/PropertyContactMessageDialog.tsx` | 1 | **faux positif** — `<label>` d'un honeypot `aria-hidden` ; le traduire changerait l'appât |

#### Lot C — bloqué à 115 occurrences sur 116

`app/(dashboard)/app/**` est **intégralement à zéro** (30 pages + 4 vues d'ensemble + 3 panneaux),
et 5 des 10 fichiers de `components/property-dashboard/`.

Les 5 fichiers restants **importent tous `property-form/options.ts`** : `PropertyListFilters` (46),
`PropertyHeaderActions` (22), `PropertyRowActions` (22), `PropertyList` (21),
`PropertyStatusBadge` (4). Le sixième, `PropertyVisibilityBadge`, ne pèse qu'une occurrence.

#### Lot D — en cours

`app/(dashboard)/admin/**` est **intégralement à zéro** (14 fichiers), ainsi que `owners/`,
`service-providers/`, `admin/finances/` et quatre composants de modération.

Restent les quatre gros formulaires — `admin-settings/IntegrationsManager` (45),
`admin-agency/AgencyConfigForm` (33), `admin-tags/TagsManager` (28),
`admin-settings/SettingsManager` (19) — et 8 fichiers de `components/admin/**` hors `super/`.

⚠️ **`TeamConsole` et `admin/roles/` sont hors de portée** tant que TCK-279 n'est pas mergé : c'est
la frontière posée au moment de TCK-291, et elle n'a pas été franchie.

### Le blocage à trancher avant de reprendre

**`property-form/options.ts` retient 123 occurrences** (8 au lot B, 115 au lot C), et le même
schéma se reproduira au lot E avec `customer-form/options.ts`.

Ses six tables de libellés sont importées par une dizaine de fichiers répartis sur **trois lots
différents** (C, D, E). Les convertir au patron « la donnée porte la clé » oblige à toucher tous
les consommateurs dans le même commit — donc à mélanger trois lots.

*Les douze lots sont disjoints par **fichier**, mais le code ne l'est pas par **dépendance**.*
C'est une limite du découpage, pas une difficulté de ces fichiers-là. Le cas se reproduira sur
`components/*/labels.ts` et `documents/constants.ts`, qui ont la même forme.

**Deux issues, à trancher avant de reprendre :**

1. un lot **« vocabulaire partagé »** traité en premier, hors du découpage en douze ;
2. ou l'acceptation qu'un commit croise les lots quand un module partagé l'impose.

### Le scanner a un plancher — et aussi un plafond

`scripts/i18n-scan.mjs` documente franchement que son total est un **plancher** : il rate les
gabarits interpolés, donc le vrai reste est supérieur à 2 761.

Ce qui n'était écrit nulle part, et que ces trois lots ont établi : **il compte aussi des chaînes
qu'il ne faut surtout pas traduire.** Trois familles, toutes rencontrées :

- **balisage** — SVG inline en data-URI (2 occurrences) ;
- **appât de honeypot** — `aria-hidden`, hors écran ; le traduire casserait l'anti-spam ;
- **noms propres** — quartiers et villes du Sénégal.

⚠️ **Une quatrième famille a bien failli être classée là par erreur, et n'en était pas une.**
`owners/` et `service-providers/` portaient onze `new ApiError(401, { message: 'no token' })` : des
sentinelles anglaises qui *ressemblaient* à du technique. Vérification faite,
`ApiError.displayMessage` (`src/lib/api.ts:67-73`) rend `data.message` tel quel et `QueryBoundary`
l'affiche : **l'utilisateur lisait littéralement « no token »**. C'était un bug que la garde i18n
a trouvé sans le savoir. *« Ça ressemble à du technique donc ça ne s'affiche pas » est une
hypothèse à vérifier, pas un classement.*

`i18n-scan.mjs` **n'a pas été touché** : il vient d'être réécrit et validé occurrence par
occurrence (TCK-323), et l'étendre est une décision. Trois règles possibles, par difficulté
croissante :

1. « un littéral commençant par `<?xml` ou `<svg` est du balisage » — étroite, testable, sûre ;
2. « les enfants d'un élément `aria-hidden="true"` ne sont pas du texte affiché » — juste, mais
   **structurelle** : ce lexeur ne construit pas d'arbre, c'est un vrai chantier ;
3. les noms propres : aucune règle mécanique possible. Allowlist par fichier, ou on assume.

### Décisions du Delta encore ouvertes

- **Sort de `src/components/playground/` et des route handlers `src/app/api/**`** — le ticket
  penche pour les requalifier hors périmètre. Non tranché.
- **Suppression de `layout/{Footer,Header,Navigation,Sidebar}.tsx`** : le bullet du Delta a été
  **vérifié bon** (0 référence pour chacun des quatre). Gardée pour le lot L.
- **Les 88 clés wolof → 70.** ⚠️ **13 des 70 restantes sont un raccourci gratuit** :
  `property.fields` (7), `property.status` (4) et `property.list` (2) sont la même famille que
  `property.types` — des sous-arbres créés par TCK-286 en prévision, **sans aucun consommateur**
  (vérifié : aucun `useTranslations` sur ces trois) **et sans wolof**. Ou bien leurs consommateurs
  arrivent dans un lot ultérieur et il faudra les traduire, ou bien c'est du poids mort à
  supprimer — auquel cas `PLAFONDS_PARITE.wo` tombe à **57 sans écrire une ligne de wolof**.

### Ce qui est vrai à chaque commit de la branche

`npx tsc --noEmit` 0 erreur · `npm run lint` 0 erreur et **35 warnings — la baseline `dev`
exacte** · les tests des surfaces touchées verts, **sans qu'une seule assertion soit modifiée**
(c'est la forme vérifiable d'AC3) · `check-i18n` vert, `en` à 0/0 · les 13 gardes de la racine
vertes.

`docs/backlog/INDEX.md` n'est **jamais** touché : il est dérivé, et plusieurs worktrees qui le
régénèrent produisent des conflits sur un fichier généré.

## Notes d'implémentation

### La divergence du vocabulaire des types de bien : tranchée, et elle était plus large

Le Delta annonce deux tables (`nav.categories` ↔ `property.types`). **Mesuré, il y en avait cinq**
pour le même enum backend : les deux du dictionnaire, plus trois tables locales
(`property/PropertyCard.tsx`, `search/SearchToolbar.tsx`, `search/FilterSidebar.tsx`), plus une
sixième côté formulaire (`property-form/options.ts`).

Ce qui a tranché est une mesure, pas un goût :

1. **`property.types` n'avait aucun consommateur.** Aucun `useTranslations('property.types')` dans
   tout `src` — le seul sous-arbre lu sous `property.*` était `property.portfolio`.
2. **`property.types` n'avait aucun wolof.** `nav.categories` avait ses 16 valeurs dans les trois
   langues.

D'où : **`property.types` gagne comme emplacement** (vocabulaire de bien, pas de navigation),
**`nav.categories` gagne comme valeurs**, et `nav.categories` est supprimé. Effet de bord :
18 des 88 clés wolof manquantes disparaissent — le doublon était la dette, pas la traduction.

**Ce que ça change à l'écran, exhaustivement** : `shop` passe de « Boutique » à « Commerce » sur la
carte de bien publique et dans le formulaire ; `resort` passe de « Resort » à « Complexe » dans le
formulaire. **Trois libellés, deux écrans.** Toute la surface de recherche publique (navbar, barre
d'outils, panneau de filtres) est inchangée au caractère près, et aucun test n'assertait ces mots.

### Le patron « la donnée porte la clé » a une variante non prévue

`SearchToolbar.FILTER_LABELS` n'était pas une table de libellés mais une table **de fonctions**
(une par filtre, qui formate sa valeur). Une fonction ne peut pas porter une clé statique. Elle est
devenue une **fabrique** qui reçoit les traducteurs et rend la même table depuis le composant.

### Un piège du React Compiler, payé une fois

`search/Pagination.tsx` ouvrait sur `if (lastPage <= 1) return null;`. Un `useTranslations` posé
après cette ligne aurait été un hook conditionnel — refusé par le React Compiler (ADR-0015, activé
par TCK-318). Le hook se place **avant** la sortie anticipée. À vérifier systématiquement dans les
lots suivants : le motif « garde d'entrée en première instruction » est fréquent dans ce dépôt.

### Une dette trouvée, hors périmètre

**Le formatage des nombres et des dates est figé en `fr-SN` quelle que soit la locale** —
`toLocaleString('fr-SN')`, `toLocaleDateString('fr-SN', …)`, écrits en dur dans `SearchToolbar` et
ailleurs. Traduire les libellés ne corrige pas ça : un anglophone lira des libellés anglais et des
nombres au format français. Le scanner ne le voit pas (ce n'est pas du texte) et ce n'est pas dans
le Delta. **Ça vaut un ticket.**


## Vague du 2026-08-20 — les douze lots traités, et ce qu'ils ont coûté

**Mesuré aux mêmes commandes au départ et à l'arrivée** (`node scripts/check-i18n.mjs --report`
depuis `takussan-web/`), machine à 8 cœurs :

| | 2026-08-17 | 2026-08-20 |
|---|---:|---:|
| fichiers portant du texte en dur | 291 | **40** |
| occurrences | 2 761 | **91** |
| clés `wo` manquantes | 70 | **0** |
| clés `fr` au dictionnaire | 2 332 | **4 984** |
| tests front | ~810 | **1 160** |

Les douze lots (A → L) ont été traités. **Le compte de 91 n'est pas un reste à traduire** : c'est
ce que le cliquet **heuristique** compte encore — clés techniques, classes CSS, identifiants,
valeurs d'API, texte de test. Le tri fichier par fichier est dans les rapports de vague ; il vaut
plus que dix conversions de plus, parce que c'est lui qui permettra de clore.

### Trois rendus ont changé, et il faut les nommer — l'AC3 n'est donc pas tenu à la lettre

L'AC3 dit « aucun libellé affiché n'a changé de formulation ». Trois écarts, tous **mesurés**, tous
**délibérés**, aucun découvert par l'agent qui l'a produit — les trois viennent de vérifications
adverses :

1. **`shop` : « Boutique » → « Commerce » · `resort` : « Resort » → « Complexe ».** Ce n'est pas un
   dérapage : **ce ticket avait tranché** la divergence `nav.categories.*` ↔ `property.types.*`
   (§ *La divergence du vocabulaire des types de bien*) en donnant l'emplacement à `property.types`
   et les **valeurs** à `nav.categories`. Le lot C a appliqué la décision. 2 entrées sur 16
   diffèrent ; 4 sites de rendu (cartes et filtres du tableau de bord).
   *C'est un choix produit, et il se révoque en deux lignes de dictionnaire.*
   ⚠ **Pourquoi le contrôle « littéral supprimé ↔ dictionnaire » ne pouvait pas le voir** : ces deux
   mots n'ont jamais été des littéraux des fichiers convertis — ils vivaient dans une table
   importée. **Ce n'est pas le texte qui a bougé, c'est sa SOURCE.** Toute vérification qui ne
   regarde que les diffs rate cette classe entière ; il faut comparer les deux TABLES, entrée par
   entrée.
2. **Pluriels ICU à partir de 1000.** `{count, plural, …}` formate `#` avec `Intl.NumberFormat`,
   qui insère en français une espace fine insécable (U+202F) : `1000 biens` → `1 000 biens`.
   Mesuré sur `agency.publicPage.metaSummary` et sur `superAdmin.properties.table.totalCount` —
   ce dernier compte les biens **toutes agences confondues**, donc franchir 1000 n'est pas une
   hypothèse d'école. **Conservé : c'est la typographie française juste.**
3. **Fuseau horaire.** Les composants qui appelaient `new Date(x).toLocaleString('fr-FR', …)`
   rendaient dans le fuseau du **navigateur** ; passés à `formatDate`, ils rendent dans
   `Africa/Dakar` (`src/i18n/config.ts`). Sous `TZ=Europe/Paris` : `11:07` → `09:07`.
   **Conservé, et c'est l'ancien comportement qui était l'exception** : mesuré, **61 fichiers**
   passaient déjà par `@/lib/format` avant cette branche, contre 9 qui ne le faisaient pas. Un
   journal d'audit à l'heure du navigateur pendant que 61 autres écrans affichaient l'heure de
   Dakar était une incohérence, pas une fonctionnalité.

### Ce que les vérifications adverses ont trouvé, et que personne n'a vu en relisant

- **18 messages de validation rendus en CLÉ BRUTE** (`validation.tag.nameRequired` au lieu de
  « Le libellé est requis. »). Le lot J avait posé le bon patron, mais son inventaire
  (`grep -rn zodResolver`) était **structurellement aveugle** aux consommateurs qui appellent
  `safeParse()` et rendent le message directement. **Aucun test ne parcourait ces chemins** : la
  régression était invisible en CI.
- **Puis le même défaut, déplacé** : le correctif suivant a fait dépendre le libellé d'un traducteur
  rangé dans une variable de module enregistrée par un composant `'use client'`, alors que
  **17 modules `'use server'`** le lisent. On avait troqué de l'anglais contre une clé brute.
  Ce défaut a traversé **trois vagues d'agents et deux vérifications** avant qu'un vérificateur
  l'exécute depuis le bon contexte. Cause supprimée : **ADR-0019**.
- **42 messages en prose dans 25 des 31 route handlers BFF**, dont 19 × `Not authenticated.`,
  affichés verbatim en interface française à l'expiration d'une session. Le vérificateur en
  annonçait « au moins 9 » ; l'inventaire mesuré en a trouvé **4,6 fois plus**.
- **Cinq chaînes françaises destinées à l'écran dans des fichiers déclarés FINIS**, invisibles du
  scanner (gabarits interpolés, props de composants maison), plus les en-têtes de colonnes du
  calendrier (`WEEKDAY_SHORT_FR`) — du texte affiché tous les jours.

### La réserve qui reste, et qu'aucune garde ne peut lever

**Le wolof est écrit, il n'est pas relu.** La parité est exacte (0 manquante sur 4984), et elle est
**muette sur la justesse** : une valeur wolof recopiée du français passe au vert. Un vérificateur a
mesuré **42 valeurs `wo` identiques à leur `fr` dans un seul lot**, dont une trentaine seulement
étaient déclarées comme emprunts assumés. Une passe de relecture a trié l'inventaire complet et
corrigé ce qui avait déjà une traduction établie ailleurs dans `wo.json` ; le reste est listé, clé
par clé, dans les rapports de vague. **C'est une relecture par un locuteur qu'il faut là, pas une
garde** — et ce ticket ne peut pas la fournir.
