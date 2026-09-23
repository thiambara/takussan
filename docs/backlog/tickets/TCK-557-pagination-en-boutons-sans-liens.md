---
id: TCK-557
title: "La pagination de la liste des biens est faite de <button> sans href : pages 2 et suivantes introuvables par un robot, cibles de 36 px"
status: todo
phase: P1
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
tags: [front, mobile, pagination, seo, a11y]
---

## Objectif utilisateur

Un visiteur change de page d'un tap sûr, sait où il en est, peut ouvrir une page dans un nouvel
onglet — et un moteur de recherche atteint les biens des pages suivantes par la liste.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat G1).

- `Pagination` rend des `<button onClick>` : aucun `href`. Les pages 2 et suivantes de
  `/properties` ne sont atteignables par aucun lien — un robot ne les suit pas, un visiteur ne peut
  ni les ouvrir dans un onglet ni copier leur adresse. TCK-432 a rendu les biens présents dans le
  HTML de la première réponse ; la pagination, elle, ne l'est toujours pas.
- Les cibles font 36 × 36 px ; rien n'indique « page X sur Y ».
- Au changement de page, la vue remonte en haut du document (`h1` à 101 px), au-dessus des contrôles,
  plutôt qu'au début des résultats.

Revue adverse intégrée : un « voir plus » en défilement infini a été écarté — il casserait la
restauration du défilement (TCK-335) et l'exploration par les robots. La pagination numérotée reste ;
elle devient faite de liens.

## Contrat de données

Aucun endpoint. `meta.current_page` et `meta.last_page`, déjà reçus.

## Direction UX / Artistique

- Des liens de page, dont la navigation reste instantanée côté client.
- Cibles de 44 px, position courante lisible (« Page 2 sur 5 »).
- Après un changement de page, la vue arrive au début des résultats.

## Contraintes strictes (métier)

- Chaque lien de page porte l'URL complète : filtres courants conservés, `page` mis à jour, `page=1`
  omis — la même forme que la canonique (`lib/canonique`).
- La restauration du défilement au retour arrière (TCK-335) n'est pas dégradée.

## Delta à produire

- [x] Pagination rendue en liens `href`, interceptés pour une navigation client.
- [x] Cibles de 44 px et indication de la page courante sur le total.
- [x] Défilement vers le début des résultats après changement de page.
- [x] Tests : `href` de chaque page ; conservation des filtres ; `page=1` omis.

## Critères d'acceptation

- [x] AC1 — dans le HTML **servi** de `/fr/properties?contract_type=rent` (avant hydratation), un
      `<a href>` mène à `…contract_type=rent&page=2` (ordre des paramètres indifférent).
- [x] AC2 — le lien de la page 1 ne contient pas `page=`.
- [x] AC3 — à 360 px, chaque cible de pagination mesure au moins 44 × 44 px, et la pagination tient
      sur une rangée sans débordement **au pire cas** : page 5 d'au moins 10 pages (la forme
      actuelle y rend 9 éléments, soit 428 px pour 328 disponibles — le nombre d'éléments affichés
      sous `md` doit donc baisser).
- [x] AC4 — après passage en page 2, le haut de la première carte est dans le viewport, sous la `nav`.
- [x] AC5 — un retour arrière depuis une fiche ouverte en page 2 restaure la position de défilement.

## Hors périmètre

- `rel="next"`/`rel="prev"` et la canonique (TCK-433).
- Le nombre de résultats par page.

## Notes d'implémentation

### Prémisses re-mesurées (2026-09-23, avant tout changement)

- **Confirmée** — HTML servi de `/fr/properties?contract_type=rent` (`curl`, `next dev` du worktree) :
  la `<nav aria-label="Pagination">` contient 8 `<button>` (précédent désactivé, 1 à 6, suivant) et
  **aucun** `page=2` dans tout le document.
- **Confirmée** — cibles `w-9 h-9` (36 px), aucune mention « Page X sur Y ».
- **Confirmée** — `setPage` de `useSearch` navigue en `router.push(url, { scroll: true })` : la vue
  repart en haut du document.
- **Écart** — le pire cas de l'AC3 (« page 5 d'au moins 10 pages ») n'existe pas avec le `per_page`
  par défaut sur la base locale : 247 biens → 9 pages ; `contract_type=rent` → 180 biens, 6 pages.
  Il se mesure avec `per_page=12` (21 pages).
- **Précision** — `setPage` écrivait `page=1` explicitement ; aucune fonction existante de
  `lib/canonique` ou `lib/recherche-publique` ne construit une URL de page *en gardant les
  filtres* (`cheminCanoniqueDeLaListe` écarte 22 clés sur 25, `parametresDeRecherche` fabrique la
  requête d'API avec `per_page`). La fabrique retenue est **`filtersToParams`** (`hooks/useSearch`),
  celle qu'emploie déjà `search()` : importée, pas modifiée (TCK-559 édite ce fichier).

### Décisions

- **`<a href>` + `router.push(href, { scroll: false })`** sur clic simple, clic modifié laissé au
  navigateur. `next/link` écarté : son `onClick` ne permet pas de savoir, dans le composant, que la
  navigation a eu lieu (le défilement doit l'attendre), et il aurait fallu le doubler en test.
- **Défilement APRÈS le changement d'URL**, pas au clic : un drapeau posé au clic est consommé par
  l'effet qui suit le changement de `useSearchParams()`. Défiler au clic émettrait un `scroll` que
  `useScrollRestoration` (TCK-335) pourrait attribuer à l'entrée quittée. Mutation : défiler au clic
  fait rougir le test dédié.
- **Page courante = lien `aria-current="page"`** dont le clic est neutralisé : le lien de la page 1
  existe donc aussi sur la page 1 (AC2 mesurable sur les deux).
- **Sous `md`, `‹ 1 … c … L ›`** : une seule rangée dont chaque élément sait s'il se montre sous `md`
  (les pages mobiles sont un sous-ensemble des pages de bureau) — pas deux rangées, qui doubleraient
  chaque lien dans le HTML servi.
- `setPage` n'est plus appelé par la page ; il reste exporté par `useSearch` (hors périmètre).
- Cliquet `ENCRES_INVERSES` 242 → 243 (`surface-publique.contraste.test.ts`), relevé par
  `couplesDuFichier` sur `HEAD` (3 entrées) puis sur la nouvelle version (4). Une première version
  portait les classes dans des constantes : l'analyseur ne les lisait plus (compte 242 → 241, et le
  couple `text-foreground` des numéros sortait de la mesure). Classes remises en ligne.

### Mesures

- **AC1/AC2 — HTML servi** (`curl` sur `next dev -p 3015`, avant toute hydratation) :
  `?contract_type=rent` → 0 `<button>` dans la `<nav>`, 8 `<a href>` dont
  `/fr/properties?contract_type=rent&page=2` (« 2 » et « Page suivante ») ; le « 1 » (courant) mène à
  `/fr/properties?contract_type=rent`. `?contract_type=rent&page=2` → « Page précédente » et « 1 »
  mènent tous deux à `/fr/properties?contract_type=rent`, sans `page=`.
- **AC3 — `?per_page=12&page=5` (21 pages), Chrome headless, CDP** :
  - 360 px, `mobile: true` : `innerWidth` **360** (pas d'élargissement), `scrollWidth` 360 ;
    7 éléments `‹ 1 … 5 … 21 ›`, rangée de **292 px** (34 → 326), **1** rangée, cibles **44 × 44**,
    ellipses 24 × 44. Même relevé à 360 en `mobile: false`.
  - 1280 px : forme de bureau `‹ 1 … 4 5 6 … 21 ›`, 9 éléments, 388 px, cibles 44 × 44.
- **AC4 — clic sur « 2 » depuis le bas de la page 1** (`el.click()`, même document : témoin
  `window.__temoin` conservé) : 360 px → `scrollY` 4107 → **319**, haut de la première carte à
  **85 px**, bas de la `nav` fixe à 69 px, `h1` à −218 (au-dessus). 1280 px → première carte à
  **152 px**, `nav` à 135 px.
- **AC5 — ROUGE à la première mesure, et le défaut est ANTÉRIEUR au ticket.** Page 1 → clic « 2 » →
  défilement à 1500 → fiche → `history.back()` : retour à **0**. Diagnostic par CDP : l'entrée
  d'historique poussée par `router.push` **ne porte plus la clé** `__takussanScrollKey`
  (`history.state` sans elle dès `page2-apres-clic`) — le routeur de Next 16 ne reconduit pas
  l'état personnalisé sur une navigation (`preserveCustomHistoryState` faux), contrairement à ce
  qu'affirme le docblock de `useScrollRestoration`. La page 2 n'enregistre donc rien
  (`lireCle() !== cle`), et le retour pose une clé neuve, sans position.
  - **Témoin** : même parcours avec `Pagination.tsx` et `PropertiesDiscoveryPage.tsx` de `HEAD`
    remis en place (HTML servi vérifié : `w-9 h-9` présent) → retour à **0** aussi.
  - **Contre-témoin** : `?page=2` chargée DIRECTEMENT (pas de `push`) → retour à **1500**.
  - **Correctif** (`hooks/useScrollRestoration.ts`) : la clé se relit — et se pose sur l'entrée qui
    n'en a pas — à chaque décision (`pret`), plus une fois au montage ; l'enregistrement ne vaut que
    pour la clé de la dernière décision. Le docblock qui affirmait la survie de la clé est corrigé.
    Test ajouté (`useScrollRestoration.test.ts`) qui rejoue l'état écrit par Next (`{ __NA: true }`).

### Reprise et re-vérification (2026-09-23, second agent)

Le premier agent a été coupé avant de commiter ; son travail a été repris tel quel, et **chaque
affirmation ci-dessus re-mesurée par exécution** — aucune ne différait.

- **Tests ciblés** : `Pagination.test.tsx`, `useScrollRestoration.test.ts`, `rendu-serveur.test.tsx`,
  `surface-publique.contraste.test.ts`, `PropertiesDiscoveryPage.*.test.tsx` → 7 fichiers, 47 tests
  verts.
- **Ablations** :
  - `useScrollRestoration.ts` de `HEAD` → le nouveau test rougit (`scrollTo` jamais appelé avec
    `(0, 1500)`), les deux tests TCK-335 restent verts.
  - `Pagination.tsx` et `PropertiesDiscoveryPage.tsx` de `HEAD` → 15 tests rougissent (les 13 de
    `Pagination.test.tsx`, les 2 TCK-557 de `rendu-serveur.test.tsx`).
- **AC1/AC2 — HTML servi** (`curl` sur `next dev -p 3015`) : `?contract_type=rent` → 0 `<button>`
  dans la `<nav>`, liens `…?contract_type=rent` (« 1 »), `…&page=2` à `…&page=6`, « Page 1 sur 6 » ;
  `&page=2` → « Page précédente » et « 1 » mènent à `/fr/properties?contract_type=rent`, « 2 » porte
  `aria-current`.
- **AC3** — `?per_page=12&page=5` : 360 `mobile: true` et `mobile: false` → `innerWidth` 360,
  `scrollWidth` 360, 7 éléments, rangée de 292 px (34 → 326), 1 rangée, cibles 44 × 44. À titre
  d'information, 320 px : `innerWidth` 320, rangée 14 → 306, 1 rangée. 1280 : 1 rangée, cibles 44.
- **AC4** — 360 : `scrollY` 4106 → 319, première carte à 85 px, bas de la `nav` à 69, `h1` à −218,
  même document. 1280 : 2095 → 187, carte à 152, `nav` à 135.
- **AC5** — page 1 → « 2 » → 1500 → fiche → `history.back()` : retour à **1501**. **Témoin au
  navigateur** : seul `useScrollRestoration.ts` de `HEAD` remis en place (Pagination neuve) → retour à
  **0** ; correctif rétabli → **1500**.
- **Non-régression TCK-335** (même banc) : `?contract_type=rent` à 1200 → fiche → retour : **1199** ;
  puis 1200 → « 2 » (arrivée à 394) → `history.back()` dans la liste : page 1 revient à **1200** — la
  position de la page quittée n'est pas écrasée par le défilement vers les résultats.
- `eslint` des fichiers touchés : 0 ; `tsc --noEmit` : 0 ; `check:i18n` (parité 5727 clés),
  `check:i18n-namespaces`, `check:classes-emises` : verts ; les `scripts/check-*.mjs` de la racine :
  tous verts ; `fr/en/wo.json` au format `JSON.stringify(…, null, 2) + "\n"`.
